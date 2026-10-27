import type { AbilityId, AbilityParams } from "../types";

export type AbilityKind = "chain" | "nova" | "fan" | "cone" | "projectile" | "dash" | "buff" | "zone" | "teleport";
export type AbilityFamily = "offense" | "control" | "mobility" | "defense";

export interface SpecDef {
  name: string;
  desc: string;
  mod: AbilityParams;
}

export interface AbilityDef {
  id: AbilityId;
  name: string;
  family: AbilityFamily;
  kind: AbilityKind;
  color: string;
  desc: string;
  cooldownMs: number;
  base: AbilityParams;
  specA: SpecDef;
  specB: SpecDef;
}

export const ABILITY_IDS: AbilityId[] = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3", "D1", "D2", "D3"];

/** Valores do nível I. Escala por nível em BALANCE.levelDamageScale e levelCooldownScale. */
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  A1: {
    id: "A1", name: "Choque do TI", family: "offense", kind: "chain", color: "#5ad1ff", cooldownMs: 7000,
    desc: "Raio que salta entre adversários próximos.",
    base: { damage: 18, range: 14, chains: 2, chainRange: 7 },
    specA: { name: "Sobrecarga", desc: "+2 saltos", mod: { chains: 2 } },
    specB: { name: "Curto-circuito", desc: "Atordoa o primeiro alvo por 0,6 s", mod: { stunMs: 600 } },
  },
  A2: {
    id: "A2", name: "Cadeira Giratória", family: "offense", kind: "nova", color: "#ff8a3d", cooldownMs: 8000,
    desc: "Gira na cadeira e acerta quem estiver em volta.",
    base: { damage: 20, radius: 3.5, knock: 9 },
    specA: { name: "Tornado", desc: "Raio +40%", mod: { radius: 1.4 } },
    specB: { name: "Rodinha solta", desc: "Empurrão em dobro e lentidão", mod: { knock: 9, slowMs: 1500, slowPct: 0.35 } },
  },
  A3: {
    id: "A3", name: "Impressora Descontrolada", family: "offense", kind: "fan", color: "#f4f1ea", cooldownMs: 6000,
    desc: "Dispara um leque de folhas.",
    base: { damage: 7, count: 5, spreadDeg: 40, speed: 26, range: 18, radius: 0.35 },
    specA: { name: "Modo rascunho", desc: "+3 folhas", mod: { count: 3 } },
    specB: { name: "Toner", desc: "Folhas causam lentidão", mod: { slowMs: 1000, slowPct: 0.3 } },
  },
  B1: {
    id: "B1", name: "Café na Cara", family: "control", kind: "cone", color: "#8b5a2b", cooldownMs: 9000,
    desc: "Jato de café em cone que cega.",
    base: { damage: 10, range: 6, spreadDeg: 70, blindMs: 2000 },
    specA: { name: "Expresso", desc: "Cegueira +1,5 s", mod: { blindMs: 1500 } },
    specB: { name: "Cappuccino", desc: "+6 de dano e lentidão", mod: { damage: 6, slowMs: 1500, slowPct: 0.35 } },
  },
  B2: {
    id: "B2", name: "Grampeador Nervoso", family: "control", kind: "projectile", color: "#c9ced6", cooldownMs: 9000,
    desc: "Grampo rápido que atordoa.",
    base: { damage: 14, speed: 40, range: 22, radius: 0.3, stunMs: 800, count: 1, spreadDeg: 8 },
    specA: { name: "Grampo duplo", desc: "Dispara 2 grampos", mod: { count: 1 } },
    specB: { name: "Grampo industrial", desc: "Atordoa +0,6 s", mod: { stunMs: 600 } },
  },
  B3: {
    id: "B3", name: "Arquivo Confidencial", family: "control", kind: "projectile", color: "#d9b26a", cooldownMs: 8000,
    desc: "Pasta pesada que empurra longe.",
    base: { damage: 16, speed: 22, range: 18, radius: 0.6, knock: 14, count: 1 },
    specA: { name: "Pasta suspensa", desc: "Atravessa adversários", mod: { pierce: true } },
    specB: { name: "Arquivo morto", desc: "Maior e +8 de dano", mod: { radius: 0.4, damage: 8 } },
  },
  C1: {
    id: "C1", name: "Sprint do Estagiário", family: "mobility", kind: "dash", color: "#24d17e", cooldownMs: 5000,
    desc: "Arrancada na direção da mira.",
    base: { range: 9, durationMs: 220 },
    specA: { name: "Atropelo", desc: "15 de dano e empurrão em quem tocar", mod: { damage: 15, knock: 8 } },
    specB: { name: "Hora extra", desc: "Recarga -40%", mod: { cooldownPct: -0.4 } },
  },
  C2: {
    id: "C2", name: "Escudo do Jurídico", family: "defense", kind: "buff", color: "#7b8cff", cooldownMs: 12000,
    desc: "Escudo temporário de 30.",
    base: { shield: 30, durationMs: 4000 },
    specA: { name: "Liminar", desc: "Escudo +15", mod: { shield: 15 } },
    specB: { name: "Recurso", desc: "Cura 20", mod: { heal: 20 } },
  },
  C3: {
    id: "C3", name: "Café Duplo", family: "mobility", kind: "buff", color: "#ffcc4d", cooldownMs: 12000,
    desc: "Corre e atira mais rápido por 4 s.",
    base: { hasteMult: 1.5, durationMs: 4000 },
    specA: { name: "Café triplo", desc: "+2 s de efeito", mod: { durationMs: 2000 } },
    specB: { name: "Com açúcar", desc: "Cura 15", mod: { heal: 15 } },
  },
  D1: {
    id: "D1", name: "Vazamento de TI", family: "offense", kind: "zone", color: "#9b5cff", cooldownMs: 10000,
    desc: "Poça de dados que causa dano contínuo no ponto mirado.",
    base: { damage: 6, radius: 3, tickMs: 500, durationMs: 4000, range: 16 },
    specA: { name: "Vazamento geral", desc: "Raio +40%", mod: { radius: 1.2 } },
    specB: { name: "Dados corrompidos", desc: "Causa lentidão", mod: { slowMs: 700, slowPct: 0.35 } },
  },
  D2: {
    id: "D2", name: "Reunião Obrigatória", family: "control", kind: "zone", color: "#ff5f8f", cooldownMs: 12000,
    desc: "Área onde todo mundo fica lento.",
    base: { damage: 2, radius: 4.5, tickMs: 300, durationMs: 3000, range: 16, slowMs: 600, slowPct: 0.5 },
    specA: { name: "Pauta extensa", desc: "+2 s de duração", mod: { durationMs: 2000 } },
    specB: { name: "Convocação", desc: "Atordoa 0,5 s ao lançar", mod: { stunMs: 500 } },
  },
  D3: {
    id: "D3", name: "Teletransporte do Home Office", family: "mobility", kind: "teleport", color: "#3fb8c4", cooldownMs: 10000,
    desc: "Teleporta para o ponto mirado.",
    base: { range: 12 },
    specA: { name: "VPN", desc: "Recarga -40%", mod: { cooldownPct: -0.4 } },
    specB: { name: "Volta presencial", desc: "Escudo de 20 ao chegar", mod: { shield: 20, durationMs: 3000 } },
  },
};
