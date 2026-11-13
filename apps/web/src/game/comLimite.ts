/** Espera a promessa terminar (dando certo ou não) ou o tempo acabar, o que vier primeiro. Nunca rejeita. */
export function comLimite(p: Promise<unknown>, ms: number): Promise<unknown> {
  return new Promise((ok) => {
    const timer = setTimeout(ok, ms);
    const fim = () => {
      clearTimeout(timer);
      ok(undefined);
    };
    p.then(fim, fim);
  });
}
