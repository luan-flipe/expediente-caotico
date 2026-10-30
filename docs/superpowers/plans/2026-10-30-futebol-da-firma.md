# Futebol da Firma: plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** modo novo "Futebol da Firma" (1v1 a 4v4, goleiros da IA, bots completam) no mapa do Ipatingão, com regras, pênaltis, uniformes, comemorações e aba própria no ranking.

**Arquitetura:** a simulação inteira fica em `packages/shared/src/futebol/` (pura e determinística, como `race/`). O servidor roda `stepFutebol` no tick que já existe em `rooms.ts`, com o modo `"futebol"` ao lado de `"race"`. O cliente ganha `apps/web/src/futebol/` (view, engine Three.js, HUD, resultados), carregado sob demanda como o `RaceView`.

**Stack:** TypeScript, pnpm monorepo, zod (protocolo), Three.js, vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-futebol-da-firma-design.md`

## Restrições globais

- Gate antes de cada commit: `pnpm typecheck && pnpm lint && pnpm test`; `pnpm build` no fim de cada fase.
- Node 22: `export PATH="/c/Users/luan.oliveira/tools/node22:$PATH"`. Python não funciona.
- Arquivos do repo em LF. Commits sem `Co-Authored-By` e sem "Generated with". Nunca `git add -A`; nunca adicionar `docs/deploy-coolify.pdf`.
- Texto visível ao jogador em PT-BR e sem travessão "—".
- Servidor é a autoridade: cliente manda só intenção (`ClientMsg`), nunca posição da bola, gol ou cartão.
- Durações: 180000, 300000, 600000 ms (mesmo `duration` que já existe).
- Cobranças: 8000 ms de espera; contador na tela nos últimos 3000 ms; esgotado, a IA cobra.
- Ranking: aba própria `futebol`; só pontua com pelo menos 2 humanos na partida; derrota não dá nem tira pontos; gols da disputa de pênaltis não contam como gol.
- Sala: até 8 humanos (`BALANCE.maxPlayers`); goleiros nunca são humanos.

## Foco da revisão

1. Jogador sai no meio da partida: o bot assume a vaga dele na hora, sem travar cobrança pendente dele. (teste na Tarefa 9)
2. Cobrador designado desconecta durante os 8 s: a contagem segue e a IA cobra no fim. (teste na Tarefa 6)
3. Bola parada exatamente na linha (meio fora, meio dentro): só sai quando passa inteira, como no futebol. (teste na Tarefa 3)
4. Dois jogadores disputam a mesma bola no mesmo tick: resultado determinístico (menor distância vence; empate, menor id). (teste na Tarefa 4)
5. Vermelho no último jogador de linha de um time em 2v2 a 4v4: o time continua só com o goleiro e a partida não trava. (teste na Tarefa 5)

---

## Fase 1: simulação compartilhada (`packages/shared/src/futebol/`)

### Tarefa 1: tipos, formatos e campo

**Arquivos:**
- Criar: `packages/shared/src/futebol/types.ts`, `balance.ts`, `field.ts`
- Modificar: `packages/shared/src/index.ts` (exportar o módulo)
- Teste: `packages/shared/src/test/futebol-campo.test.ts`

**Interfaces (produz):**
- `type FutFormat = 1 | 2 | 3 | 4` (jogadores de linha por time); `FUT_FORMATS = [1, 2, 3, 4] as const`.
- `type TeamSide = 0 | 1`.
- `interface Field { halfL: number; halfW: number; goalHalfW: number; goalH: number; boxL: number; boxHalfW: number; penaltySpot: number }` em metros, origem no centro, gols em `x = ±halfL`.
- `fieldFor(format: FutFormat): Field`. Valores (campo total L x W): 1 → 30 x 20, 2 → 40 x 26, 3 → 50 x 32, 4 → 60 x 38. Gol 4 m x 2 m em todos (mesmo `gol.glb`). Área: `boxL = L * 0.16`, `boxHalfW = W * 0.3`. Marca do pênalti a `boxL * 0.7` do gol.
- `FUT` em `balance.ts`: `restartWaitMs: 8000`, `restartCountdownMs: 3000`, `walkSpeed: 6`, `sprintSpeed: 8.5`, `doubleTapMs: 250`, `controlRadius: 0.9`, `dribbleTouch: 0.7`, `sprintTouch: 1.6`, `chargeMaxMs: 1000`, `shotMin: 10`, `shotMax: 28`, `passMin: 6`, `passMax: 18`, `ballRadius: 0.25`, `goalCelebrateMs: 4000`, `kickoffWaitMs: 2000`. Ajustáveis no teste; os testes leem de `FUT`, nunca números soltos.

- [ ] **Passo 1: teste que falha:** `fieldFor` cresce de 1 a 4 (`fieldFor(1).halfL < fieldFor(4).halfL`), `fieldFor(4)` tem `halfL === 30` e `halfW === 19`, gol sempre `goalHalfW === 2` e `goalH === 2`, área dentro do campo (`boxHalfW < halfW`).
- [ ] **Passo 2:** rodar `pnpm --filter @ec/shared test -- futebol-campo` e ver falhar por import.
- [ ] **Passo 3:** implementar os três arquivos e exportar em `index.ts`.
- [ ] **Passo 4:** rodar de novo e ver passar.
- [ ] **Passo 5:** commit `Futebol: tipos, formatos e medidas do campo`.

### Tarefa 2: jogador de linha (movimento, corrida e condução)

**Arquivos:** criar `futebol/player.ts`; teste `test/futebol-jogador.test.ts`.

**Interfaces:**
- Consome: `FUT`, `Field`.
- Produz: `interface FutInput { mx: number; mz: number; aim: number; sprint: boolean; kick: "none" | "charge" | "release"; pass: "none" | "charge" | "release" }` (botão esquerdo = `kick`, direito = `pass`; sem a bola, `kick` vira carrinho e `pass` vira disputa).
- `interface FutPlayer { id; side: TeamSide; role: "linha" | "goleiro"; x; z; vx; vz; facing; chargeMs; chargeKind: "kick" | "pass" | null; tackleMs; downMs; yellow: number; sentOff: boolean; isBot: boolean }`.
- `stepPlayer(p: FutPlayer, input: FutInput, field: Field, dtMs: number): void`: aceleração suave até `walkSpeed`/`sprintSpeed`; não sai do campo mais 2 m de margem; `downMs > 0` (caído) ignora input.
- O toque duplo para correr é detectado no **cliente** e vira `sprint: true` no input (o servidor não vê teclas).

- [ ] **Passo 1: testes que falham:** `anda até walkSpeed e não passa`, `sprint chega a sprintSpeed`, `caído não se mexe`, `não sai além da margem do campo`.
- [ ] **Passos 2 a 4:** ver falhar, implementar `stepPlayer`, ver passar.
- [ ] **Passo 5:** commit `Futebol: movimento do jogador de linha`.

### Tarefa 3: bola (física 3D simples, saída e gol)

**Arquivos:** criar `futebol/ball.ts`; teste `test/futebol-bola.test.ts`.

**Interfaces:**
- `interface Ball { x; y; z; vx; vy; vz; ownerId: string | null; lastTouch: { id: string; side: TeamSide } | null; prevTouch: { id: string; side: TeamSide } | null }`.
- `stepBall(b: Ball, dtMs: number): void`: gravidade 9,8; quique com coeficiente 0,55 e atrito no chão (rolando perde 35% da velocidade por segundo); para abaixo de 0,05 m/s.
- `ballOut(b: Ball, f: Field): { kind: "lateral" | "fundo" | "gol"; side: TeamSide } | null`: só conta quando a bola passa **inteira** da linha (centro além da linha mais `ballRadius`). Gol: passou inteira da linha de fundo entre as traves e abaixo do travessão; `side` é quem sofreu.
- `kickBall(b: Ball, dirYaw: number, power01: number, kind: "kick" | "pass"): void`: velocidade entre `shotMin..shotMax` ou `passMin..passMax`; chute com `power01 > 0.6` sobe (vy proporcional), passe fica rasteiro.

- [ ] **Passo 1: testes que falham:** `quica e perde altura`, `rolando para sozinha`, `meio fora da linha ainda está em jogo` (Foco 3), `passou inteira da lateral dá lateral`, `entre as traves e abaixo de 2 m é gol`, `por cima do travessão é tiro de meta (fundo)`, `chute forte sobe e passe fica rasteiro`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: física da bola, saída e gol`.

