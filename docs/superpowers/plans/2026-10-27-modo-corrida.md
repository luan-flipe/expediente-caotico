# Modo Corrida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segundo modo de jogo: corrida de cadeiras de escritório, 3 voltas, até 8 participantes, itens de escritório, mesma sala e lobby do tiroteio.

**Architecture:** Tudo que decide resultado mora em `packages/shared/src/race/` como funções puras (física, pista, voltas, itens, bots, partida), testado com Vitest e rodado pelo servidor a 30 Hz. `apps/server/src/rooms.ts` passa a escolher entre `Match` (tiroteio) e `RaceMatch` pelo modo da sala. O cliente ganha `RaceEngine` (cena, câmera de perseguição, previsão da própria cadeira) e telas próprias de HUD e resultado; o tiroteio não muda.

**Tech Stack:** o mesmo do projeto (TypeScript, pnpm, Three.js, React, ws, Zod, Vitest).

**Spec:** `docs/SPEC-corrida.md` (e `docs/SPEC.md` para o que já existe).

## Global Constraints

- Node 22; testes com `pnpm test` (o script chama o Vitest direto).
- Cliente só envia intenções: `kinput` (direção, acelerador, derrapagem) e `kitem`. Nunca posição, volta, item ou colocação.
- Todas as cadeiras com a mesma física; personalização só visual.
- Números de física e itens só em `packages/shared/src/race/balance.ts` e `race/items.ts`.
- Texto visível em PT-BR, sem travessão "—".
- Unidades: metros e ms de simulação; `heading` 0 olha para +z, igual ao `dirOf` do tiroteio.
- Tiroteio continua funcionando igual: os 57 testes atuais seguem passando.

## Review Focus

1. Andar na contramão até a linha de chegada e cruzar: não pode contar volta. (Task 3)
2. Cadeira presa na parede ou fora do traçado por bug de colisão: `R` reposiciona, e o servidor reposiciona sozinho após 5 s fora da pista. (Tasks 2 e 6)
3. Item usado no mesmo tick em que a caixa é pega, ou dois jogadores na mesma caixa: um item por jogador, caixa só entrega a um. (Task 4)
4. Jogador desconecta no meio da corrida: a cadeira para no lugar, não bloqueia o fim; reconexão com token retoma. (Task 7)
5. Troca de modo no lobby enquanto um cliente ainda está na tela de resultados do outro modo: cliente segue o `lobby.mode` do servidor. (Task 8)

---

## File Structure

```
packages/shared/src/race/
  balance.ts        RACE: números de física, derrapagem, itens, voltas
  track.ts          TRACK: linha central, larguras, checkpoints, caixas, grid; buildWalls(), progressOf()
  kart.ts           KartState, KartInput, stepKart(), collideKarts()
  laps.ts           updateProgress(), ranking()
  items.ts          ITEM_IDS, ITEM_WEIGHTS, rollItem(), useItem(), stepHazards()
  bots.ts           stepRaceBot()
  match.ts          createRace(), stepRace(), setKartInput(), queueItemUse(), buildRaceSnapshot(), buildRacePrivate(), getRaceResults()
  chair.ts          ChairDNA, CHAIR_* opções, sanitizeChair(), DEFAULT_CHAIR
  types.ts          RaceSnapshot, RacePrivate, RaceResultRow, Hazard, RaceEvent
packages/shared/src/protocol.ts     + mode, kinput, kitem; LobbyState.mode; ServerMsg rsnap/rresults
packages/shared/src/test/race-*.test.ts
apps/server/src/rooms.ts            Room.mode, start/step/finish para os dois modos
apps/server/src/test/race.test.ts
apps/web/src/race/
  RaceView.tsx      monta RaceEngine + HUD
  raceEngine.ts     cena, câmera de perseguição, previsão, interpolação, efeitos
  trackScene.ts     buildTrack(scene) a partir de TRACK
  chairMesh.ts      buildChair(chair) e boneco sentado (usa createCharacter)
  RaceHud.tsx, RaceResults.tsx, Minimap.tsx
apps/web/src/screens/Lobby.tsx      seletor de modo
apps/web/src/screens/Creator.tsx    aba Cadeira
apps/web/src/App.tsx, store.ts      rotas e estado do modo corrida
```

---

### Task 1: Dados da pista e da cadeira

