export type Estrategia = "rede" | "cache-primeiro" | "navegacao" | "ignorar";
export function estrategiaDe(req: { url: string; method: string; mode: string; range: boolean }, origem: string): Estrategia;
