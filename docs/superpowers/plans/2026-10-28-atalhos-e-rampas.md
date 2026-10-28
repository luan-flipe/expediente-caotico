# Atalhos e rampas com paraquedas: plano de execução

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** bifurcações com atalho nas pistas do Rally e rampas onde a cadeira voa e desce de paraquedas (issue 38).

**Arquitetura:** o sim continua 2D. Cada pista ganha um `Branch` opcional: um segundo corredor que sai da pista principal e volta para ela. `progressOf` passa a olhar os dois corredores e converte a posição no atalho em `s` da pista principal, então voltas, checkpoints e classificação seguem iguais. A altura entra depois como `y`/`vy` no `KartState`, com rampas e vãos descritos por faixas de `s` em cada caminho.

**Stack:** TypeScript, pnpm monorepo, Vitest, Three.js. Node 22 (`export PATH="/c/Users/luan.oliveira/tools/node22:$PATH"`).

**Spec:** `docs/superpowers/specs/2026-10-28-atalhos-e-rampas-design.md`

## Regras gerais

- Dois PRs, cada um saindo de `origin/main` atualizada numa worktree própria, merge squash só depois de `gh run watch --exit-status` verde: **PR A** `feat/atalhos` (Tarefas 1 a 4), **PR B** `feat/rampas-paraquedas` (Tarefas 5 a 9).
- Sem travessão (em-dash) em texto, commit ou PR. Sem linha de co-autor ou "Generated with".
- `git add` só dos arquivos tocados, nunca `-A`. Nunca adicionar `docs/deploy-coolify.pdf`.
- Física pura e determinística em `packages/shared`: mesmo estado e entrada, mesmo resultado (o cliente prevê com o mesmo código).
- Ids das pistas não mudam (`laps[id]` no arquivo de dados).
- Arquivos com CRLF: scripts de edição normalizam `\r\n`.
- Gate antes de cada commit: `pnpm typecheck && pnpm lint && pnpm test`.

## Foco da revisão final

1. Cadeira parada exatamente na boca da bifurcação (equidistante dos dois corredores) não pode alternar de caminho a cada tick nem tremer.
2. Reposição (R) dentro do atalho volta no atalho, não no meio do infield.
3. Atalho mais curto não pode gerar passo de `s` acima de `RACE.maxProgressStep` (5) em velocidade de turbo roxo, senão o checkpoint é perdido.
4. Cliente com previsão: pouso e queda no vão iguais no servidor e no cliente (nada de cadeira "teleportando" ao pousar).
5. Fantasma gravado antes deste PR (4 números) toca no replay e no Contra o relógio sem erro.

---

## PR A: atalhos (2D)

### Tarefa 1: corredor do atalho em `track.ts`

**Arquivos:**
- Modificar: `packages/shared/src/race/track.ts`
- Teste: `packages/shared/src/test/race-track.test.ts`

**Interfaces:**
- Produz:
  - `interface BranchDef { from: number; to: number; ctrl: Ctrl[] }` (índices de controle da pista principal, podem ser fracionários; `ctrl` são os pontos intermediários).
  - `interface Branch { sFrom: number; sTo: number; points: Vec2[]; widths: number[]; cum: number[]; spacing: number; length: number }`
  - `Track.branches: Branch[]` (vazio nas pistas sem atalho).
  - `TrackProgress` ganha `path: number` (-1 = principal, 0.. = índice do atalho) e `heading: number` (direção do caminho naquele ponto).
  - `progressOf(track, pos, prefer?: number)` e `clampToTrack(track, pos, r, prefer?: number)`: `prefer` é o caminho do tick anterior.
  - `branchPointAt(track, path, s): { pos; heading; halfWidth }`.

Abordagem: o atalho é uma curva aberta Catmull-Rom de `pointAt(main, sAtCtrl(from))` até `pointAt(main, sAtCtrl(to))` passando por `ctrl`, reamostrada com o mesmo `STEP`. No atalho, `s = sFrom + (bs / branch.length) * deltaS(sFrom, sTo)`. `progressOf` calcula o mais próximo em cada corredor; vale o corredor onde a posição está dentro da largura. Se estiver dentro dos dois (bocas), fica com `prefer`; sem `prefer`, o de menor `dist`. Fora de todos, `clampToTrack` empurra para o mais próximo.

Definições [decisão do Claude, coordenadas finais acertadas olhando no navegador]:
- Corporativo: `{ from: 5, to: 8, ctrl: [{ x: 48, z: 1, w: 5 }] }` (reto pelo meio das ilhas).
- Estacionamento: `{ from: 3, to: 5, ctrl: [{ x: 50, z: -12, w: 7 }] }` (vira o salto no PR B).
- Copa: `{ from: 9, to: 11, ctrl: [{ x: -20, z: -2, w: 5 }] }` (despensa).

