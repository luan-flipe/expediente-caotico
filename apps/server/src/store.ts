import { mkdirSync, readFileSync, renameSync, promises as fsp } from "node:fs";
import { join } from "node:path";
import { emptyRankingData, type RankingData } from "@ec/shared";

const SAVE_DELAY_MS = 2000;

/**
 * Limpezas que rodam uma vez por arquivo. "voltas-pr31": a física nova da corrida (PR 31) deixou as voltas
 * bem mais rápidas, então recordes, fantasmas e melhor volta de antes deixaram de ser comparáveis.
 * Pontos do mês, vitórias e contas ficam.
 */
const RESETS: { id: string; apply: (d: RankingData) => void }[] = [
  {
    id: "voltas-pr31",
    apply: (d) => {
      d.laps = {};
      for (const st of Object.values(d.stats)) st.bestLapMs = null;
    },
  },
];

function isRankingData(v: unknown): v is RankingData {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  const isObj = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x);
  return d.version === 1 && isObj(d.accounts) && isObj(d.stats) && isObj(d.months) && isObj(d.laps);
}

/** Arquivo de dados do ranking: um JSON em `dir`, gravado de forma atômica e agrupada. */
export class Store {
  data: RankingData;
  private readonly file: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private writing: Promise<void> = Promise.resolve();
  /** Arquivo existe mas não deu para ler: nunca gravar por cima dele. */
  private readOnly = false;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "ranking.json");
    this.data = this.load();
  }

  private load(): RankingData {
    let raw: string;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.readOnly = true;
        console.error("ranking.json ilegível: o ranking fica vazio e NADA será gravado até corrigir o arquivo/volume:", err);
      }
      return emptyRankingData();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRankingData(parsed)) {
        // arquivo anterior ao desafio da semana: sem o campo, vale vazio
        const challenges = (parsed as Partial<RankingData>).challenges;
        if (!challenges || typeof challenges !== "object" || Array.isArray(challenges)) parsed.challenges = {};
        if (this.applyResets(parsed)) this.dirty = true;
        return parsed;
      }
    } catch {
      // cai no tratamento de arquivo inválido
    }
    const bad = `${this.file}.bad-${Date.now()}`;
    try {
      renameSync(this.file, bad);
    } catch (err) {
      this.readOnly = true;
      console.error("não consegui guardar o ranking.json inválido; nada será gravado por cima dele:", err);
    }
    console.warn(`ranking.json inválido ou de versão desconhecida, guardado em ${bad}. Começando com dados vazios.`);
    return emptyRankingData();
  }

  /** Aplica as limpezas pendentes; true se mudou algo (o arquivo precisa ser regravado). */
  private applyResets(d: RankingData): boolean {
    const done = Array.isArray(d.resets) ? d.resets : [];
    const pending = RESETS.filter((r) => !done.includes(r.id));
    for (const r of pending) {
      r.apply(d);
      console.log(`ranking: limpeza "${r.id}" aplicada`);
    }
    d.resets = [...done, ...pending.map((r) => r.id)];
    return pending.length > 0;
  }

  /** Marca os dados como alterados; a gravação sai em até 2 s e junta chamadas seguidas. */
  save(): void {
    if (this.readOnly) return;
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, SAVE_DELAY_MS);
  }

  /** Grava já se houver pendência e espera qualquer gravação em andamento. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.dirty) {
      this.dirty = false;
      const json = JSON.stringify(this.data);
      this.writing = this.writing.then(() => this.write(json));
    }
    return this.writing;
  }

  private async write(json: string): Promise<void> {
    const tmp = `${this.file}.tmp`;
    try {
      await fsp.writeFile(tmp, json);
      await fsp.rename(tmp, this.file);
    } catch (err) {
      console.error("falha ao gravar o ranking, tentarei de novo na próxima gravação:", err);
      this.dirty = true;
    }
  }
}
