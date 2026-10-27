import type { AvatarDNA } from "../types";

/** Skins prontas (GLB inteiro, sem crachá). O índice 0 é o boneco montado pelo crachá. */
export const MODELS = ["Montar o meu", "Polo com barba"];
export const SKINS = ["#f6d7c3", "#eec1a0", "#d9a27a", "#c68863", "#a96d4a", "#8a5537", "#6b3f27", "#4a2c1b"];
export const HAIR_STYLES = ["Careca", "Curto", "Médio", "Longo", "Coque", "Moicano", "Cacheado", "Volumoso"];
/** Ordem dos penteados na tela; o índice salvo no crachá continua o de HAIR_STYLES. */
export const HAIR_ORDER = [0, 1, 7, 2, 3, 4, 5, 6];
export const HAIR_COLORS = ["#1b1410", "#3b2416", "#6b4226", "#a8743f", "#d9b26a", "#9a9a9a", "#b8442f", "#3a5bd9"];
export const SHIRTS = ["#2f6fdf", "#e2483c", "#24a06b", "#f2b632", "#7b4bd6", "#f4f1ea", "#232323", "#ef7aa8", "#3fb8c4", "#8a6a4a"];
/** O primeiro é o castanho escuro original do boneco do romulo-h. */
export const EYE_COLORS = ["#3a2430", "#5b3a1e", "#9a6a2a", "#3f7a45", "#3a6fc4", "#7d8b95", "#111111"];
export const PANTS = ["#26324a", "#1e1e1e", "#5a5f66", "#7a5b3a", "#c9b48a", "#2f4d3a", "#4a3a6b", "#9aa3ad"];
export const BEARDS = ["Sem barba", "Curta", "Cheia"];
/** Índice 2 (Tênis) é o calçado do próprio boneco e o padrão. */
export const SHOES = ["Descalço", "Meia", "Tênis", "Sapato", "Salto alto", "Bota bico de aço", "Galocha"];
export const GLASSES = ["Sem óculos", "Redondo", "Quadrado"];
export const ACCESSORIES = ["Nenhum", "Fone", "Boné", "Gravata", "Crachá"];
export const HEIGHTS = ["Baixo", "Médio", "Alto"];

export const DEFAULT_AVATAR: AvatarDNA = {
  name: "Funcionário",
  model: 0,
  skin: 1,
  hair: 1,
  hairColor: 1,
  eyes: 0,
  beard: 0,
  glasses: 0,
  shirt: 0,
  pants: 0,
  shoes: 2,
  accessory: 4,
  height: 1,
};

function idx(v: unknown, len: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < len ? v : fallback;
}

export function sanitizeName(v: unknown, fallback = DEFAULT_AVATAR.name): string {
  if (typeof v !== "string") return fallback;
  const clean = [...v]
    .filter((c) => c.charCodeAt(0) >= 32 && !`<>&"'\``.includes(c))
    .join("")
    .trim()
    .slice(0, 16);
  return clean.length > 0 ? clean : fallback;
}

/** Barba antiga era booleana: true vira a barba curta. */
function beardIdx(v: unknown): number {
  return v === true ? 1 : idx(v, BEARDS.length, DEFAULT_AVATAR.beard);
}

/** Converte qualquer entrada em um boneco válido. Valor fora da lista cai no padrão. */
export function sanitizeAvatar(raw: unknown): AvatarDNA {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR;
  return {
    name: sanitizeName(r.name),
    model: idx(r.model, MODELS.length, d.model),
    skin: idx(r.skin, SKINS.length, d.skin),
    hair: idx(r.hair, HAIR_STYLES.length, d.hair),
    hairColor: idx(r.hairColor, HAIR_COLORS.length, d.hairColor),
    eyes: idx(r.eyes, EYE_COLORS.length, d.eyes),
    beard: beardIdx(r.beard),
    glasses: idx(r.glasses, GLASSES.length, d.glasses),
    shirt: idx(r.shirt, SHIRTS.length, d.shirt),
    pants: idx(r.pants, PANTS.length, d.pants),
    shoes: idx(r.shoes, SHOES.length, d.shoes),
    accessory: idx(r.accessory, ACCESSORIES.length, d.accessory),
    height: idx(r.height, HEIGHTS.length, d.height),
  };
}

export function randomAvatar(rng: () => number, name = DEFAULT_AVATAR.name): AvatarDNA {
  const r = (n: number) => Math.floor(rng() * n);
  return {
    name,
    model: rng() < 0.2 ? 1 + r(MODELS.length - 1) : 0,
    skin: r(SKINS.length),
    hair: r(HAIR_STYLES.length),
    hairColor: r(HAIR_COLORS.length),
    eyes: r(EYE_COLORS.length),
    beard: rng() < 0.3 ? 1 + r(BEARDS.length - 1) : 0,
    glasses: rng() < 0.6 ? 0 : 1 + r(2),
    shirt: r(SHIRTS.length),
    pants: r(PANTS.length),
    shoes: r(SHOES.length),
    accessory: r(ACCESSORIES.length),
    height: r(HEIGHTS.length),
  };
}

const p = (n: number, dna: Omit<AvatarDNA, "name" | "model" | "eyes" | "shoes">) => ({
  id: `funcionario_${String(n).padStart(2, "0")}`,
  dna: { name: `Funcionário ${String(n).padStart(2, "0")}`, model: 0, eyes: 0, shoes: 2, ...dna },
});

/** Pontos de partida editáveis. Os nomes reais entram depois. */
export const PRESETS: { id: string; dna: AvatarDNA }[] = [
  p(1, { skin: 1, hair: 1, hairColor: 0, beard: 0, glasses: 0, shirt: 0, pants: 0, accessory: 4, height: 1 }),
  p(2, { skin: 3, hair: 3, hairColor: 1, beard: 0, glasses: 1, shirt: 7, pants: 1, accessory: 0, height: 0 }),
  p(3, { skin: 5, hair: 6, hairColor: 0, beard: 2, glasses: 0, shirt: 2, pants: 3, accessory: 1, height: 2 }),
  p(4, { skin: 0, hair: 4, hairColor: 4, beard: 0, glasses: 2, shirt: 5, pants: 6, accessory: 0, height: 1 }),
  p(5, { skin: 2, hair: 0, hairColor: 5, beard: 1, glasses: 2, shirt: 6, pants: 1, accessory: 3, height: 2 }),
  p(6, { skin: 6, hair: 5, hairColor: 7, beard: 0, glasses: 0, shirt: 4, pants: 0, accessory: 1, height: 1 }),
  p(7, { skin: 1, hair: 2, hairColor: 6, beard: 0, glasses: 1, shirt: 3, pants: 7, accessory: 4, height: 0 }),
  p(8, { skin: 4, hair: 7, hairColor: 0, beard: 2, glasses: 0, shirt: 9, pants: 4, accessory: 2, height: 1 }),
  p(9, { skin: 7, hair: 6, hairColor: 1, beard: 0, glasses: 2, shirt: 8, pants: 2, accessory: 0, height: 2 }),
  p(10, { skin: 0, hair: 3, hairColor: 3, beard: 0, glasses: 0, shirt: 1, pants: 0, accessory: 1, height: 1 }),
  p(11, { skin: 3, hair: 1, hairColor: 5, beard: 1, glasses: 1, shirt: 5, pants: 2, accessory: 3, height: 1 }),
  p(12, { skin: 2, hair: 4, hairColor: 2, beard: 0, glasses: 0, shirt: 2, pants: 5, accessory: 2, height: 0 }),
];