- [ ] **Passo 1: testes que falham**, em `race-track.test.ts`:
  - `atalho existe nas 3 pistas`: `TRACKS[id].branches.length === 1` para cada id.
  - `progresso no atalho vira s da principal`: posição no meio do atalho do Corporativo dá `path === 0` e `s` entre `sFrom` e `sTo`.
  - `s cresce ao percorrer o atalho`: amostrar 50 pontos ao longo do atalho, `s` estritamente crescente (com `deltaS`) e cada passo menor que `RACE.maxProgressStep` quando os pontos estão a 1 m.
  - `boca da bifurcação respeita prefer`: no ponto `sFrom + 1`, `progressOf(..., -1).path === -1` e `progressOf(..., 0).path === 0`.
  - `clamp fora dos corredores`: ponto no infield entre os dois caminhos volta com `hit === true` e cai dentro de um deles.
  - `atalho não encosta no resto da pista`: todo ponto do atalho com `s` fora de `[sFrom - 10, sTo + 10]` fica a mais de `meia largura + 3` da linha principal.
- [ ] **Passo 2:** `pnpm test race-track`. Esperado: FALHA (`branches` indefinido).
- [ ] **Passo 3:** implementar as interfaces acima.
- [ ] **Passo 4:** rodar de novo. Esperado: PASSA, e os testes antigos do arquivo também.
- [ ] **Passo 5:** commit `Atalho como segundo corredor nas pistas do Rally`.

### Tarefa 2: física, voltas, contramão e reposição pelo caminho certo

**Arquivos:**
- Modificar: `packages/shared/src/race/kart.ts`, `packages/shared/src/race/match.ts`
- Teste: `packages/shared/src/test/race-kart.test.ts`, `race-laps.test.ts`, `race-match.test.ts`

**Interfaces:**
- Consome: `progressOf`/`clampToTrack` com `prefer`, `TrackProgress.path/heading`, `branchPointAt` (Tarefa 1).
- Produz: `KartState.path?: number` (padrão -1), gravado pelo `stepKart` a partir de `progress.path`; `respawnAt(track, s, path)`.

- [ ] **Passo 1: testes que falham:**
  - `race-kart`: cadeira em linha reta pelo atalho do Corporativo, entrada fixa de acelerar, 400 passos de 50 ms: nunca `wall`, `path` fica 0 no meio e volta a -1 no fim.
  - `race-laps`: piloto que faz a volta pelo atalho fecha a volta (`lapDone`) e passa por todos os checkpoints na ordem.
  - `race-laps`: volta pelo atalho com piloto perfeito é mais rápida que pela principal, diferença entre 0,4 e 1,5 s (prova o "ganho de 0,5 a 1 s" da spec).
  - `race-match`: contramão não dispara andando certo dentro do atalho (usa `pr.heading`, não `pointAt(main)`).
  - `race-match`: R dentro do atalho reaparece com `path === 0`.
- [ ] **Passo 2:** rodar os 3 arquivos. Esperado: FALHA.
- [ ] **Passo 3:** passar `k.path` como `prefer`; em `match.ts` trocar `pointAt(race.track, pr.s).heading` por `pr.heading` na contramão e usar `path` na reposição. Se algum teste mostrar passo de `s` acima de 5 no atalho em turbo, aumentar a largura do atalho, não o `maxProgressStep`.
- [ ] **Passo 4:** rodar `pnpm test`. Esperado: tudo verde.
- [ ] **Passo 5:** commit `Física, voltas e reposição seguem o atalho`.

### Tarefa 3: bots escolhem o caminho

**Arquivos:**
- Modificar: `packages/shared/src/race/bots.ts`, `packages/shared/src/botLevels.ts`
- Teste: `packages/shared/src/test/race-match.test.ts` (ou novo `race-bots.test.ts` se não houver lugar)

**Interfaces:**
- Produz: `RACE_BOT[level].shortcutChance` (`facil 0.1`, `normal 0.4`, `dificil 0.75`); `RaceBotBrain.route?: number` (-1 ou índice).

Abordagem: a 20 m antes de `sFrom` o bot sorteia uma vez com `race.rng()` e grava `route`; ao passar de `sTo`, limpa. Com `route >= 0` e `s` dentro do atalho, o ponto alvo sai de `branchPointAt`.

- [ ] **Passo 1: teste que falha:** 200 corridas curtas de 1 bot difícil com sementes diferentes no Corporativo; fração que passou pelo atalho entre 0.6 e 0.9. Mesmo teste com fácil: abaixo de 0.25. Nenhum bot fica preso (`stuckMs` nunca dispara reposição dentro do atalho).
- [ ] **Passo 2:** rodar. Esperado: FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar a suíte. Esperado: verde.
- [ ] **Passo 5:** commit `Bots escolhem atalho conforme o nível`.