### Tarefa 4: domínio, condução, chute, passe e disputa

**Arquivos:** criar `futebol/touch.ts`; teste `test/futebol-toque.test.ts`.

**Interfaces:**
- `resolveTouches(players: FutPlayer[], ball: Ball, inputs: Map<string, FutInput>, dtMs: number): TouchEvent[]` com `type TouchEvent = { t: "kick" | "pass" | "steal" | "tackle"; id: string; ok: boolean }`.
- Regra de domínio (meio-termo da spec): dentro de `controlRadius`, o dono empurra a bola à frente a cada passo com distância `dribbleTouch` (andando) ou `sprintTouch` (correndo). Em corrida a bola fica fora do raio por instantes, então o adversário pode tomar.
- Disputa: quem chega na bola sem dono, o mais perto vence; empate de distância, menor `id` (Foco 4).
- Carga: `charge` acumula `chargeMs` até `chargeMax`; `release` chama `kickBall` com `power01 = chargeMs / chargeMax` na direção `aim`. Soltar sem a bola é ignorado.
- Atualiza `ball.lastTouch` e `ball.prevTouch` (para a assistência).

- [ ] **Passo 1: testes que falham:** `dono conduz a bola à frente andando`, `correndo o toque é mais longo`, `bola solta vai para o mais perto`, `empate de distância vence o menor id` (Foco 4), `segurar e soltar chuta com força proporcional`, `soltar sem a bola não faz nada`, `passe registra prevTouch para a assistência`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: domínio, chute, passe e disputa`.

### Tarefa 5: falta, carrinho e cartões

**Arquivos:** criar `futebol/fouls.ts`; teste `test/futebol-faltas.test.ts`.

**Interfaces:**
- `judgeTackle(tackler: FutPlayer, victim: FutPlayer, ball: Ball, kind: "carrinho" | "disputa", tackler_sprinting: boolean): { foul: boolean; card: "none" | "yellow" | "red" }`. Critérios da spec, valores exatos:
  - Tocou a bola primeiro (bola a até 0,6 m do pé do `tackler` no instante do contato): limpo.
  - Contato sem tocar a bola antes: falta.
  - Falta de carrinho vindo de ângulo maior que 120° em relação ao `facing` da vítima: vermelho.
  - Falta de carrinho em corrida: amarelo.
  - Falta em disputa em pé: só falta.
- `applyCard(p: FutPlayer, card): void`: segundo amarelo vira vermelho; vermelho marca `sentOff = true` e tira o jogador do campo.
- Falta dentro da área do time da vítima atacando vira pênalti.

- [ ] **Passo 1: testes que falham:** `carrinho que toca a bola primeiro é limpo`, `carrinho sem bola é falta`, `carrinho por trás é vermelho direto`, `carrinho em corrida é amarelo`, `disputa em pé é só falta`, `segundo amarelo vira vermelho`, `falta na área vira pênalti`, `vermelho no último de linha deixa o time só com goleiro` (Foco 5).
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: faltas e cartões`.

