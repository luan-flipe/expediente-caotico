import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, DEFAULT_CHAIR, MAIN_TRACK_ID, type GhostSample, type ReplayData, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";
import { signSession } from "../auth";
import { Store } from "../store";

const SECRET = "segredo-de-teste";
const ghost = (ms: number): GhostSample[] => [
  [0, 0, 0, 0],
  [ms / 2, 5, 5, 1],
  [ms, 10, 0, 2],
];

let srv: RunningServer;
let store: Store;
let dir: string;
const base = () => `http://localhost:${srv.port}`;
const replay = (query: string) => fetch(`${base()}/api/replay${query}`);

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  dir = mkdtempSync(join(tmpdir(), "ec-replay-"));
  store = new Store(dir);
  store.data.accounts = {
    "g-ana": { email: "ana@firma.com", name: "Ana", since: 1, avatar: { ...DEFAULT_AVATAR, name: "Ana", hair: 5 }, chair: { ...DEFAULT_CHAIR, back: 2 } },
    "g-beto": { email: "beto@firma.com", name: "Beto", since: 1 },
    "g-caio": { email: "caio@firma.com", name: "Caio", since: 1 },
  };
  store.data.laps[MAIN_TRACK_ID] = {
    "g-beto": { ms: 61000, at: 1, ghost: ghost(61000) },
    "g-ana": { ms: 55000, at: 1, ghost: ghost(55000) },
    "g-caio": { ms: 70000, at: 1, ghost: ghost(70000) },
  };
  srv = await startServer(0, { idleMs: 120000, store, auth: { clientId: "teste", secret: SECRET } });
});
afterAll(async () => {
  await srv.close();
  await store.flush();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/replay", () => {
  it("devolve a linha certa na ordem da aba de voltas, sem cache", async () => {
    const r1 = await replay(`?pista=${MAIN_TRACK_ID}&linha=1`);
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    const a = (await r1.json()) as ReplayData;
    expect(a).toMatchObject({ name: "Ana", ms: 55000 });
    expect(a.ghost).toEqual(ghost(55000));
    expect(a.avatar.hair).toBe(5);
    expect(a.chair.back).toBe(2);
    const b = (await (await replay(`?pista=${MAIN_TRACK_ID}&linha=2`)).json()) as ReplayData;
    expect(b).toMatchObject({ name: "Beto", ms: 61000 });
    const c = (await (await replay(`?pista=${MAIN_TRACK_ID}&linha=3`)).json()) as ReplayData;
    expect(c).toMatchObject({ name: "Caio", ms: 70000 });
  });

  it("quem nunca guardou boneco e cadeira volta com os padrões", async () => {
    const b = (await (await replay(`?pista=${MAIN_TRACK_ID}&linha=2`)).json()) as ReplayData;
    expect(b.avatar).toEqual({ ...DEFAULT_AVATAR, name: "Beto" });
    expect(b.chair).toEqual(DEFAULT_CHAIR);
  });

  it("não expõe id de conta nem e-mail", async () => {
    for (const linha of [1, 2, 3]) {
      const body = await (await replay(`?pista=${MAIN_TRACK_ID}&linha=${linha}`)).text();
      expect(body).not.toContain("g-ana");
      expect(body).not.toContain("g-beto");
      expect(body).not.toContain("g-caio");
      expect(body).not.toContain("@firma.com");
      expect(body).not.toContain("email");
      expect(Object.keys(JSON.parse(body)).sort()).toEqual(["avatar", "chair", "ghost", "ms", "name"]);
    }
  });

  it("linha fora do intervalo e pista desconhecida dão 404", async () => {
    expect((await replay(`?pista=${MAIN_TRACK_ID}&linha=4`)).status).toBe(404);
    expect((await replay(`?pista=${MAIN_TRACK_ID}&linha=999`)).status).toBe(404);
    expect((await replay(`?pista=nao-existe&linha=1`)).status).toBe(404);
  });

  it("parâmetros ruins dão 400", async () => {
    for (const q of ["", `?pista=${MAIN_TRACK_ID}`, "?linha=1", `?pista=${MAIN_TRACK_ID}&linha=0`, `?pista=${MAIN_TRACK_ID}&linha=-1`, `?pista=${MAIN_TRACK_ID}&linha=1.5`, `?pista=${MAIN_TRACK_ID}&linha=abc`, `?pista=${MAIN_TRACK_ID}&linha=99999999999`, `?pista=${"x".repeat(100)}&linha=1`, `?pista=a%20b&linha=1`, `?pista=__proto__x&linha=1&linha=2`]) {
      expect((await replay(q)).status, q).toBe(400);
    }
  });
});

describe("boneco e cadeira da conta", () => {
  it("logado: o servidor guarda o último boneco e cadeira, sanitizados", async () => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    const msgs: ServerMsg[] = [];
    ws.on("message", (d) => msgs.push(JSON.parse(d.toString())));
    await new Promise<void>((ok) => ws.once("open", () => ok()));
    const session = signSession("g-caio", SECRET);
    ws.send(JSON.stringify({ t: "create", name: "Caio", avatar: { ...DEFAULT_AVATAR, name: "Caio", hair: 3 }, chair: { ...DEFAULT_CHAIR, seat: 1 }, session }));
    await vi_until(() => msgs.some((m) => m.t === "welcome"));
    expect(store.data.accounts["g-caio"].avatar?.hair).toBe(3);
    expect(store.data.accounts["g-caio"].chair?.seat).toBe(1);

    // lixo vira valores válidos; nada fora do formato entra no arquivo
    ws.send(JSON.stringify({ t: "avatar", avatar: { ...DEFAULT_AVATAR, name: "Caio", hair: 9999, evil: "x".repeat(500) }, chair: { seat: 99999, base: "<script>", extra: 1 } }));
    await vi_until(() => store.data.accounts["g-caio"].avatar?.hair !== 3);
    const acc = store.data.accounts["g-caio"];
    expect(acc.avatar).toBeDefined();
    expect(Object.keys(acc.avatar!)).not.toContain("evil");
    expect(Object.keys(acc.chair!).sort()).toEqual(Object.keys(DEFAULT_CHAIR).sort());
    expect(typeof acc.chair!.base).toBe("number");
    expect(acc.chair!.seat).toBeLessThan(99999);
    ws.close();
  });

  it("visitante não grava nada em conta alguma", async () => {
    const before = JSON.stringify(store.data.accounts);
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    const msgs: ServerMsg[] = [];
    ws.on("message", (d) => msgs.push(JSON.parse(d.toString())));
    await new Promise<void>((ok) => ws.once("open", () => ok()));
    ws.send(JSON.stringify({ t: "create", name: "Visitante", avatar: DEFAULT_AVATAR }));
    await vi_until(() => msgs.some((m) => m.t === "welcome"));
    expect(JSON.stringify(store.data.accounts)).toBe(before);
    ws.close();
  });
});

async function vi_until(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
}