### Tarefa 4: desenho do atalho, minimapa e PR A

**Arquivos:**
- Modificar: `apps/web/src/race/trackScene.ts`, `apps/web/src/race/Minimap.tsx`

**Interfaces:**
- Consome: `Track.branches`, `trackEdges` (estender com `branchEdges(track, i)`).

Abordagem: o atalho reaproveita `ribbon` e as paredes; nas bocas, as paredes da principal ganham uma abertura (pular os pontos de parede cujo segmento cruza o corredor do atalho). Decoração leve: mesas baixas no atalho do Corporativo, prateleiras na despensa da Copa. O minimapa desenha o atalho com traço mais fino.

- [ ] **Passo 1:** gate completo verde.
- [ ] **Passo 2:** navegador (`preview_start`): corrida com 3 bots difíceis em cada pista. Conferir: dá para entrar e sair do atalho sem bater em parede invisível; bots usam; minimapa mostra; sem erro no console. Screenshot de cada atalho.
- [ ] **Passo 3:** commit `Atalhos desenhados na pista e no minimapa`, push, PR "Atalhos nas pistas do Rally", CI verde, merge squash.

---

## PR B: rampas, voo e paraquedas

### Tarefa 5: altura e voo em `stepKart`

**Arquivos:**
- Modificar: `packages/shared/src/race/kart.ts`, `packages/shared/src/race/balance.ts`, `packages/shared/src/race/track.ts`
- Teste: `packages/shared/src/test/race-kart.test.ts`

**Interfaces:**
- Produz:
  - `interface Ramp { path: number; sFrom: number; sTo: number; height: number; gap?: { sFrom: number; sTo: number } }` e `Track.ramps: Ramp[]`.
  - `groundAt(track, progress): { y: number; gap: boolean }`: na rampa sobe linear de 0 a `height`; dentro do `gap`, `gap: true`.
  - `KartState` ganha `y?: number`, `vy?: number`, `air?: boolean`, `trick?: boolean`, `fell?: boolean`.
  - `RACE` ganha `gravity: 30`, `glideFall: 4` (queda máxima com paraquedas, m/s), `glideAfterMs: 250`, `airSteer: 0.35`, `minLaunchSpeed: 8`, `fallDepth: -3` [decisão do Claude, ajustar no teste de sensação].

Comportamento:
- No chão, `y = groundAt`. Saindo do topo da rampa com `speed >= minLaunchSpeed`: `air = true`, `vy = speed * height / (sTo - sFrom)`.
- No ar: `vy -= gravity * dt`; passado o pico, `vy = max(vy, -glideFall)` (paraquedas aberto); esterço multiplicado por `airSteer`; não começa derrapagem; aceleração não muda `speed`.
- Apertar derrapar no ar marca `trick = true`.
- `y <= ground` e fora de vão: pousa (`air = false`, `y = ground`); com `trick`, aplica `stuntBoostMs`/`stuntBoostSpeed` e devolve `stunt: true` no `KartStep`.
- `y <= ground` dentro do vão: continua caindo até `fallDepth` e devolve `fell: true`.
- Paredes continuam valendo no ar (o `clampToTrack` não muda).

Rampas [decisão do Claude]:
- Corporativo: `{ path: -1, sFrom: s(ctrl 2), sTo: s(ctrl 2) + 6, height: 1.6 }`.
- Estacionamento: `{ path: 0, sFrom: 0.15 * len, sTo: 0.15 * len + 6, height: 2.2, gap: { sFrom: 0.35 * len, sTo: 0.75 * len } }`, em `s` do próprio atalho.

- [ ] **Passo 1: testes que falham:**
  - `decola acima da velocidade mínima`: a 20 m/s pela rampa do Corporativo, `air` vira true no fim dela; a 6 m/s, não.
  - `paraquedas limita a queda`: depois do pico, `vy >= -RACE.glideFall` em todo passo.
  - `manobra dá turbo só ao pousar`: derrapar apertado no ar, `boostUntil` igual até o pouso e maior no passo do pouso; `stunt === true` só nesse passo.
  - `sem manobra não há turbo`: pouso sem derrapar, `boostUntil` inalterado.
  - `vão`: no atalho do Estacionamento a 22 m/s atravessa sem `fell`; a 10 m/s, `fell === true`.
  - `determinismo`: mesma sequência de entradas duas vezes dá estados idênticos (`toEqual`).
- [ ] **Passo 2:** rodar. Esperado: FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar a suíte. Esperado: verde, e os testes antigos de kart iguais (pistas sem rampa não mudam nada).
- [ ] **Passo 5:** commit `Altura, rampa, voo com paraquedas e manobra na física da cadeira`.

