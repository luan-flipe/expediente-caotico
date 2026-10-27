import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { rankingView } from "@ec/shared";
import { readSession, signSession, verifyGoogleToken } from "./auth";
import { RoomManager, type Conn } from "./rooms";
import { TokenBucket } from "./ratelimit";
import type { Store } from "./store";

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
  /** Voltas e tolerância da corrida (só para testes). */
  race?: { laps?: number; graceMs?: number };
  /** Arquivo de dados do ranking. Sem ele o servidor só tem visitantes e não pontua. */
  store?: Store;
  /** Login: `clientId` null desliga o login do Google; `secret` assina as sessões do jogo. */
  auth?: { clientId: string | null; secret: string };
}

const MAX_CONNS_PER_IP = 30;
const MAX_LOGIN_BODY = 8 * 1024;

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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Lê o corpo até `max` bytes. Estourou o limite: devolve null (e a conexão é cortada pelo chamador). */
function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        req.pause();
        ok(null);
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

export function startServer(port: number, opts: ServerOptions = {}): Promise<RunningServer> {
  const { store, auth } = opts;
  const manager = new RoomManager(opts.idleMs ?? 10000, opts.race, store && auth ? { store, secret: auth.secret } : undefined);
  const loginBuckets = new Map<string, TokenBucket>();
  const loginAllowed = (ip: string): boolean => {
    let b = loginBuckets.get(ip);
    if (!b) {
      b = new TokenBucket(8, 0.5);
      loginBuckets.set(ip, b);
    }
    if (loginBuckets.size > 5000) loginBuckets.clear();
    return b.take();
  };

  /** POST /api/login { credential }: confere o token do Google e devolve a sessão do jogo. */
  async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!auth?.clientId || !store) return sendJson(res, 404, { error: "Login indisponível" });
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST" });
    if (!loginAllowed(clientIp(req))) return sendJson(res, 429, { error: "Muitas tentativas. Aguarde um pouco." });
    const raw = await readBody(req, MAX_LOGIN_BODY);
    if (raw === null) {
      sendJson(res, 413, { error: "Corpo grande demais" });
      res.once("finish", () => req.destroy());
      return;
    }
    let credential: unknown;
    try {
      credential = (JSON.parse(raw) as { credential?: unknown } | null)?.credential;
    } catch {
      return sendJson(res, 400, { error: "JSON inválido" });
    }
    if (typeof credential !== "string" || !credential) return sendJson(res, 400, { error: "Falta a credencial" });
    const user = await verifyGoogleToken(credential, auth.clientId);
    if (!user) return sendJson(res, 401, { error: "Credencial inválida" });
    // o nome do Google só vale na primeira entrada; depois a conta guarda o nome do crachá
    const acc = (store.data.accounts[user.sub] ??= { email: user.email, name: user.name, since: Date.now() });
    acc.email = user.email;
    store.save();
    sendJson(res, 200, { session: signSession(user.sub, auth.secret), name: acc.name });
  }

  function api(req: IncomingMessage, res: ServerResponse, path: string): void | Promise<void> {
    if (path === "/api/config") return sendJson(res, 200, { googleClientId: auth?.clientId ?? null });
    if (path === "/api/login") return login(req, res);
    if (path === "/api/ranking" && store) {
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
      const viewer = bearer && auth ? (readSession(bearer, auth.secret) ?? undefined) : undefined;
      return sendJson(res, 200, rankingView(store.data, Date.now(), viewer));
    }
    sendJson(res, 404, { error: "Não encontrado" });
  }

  const http: Server = createServer((req, res) => {
    const fail = (err: unknown) => {
      console.error("erro http", err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    };
    try {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
        return;
      }
      if (path.startsWith("/api/")) {
        Promise.resolve(api(req, res, path)).catch(fail);
        return;
      }
      serveStatic(req.url ?? "/", res);
    } catch (err) {
      fail(err);
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
