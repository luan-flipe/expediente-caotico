import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, DEFAULT_CHAIR, MAIN_TRACK_ID, applyAwards, applyShooterResult, emptyRankingData, type PlayerProfile } from "@ec/shared";
import { publicId, startServer, type RunningServer } from "../app";
import { signSession } from "../auth";
import { Store } from "../store";

const SECRET = "segredo-de-teste";
const ANA = publicId("g-ana", SECRET);
const BETO = publicId("g-beto", SECRET);

let srv: RunningServer;
let store: Store;
let dir: string;
const base = () => `http://localhost:${srv.port}`;
const perfil = (query: string, headers: Record<string, string> = {}) => fetch(`${base()}/api/perfil${query}`, { headers });

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  dir = mkdtempSync(join(tmpdir(), "ec-perfil-"));
  store = new Store(dir);
  store.data.accounts = {
    "g-ana": { email: "ana@firma.com", name: "Ana", since: 1, avatar: { ...DEFAULT_AVATAR, name: "Ana", hair: 4 }, chair: { ...DEFAULT_CHAIR, back: 2 } },
    "g-beto": { email: "beto@firma.com", name: "Beto", since: 1 },
  };
  const ghost = [[0, 0, 0, 0]] as [number, number, number, number][];
  store.data.laps[MAIN_TRACK_ID] = { "g-beto": { ms: 28000, at: 1, ghost }, "g-ana": { ms: 29000, at: 1, ghost } };
  applyShooterResult(store.data, [{ accountId: "g-ana", rank: 1, kills: 6 }, { accountId: "g-beto", rank: 2, kills: 2 }], Date.now());
  applyAwards(store.data, [{ accountId: "g-ana", title: "Rei do café" }]);
  srv = await startServer(0, { idleMs: 120000, store, auth: { clientId: "teste", secret: SECRET } });
});
afterAll(async () => {
  await srv.close();
  await store.flush();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/perfil", () => {
  it("devolve o perfil da conta do apelido, sem cache", async () => {
    const r = await perfil(`?id=${ANA}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const p = (await r.json()) as PlayerProfile;
    expect(p.id).toBe(ANA);
    expect(p.name).toBe("Ana");
    expect(p.avatar.hair).toBe(4);
    expect(p.chair.back).toBe(2);
    expect(p.stats).toMatchObject({ shooterWins: 1, shooterMatches: 1, shooterKills: 6 });
    expect(p.laps).toEqual([{ track: MAIN_TRACK_ID, trackName: expect.any(String), ms: 29000, rank: 2 }]);
    expect(p.month.position).toBe(1);
    expect(p.awards).toEqual([{ title: "Rei do café", count: 1 }]);
    expect(p.history).toHaveLength(1);
    expect(p.history[0]).toMatchObject({ mode: "shooter", place: 1, kills: 6 });
    expect(p.challenges.week.target).toBeGreaterThan(0);
  });

  it("resolve cada apelido para a conta certa", async () => {
    const b = (await (await perfil(`?id=${BETO}`)).json()) as PlayerProfile;
    expect(b.name).toBe("Beto");
    expect(b.laps[0].rank).toBe(1);
  });

  it("apelido desconhecido dá 404", async () => {
    const r = await perfil("?id=aaaaaaaaaaaaaaaa");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("parâmetro ausente, repetido ou malformado dá 400", async () => {
    for (const q of ["", "?id=", `?id=${ANA}&id=${BETO}`, "?id=curto", `?id=${ANA}x`, "?id=g-ana", "?id=../../etc"]) {
      expect((await perfil(q)).status, q).toBe(400);
    }
  });

  it("não vaza id do Google nem e-mail em lugar nenhum do corpo", async () => {
    for (const id of [ANA, BETO]) {
      const body = await (await perfil(`?id=${id}`)).text();
      expect(body).not.toMatch(/g-ana|g-beto|@firma\.com|email/);
    }
  });

  it("conta nova entra na resolução sem reiniciar", async () => {
    expect((await perfil(`?id=${publicId("g-caio", SECRET)}`)).status).toBe(404);
    store.data.accounts["g-caio"] = { email: "caio@firma.com", name: "Caio", since: 1 };
    const r = await perfil(`?id=${publicId("g-caio", SECRET)}`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as PlayerProfile).name).toBe("Caio");
  });

  it("id=eu devolve o perfil de quem está logado e exige sessão", async () => {
    const sem = await perfil("?id=eu");
    expect(sem.status).toBe(401);
    const ok = await perfil("?id=eu", { authorization: `Bearer ${signSession("g-beto", SECRET)}` });
    expect(ok.status).toBe(200);
    const p = (await ok.json()) as PlayerProfile;
    expect(p.name).toBe("Beto");
    expect(p.id).toBe(BETO);
  });

  it("sessão de conta que sumiu do arquivo dá 404 no id=eu", async () => {
    const r = await perfil("?id=eu", { authorization: `Bearer ${signSession("g-fantasma", SECRET)}` });
    expect(r.status).toBe(404);
  });
});

describe("arquivo antigo (sem histórico nem prêmios)", () => {
  it("o Store carrega e o perfil sai vazio nesses campos", () => {
    const old = mkdtempSync(join(tmpdir(), "ec-perfil-old-"));
    try {
      const data = { ...emptyRankingData(), accounts: { "g-x": { email: "x@y.z", name: "X", since: 1 } } } as Record<string, unknown>;
      delete data.challenges;
      writeFileSync(join(old, "ranking.json"), JSON.stringify(data));
      const s = new Store(old);
      expect(s.data.accounts["g-x"].name).toBe("X");
      expect(s.data.accounts["g-x"].history).toBeUndefined();
      expect(s.data.challenges).toEqual({});
    } finally {
      rmSync(old, { recursive: true, force: true });
    }
  });
});
