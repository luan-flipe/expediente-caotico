import type { FutEvent, FutSnapshot } from "@ec/shared";

/** Frases de narrador de firma. {n} = jogador, {t} = time. */
export const PHRASES = {
  gol: [
    "Gol de {n}! O {t} entregou antes do prazo.",
    "{n} balança a rede e o {t} bate a meta do trimestre.",
    "É gol! {n} aprovou o orçamento do {t} na raça.",
    "Gooool! {n} resolveu a pendência que ninguém queria assumir.",
  ],
  golContra: [
    "Gol contra de {n}. Fogo amigo é o pior tipo de fogo.",
    "{n} marcou contra. Isso vai pra ata da reunião.",
  ],
  falta: [
    "Falta de {n}. Isso vai pro relatório.",
    "{n} foi na bola e levou o adversário junto. Falta de alinhamento.",
    "Falta marcada. {n} precisa de um treinamento de convivência.",
  ],
  amarelo: [
    "Amarelo para {n}. O RH já foi avisado.",
    "{n} recebe o amarelo. Advertência formal, com cópia para a chefia.",
  ],
  vermelho: [
    "Vermelho para {n}! Rescisão sem justa causa.",
    "{n} está expulso. Pode devolver o crachá.",
  ],
  defesa: [
    "O goleiro do {t} defende! Esse aí merece reajuste.",
    "Defesaça do {t}! Chamem o gerente, tem muralha na área.",
    "O {t} salva! Goleiro com escala 6x1 e ainda faz milagre.",
  ],
  trave: [
    "Na trave! Foi por um parafuso.",
    "Bateu no pé da trave! Quase uma reunião que acabou no horário.",
  ],
  quase: [
    "Passou raspando! Faltou só a assinatura do gerente.",
    "Quase! A bola pediu licença e saiu.",
  ],
  penalti: [
    "Pênalti! Ninguém quer assumir essa responsabilidade.",
    "É pênalti! Hora de provar que sabe lidar com pressão.",
  ],
  penConvertido: [
    "{n} bate e converte. O {t} bate a meta.",
    "Gol de pênalti! {n} nem piscou.",
  ],
  penPerdido: [
    "{n} perde a cobrança. Sem bônus esse trimestre.",
    "Defendeu! {n} vai ter que justificar isso depois.",
  ],
} as const;

/** Espaço (ms) mínimo entre duas falas quaisquer e entre falas do mesmo tipo (gol e pênalti da disputa ignoram o geral). */
const GAP_ANY = 4000;
const GAP_KIND: Record<string, number> = { falta: 14000, quase: 12000, trave: 10000, defesa: 10000, amarelo: 6000, vermelho: 3000, penalti: 6000 };
const ALWAYS = new Set(["gol", "golContra", "penConvertido", "penPerdido"]);

export interface NarraState {
  lastAt: number;
  lastByKind: Record<string, number>;
}

export function newNarra(): NarraState {
  return { lastAt: -Infinity, lastByKind: {} };
}

function pick(list: readonly string[], rng: () => number): string {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** Escolhe o tipo de fala do evento (null = o evento não é narrado) e quem fala dele. */
function classify(s: FutSnapshot, e: FutEvent): { kind: keyof typeof PHRASES; n: string; t: string } | null {
  const name = (id: string | null | undefined) => s.players.find((p) => p.id === id)?.name ?? "alguém";
  const team = (side: 0 | 1) => s.teams[side].name;
  switch (e.type) {
    case "goal":
      return { kind: e.own ? "golContra" : "gol", n: name(e.scorerId), t: team(e.side) };
    case "foul": {
      const side = s.players.find((p) => p.id === e.id)?.side ?? 0;
      return { kind: "falta", n: name(e.id), t: team(side) };
    }
    case "card": {
      const side = s.players.find((p) => p.id === e.id)?.side ?? 0;
      return { kind: e.card === "yellow" ? "amarelo" : "vermelho", n: name(e.id), t: team(side) };
    }
    case "save":
      return { kind: "defesa", n: "Goleiro", t: team(e.side) };
    case "near":
      return { kind: e.post ? "trave" : "quase", n: "", t: team(e.side) };
    case "restart":
      return e.kind === "penalti" ? { kind: "penalti", n: "", t: "" } : null;
    case "pen": {
      return { kind: e.scored ? "penConvertido" : "penPerdido", n: name(e.takerId), t: team(e.side) };
    }
    default:
      return null;
  }
}

/** Linha de narração para o evento, ou null quando ele não é narrado ou a narração ainda está em descanso (para não poluir a tela). */
export function narrate(s: FutSnapshot, e: FutEvent, st: NarraState, now: number, rng: () => number): string | null {
  const c = classify(s, e);
  if (!c) {
    return null;
  }
  if (!ALWAYS.has(c.kind)) {
    if (now - st.lastAt < GAP_ANY || now - (st.lastByKind[c.kind] ?? -Infinity) < (GAP_KIND[c.kind] ?? GAP_ANY)) {
      return null;
    }
  }
  st.lastAt = now;
  st.lastByKind[c.kind] = now;
  return pick(PHRASES[c.kind], rng).replace("{n}", c.n).replace("{t}", c.t);
}