### Tarefa 6: bola parada (lateral, escanteio, tiro de meta, falta) com espera de 8 s

**Arquivos:** criar `futebol/restarts.ts`; teste `test/futebol-cobrancas.test.ts`.

**Interfaces:**
- `type Restart = { kind: "lateral" | "escanteio" | "meta" | "falta" | "penalti" | "saida"; side: TeamSide; x: number; z: number; takerId: string; leftMs: number }`.
- `startRestart(m: FutMatch, kind, side, x, z): void`: escolhe o cobrador = jogador de linha do `side` mais perto do ponto; tiro de meta e pênalti defensivo nunca (meta é sempre do goleiro); `leftMs = FUT.restartWaitMs`.
- Enquanto há `restart`, só o cobrador pode tocar na bola; os outros ficam a 4 m.
- `leftMs` chega a 0: a IA cobra (passe para o companheiro mais livre). Cobrador desconectado não pausa nada (Foco 2).
- O snapshot expõe `restart.leftMs`; o cliente mostra o contador quando `leftMs <= FUT.restartCountdownMs`.

- [ ] **Passo 1: testes que falham:** `saída lateral escolhe o mais perto do time certo`, `tiro de meta é do goleiro`, `escanteio quando o defensor toca por último`, `8 s sem cobrar: IA cobra`, `cobrador que caiu da sala: IA cobra no fim do tempo` (Foco 2), `só o cobrador toca na bola`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: cobranças com espera de 8 s`.

### Tarefa 7: goleiro da IA e bots de linha

**Arquivos:** criar `futebol/keeper.ts`, `futebol/bots.ts`; teste `test/futebol-ia.test.ts`.

**Interfaces:**
- `keeperInput(k: FutPlayer, ball: Ball, f: Field, level: BotLevel): FutInput`: fica na linha entre a bola e o centro do gol, sai do gol quando a bola entra na área sem dono; defende se a trajetória cruza o gol e chega ao alcance (alcance e reação por nível: fácil 0,8 m / 350 ms, normal 1,1 m / 220 ms, difícil 1,4 m / 140 ms); com a bola, passa para o companheiro mais livre.
- `botInput(p: FutPlayer, m: FutMatch, level: BotLevel): FutInput`: sem bola, vai à bola se for o mais perto do time, senão guarda posição por formação; com bola, conduz para o gol e chuta de dentro da área ou passa se marcado.
- Usa o `rng` da partida (determinístico pela seed).

- [ ] **Passo 1: testes que falham:** `goleiro se posiciona entre bola e gol`, `goleiro difícil defende chute central de média força`, `goleiro fácil deixa passar chute no canto`, `bot mais perto vai na bola`, `bot com bola na área chuta`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: goleiro e bots`.

