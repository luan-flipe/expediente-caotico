/** Cargos por vitórias somadas (tiroteio e Rally). Cada degrau vale a partir do número indicado. */
export const CARGOS = [
  { min: 0, nome: "Estagiário" },
  { min: 1, nome: "Assistente" },
  { min: 5, nome: "Analista" },
  { min: 15, nome: "Pleno" },
  { min: 30, nome: "Sênior" },
  { min: 60, nome: "Gerente" },
  { min: 100, nome: "Diretor" },
] as const;

/** Cargo de quem tem `vitorias` vitórias; número negativo ou torto vale zero. */
export function cargoDe(vitorias: number): string {
  const v = Number.isFinite(vitorias) ? Math.max(0, vitorias) : 0;
  let nome: string = CARGOS[0].nome;
  for (const c of CARGOS) if (v >= c.min) nome = c.nome;
  return nome;
}