**Files:** `race/balance.ts`, `race/track.ts`, `race/chair.ts`, `race/types.ts`, `test/race-track.test.ts`.

**Produces:**
- `RACE = { maxSpeed: 16, accel: 8, brake: 14, reverseMax: 5, turnRate: 2.4, minTurnRadius: 3.5, driftTurnBonus: 0.45, driftLevel1Ms: 800, driftLevel2Ms: 1600, boost1Ms: 600, boost2Ms: 1000, boostSpeed: 22, wallSpeedKeep: 0.5, carpetMax: 0.6, kartRadius: 0.7, laps: 3, finishGraceMs: 30000, respawnPenaltyMs: 2000, offTrackAutoRespawnMs: 5000, boxRespawnMs: 4000, maxPlayers: 8 }`.
- `TRACK: { points: Vec2[]; widths: number[]; carpet: {from: number; to: number; side: -1 | 1}[]; boxRows: number[]; driftHints: {from: number; to: number}[]; startIndex: 0 }` com linha central fechada de ~350 m pelos ambientes do spec §4.4 (pontos a cada ~5 m, coordenadas dentro de 120 x 90 m, origem no centro).
- `buildWalls(track): Box[]` (caixas finas nas bordas, gerando o mesmo formato `Box` de `data/map.ts`), `progressOf(track, pos): { s: number; seg: number; lateral: number }` (`s` em metros ao longo da linha central), `checkpoints(track): number[]` (valores de `s` a cada 20 m), `gridSlots(track, n): {pos: Vec2; heading: number}[]`, `TRACK_LENGTH`.
- `ChairDNA = { seat: number; base: number; wheels: number; back: number; trinket: number }`, listas `CHAIR_SEATS` (10 cores), `CHAIR_BASES` (6), `CHAIR_WHEELS` ["Comuns", "Neon", "Patinete"], `CHAIR_BACKS` ["Baixo", "Alto", "Gamer"], `CHAIR_TRINKETS` ["Nenhum", "Bandeirinha", "Buzina", "Caneca", "Plantinha", "Adesivos"], `sanitizeChair(raw: unknown): ChairDNA`.

- [ ] Testes: linha fechada (último ponto a menos de 6 m do primeiro); comprimento entre 300 e 400 m; largura entre 8 e 12 m em todo ponto; nenhum trecho da pista cruza outro (distância mínima entre segmentos não vizinhos maior que a soma das meias-larguras); `progressOf` de um ponto da linha central devolve o `s` desse ponto (tolerância 0,5 m); os 8 `gridSlots` ficam dentro da pista e a mais de 1,5 m entre si; `sanitizeChair` corrige valores inválidos.
- [ ] Implementar. Commit.

### Task 2: Física da cadeira

**Files:** `race/kart.ts`, `test/race-kart.test.ts`.

**Consumes:** `RACE`, `buildWalls`, `progressOf`, `moveCircle` de `sim/collision.ts`.
**Produces:** `KartState = { pos: Vec2; heading: number; speed: number; drifting: boolean; driftDir: -1 | 0 | 1; driftMs: number; boostUntil: number; spinUntil: number; slipUntil: number; offTrackMs: number }`, `KartInput = { steer: number; throttle: number; drift: boolean }`, `stepKart(k: KartState, input: KartInput, dtMs: number, now: number, walls: Box[]): KartState` (pura), `collideKarts(a: KartState, b: KartState): void`, `respawnAt(track, s): Pick<KartState, "pos" | "heading">`.

- [ ] Testes: parado com acelerador 1 chega a 95% de `maxSpeed` entre 1,6 e 2,4 s; sem acelerador desacelera até parar; virar a 16 m/s descreve raio maior que a 6 m/s; bater de frente em parede deixa a velocidade em no máximo 50% e não atravessa; derrapagem segurada 0,9 s e solta dá `boostUntil` de 600 ms, 1,7 s dá 1000 ms; soltar antes de 0,8 s não dá turbo; em `spinUntil` o input é ignorado; no carpete a velocidade não passa de 60%; dois karts sobrepostos se separam; `stepKart` com o mesmo estado e input dá o mesmo resultado (determinismo).
- [ ] Implementar. Commit.

### Task 3: Voltas e classificação

**Files:** `race/laps.ts`, `test/race-laps.test.ts`.

