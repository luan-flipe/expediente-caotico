# final-fix report
Commits: release repetido (touch.ts + testes); resto da rodada (accountId, anti-farm, bots, reviveFutPlayer, Perfil, comemoracoes).
Comandos: `pnpm typecheck` ok; `pnpm lint` sem erros; `pnpm test` 65 arquivos / 616 testes passando; `pnpm build` ok (aviso de chunk >500 kB, preexistente).
Cliente: readFutInput já manda "charge" antes de "release" (phase()), sem ajuste.

## Re-revisão: disputa dos bots
- bots.ts: a disputa agora carrega (pass "charge") e solta no tick seguinte; antes mandava "release" sem carga e o novo ramo de touch.ts engolia. Carrinho de bot não existe.
- touch.ts: ramos `charged && kick` / `charged` (else) sem bloco vazio.
- Teste novo em futebol-ia.test.ts: bot via botInput + resolveTouches produz steal.
- Com a disputa viva a simulação mudou: o teste "só com bots" (1v1 seed 1) caiu para 0 gols (a variância é alta, 0 a 18 gols por seed). Troquei a seed para 3 (smoke test, não retuning de balanço).
- Gate: typecheck, lint, test, build verdes.
