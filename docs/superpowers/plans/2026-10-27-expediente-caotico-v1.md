# Expediente Caótico v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jogo TPS multiplayer no navegador, salas privadas de até 8, bonecos customizáveis, 12 habilidades com evolução, servidor autoritativo.

**Architecture:** Monorepo pnpm. `packages/shared` contém dados do jogo e TODA a simulação como funções puras (testadas com Vitest). `apps/server` (Node + `ws`) só gerencia salas, valida mensagens e roda `stepMatch` a 30 Hz, mandando snapshots a 15 Hz. `apps/web` (Vite + React para telas/HUD + Three.js imperativo para o jogo) envia intenções e renderiza snapshots com interpolação; prevê só o próprio movimento usando a mesma colisão do shared.

**Tech Stack:** TypeScript 5, pnpm 10, Node 22, Vite 8, React 19, Three.js 0.18x, ws 8, Zod 3, Vitest, ESLint 9 + typescript-eslint, tsx.

**Spec:** `docs/SPEC.md` + `docs/superpowers/specs/2026-10-27-expediente-caotico-design.md`

## Global Constraints

- Node 22: `export PATH="/c/Users/luan.oliveira/tools/node22:$PATH"` antes de qualquer pnpm/node.
- Todo texto visível em PT-BR, sem travessão "—".
- Cliente nunca envia dano, pontos, vida, recarga ou vencedor. Só `input`, `action`, `evolve` e mensagens de lobby.
- Valores de balanceamento só em `packages/shared/src/data/balance.ts` e `abilities.ts`.
- Unidades: distância em metros (plano XZ, jogo 2.5D sem pulo), tempo em ms de simulação.
- Máximo 8 participantes por sala. Código de sala: 5 letras de `ABCDEFGHJKLMNPQRSTUVWXYZ`.
- Commits locais pequenos por task; sem push.

## Review Focus