**Produces:** `LapState = { lap: number; nextCheckpoint: number; lastS: number; lapStartedAt: number; bestLapMs: number | null; finishedAt: number | null }`, `updateProgress(l: LapState, s: number, now: number, cps: number[]): LapState` (avança checkpoint só na ordem; volta só conta ao cruzar a linha com todos os checkpoints), `raceProgress(l: LapState, s: number): number` (= voltas completas × comprimento + s), `ranking(entries: {id; progress; finishedAt}[]): string[]` (terminados por `finishedAt`, demais por `progress`).

- [ ] Testes: dar a volta certa conta 1; ir e voltar na linha de chegada não conta; percorrer a pista ao contrário inteira não conta; pular um checkpoint (teleporte) não conta até passar por ele; terminar 3 voltas preenche `finishedAt` e `bestLapMs`; ranking põe terminados à frente e ordena o resto pelo progresso.
- [ ] Implementar. Commit.

### Task 4: Itens

**Files:** `race/items.ts`, `test/race-items.test.ts`.

**Produces:** `ItemId = "expresso" | "triplo" | "grampeador" | "poca" | "resma" | "aviao" | "pasta" | "postit"`, `ITEM_WEIGHTS: { front: Record<ItemId, number>; back: Record<ItemId, number> }` (front = primeira metade do pelotão; `aviao` e `triplo` com peso 0 no front; `expresso` e `aviao` maiores no back), `rollItem(rng, place: number, total: number): ItemId`, `Hazard = { id; kind: "poca" | "resma" | "grampo" | "aviao"; pos: Vec2; vel?: Vec2; targetId?: string; owner: string; until: number }`, `useItem(race, kartId): boolean`, `stepHazards(race, dtMs): void`, `pickBoxes(race): void`.
Efeitos: valores do spec §4.5 em `RACE`/`ITEM_FX`; `pasta` consome o próximo `spin`/`slip`; `postit` só marca `blindUntil` no alvo (o cliente desenha).

- [ ] Testes: caixa entrega item só a quem está com o espaço vazio e some até `boxRespawnMs`; duas cadeiras na mesma caixa no mesmo tick: só uma recebe; `rollItem` com 10 mil sorteios respeita os pesos (±2 pontos percentuais) e nunca dá `aviao` ao 1º lugar; grampo acerta e causa `spinUntil` de 1000 ms; grampo para na parede; poça causa `slipUntil` 800 ms e some após o acerto; resma bloqueia passagem e some quando atingida; aviãozinho persegue só o kart imediatamente à frente e para em parede; pasta anula um ataque e some; `triplo` dá 3 usos; usar sem item não faz nada.
- [ ] Implementar. Commit.

### Task 5: Partida de corrida e bots

**Files:** `race/match.ts`, `race/bots.ts`, `test/race-match.test.ts`.

**Produces:** `RaceMatch` (fase `countdown | active | finished`, mesmo formato de relógio do `Match`), `createRace({ seed, players: {id; name; avatar; chair; isBot}[] })`, `stepRace(r, dtMs)`, `setKartInput(r, id, input)`, `queueItemUse(r, id)`, `respawnRequest(r, id)`, `buildRaceSnapshot(r)`, `buildRacePrivate(r, id)`, `getRaceResults(r): RaceResultRow[]` (posição, tempo total ou null, melhor volta, itens usados), `stepRaceBot(r, kart)`.
Regras: contagem de 3 s com cadeiras travadas; fim 30 s depois do primeiro terminar ou quando todos terminam; fora da pista por 5 s reposiciona automaticamente.

- [ ] Testes: corrida só de bots (8) termina em até 6 min de simulação com todos com `lap >= 2`; ninguém anda durante a contagem; após o 1º terminar, fase vira `finished` em no máximo 30 s; resultados ordenados igual ao `ranking`; snapshot não expõe estado de outros jogadores além do necessário (item atual só no privado).
- [ ] Implementar. Commit.

### Task 6: Protocolo e servidor

**Files:** `packages/shared/src/protocol.ts`, `apps/server/src/rooms.ts`, `apps/server/src/test/race.test.ts`.

