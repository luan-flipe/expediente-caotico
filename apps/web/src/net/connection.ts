import type { ClientMsg, ServerMsg } from "@ec/shared";

type Session = { code: string; token: string } | null;

/** Mesmo código usado pelo servidor ao abrir a sessão em outra aba. */
const CLOSE_DUPLICATE = 4001;

/** WebSocket com reconexão automática por token (até 30 s). */
export class Connection {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private closedByUser = false;
  private retryUntil = 0;
  private extraListeners = new Set<(m: ServerMsg) => void>();
  rtt = 80;

  constructor(
    private readonly onMsg: (m: ServerMsg) => void,
    private readonly onStatus: (online: boolean) => void,
    private readonly session: () => Session,
    /** Sessão de login (conta); vai junto no resume para a partida continuar contando. */
    private readonly login: () => string | undefined,
  ) {
    setInterval(() => this.send({ t: "ping", c: performance.now() }, false), 2000);
  }

  listen(fn: (m: ServerMsg) => void): () => void {
    this.extraListeners.add(fn);
    return () => this.extraListeners.delete(fn);
  }

  private open(): void {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.onStatus(true);
      for (const m of this.queue) ws.send(m);
      this.queue = [];
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (msg.t === "pong") this.rtt = this.rtt * 0.7 + (performance.now() - msg.c) * 0.3;
      this.onMsg(msg);
      for (const l of this.extraListeners) l(msg);
    };
    ws.onclose = (ev) => {
      this.onStatus(false);
      if (this.ws !== ws || this.closedByUser) return;
      this.ws = null;
      if (ev.code === CLOSE_DUPLICATE) return;
      const s = this.session();
      if (!s) return;
      if (!this.retryUntil) this.retryUntil = Date.now() + 30000;
      if (Date.now() > this.retryUntil) return;
      setTimeout(() => this.resume(), 1000);
    };
  }

  /** Reabre e retoma a sessão salva, se houver. */
  resume(): boolean {
    const s = this.session();
    if (!s) return false;
    this.closedByUser = false;
    this.ensure();
    this.send({ t: "resume", code: s.code, token: s.token, session: this.login() });
    return true;
  }

  ensure(): void {
    this.closedByUser = false;
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) this.open();
  }

  send(msg: ClientMsg, queueIfClosed = true): void {
    const raw = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
      this.retryUntil = 0;
    } else if (queueIfClosed && msg.t !== "input") {
      this.queue.push(raw);
    }
  }

  close(): void {
    this.closedByUser = true;
    this.queue = [];
    this.ws?.close();
    this.ws = null;
  }
}