1. Escolha de evolução chegando depois de expirar ou repetida: servidor ignora, não aplica duas vezes. (Task 6)
2. Jogador morto/atordoado mandando `action`: nada acontece, recarga não é consumida. (Task 5)
3. Mensagem malformada ou NaN/Infinity no input: descartada, sala segue. (Task 9)
4. Jogador desconecta no meio da partida: fica parado 30 s, reconecta com token, mantém pontos; token errado não assume o jogador. (Task 9)
5. Dois jogadores matando o mesmo alvo no mesmo tick: só uma eliminação e um respawn. (Task 7)

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, .gitignore, README.md, Dockerfile
packages/shared/src/
  index.ts                 re-exports
  types.ts                 Vec2, AvatarDNA, PlayerSim, Match, Projectile, AbilityZone, GameEvent, Snapshot, PrivateState
  rng.ts                   mulberry32(seed)
  data/balance.ts          BALANCE (números globais)
  data/map.ts              OFFICE_MAP {bounds, boxes, spawns, objectivePoints, rooms}
  data/avatar.ts           opções do Crachá, PRESETS (12), sanitizeAvatar, randomAvatar
  data/abilities.ts        ABILITIES (12), AbilityId
  data/synergies.ts        SYNERGIES (4)
  sim/collision.ts         moveCircle, segmentBoxT, segmentBlocked
  sim/combat.ts            applyDamage, applyStatus, hasStatus, speedMult, knockback
  sim/abilities.ts         resolveAbility, castAbility, stepProjectiles, stepZones
  sim/progression.ts       xpToNext, grantXp, generateOptions, applyOption, chooseEvolution
  sim/scoring.ts           handleDeath, rankPlayers
  sim/objective.ts         stepObjective
  sim/bots.ts              stepBot
  sim/match.ts             createMatch, stepMatch, setInput, queueAction, buildSnapshot, buildPrivate, getResults
  protocol.ts              Zod schemas ClientMsg, tipos ServerMsg
  test/*.test.ts
apps/server/src/
  index.ts                 http + ws + static
  rooms.ts                 RoomManager, Room
  ratelimit.ts             TokenBucket
  test/server.test.ts
apps/web/src/
  main.tsx, App.tsx, store.ts, styles.css
  net/connection.ts        Connection (ws + reconexão)
  screens/Home.tsx, Creator.tsx, Lobby.tsx, Results.tsx
  game/GameView.tsx        monta o engine e o HUD
  game/engine.ts           Engine (renderer, loop, câmera, input, previsão, interpolação)
  game/officeScene.ts      buildOffice(scene)
  game/avatarMesh.ts       buildAvatar(dna): AvatarRig, animateAvatar
  game/fx.ts               efeitos (projéteis, zonas, partículas, números)
  game/AvatarPreview.tsx   canvas 3D girando
  hud/Hud.tsx, Evolution.tsx, Scoreboard.tsx
```

---

### Task 1: Scaffold do monorepo

**Files:** raiz (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.gitignore`), `packages/shared/package.json`, `apps/server/package.json`, `apps/web/package.json` + `vite.config.ts` + `index.html`.

**Produces:** scripts raiz `dev`, `build`, `start`, `test`, `typecheck`, `lint`. Pacote `@ec/shared` consumido via workspace como fonte TS (`"main": "src/index.ts"`), sem build próprio; server roda com `tsx` em dev e é empacotado com `esbuild` no build.

- [ ] Criar arquivos e `pnpm install`.
- [ ] Teste fumaça `packages/shared/src/test/smoke.test.ts` (`expect(1+1).toBe(2)`), `pnpm test` passa.
- [ ] `pnpm typecheck` e `pnpm lint` passam. Commit.

### Task 2: Dados do jogo

**Files:** `types.ts`, `rng.ts`, `data/*.ts`, `test/data.test.ts`.

**Produces:**
- `AvatarDNA = { name: string; skin: number; hair: number; hairColor: number; beard: boolean; glasses: 0|1|2; shirt: number; pants: number; accessory: 0|1|2|3|4; height: 0|1|2 }` (números são índices em listas de `data/avatar.ts`).
- `sanitizeAvatar(raw: unknown): AvatarDNA`, `randomAvatar(rng): AvatarDNA`, `PRESETS: {id: string; dna: AvatarDNA}[]` com ids `funcionario_01..12`.
- `AbilityDef = { id: AbilityId; name; family; kind: 'chain'|'nova'|'fan'|'cone'|'projectile'|'dash'|'buff'|'zone'|'teleport'; cooldownMs; base: AbilityParams; specA: {name; desc; mod: Partial<AbilityParams>}; specB: {...}; desc }` e `AbilityParams` com campos opcionais: `damage, range, radius, count, spreadDeg, speed, knock, stunMs, blindMs, slowMs, slowPct, shield, heal, durationMs, hasteMult, chains, tickMs, pierce`.
- `SYNERGIES: { id; name; desc; requires: [AbilityId, AbilityId]; target: AbilityId; mod: Partial<AbilityParams> }[]`.
- `OFFICE_MAP: { width: 64; depth: 44; boxes: Box[]; spawns: Vec2[] (8); objectivePoints: Vec2[] (5); rooms: {name; x; z; w; d; floor: string}[] }`, `Box = {x; z; w; d; h; kind: 'wall'|'desk'|'cabinet'|'glass'|'plant'|'counter'}` (centro + tamanho).

- [ ] Teste: `sanitizeAvatar({skin: 999, name: '<script>' })` devolve índices válidos e nome com ≤16 chars sem `<>`; todo `PRESETS[i].dna` passa sanitize sem mudar; todo spawn fica fora de qualquer box; 12 habilidades com ids únicos A1..D3; toda sinergia referencia ids existentes.
- [ ] Implementar valores da tabela do SPEC §6. Testes passam. Commit.

### Task 3: Colisão e movimento

**Files:** `sim/collision.ts`, `test/collision.test.ts`.

**Produces:** `moveCircle(pos: Vec2, dx: number, dz: number, r: number, boxes: Box[], bounds: {w; d}): Vec2` (desliza nos eixos separadamente), `segmentBoxT(a: Vec2, b: Vec2, boxes: Box[], pad?: number): number | null` (menor t∈[0,1] de interseção), `segmentBlocked(a, b, boxes): boolean`.

- [ ] Testes: andar contra parede para na borda (x = box.minX - r); andar na diagonal contra parede desliza no outro eixo; nunca sai dos limites do mapa; segmento atravessando caixa retorna t correto (0,5 no meio); `segmentBlocked` falso em linha livre. Implementar. Commit.

### Task 4: Combate e efeitos

**Files:** `sim/combat.ts`, `test/combat.test.ts`.

**Consumes:** `Match`, `PlayerSim` de `types.ts`.
**Produces:** `applyDamage(m: Match, target: PlayerSim, amount: number, sourceId: string | null): number` (retorna dano efetivo na vida+escudo; 0 se invulnerável, morto ou fase ≠ 'active'; consome escudo antes; registra `damageLog`; dá XP ao atacante = dano efetivo; chama `handleDeath` ao zerar), `applyStatus(m, target, kind: 'stun'|'blind'|'slow'|'haste', ms: number, magnitude?: number): void` (stun ignorado se `now < stunImmuneUntil`; ao aplicar stun define `stunImmuneUntil = fim do stun + BALANCE.stunImmunityMs (2000)`), `hasStatus(p, kind, now): boolean`, `speedMult(p, now): number`, `knockback(p, dirX, dirZ, force)`.

- [ ] Testes: escudo 30 absorve 20 e sobra 10; dano em invulnerável retorna 0 e não dá XP; segundo stun dentro da imunidade é ignorado; lento 50% + acelerado 1,5 = 0,75; dano letal chama morte uma vez mesmo com dois `applyDamage` no mesmo tick. Implementar. Commit.

### Task 5: Habilidades, projéteis, zonas

**Files:** `sim/abilities.ts`, `test/abilities.test.ts`.

**Produces:** `resolveAbility(owned: OwnedAbility[], id: AbilityId): AbilityParams & {cooldownMs}` (base, escala por nível: dano ×(1+0,15·(lvl-1)), recarga ×(1-0,06·(lvl-1)), soma `specA/specB.mod` (campos numéricos somam, booleanos substituem; `cooldownPct` multiplica), aplica sinergias ativas), `castAbility(m, p, slot: 0|1|2, yaw: number, dist: number): boolean`, `fireBall(m, p, yaw): boolean`, `stepProjectiles(m, dtMs)`, `stepZones(m, dtMs)`.

- [ ] Testes: Cadeira nível 3 spec A tem raio 3,5×1,4; `castAbility` com recarga ativa retorna false e não muda `readyAt`; jogador atordoado ou morto não lança; Choque do TI salta para no máximo `chains` alvos distintos e não atravessa parede; projétil para na parede; Teletransporte não coloca jogador dentro de caixa; sinergia A1+D1 adiciona `slowMs` ao Choque. Implementar. Commit.

### Task 6: Progressão

**Files:** `sim/progression.ts`, `test/progression.test.ts`.

**Produces:** `xpToNext(level: number): number` (= 80 + 40·level), `grantXp(m, p, amount)`, `generateOptions(p: PlayerSim, rng): EvolutionOption[]` (3 opções distintas; `EvolutionOption = { id: string; type: 'unlock'|'upgrade'|'spec'|'stat'; abilityId?; spec?: 'A'|'B'; stat?: 'hp'|'speed'|'ball'; title; desc }`), `applyOption(p, opt): boolean`, `chooseEvolution(m, playerId, optionId): boolean`, fila `p.pendingLevels` (níveis acumulados viram escolhas em sequência), expiração em `BALANCE.evolutionTimeoutMs = 8000` aplica `options[0]`.

Regras de geração: se <3 habilidades, até 2 opções de unlock entre não equipadas; upgrades das equipadas com nível <5; habilidade no nível 2 gera DUAS opções 'spec' (A e B) em vez de 'upgrade'; completar com 'stat' (hp +15, speed +8%, ball +12%). Primeira escolha da partida: 3 unlocks.

- [ ] Testes: primeira escolha só tem unlocks; nunca 4ª habilidade; nunca nível 6; spec escolhida não volta a ser oferecida e o upgrade seguinte mantém a spec; `chooseEvolution` com id inexistente ou repetido retorna false; timeout aplica a primeira opção; simulação de 40 níveis com escolha aleatória nunca gera opção inválida (todas aplicáveis) e termina com 3 habilidades nível 5. Implementar. Commit.

### Task 7: Pontuação, objetivo, partida

**Files:** `sim/scoring.ts`, `sim/objective.ts`, `sim/match.ts`, `test/match.test.ts`.

**Produces:** `createMatch(opts: {durationMs: number; seed: number; players: {id; name; avatar; isBot}[]}): Match`, `stepMatch(m, dtMs)` (countdown 3000 ms → active → finished; aplica inputs, dodge, tiro, habilidades, projéteis, zonas, objetivo, bots, respawn, timeouts de evolução), `setInput(m, id, input: PlayerInput)`, `queueAction(m, id, action: PlayerAction)`, `handleDeath(m, victim, killerId)`, `rankPlayers(players): ResultRow[]`, `getResults(m)`, `buildSnapshot(m): Snapshot`, `buildPrivate(m, id): PrivateState`, `addPlayerToMatch`/`removePlayer` (marca `connected=false`).

- [ ] Testes: kill dá +100 ao matador e +40 a quem causou ≥20 nos últimos 8 s (não ao matador); dano de 8 s atrás não conta; respawn após 3000 ms com invulnerabilidade 1500 ms; zona com 2 jogadores dentro não pontua; sozinho 5 s → +10; fim do ciclo dá +50 ao maior possuidor; desempate por kills e depois assistências, empate total marca `tie: true`; após `durationMs` fase vira 'finished' e ações são ignoradas. Implementar. Commit.

### Task 8: Bots

**Files:** `sim/bots.ts`, teste em `test/match.test.ts`.

**Produces:** `stepBot(m, p)`: escolhe alvo vivo mais próximo com linha de visão (senão vai ao objetivo), anda em direção com desvio lateral, atira com erro de ±0,12 rad se distância < 22 m, lança habilidade disponível aleatória com 2% de chance por tick, escolhe evolução aleatória ao ter opções.

- [ ] Teste: partida de 4 bots, 120 s simulados a 30 Hz termina sem exceção, com pelo menos 1 eliminação e todos os níveis > 1. Commit.

### Task 9: Servidor

**Files:** `packages/shared/src/protocol.ts`, `apps/server/src/{index,rooms,ratelimit}.ts`, `apps/server/src/test/server.test.ts`.

**Produces:** protocolo JSON. Cliente → servidor (`ClientMsg`, validado por Zod, números `.finite()`):
`{t:'create', name, avatar}`, `{t:'join', code, name, avatar}`, `{t:'resume', code, token}`, `{t:'ready', ready}`, `{t:'avatar', avatar}`, `{t:'addBot'}`, `{t:'removeBot'}`, `{t:'duration', ms: 180000|300000|600000}`, `{t:'start'}`, `{t:'input', mx, mz, yaw, fire}`, `{t:'action', kind:'dodge'|'ability', slot?, yaw, dist?}`, `{t:'evolve', optionId}`, `{t:'lobby'}` (anfitrião volta ao lobby após o fim), `{t:'ping', c}`.
Servidor → cliente: `{t:'welcome', id, token, code}`, `{t:'lobby', state: LobbyState}`, `{t:'snap', s: Snapshot, me: PrivateState}`, `{t:'results', rows: ResultRow[]}`, `{t:'error', msg}`, `{t:'pong', c}`.
Rate limit: token bucket 60 msg/s por conexão (input 30/s); excedente descartado e logado. Sala sem humanos conectados apagada em 60 s. Reconexão: `resume` com token dentro de 30 s. Porta `PORT` (padrão 2567); em produção serve `apps/web/dist`.

- [ ] Teste de integração: sobe servidor em porta aleatória, cliente A cria, B entra pelo código, ambos `ready`, A `start`; recebem `snap` com fase 'countdown' e 2 jogadores; mensagem `{t:'input', mx: NaN}` não derruba (B ainda recebe snaps); B fecha socket, reabre com `resume` e token → mesmo id; token errado recebe `error`; 9º participante recebe `error` "Sala cheia". Commit.

### Task 10: Web, telas fora do jogo

**Files:** `apps/web/src/{main.tsx,App.tsx,store.ts,styles.css}`, `net/connection.ts`, `screens/*`, `game/avatarMesh.ts`, `game/AvatarPreview.tsx`.

**Produces:** `Connection` com `send(msg: ClientMsg)`, `on(handler)`, reconexão automática com `resume` (token em `sessionStorage`). Store com `useSyncExternalStore`: `screen: 'home'|'creator'|'lobby'|'game'|'results'`, `lobby`, `me`, `snap`, `results`. `buildAvatar(dna: AvatarDNA): AvatarRig` (`AvatarRig = {root: THREE.Group; parts: {legL, legR, armL, armR, head, body}}`), `animateAvatar(rig, speed01, t, shooting)`.

- [ ] Home: nome, prévia do boneco, "Editar boneco", "Criar sala", campo código + "Entrar"; lê `?sala=`.
- [ ] Creator: controles de cada parâmetro, presets, aleatório, salvar em `localStorage` (`ec.avatar`).
- [ ] Lobby: código, botão copiar link, lista com miniaturas, pronto, controles do anfitrião.
- [ ] Verificar no navegador com servidor rodando: criar sala e ver lobby. Commit.

### Task 11: Web, motor do jogo

**Files:** `game/{engine.ts,officeScene.ts,fx.ts,GameView.tsx}`.

**Produces:** `new Engine(canvas, conn, myId)`, `engine.applySnapshot(s, me)`, `engine.dispose()`. Câmera: atrás e à direita do ombro (offset lateral 0,9 m, 3,6 m atrás, altura 2,4), pitch limitado a [-0,5, 0,6] rad, colisão simples com paredes (aproxima a câmera). Mira: raio da câmera pela retícula intersecta plano y=1,2 (ou ponto a 60 m); `yaw` = direção do jogador até esse ponto; `dist` = distância horizontal (para zonas e teleporte). Input a 30 Hz. Previsão local com `moveCircle`; correção: erro > 4 m encaixa, senão aproxima 15% por quadro. Remotos interpolados 100 ms atrás entre snapshots. Projéteis extrapolados por `vx, vz`. Cegueira = overlay escuro com vinheta no HUD.

- [ ] Verificar no navegador com 1 bot: andar, colidir, atirar, acertar, morrer e renascer. Commit.

### Task 12: HUD, evolução, placar, resultados

**Files:** `hud/{Hud,Evolution,Scoreboard}.tsx`, `screens/Results.tsx`.

- [ ] HUD atualizado a ~10 Hz a partir do store: vida/escudo, XP/nível, 3 slots (Q/E/R) com recarga em sombra radial, esquiva, relógio, top 3, seta/distância da zona, feed de kills, ícones de status, sinergias ativas.
- [ ] Evolução: 3 cartões com tipo (Nova / Melhoria / Especialização / Atributo), nível atual → novo, barra de 8 s, teclas 1/2/3 e clique (clique exige sair do pointer lock: cartões também respondem a 1/2/3 sem sair).
- [ ] Tab: placar completo. Resultados: vencedor, ranking, build, "Voltar ao lobby".
- [ ] Verificar no navegador partida de 3 min com bots até a tela final. Commit.

### Task 13: Fechamento

- [ ] README (requisitos, Node 22, comandos dev/build/start/test, como jogar, como ajustar mapa e bonecos), Dockerfile.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes; `pnpm start` serve o jogo em `http://localhost:2567`.
- [ ] Commit final.