**Produces:** cliente → servidor: `{t:"mode", mode: "shooter" | "race"}` (anfitrião, só no lobby), `{t:"kinput", steer, throttle, drift}` (números finitos em [-1, 1]), `{t:"kitem"}`, `{t:"krespawn"}`, `chair` opcional em `create`, `join` e `avatar`. Servidor → cliente: `{t:"rsnap", s: RaceSnapshot, me: RacePrivate | null}`, `{t:"rresults", rows: RaceResultRow[]}`. `LobbyState` ganha `mode` e cada `LobbyPlayer` ganha `chair`.
`Room` guarda `mode` e um `race: RaceMatch | null`; `start()` cria um ou outro; `step()` e `finish()` tratam os dois; `handle()` ignora mensagens do modo errado. Rate limit e validação iguais aos atuais.

- [ ] Teste de integração: host troca para corrida, adiciona 3 bots, inicia; recebe `rsnap` com 4 cadeiras na contagem; `kinput` com NaN é descartado; convidado não consegue trocar o modo; `input` de tiroteio durante a corrida é ignorado; após simular o fim (corrida curta via opção de teste `lapsOverride`) chega `rresults` e o lobby volta a aceitar troca de modo.
- [ ] Testes atuais do servidor continuam passando. Commit.

### Task 7: Cena da corrida no cliente

**Files:** `apps/web/src/race/{raceEngine.ts,trackScene.ts,chairMesh.ts,RaceView.tsx}`.

**Produces:** `new RaceEngine(canvas, myId, onUi)`, `applySnapshot(s, me)`, `dispose()`; `buildTrack(scene)` desenha piso, faixas, paredes (de `buildWalls`), carpete, linha de largada, caixas e decoração; `buildChair(chair: ChairDNA): THREE.Group` e `seatCharacter(avatar)` (boneco do crachá sentado, usando `createCharacter` e pose sentada nos quadris).
Câmera: 6 m atrás e 2,8 m acima da cadeira, olhando 8 m à frente, com suavização; leve FOV maior no turbo. Previsão local com `stepKart` + reconciliação no mesmo estilo do `engine.ts` (correção 25%, encaixe acima de 3 m). Outras cadeiras interpoladas 110 ms atrás. Efeitos: faíscas da derrapagem (cor por nível), rastro do turbo, rodopio, poça, resma, grampo, aviãozinho, post-it cobrindo parte da tela do alvo.

- [ ] Verificar no navegador: largada com 3 bots, pilotar uma volta inteira, derrapar e ver o turbo, pegar caixa e usar cada item (usar o modo de teste do item, abaixo). Commit.

### Task 8: Lobby, editor da cadeira, HUD e resultados

**Files:** `screens/Lobby.tsx`, `screens/Creator.tsx`, `store.ts`, `App.tsx`, `race/RaceHud.tsx`, `race/Minimap.tsx`, `race/RaceResults.tsx`.

- [ ] Lobby: seletor Tiroteio | Corrida (anfitrião), texto "3 voltas" no modo corrida, miniatura da cadeira junto do boneco.
- [ ] Editor: abas "Boneco" e "Cadeira"; prévia do boneco sentado na cadeira; salvar `ec.chair` no `localStorage`; botão Aleatório cobre os dois.
- [ ] `App`: `lobby.phase === "match"` e `lobby.mode === "race"` vai para `RaceView`; resultados escolhem `RaceResults` pelo modo.
- [ ] HUD: posição grande (1º/8), volta (2/3), tempo e melhor volta, item atual com ícone e cargas, minimapa com o traçado e um ponto por participante, contagem de largada, aviso "Contramão!" quando o progresso diminui por 1 s, "R para voltar à pista".
- [ ] Resultados: pódio com os 3 primeiros sentados nas cadeiras, tabela com tempo total, melhor volta e item favorito; "Voltar ao lobby".
- [ ] Verificar no navegador com 2 abas humanas + bots: troca de modo, corrida completa, resultados iguais nas duas abas, volta ao lobby e partida de tiroteio em seguida. Commit.

### Task 9: Fechamento

- [ ] README: seção do modo corrida (controles, itens, como editar a pista em `race/track.ts`).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes.
- [ ] Revisão final do branch por um revisor independente; corrigir críticos e importantes com teste.
- [ ] PR para `main` com o modelo de PR preenchido.

## Ferramenta de teste de itens

Em dev (`import.meta.env.DEV`), teclas 1 a 8 no RaceView pedem ao servidor um item específico via `{t:"kdebug", item}`. O servidor só aceita essa mensagem quando `NODE_ENV !== "production"`. Remove a dependência de sorte para testar cada item no navegador.