### Tarefa 8: partida (tempo, gol, saída, comemoração, pênaltis, resultado)

**Arquivos:** criar `futebol/match.ts`, `futebol/penalties.ts`; teste `test/futebol-partida.test.ts`.

**Interfaces (o servidor e o cliente consomem):**
- `interface FutTeamConfig { name: string; kit: number; color: number }` (`kit` índice em `FUT_KITS`, `color` índice em `FUT_COLORS`, definidos em `balance.ts`: 3 modelos e 8 cores).
- `createFutebol(opts: { seed: number; format: FutFormat; durationMs: number; botLevel: BotLevel; players: { id: string; name: string; avatar: AvatarDNA; side: TeamSide; isBot: boolean; accountId: string | null }[]; teams: [FutTeamConfig, FutTeamConfig] }): FutMatch`. Cria os 2 goleiros da IA e completa cada lado até `format` com bots.
- `setFutInput(m: FutMatch, id: string, input: FutInput, seq?: number): void`
- `stepFutebol(m: FutMatch, dtMs: number): void`: fases `"kickoff" | "play" | "restart" | "goal" | "penalties" | "over"`.
- `buildFutSnapshot(m): FutSnapshot` e `buildFutPrivate(m, id): FutPrivate | null` (só `chargeMs`, `seq` confirmada).
- `getFutResults(m): FutResultRow[]` com `{ id, name, side, isBot, accountId, goals, assists, yellow, red }` e `getFutScore(m): { score: [number, number]; pens: [number, number] | null; winner: TeamSide | null }`.
- Eventos para o cliente em `m.events`: `goal { side, scorerId, assistId }`, `card { id, card }`, `foul { id }`, `restart { kind }`, `whistle { kind: "start" | "half" | "end" }`.
- Assistência: `prevTouch` do mesmo time do autor, até 6 s antes do gol. Gol contra não dá assistência.
- Gol: fase `goal` por `FUT.goalCelebrateMs`, depois saída do meio para quem sofreu.
- Fim do tempo com empate: `penalties.ts` com 5 cobranças alternadas por time; empatado, cobranças alternadas uma a uma até um converter e o outro errar. Cobradores giram entre jogadores de linha não expulsos do time, humanos primeiro. Gols da disputa não entram em `goals`.
- Jogador desconectado ou que sai: vira bot na hora (Foco 1).
- 1v1 com vermelho: partida termina e o adversário vence.

