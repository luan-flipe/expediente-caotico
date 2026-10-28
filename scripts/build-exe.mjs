import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB_DIST = resolve(ROOT, "apps/web/dist");
const TEMP_DIR = resolve(ROOT, ".build-exe-temp");
const EXE_OUT = resolve(ROOT, "expediente-caotico.exe");

const MIME_MAP = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function collectFiles(dir, baseDir = dir) {
  const result = [];
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath, baseDir));
    } else {
      const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");
      const content = readFileSync(fullPath).toString("base64");
      const mime = MIME_MAP[extname(entry.name).toLowerCase()] || "application/octet-stream";
      result.push({ path: relPath, content, mime });
    }
  }
  return result;
}

async function main() {
  console.log("=== Construindo Expediente Caótico Executável ===");

  // 1. Build do cliente web se necessário
  console.log("[1/5] Compilando cliente web...");
  execSync("pnpm --filter @ec/web build", { cwd: ROOT, stdio: "inherit" });

  if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  // 2. Coletar assets estáticos para embutir no executável
  console.log("[2/5] Empacotando arquivos estáticos...");
  const files = collectFiles(WEB_DIST);
  console.log(`      ${files.length} arquivos estáticos encontrados.`);

  const embeddedAssetsSource = `
export const EMBEDDED_ASSETS = ${JSON.stringify(
    files.reduce((acc, f) => {
      acc[f.path] = { content: f.content, mime: f.mime };
      return acc;
    }, {}),
    null,
    2
  )};
`;
  writeFileSync(join(TEMP_DIR, "embedded-assets.ts"), embeddedAssetsSource, "utf-8");

  // 3. Gerar código do entrypoint standalone
  const standaloneSource = `
import { createServer } from "node:http";
import { existsSync, statSync, createReadStream, readFileSync } from "node:fs";
import { join, resolve, extname, normalize } from "node:path";
import { exec } from "node:child_process";
import { WebSocketServer } from "ws";
import { RoomManager, type Conn } from "../apps/server/src/rooms";
import { TokenBucket } from "../apps/server/src/ratelimit";
import { EMBEDDED_ASSETS } from "./embedded-assets";

const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const DISK_SEARCH_DIRS = [
  resolve(process.cwd(), "apps/web/dist"),
  resolve(process.cwd(), "web/dist"),
  resolve(process.cwd(), "dist"),
];

function findOnDisk(path: string): string | null {
  for (const dir of DISK_SEARCH_DIRS) {
    const full = join(dir, path);
    if (full.startsWith(dir) && existsSync(full) && !statSync(full).isDirectory()) {
      return full;
    }
  }
  return null;
}

function serveStatic(url: string, res: import("node:http").ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.split("?")[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const cleanPath = normalize(decoded).replace(/^([/\\\\])+/, "").replace(/\\\\/g, "/");
  const targetPath = cleanPath === "" ? "index.html" : cleanPath;

  // 1. Tentar ler do disco se disponível localmente
  const onDisk = findOnDisk(targetPath) || findOnDisk("index.html");
  if (onDisk) {
    const mime = MIME_MAP[extname(onDisk).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": mime });
    createReadStream(onDisk).pipe(res);
    return;
  }

  // 2. Servir do bundle embutido na memória
  const asset = EMBEDDED_ASSETS[targetPath] || EMBEDDED_ASSETS["index.html"];
  if (asset) {
    const buf = Buffer.from(asset.content, "base64");
    res.writeHead(200, {
      "content-type": asset.mime,
      "content-length": buf.length,
      "cache-control": targetPath === "index.html" ? "no-cache" : "public, max-age=31536000",
    });
    res.end(buf);
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 Não Encontrado");
}

function openBrowser(url: string) {
  if (process.env.NO_OPEN === "1") return;
  try {
    if (process.platform === "win32") {
      exec('start "" "' + url + '"');
    } else if (process.platform === "darwin") {
      exec('open "' + url + '"');
    } else {
      exec('xdg-open "' + url + '"');
    }
  } catch {}
}

const MAX_CONNS_PER_IP = 30;

function clientIp(req: import("node:http").IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (process.env.TRUST_PROXY === "1" && typeof fwd === "string") {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket.remoteAddress ?? "127.0.0.1";
}

export function start() {
  const port = Number(process.env.PORT ?? 2567);
  const manager = new RoomManager(10000);
  const server = createServer((req, res) => {
    try {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
        return;
      }
      serveStatic(req.url ?? "/", res);
    } catch (err) {
      console.error("Erro HTTP:", err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  const conns = new Map<string, number>();
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

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

  server.listen(port, () => {
    const actualPort = (server.address() as any)?.port ?? port;
    const url = "http://localhost:" + actualPort;
    console.log("");
    console.log("==============================================================");
    console.log("   EXPEDIENTE CAÓTICO");
    console.log("   Tiroteio corporativo em terceira pessoa no navegador");
    console.log("==============================================================");
    console.log("   Servidor online em: " + url);
    console.log("   WebSocket ativo em: " + url + "/ws");
    console.log("   Abrindo o jogo no seu navegador padrão...");
    console.log("   Pressione Ctrl+C a qualquer momento para encerrar.");
    console.log("==============================================================");
    console.log("");

    openBrowser(url);
  });

  process.on("SIGINT", () => {
    console.log("\\nEncerrando Expediente Caótico...");
    manager.close();
    wss.close();
    server.close(() => process.exit(0));
  });
}

start();
`;
  writeFileSync(join(TEMP_DIR, "standalone-entry.ts"), standaloneSource, "utf-8");

  // 4. Bundle com esbuild
  console.log("[3/5] Gerando bundle CJS com esbuild...");
  const esbuildPath = pathToFileURL(join(ROOT, "apps/server/node_modules/esbuild/lib/main.js")).href;
  const { build } = await import(esbuildPath);
  const bundledCjs = join(TEMP_DIR, "bundle.cjs");
  await build({
    entryPoints: [join(TEMP_DIR, "standalone-entry.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundledCjs,
    nodePaths: [join(ROOT, "apps/server/node_modules")],
  });

  // 5. Node SEA: Gerar blob e injetar no executável
  console.log("[4/5] Gerando blob SEA do Node.js...");
  const seaConfig = {
    main: bundledCjs,
    output: join(TEMP_DIR, "sea-prep.blob"),
    disableExperimentalSEAWarning: true,
  };
  const seaConfigFile = join(TEMP_DIR, "sea-config.json");
  writeFileSync(seaConfigFile, JSON.stringify(seaConfig, null, 2), "utf-8");

  execSync(`node --experimental-sea-config "${seaConfigFile}"`, { cwd: ROOT, stdio: "inherit" });

  console.log("[5/5] Injetando binário final em " + EXE_OUT + "...");
  if (existsSync(EXE_OUT)) {
    try {
      rmSync(EXE_OUT);
    } catch {
      console.warn("Aviso: arquivo existente não pôde ser removido diretamente.");
    }
  }

  copyFileSync(process.execPath, EXE_OUT);

  execSync(
    `npx postject "${EXE_OUT}" NODE_SEA_BLOB "${join(TEMP_DIR, "sea-prep.blob")}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
    { cwd: ROOT, stdio: "inherit" }
  );

  // Limpeza
  rmSync(TEMP_DIR, { recursive: true, force: true });

  const sizeMb = (statSync(EXE_OUT).size / (1024 * 1024)).toFixed(1);
  console.log("");
  console.log("==============================================================");
  console.log(`SUCESSO! Executavel gerado: expediente-caotico.exe (${sizeMb} MB)`);
  console.log("Para jogar, basta dar duplo clique no arquivo!");
  console.log("==============================================================");
}

main().catch((err) => {
  console.error("Erro na geracao do executavel:", err);
  process.exit(1);
});
