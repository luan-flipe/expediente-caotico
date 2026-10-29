import type { AvatarDNA } from "../types";

/** O primeiro tom de pele e o primeiro de olho são os do bebê (boneco_bebe.glb) como veio. */
export const SKINS = ["#ebbeaf", "#f6d7c3", "#eec1a0", "#d9a27a", "#c68863", "#a96d4a", "#8a5537", "#6b3f27", "#4a2c1b"];
/** Rostos feitos com as peças de expressão do bebê; o 0 é o rosto como veio. Item novo entra no fim. */
export const FACES = ["Feliz", "Furioso", "Surpreso", "Preocupado", "Desconfiado", "Sonolento", "Entediado"];
export const EYE_COLORS = ["#753727", "#3a2430", "#9a6a2a", "#3f7a45", "#3a6fc4", "#7d8b95", "#111111"];
/** Penteados modelados pelo designer (e derivados deles); o 0 é careca. Item novo entra no fim, para não mudar crachás salvos. */
export const HAIR_STYLES = ["Careca", "Repicado", "Black power", "Longo", "Médio cacheado"];
export const HAIR_COLORS = ["#1b1410", "#3b2416", "#6b4226", "#a8743f", "#d9b26a", "#9a9a9a", "#b8442f", "#3a5bd9"];
/** Barbas modeladas pelo designer; o 0 é sem barba. */
export const BEARDS = ["Sem barba", "Barba", "Barba longa"];

/** Padrão: o bebê como veio, careca e sem barba. */
export const DEFAULT_AVATAR: AvatarDNA = {
  name: "Funcionário",
  skin: 0,
  eyes: 0,
  face: 0,
  hair: 0,
  hairColor: 1,
  beard: 0,
  beardColor: 1,
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

/** Converte qualquer entrada em um crachá válido. Valor fora da lista cai no padrão; campos que não existem mais somem. */
export function sanitizeAvatar(raw: unknown): AvatarDNA {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR;
  const hairColor = idx(r.hairColor, HAIR_COLORS.length, d.hairColor);
  return {
    name: sanitizeName(r.name),
    skin: idx(r.skin, SKINS.length, d.skin),
    eyes: idx(r.eyes, EYE_COLORS.length, d.eyes),
    face: idx(r.face, FACES.length, d.face),
    hair: idx(r.hair, HAIR_STYLES.length, d.hair),
    hairColor,
    beard: idx(r.beard, BEARDS.length, d.beard),
    // sem a cor da barba, ela acompanha o cabelo
    beardColor: idx(r.beardColor, HAIR_COLORS.length, hairColor),
  };
}

const p = (n: number, dna: Omit<AvatarDNA, "name">) => ({
  id: `funcionario_${String(n).padStart(2, "0")}`,
  dna: { name: `Funcionário ${String(n).padStart(2, "0")}`, ...dna },
});

/** Funcionários prontos: pontos de partida para a primeira aba do crachá. */
export const PRESETS: { id: string; dna: AvatarDNA }[] = [
  p(1, { skin: 2, eyes: 1, face: 0, hair: 1, hairColor: 1, beard: 0, beardColor: 1 }),
  p(2, { skin: 3, eyes: 2, face: 2, hair: 1, hairColor: 4, beard: 0, beardColor: 4 }),
  p(3, { skin: 6, eyes: 1, face: 1, hair: 2, hairColor: 0, beard: 1, beardColor: 0 }),
  p(4, { skin: 1, eyes: 4, face: 2, hair: 3, hairColor: 6, beard: 0, beardColor: 6 }),
  p(5, { skin: 4, eyes: 0, face: 4, hair: 0, hairColor: 5, beard: 2, beardColor: 5 }),
  p(6, { skin: 7, eyes: 6, face: 5, hair: 4, hairColor: 7, beard: 0, beardColor: 0 }),
  p(7, { skin: 2, eyes: 3, face: 3, hair: 2, hairColor: 2, beard: 1, beardColor: 2 }),
  p(8, { skin: 5, eyes: 1, face: 6, hair: 1, hairColor: 0, beard: 1, beardColor: 0 }),
];
