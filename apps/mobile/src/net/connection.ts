import { AppState } from "react-native";
import type { ClientMsg, ServerMsg } from "@ec/shared";
import { wsUrl } from "./serverUrl";

type Session = { code: string; token: string } | null;

/** Mesmo código usado pelo servidor ao abrir a sessão em outro aparelho ou aba. */
const CLOSE_DUPLICATE = 4001;

/** WebSocket com reconexão automática por token (até 30 s) e retomada ao voltar para o app. */
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
    private readonly server: () => string,
    /** Sessão de login (conta); vai junto no resume para a partida continuar contando no ranking. */
    private readonly login: () => string | undefined = () => undefined,
  ) {
    setInterval(() => this.send({ t: "ping", c: performance.now() }, false), 2000);
    // o sistema derruba o socket com o app em segundo plano; na volta, retoma a sala salva
    AppState.addEventListener("change", (s) => {
      if (s !== "active" || this.closedByUser) return;
      if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
        this.retryUntil = 0;
        this.resume();
      }
    });
  }

  listen(fn: (m: ServerMsg) => void): () => void {
    this.extraListeners.add(fn);
    return () => this.extraListeners.delete(fn);
  }

  private open(): void {
    const ws = new WebSocket(wsUrl(this.server()));
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
    ws.onerror = () => {
      if (this.ws === ws && !this.session()) this.onMsg({ t: "error", msg: "Não foi possível falar com o servidor" });
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
    } else if (queueIfClosed && msg.t !== "input" && msg.t !== "kinput") {
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
