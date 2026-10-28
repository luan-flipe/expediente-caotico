/** Um SW novo assumiu: recarregar só se havia SW antes, fora de sala e uma única vez. */
export function deveRecarregar(s: { tinhaControlador: boolean; emSala: boolean; jaRecarregou: boolean }): boolean {
  return s.tinhaControlador && !s.emSala && !s.jaRecarregou;
}
