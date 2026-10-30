import { MAX_WEARABLES } from "@ec/shared";

/** Peça de roupa ou cabelo: um GLB exportado do mesmo esqueleto do boneco. */
export interface Wearable {
  label: string;
  url: string;
  /** Saia (arquivo com "saia" no nome): com ela, a camiseta fica para dentro do cós. */
  tuck: boolean;
  /** Salto alto (arquivo com "salto" no nome): com ele, o pé fica inclinado e o boneco sobe. */
  heel: boolean;
}

/** "02_moicano_alto.glb" vira "Moicano alto". */
function labelOf(path: string): string {
  const file = path.split("/").pop()!.replace(/\.glb$/i, "");
  if (/jaqueta_jeans/i.test(file)) return "Jaqueta jeans";
  if (/adidas/i.test(file)) return "Tenis adidas";
  const name = file.replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " ").trim();
  return name ? name[0].toUpperCase() + name.slice(1) : "Peça";
}

/** Peças da pasta, em ordem de nome de arquivo. No AvatarDNA, 0 é nenhuma e i é a peça i - 1. */
function listOf(files: Record<string, string>): Wearable[] {
  return Object.keys(files)
    .sort()
    .slice(0, MAX_WEARABLES - 1)
    .map((path) => {
      const file = path.split("/").pop()!;
      return { label: labelOf(path), url: files[path], tuck: /saia/i.test(file), heel: /salto/i.test(file) };
    });
}

// o glob do Vite só aceita caminho literal, por isso uma chamada por pasta
export const HAIRS = listOf(import.meta.glob<string>("../assets/cabelos/*.glb", { eager: true, query: "?url", import: "default" }));
export const BEARDS_3D = listOf(import.meta.glob<string>("../assets/barbas/*.glb", { eager: true, query: "?url", import: "default" }));
export const GLASSES_3D = listOf(import.meta.glob<string>("../assets/oculos/*.glb", { eager: true, query: "?url", import: "default" }));
export const SHIRTS_3D = listOf(import.meta.glob<string>("../assets/camisetas/*.glb", { eager: true, query: "?url", import: "default" }));
export const PANTS_3D = listOf(import.meta.glob<string>("../assets/calcas/*.glb", { eager: true, query: "?url", import: "default" }));
export const SHOES_3D = listOf(import.meta.glob<string>("../assets/tenis/*.glb", { eager: true, query: "?url", import: "default" }));

export const HAIR_LABELS = ["Sem cabelo", ...HAIRS.map((h) => h.label)];
export const BEARD_LABELS = ["Sem barba", ...BEARDS_3D.map((b) => b.label)];
export const GLASSES_LABELS = ["Sem óculos", ...GLASSES_3D.map((g) => g.label)];
export const SHIRT_LABELS = ["Sem camiseta", ...SHIRTS_3D.map((s) => s.label)];
export const PANTS_LABELS = ["Sem calça", ...PANTS_3D.map((p) => p.label)];
export const SHOE_LABELS = ["Descalço", ...SHOES_3D.map((s) => s.label)];
