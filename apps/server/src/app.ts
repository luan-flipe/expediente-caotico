import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
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
  const path = normalize(decodeURIComponent(url.split("?")[0])).replace(/^([/\\])+/, "");
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

export function startServer(port: number): Promise<RunningServer> {
  const manager = new RoomManager();
  const http: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
      return;
    }
    serveStatic(req.url ?? "/", res);
  });
  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 4096 });
  wss.on("connection", (ws, req) => {
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? "?";
    const conn: Conn = { ws, ip, bucket: new TokenBucket(90, 60), invalid: 0 };
    ws.on("message", (data) => manager.onMessage(conn, data.toString()));
    ws.on("close", () => manager.onClose(conn));
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
