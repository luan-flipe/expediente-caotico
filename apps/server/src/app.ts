import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { RoomManager, type Conn } from "./rooms";
import { TokenBucket } from "./ratelimit";

const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

/** Serve o build do cliente (produção). Em dev o Vite cuida disso. */
function serveStatic(url: string, res: import("node:http").ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.split("?")[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const path = normalize(decoded).replace(/^([/\\])+/, "");
  let file = join(WEB_DIST, path);
  if (!file.startsWith(WEB_DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIST, "index.html");
  if (!existsSync(file)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Servidor do Expediente Caótico no ar. Rode o cliente com pnpm dev.");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close: () => Promise<void>;
}

export interface ServerOptions {
  /** Conexão sem nenhuma mensagem por esse tempo é derrubada (o cliente faz ping a cada 2 s). */
  idleMs?: number;
}

const MAX_CONNS_PER_IP = 30;

/**
 * IP do cliente. X-Forwarded-For só é usado com TRUST_PROXY=1 e, nesse caso,
 * vale o último salto (o que o proxy confiável acrescentou), não o primeiro.
 */
function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (process.env.TRUST_PROXY === "1" && typeof fwd === "string") {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket.remoteAddress ?? "?";
}

export function startServer(port: number, opts: ServerOptions = {}): Promise<RunningServer> {
  const manager = new RoomManager(opts.idleMs ?? 10000);
  const http: Server = createServer((req, res) => {
    try {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
        return;
      }
      serveStatic(req.url ?? "/", res);
    } catch (err) {
      console.error("erro http", err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  const conns = new Map<string, number>();
  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 4096 });
  wss.on("connection", (ws, req) => {
    const ip = clientIp(req);
    const count = (conns.get(ip) ?? 0) + 1;
    if (count > MAX_CONNS_PER_IP) {
      ws.close(1008, "Muitas conexões");
      return;
    }
    conns.set(ip, count);
    const conn: Conn = { ws, ip, bucket: new TokenBucket(90, 60), invalid: 0, lastSeen: Date.now() };
    manager.track(conn);
    ws.on("message", (data) => manager.onMessage(conn, data.toString()));
    ws.on("close", () => {
      const left = (conns.get(ip) ?? 1) - 1;
      if (left > 0) conns.set(ip, left);
      else conns.delete(ip);
      manager.onClose(conn);
    });
    ws.on("error", () => ws.close());
  });
  return new Promise((ok) => {
    http.listen(port, () => {
      const addr = http.address();
      ok({
        port: typeof addr === "object" && addr ? addr.port : port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            manager.close();
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
