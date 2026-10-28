import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRankingData } from "@ec/shared";
import { Store } from "../store";

let root: string;
beforeEach(async () => {
  root = await fsp.mkdtemp(join(tmpdir(), "ec-store-"));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await fsp.rm(root, { recursive: true, force: true });
});

const read = async (dir: string) => JSON.parse(await fsp.readFile(join(dir, "ranking.json"), "utf8"));

describe("Store", () => {
  it("sem arquivo começa vazio e não cria nada até ter o que gravar", async () => {
    const s = new Store(root);
    expect(s.data).toEqual(emptyRankingData());
    await s.flush();
    expect(await fsp.readdir(root)).toEqual([]);
  });

  it("grava no flush e relê numa nova instância, sem deixar o .tmp", async () => {
    const a = new Store(root);
    a.data.accounts["g1"] = { email: "a@b.c", name: "Ana", since: 1 };
    a.save();
    await a.flush();
    expect(await fsp.readdir(root)).toEqual(["ranking.json"]);
    const b = new Store(root);
    expect(b.data.accounts["g1"].name).toBe("Ana");
  });

  it("vários save() seguidos viram uma escrita só, em até 2 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const write = vi.spyOn(fsp, "writeFile");
    const s = new Store(root);
    s.data.months["2026-10"] = { g1: 1 };
    s.save();
    s.data.months["2026-10"] = { g1: 2 };
    s.save();
    s.data.months["2026-10"] = { g1: 3 };
    s.save();
    await vi.advanceTimersByTimeAsync(1999);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await s.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect((await read(root)).months["2026-10"].g1).toBe(3);
    await vi.advanceTimersByTimeAsync(10000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush sem pendência não escreve de novo", async () => {
    const s = new Store(root);
    s.save();
    await s.flush();
    const write = vi.spyOn(fsp, "writeFile");
    await s.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("cria o diretório se não existir", async () => {
    const dir = join(root, "fundo", "dados");
    const s = new Store(dir);
    s.save();
    await s.flush();
    expect((await read(dir)).version).toBe(1);
  });

  it("JSON corrompido sobe vazio, guarda o arquivo como .bad e avisa", async () => {
    await fsp.writeFile(join(root, "ranking.json"), "{ isso nao eh json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = new Store(root);
    expect(s.data).toEqual(emptyRankingData());
    expect(warn).toHaveBeenCalled();
    const files = await fsp.readdir(root);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^ranking\.json\.bad-\d+$/);
    expect(await fsp.readFile(join(root, files[0]), "utf8")).toBe("{ isso nao eh json");
  });

  it("versão desconhecida ou formato errado conta como inválido", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of [{ ...emptyRankingData(), version: 2 }, { version: 1 }, [], null]) {
      await fsp.writeFile(join(root, "ranking.json"), JSON.stringify(bad));
      const s = new Store(root);
      expect(s.data).toEqual(emptyRankingData());
      expect((await fsp.readdir(root)).some((f) => f.startsWith("ranking.json.bad-"))).toBe(true);
      await fsp.rm(root, { recursive: true });
      await fsp.mkdir(root);
    }
  });

  it("falha de escrita não derruba e a próxima tentativa regrava", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = new Store(root);
    s.save();
    const write = vi.spyOn(fsp, "writeFile").mockRejectedValueOnce(new Error("disco cheio"));
    await expect(s.flush()).resolves.toBeUndefined();
    await s.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect((await read(root)).version).toBe(1);
  });
});

describe("Store com arquivo ilegível", () => {
  it("erro de leitura que não é arquivo ausente deixa o servidor de pé mas sem gravar por cima", async () => {
    // um diretório no lugar do arquivo dá EISDIR na leitura, como um volume com permissão errada
    await fsp.mkdir(join(root, "ranking.json"));
    await fsp.writeFile(join(root, "ranking.json", "dentro"), "x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const write = vi.spyOn(fsp, "writeFile");
    const s = new Store(root);
    expect(s.data).toEqual(emptyRankingData());
    s.data.accounts["g1"] = { email: "a@b.c", name: "Ana", since: 1 };
    s.save();
    await s.flush();
    expect(write).not.toHaveBeenCalled();
    expect((await fsp.readdir(root)).sort()).toEqual(["ranking.json"]);
  });
});

describe("Store: zerar recordes depois da física nova (PR 31)", () => {
  it("apaga voltas, fantasmas e melhor volta uma única vez e mantém o resto", async () => {
    const old = emptyRankingData();
    old.accounts["g1"] = { email: "a@b.c", name: "Ana", since: 1 };
    old.stats["g1"] = { shooterWins: 2, shooterMatches: 3, shooterKills: 9, raceWins: 1, racePodiums: 1, raceMatches: 2, bestLapMs: 25000 };
    old.months["2026-10"] = { g1: 21 };
    old.laps["corporativo"] = { g1: { ms: 25000, at: 1, ghost: [[0, 0, 0, 0]] } };
    delete (old as Partial<typeof old>).resets;
    await fsp.writeFile(join(root, "ranking.json"), JSON.stringify(old));

    const a = new Store(root);
    expect(a.data.laps).toEqual({});
    expect(a.data.stats["g1"].bestLapMs).toBeNull();
    expect(a.data.stats["g1"].shooterWins).toBe(2);
    expect(a.data.months["2026-10"].g1).toBe(21);
    expect(a.data.accounts["g1"].name).toBe("Ana");
    await a.flush();

    // depois de gravado, uma volta nova não é apagada no próximo início
    a.data.laps["copa"] = { g1: { ms: 11000, at: 2, ghost: [] } };
    a.save();
    await a.flush();
    const b = new Store(root);
    expect(b.data.laps["copa"]["g1"].ms).toBe(11000);
  });
});
