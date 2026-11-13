import { FUT_COLORS, type FutTeamConfig, type TeamSide } from "@ec/shared";
import type { FutResults } from "../store";

/** O que vai na imagem do placar: times, gols, quem marcou, melhor jogador e alguns números da partida. */
export interface Placar {
  times: { nome: string; cor: string; gols: number; autores: string[] }[];
  titulo: string;
  penaltis: string | null;
  craque: string | null;
  numeros: { rotulo: string; v: [string, string] }[];
}

/** treino: a partida foi treino de chute (sem vencedor): o título conta os gols. */
export function montarPlacar(res: FutResults, teams: [FutTeamConfig, FutTeamConfig] | undefined, treino = false): Placar {
  const { score, pens, winner } = res.score;
  const nome = (side: TeamSide) => teams?.[side]?.name ?? `Time ${side + 1}`;
  const times = ([0, 1] as const).map((side) => ({
    nome: nome(side),
    cor: FUT_COLORS[teams?.[side]?.color ?? side]?.hex ?? "#888888",
    gols: score[side],
    autores: res.rows.filter((r) => r.side === side && r.goals > 0).map((r) => (r.goals > 1 ? `${r.name} (${r.goals})` : r.name)),
  }));
  const st = res.stats;
  const craque = st?.mvpId ? (res.rows.find((r) => r.id === st.mvpId)?.name ?? null) : null;
  const numeros = st
    ? [
        { rotulo: "Posse de bola", v: [`${st.poss[0]}%`, `${st.poss[1]}%`] as [string, string] },
        { rotulo: "Chutes no gol", v: [String(st.shotsOn[0]), String(st.shotsOn[1])] as [string, string] },
        { rotulo: "Passes", v: [String(st.passes[0]), String(st.passes[1])] as [string, string] },
      ]
    : [];
  return {
    times,
    titulo: treino ? `Treino de chute: ${score[0]} gol${score[0] === 1 ? "" : "s"}` : winner === null ? "Empate" : `Vitória do ${nome(winner)}`,
    penaltis: pens ? `Nos pênaltis: ${pens[0]} x ${pens[1]}` : null,
    craque,
    numeros,
  };
}

function corDoTexto(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#14120f" : "#fffdf7";
}

/** Corta o texto com reticências até caber na largura. */
function caber(g: CanvasRenderingContext2D, t: string, w: number): string {
  if (g.measureText(t).width <= w) return t;
  let s = t;
  while (s.length > 1 && g.measureText(`${s}...`).width > w) s = s.slice(0, -1);
  return `${s}...`;
}

/** Desenha o placar num PNG quadrado (1080 x 1080), no visual do jogo. */
export async function imagemDoPlacar(p: Placar): Promise<Blob | null> {
  const S = 1080;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  if (!g) return null;
  await document.fonts?.ready;
  const F = "'Bricolage Grotesque', sans-serif";
  g.fillStyle = "#f6f1e4";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#14120f";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 64px ${F}`;
  g.fillText("Futebol da Firma", S / 2, 110);

  // placar: um bloco por time
  p.times.forEach((t, i) => {
    const x = 70 + i * 490;
    g.fillStyle = "#14120f";
    g.fillRect(x + 10, 220, 450, 330);
    g.fillStyle = t.cor;
    g.fillRect(x, 210, 450, 330);
    g.fillStyle = corDoTexto(t.cor);
    g.font = `800 46px ${F}`;
    g.fillText(caber(g, t.nome, 410), x + 225, 270);
    g.font = `800 200px ${F}`;
    g.fillText(String(t.gols), x + 225, 430);
    g.fillStyle = "#14120f";
    g.font = `600 30px ${F}`;
    t.autores.slice(0, 4).forEach((a, k) => g.fillText(caber(g, a, 440), x + 225, 600 + k * 40));
  });
  g.fillStyle = "#14120f";
  g.font = `800 36px ${F}`;
  g.fillText("x", S / 2, 375);

  let y = 790;
  g.font = `800 52px ${F}`;
  g.fillText(p.titulo, S / 2, y);
  g.font = `600 32px ${F}`;
  if (p.penaltis) g.fillText(p.penaltis, S / 2, (y += 50));
  if (p.craque) g.fillText(caber(g, `Melhor jogador: ${p.craque}`, 940), S / 2, (y += 50));
  y += 30;
  for (const n of p.numeros) {
    y += 42;
    g.font = `600 28px ${F}`;
    g.fillText(n.rotulo, S / 2, y);
    g.font = `800 30px ${F}`;
    g.fillText(n.v[0], S / 2 - 260, y);
    g.fillText(n.v[1], S / 2 + 260, y);
  }
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}

/** Compartilha (celular) ou baixa (computador) a imagem do placar. Devolve o que aconteceu, para o botão avisar. */
export async function compartilharPlacar(p: Placar): Promise<"compartilhado" | "baixado" | "falhou"> {
  const blob = await imagemDoPlacar(p);
  if (!blob) return "falhou";
  const file = new File([blob], "placar-futebol-da-firma.png", { type: "image/png" });
  const texto = `${p.times[0].nome} ${p.times[0].gols} x ${p.times[1].gols} ${p.times[1].nome} no Futebol da Firma`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: texto });
      return "compartilhado";
    }
  } catch (err) {
    // o jogador fechou a janela de compartilhar: não é erro, só não baixa
    if ((err as Error).name === "AbortError") return "falhou";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "baixado";
}