- [ ] **Passo 1: testes que falham:** `completa os times com bots até o formato`, `tem sempre 2 goleiros da IA`, `gol soma placar e faz saída de quem sofreu`, `assistência vai para o passe do companheiro`, `gol contra não dá assistência`, `tempo acaba com vitória`, `empate vai aos pênaltis e decide`, `gols de pênalti não contam como gol`, `vermelho no 1v1 encerra com vitória do outro`, `jogador que sai vira bot sem travar` (Foco 1), `mesma seed e mesmos inputs dão o mesmo placar`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: partida, gols, assistências e pênaltis`.

## Fase 2: protocolo, servidor e ranking

### Tarefa 9: protocolo e sala

**Arquivos:** modificar `packages/shared/src/protocol.ts`, `packages/shared/src/botLevels.ts` (opções da sala), `apps/server/src/rooms.ts`; teste `apps/server/src/test/futebol.test.ts`.

**Interfaces:**
- `GameMode` ganha `"futebol"`; `ClientMsg` `mode` aceita `"futebol"`.
- `RoomOptions` ganha `futFormat: FutFormat` (padrão 2) e `futTeams: [FutTeamConfig, FutTeamConfig]` (padrão "Financeiro" azul e "TI" laranja, modelos 0 e 1).
- `LobbyPlayer` ganha `side?: TeamSide`.
- Mensagens novas: `{ t: "futTeam", side: TeamSide }` (jogador escolhe o time), `{ t: "futTeamConfig", side, name?, kit?, color? }` (o primeiro humano do time ou o anfitrião; nome com 1 a 18 caracteres, sanitizado como o nome do jogador; cor igual à do outro time é recusada), `{ t: "futInput", ... FutInput, seq }`.
- `options` aceita `futFormat`.
- `ServerMsg`: `{ t: "fsnap"; s: FutSnapshot; me: FutPrivate | null }` e `{ t: "fresults"; rows: FutResultRow[]; score; awards }`.
- `rooms.ts`: `this.futebol` ao lado de `this.race`; `start()` cria a partida com `createFutebol`; jogadores de um time a mais que `futFormat` são recusados no `start` com erro "Time com gente demais para o formato"; `stepFutebol` no mesmo tick; ao terminar, `fresults` e volta para `results`.

- [ ] **Passo 1: testes que falham:** `anfitrião troca para futebol e formato`, `jogador escolhe o time`, `cor repetida é recusada`, `não-anfitrião não muda o time dos outros`, `start completa com bots e manda fsnap`, `jogador que cai vira bot e a partida segue` (Foco 1), `fim manda fresults e volta ao lobby pelo anfitrião`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: protocolo e sala no servidor`.

### Tarefa 10: ranking (aba Futebol e trava anti-farm)

**Arquivos:** modificar `packages/shared/src/ranking/types.ts`, `ranking/rules.ts`, `apps/server/src/rooms.ts`; teste `packages/shared/src/test/ranking-futebol.test.ts`.

**Interfaces:**
- `PlayerStats` ganha `futWins`, `futMatches`, `futGoals`, `futAssists` (padrão 0; dados antigos sem os campos continuam válidos).
- `RankingView` ganha `futebol: RankingTab<FutRow>` com `FutRow = RankingRowBase & { wins; goals; assists; matches }`, ordenado por vitórias, depois gols, depois assistências.
- `applyFutebolResult(data, rows: { accountId: string | null; won: boolean; goals: number; assists: number }[], humans: number, now): string[]`: com `humans < 2` não faz nada. Pontos do mês: vitória 3, gol 1, assistência 1, derrota 0.
- O perfil (`PlayerProfile.stats`) passa a mostrar as estatísticas do futebol.