### Tarefa 6: partida (queda, itens, colisão, bots)

**Arquivos:**
- Modificar: `packages/shared/src/race/match.ts`, `packages/shared/src/race/items.ts`, `packages/shared/src/race/bots.ts`
- Teste: `race-match.test.ts`, `race-items.test.ts`

**Interfaces:**
- Consome: `KartStep.fell/stunt`, `KartState.y/air` (Tarefa 5).
- Produz: evento `{ type: "stunt"; id }` (já existe no tipo) e `{ type: "fall"; id }` (novo); `RACE.airHitHeight: 1.2`.

- [ ] **Passo 1: testes que falham:**
  - queda no vão reaparece no início da rampa com `frozenUntil` igual ao da reposição (R) e marca a volta como suja (sem recorde).
  - poça e resma não acertam cadeira com `y > airHitHeight`; grampeador e avião acertam.
  - duas cadeiras com diferença de altura maior que 1 não colidem.
  - bot no Estacionamento só toma o atalho com vão se a velocidade prevista na rampa for `>= minLaunchSpeed + 6`.
- [ ] **Passo 2:** rodar. Esperado: FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** suíte verde.
- [ ] **Passo 5:** commit `Queda no vão, itens e bots consideram a altura`.

### Tarefa 7: rede, fantasma e replay com altura

**Arquivos:**
- Modificar: `packages/shared/src/race/types.ts`, `packages/shared/src/ranking/types.ts`, `packages/shared/src/race/match.ts` (snapshot e gravação), `apps/web/src/race/ghosts.ts`, `apps/web/src/race/replayEngine.ts`, `apps/server/src` (validação Zod do fantasma, se houver)
- Teste: `race-timetrial.test.ts`, teste de replay existente

**Interfaces:**
- Produz: `RaceKartPublic.y?: number`, `flags` com `"air"` e `"chute"`; `RacePrivate.kart` com `y`, `vy`, `air`, `trick`; `GhostSample` aceita 5º número opcional `y` (`[..., y?]`).

- [ ] **Passo 1: testes que falham:** volta com salto grava amostras com `y > 0`; `sampleGhost` interpola `y`; amostra de 4 números devolve `y = 0`; o servidor aceita fantasma de 4 e de 5 números.
- [ ] **Passo 2:** rodar. Esperado: FALHA.
- [ ] **Passo 3:** implementar; `y` arredondado a 2 casas como `x` e `z`.
- [ ] **Passo 4:** suíte verde.
- [ ] **Passo 5:** commit `Altura no snapshot, no fantasma e no replay`.

### Tarefa 8: rampa, vão e paraquedas na tela

**Arquivos:**
- Modificar: `apps/web/src/race/trackScene.ts`, `apps/web/src/race/chairMesh.ts`, `apps/web/src/race/raceEngine.ts`, `apps/web/src/race/ReplayView.tsx`
- Criar: `apps/web/src/race/parachute.ts`

**Interfaces:**
- Produz: `buildParachute(kind: ParachuteKind): THREE.Group` e `parachuteFor(chair: ChairDNA): ParachuteKind`, com `ParachuteKind = "guardachuva" | "flipchart" | "saco" | "pasta"` (hash simples dos campos da cadeira, módulo 4).

Abordagem: rampa como cunha com faixa amarela e preta; vão como buraco escuro com "subsolo" 3 m abaixo e paredes laterais. O paraquedas é geometria simples (sem GLB novo), aparece com o flag `"chute"` e some ao pousar. A câmera segue `y` com suavização para não chacoalhar. A previsão local (`reconcile`) inclui `y`, `vy`, `air`, `trick`. Celular: a manobra é o botão de derrapar, nada novo.

- [ ] **Passo 1:** gate completo verde.
- [ ] **Passo 2:** navegador, sem atalhos de teste no código:
  - Corporativo: salto da rampa, paraquedas abre, manobra dá turbo ao pousar.
  - Estacionamento: atravessar o vão rápido; chegar devagar e cair.
  - Contra o relógio no Estacionamento: volta com salto vira recorde e o replay mostra o voo.
  - 375 x 812: botão de derrapar faz a manobra.
  - Console sem erro. Screenshots do voo e da queda.
- [ ] **Passo 3:** commit `Rampa, vão e paraquedas de escritório no Rally`.

### Tarefa 9: PR B

- [ ] **Passo 1:** `git fetch && git rebase origin/main`, gate completo verde.
- [ ] **Passo 2:** push, PR "Rampas com paraquedas de escritório" citando a issue 38 (`Closes #38`), CI verde com `gh run watch --exit-status`, merge squash.
- [ ] **Passo 3:** conferir em produção depois do autodeploy: abrir o Estacionamento e fazer um salto.