- [ ] **Passo 1: testes que falham:** `vitória, gol e assistência somam`, `derrota não tira ponto`, `com 1 humano não pontua`, `bots não entram`, `dado antigo sem campos do futebol carrega`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: aba no ranking com trava anti-farm`.

## Fase 3: assets

### Tarefa 11: mapa do Ipatingão otimizado

**Arquivos:** criar `scripts/otimizar-ipatingao.mjs`; original em `assets-src/futebol/ipatingao.glb` (copiar de `C:\Users\luan.oliveira\Downloads\ipatingao-3d.glb`); saída `apps/web/src/assets/futebol/ipatingao.glb`.

- Usar `@gltf-transform` (já usado por `scripts/optimize-assets.mjs`): `dedup`, `flatten`, `join` por material, `weld`, `simplify` só nas arquibancadas, texturas em WebP no máximo 1024 px, `meshopt`.
- Meta: abaixo de 4 MB. Se não bater só com script, registrar o tamanho alcançado no commit e seguir (decisão da spec).
- Medir onde está o gramado (bbox do nó ou material de grama) e anotar no topo do script o centro e a escala para alinhar o `Field` (escala do modelo para que o campo 4v4, 60 x 38 m, caiba dentro do gramado).
- Bola e gol já existem em `apps/web/src/assets/futebol/` (gerados por `scripts/gerar-bola.mjs` e `scripts/gerar-gol.mjs`); commitar junto se ainda não estiverem.

- [ ] **Passo 1:** rodar o script; conferir tamanho com `ls -la`.
- [ ] **Passo 2:** abrir o .glb no navegador (cena simples) e conferir que o estádio está inteiro e as texturas aparecem.
- [ ] **Passo 3:** commit `Futebol: mapa do Ipatingão otimizado, bola e gol`.

### Tarefa 12: uniformes no boneco

**Arquivos:** criar `apps/web/src/futebol/uniforme.ts`; modificar `apps/web/src/game/character.ts` só se precisar de um gancho para trocar a roupa; teste `apps/web/src/futebol/uniforme.test.ts`.

**Interfaces:**
- `uniformDNA(avatar: AvatarDNA, team: FutTeamConfig): AvatarDNA`: mantém rosto, cabelo, pele e corpo; troca `top`, `bottom`, `shirt`, `shirtColor` (e cores das peças) pelo modelo e cor do time. Modelos: 0 camisa lisa, 1 listrada (via cor secundária), 2 com faixa. Cor da calça: escura fixa.
- Puro sobre o DNA, sem Three.js, para testar.

- [ ] **Passo 1: testes que falham:** `mantém rosto e cabelo`, `troca a roupa pela do time`, `dois times diferentes geram camisas diferentes`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** commit `Futebol: uniforme do time no boneco`.

## Fase 4: cliente

### Tarefa 13: sala de espera do futebol

**Arquivos:** modificar `apps/web/src/screens/Lobby.tsx`, `apps/web/src/store.ts`, `apps/web/src/styles.css`.

- Botão "Futebol da Firma" no seletor de modo; com ele: seletor de formato (1v1, 2v2, 3v3, 4v4), duração (3, 5, 10 min, já existe), nível dos bots (já existe).
- Duas colunas de time: nome editável, modelo (3 opções) e cor (8 amostras); botão "Entrar neste time"; miniaturas dos jogadores com o uniforme (`uniformDNA`).
- Quem não pode editar vê só leitura.
- Verificar: `pnpm dev`, criar sala, trocar para futebol, mudar nome, cor e formato, ver na outra aba (duas abas) que mudou; sala continua sem rolagem no computador (regra do PR #61).
- Commit `Futebol: sala de espera com times e uniformes`.

### Tarefa 14: partida no cliente (cena, câmera, controles, HUD)

**Arquivos:** criar `apps/web/src/futebol/FutebolView.tsx`, `futebolEngine.ts`, `FutebolHud.tsx`, `controls.ts`; modificar `apps/web/src/App.tsx` (lazy load), `apps/web/src/touch.ts` e `apps/web/src/hud/TouchControls.tsx` (layout do futebol), `apps/web/src/settings.ts` (teclas do futebol); teste `apps/web/src/futebol/controls.test.ts`.

**Interfaces:**
- `controls.ts`: `readFutInput(keys, mouse, now, state): FutInput` com toque duplo em W em até `FUT.doubleTapMs` ligando a corrida até soltar W; botão esquerdo = `kick`, direito = `pass` (charge enquanto segura, release ao soltar). Menu de contexto do botão direito bloqueado na tela do jogo.
- Teclas novas em `RACE_ACTIONS`-like `FUT_ACTIONS`: `frente, tras, esquerda, direita, placar, chat` (mouse fixo nos botões).
- Celular: analógico à esquerda (borda = corrida), botões Chute e Passe à direita (segurar carrega), que viram Carrinho e Disputa sem a bola; mira = direção do analógico.
- Engine: carrega `ipatingao.glb`, `bola.glb`, `gol.glb` (dois gols posicionados pelo `Field` do formato), linhas do campo do formato pintadas por cima do gramado, bonecos com `uniformDNA`, câmera atrás do próprio jogador (mesma lógica de câmera do tiroteio), previsão local só do próprio boneco com `stepPlayer` e reconciliação por `seq` (como o kart), bola e outros interpolados.
- HUD: placar com nomes e cores dos times, relógio, barra de força perto do boneco, contador de cobrança quando `restart.leftMs <= 3000`, cartão mostrado na hora, placar dos pênaltis.

- [ ] **Passo 1: testes que falham (controls):** `toque duplo em W liga a corrida`, `W segurado sem toque duplo só anda`, `segurar esquerdo é charge e soltar é release`, `direito vira pass`.
- [ ] **Passos 2 a 4.**
- [ ] **Passo 5:** verificar no navegador: 1v1 contra bot e 2v2 com duas abas; chutar, passar, carrinho, sair a bola pela lateral, contador aparecer, gol; celular a 375 px com os botões.
- [ ] **Passo 6:** commit `Futebol: partida no cliente com câmera, controles e HUD`.

### Tarefa 15: comemorações, apito e tela de resultado

**Arquivos:** criar `apps/web/src/futebol/comemoracoes.ts`, `FutebolResults.tsx`; modificar `apps/web/src/sound.ts` (apito sintetizado como os bipes da largada).

- Gol: câmera curta (`FUT.goalCelebrateMs`) no autor; sorteio entre: chuva de papel picado (partículas), brinde de caneca (animação `cafe`), crachá carimbado sobre o goleiro (sprite), "dancinha da reunião que acabou mais cedo" (giro mais `tchau`). Sem animação nova feita à mão.
- Fim: vencedor comemora, perdedor com cabeça baixa; tela de resultado com placar, pênaltis se houver, gols, assistências e cartões por jogador, "Jogar de novo" e "Voltar ao lobby" para o anfitrião (como `RaceResults`).
- Verificar no navegador: gol, comemoração, fim de jogo e empate indo para os pênaltis.
- Commit `Futebol: comemorações, apito e resultado`.

### Tarefa 16: aba Futebol no ranking e no perfil

**Arquivos:** modificar `apps/web/src/screens/Ranking.tsx`, `apps/web/src/screens/Perfil.tsx`.

- Aba "Futebol" com vitórias, gols, assistências e partidas. Perfil com um card de futebol igual aos de Tiroteio e Rally. O cargo do perfil passa a somar vitórias do futebol.
- Verificar no navegador com dados de teste do servidor local.
- Commit `Futebol: aba no ranking e no perfil`.

## Fase 5: fechamento

### Tarefa 17: gate, conferência e PR

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes.
- [ ] No navegador: uma partida em cada formato (1v1 a 4v4) do apito inicial ao final, com bots completando; computador 1366x768 e celular 375 px.
- [ ] `git rev-parse --abbrev-ref HEAD` mostra `feat/futebol-da-firma`; push e PR para `main`, merge só com autorização do Luan.
