# Ranking da firma e Contra o relógio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login com Google (e visitante), ranking persistente da firma e modo Contra o relógio com fantasmas da minha melhor volta e do recordista.

**Architecture:** Regras de pontuação e do contra o relógio ficam em `packages/shared` como funções puras e testadas. O servidor ganha três peças pequenas: `store.ts` (arquivo JSON com escrita atômica), `auth.ts` (verifica o token do Google com as chaves públicas dele e emite sessão HMAC própria) e rotas `/api/*` no mesmo HTTP. A sala registra o resultado no `store` ao terminar. O cliente ganha login, tela de ranking e o modo contra o relógio no `RaceEngine` (fantasmas e outros pilotos semitransparentes).

**Tech Stack:** o mesmo do projeto. Sem dependência nova: verificação RS256 com `node:crypto` (`createPublicKey` com JWK) e botão do Google pelo script oficial `https://accounts.google.com/gsi/client`.

**Spec:** `docs/SPEC-ranking-contra-relogio.md`.

## Global Constraints

- Node 22; testes com `pnpm test`.
- Cliente continua mandando só intenções. Tempo de volta e fantasma vêm do servidor.
- Sem `GOOGLE_CLIENT_ID` o jogo funciona como hoje (só visitantes). Sem `SESSION_SECRET` o servidor gera um aleatório por processo (sessões caem a cada reinício) e avisa no log.
- `DATA_DIR` padrão `./data` (ignorado no git). Em produção `/data` com volume.
- Texto visível em PT-BR, sem travessão.
- `main` protegida: tudo por PR com CI verde.

## Review Focus

1. Token do Google forjado, de outro app (`aud`), de outro emissor ou vencido: recusado. (Task 3)
2. Arquivo de dados corrompido ou ausente na subida: o servidor sobe com dados vazios e guarda o arquivo ruim como `.bad`, sem derrubar o jogo. (Task 2)
3. Mesmo jogador logado em duas abas na mesma partida, ou partida com 1 logado + bots: não pontua em dobro nem farma. (Task 1)
4. Virada do mês em horário de Brasília (23h de 31/10 em UTC-3 já é 1/11 em UTC). (Task 1)
5. Contra o relógio: volta cortando caminho por reposição (R) não vira recorde nem fantasma; a regra de checkpoints continua valendo. (Task 5)

---

### Task 1: Regras do ranking (shared)

**Files:** `packages/shared/src/ranking/{types.ts,rules.ts}`, `test/ranking.test.ts`.

**Produces:**
- `PlayerStats = { shooterWins; shooterMatches; shooterKills; raceWins; racePodiums; raceMatches; bestLapMs: number | null }`
- `RankingData = { version: 1; accounts: Record<id, { email; name; since }>; stats: Record<id, PlayerStats>; months: Record<"YYYY-MM", Record<id, number>>; laps: Record<trackId, Record<id, { ms; at; ghost: GhostSample[] }>> }`, `GhostSample = [t, x, z, heading]` (números arredondados).
- `monthKey(date: Date): string` em `America/Sao_Paulo`.
- `PLACE_POINTS = [10, 6, 4]`, `PARTICIPATION_POINTS = 1`, `RECORD_POINTS = 5`.
- `matchCounts(entries: { accountId: string | null }[]): boolean` (2 ou mais contas distintas).
- `applyShooterResult(data, rows: { accountId; rank; kills }[], now)`, `applyRaceResult(data, rows: { accountId; place }[], now)`: ignoram linhas sem conta e contas repetidas (fica a melhor colocação), não fazem nada se a partida não conta.
- `applyLap(data, trackId, accountId, ms, ghost, now): { personalBest: boolean; record: boolean }`: grava fantasma só se for melhor que a própria; recorde novo dá `RECORD_POINTS` no mês.
- `rankingView(data, now, viewerId?)`: as 4 abas já ordenadas (top 20) mais a linha do jogador.

- [ ] Testes: partida com 1 conta não conta; com 2 contas conta e dá 10/6/4/1; conta repetida em duas abas pontua uma vez; empate no tiroteio dá vitória aos empatados; `monthKey` às 02:30Z de 1/11 é `2026-10`; volta pior não troca fantasma; recorde novo soma 5 pontos; `rankingView` destaca o jogador fora do top.
- [ ] Implementar. Commit.

### Task 2: Arquivo de dados (server)

**Files:** `apps/server/src/store.ts`, `test/store.test.ts`, `.gitignore` (`data/`).

**Produces:** `class Store { constructor(dir: string); data: RankingData; save(): void (agenda escrita em até 2 s); flush(): Promise<void>; }`. Escrita em `ranking.json.tmp` e `rename`. Se o JSON não abrir, renomeia para `ranking.json.bad-<timestamp>` e começa vazio.

- [ ] Testes: grava e relê; vários `save()` seguidos fazem uma escrita; arquivo corrompido sobe vazio e cria `.bad`; diretório inexistente é criado.
- [ ] Implementar. Commit.

### Task 3: Login (server)

**Files:** `apps/server/src/auth.ts`, `test/auth.test.ts`.

**Produces:** `verifyGoogleToken(idToken, clientId, fetchKeys = googleKeys): Promise<{ sub; email; name } | null>` (RS256, `kid` nas chaves com cache de 1 h, `iss` em `accounts.google.com`/`https://accounts.google.com`, `aud === clientId`, `exp` no futuro, `email_verified`); `signSession(accountId, secret, days = 60): string`, `readSession(token, secret): string | null` (HMAC-SHA256, comparação em tempo constante).

- [ ] Testes com par de chaves RSA gerado no teste e `fetchKeys` falso: token válido aceito; assinatura de outra chave, `aud` errado, `iss` errado e `exp` passado recusados; sessão adulterada ou vencida recusada.
- [ ] Implementar. Commit.

### Task 4: Rotas e sala registrando resultados (server + protocolo)

**Files:** `apps/server/src/app.ts`, `rooms.ts`, `packages/shared/src/protocol.ts`, `test/ranking-api.test.ts`.

**Produces:**
- HTTP: `GET /api/config` → `{ googleClientId: string | null }`; `POST /api/login` `{ credential }` → `{ session, name }` (limite por IP igual ao de criar sala); `GET /api/ranking` com `Authorization: Bearer <sessão>` opcional → `rankingView`.
- WS: `create`, `join` e `resume` aceitam `session?: string`; `Member.accountId`; `LobbyPlayer.ranked: boolean`.
- `Room.finish()` chama `applyShooterResult`/`applyRaceResult` e `store.save()`. Contra o relógio registra cada volta pela Task 5. Ao trocar o nome do crachá, a conta guarda o nome mais recente.
- `startServer(port, { store, auth: { clientId, secret } })` para os testes.

- [ ] Teste de integração: dois clientes com sessão jogam uma corrida curta com bots; `/api/ranking` mostra a vitória e os pontos; visitante não aparece; `/api/login` com token inválido dá 401.
- [ ] Implementar. Commit.

### Task 5: Contra o relógio (shared + server)

**Files:** `packages/shared/src/race/match.ts`, `race/types.ts`, `protocol.ts`, `rooms.ts`, `test/race-timetrial.test.ts`.

**Produces:** `createRace({ ..., timeTrial: true })`: sem caixas, sem itens, sem colisão entre cadeiras, sem número de voltas e sem fim por chegada; fim por `endTraining` do anfitrião ou 20 min. Cada cadeira grava amostras a cada 3 ticks da volta atual; ao fechar uma volta válida emite `{ type: "lap", id, lap, ms, ghost }` só no servidor (a lista de amostras não vai no snapshot). Modo `"timetrial"` no lobby; ao escolher, bots saem. Mensagens: `{ t: "endTraining" }` (anfitrião); servidor → cliente `{ t: "ghosts", mine: Ghost | null, record: Ghost & { name } | null }` na largada e quando mudam; resultados do treino em `rresults` com a melhor volta da sessão.

- [ ] Testes: sem caixas e sem colisão (duas cadeiras sobrepostas não se empurram); volta completa gera evento com amostras e `ms`; reposição no meio da volta não gera volta válida; `endTraining` encerra; 20 min encerra.
- [ ] Implementar. Commit.

### Task 6: Cliente

**Files:** `apps/web/src/net/session.ts`, `screens/Home.tsx`, `screens/Lobby.tsx`, `screens/Ranking.tsx`, `store.ts`, `App.tsx`, `race/raceEngine.ts`, `race/RaceHud.tsx`, `race/ghosts.ts`, `styles.css`.

- [ ] Home: carrega `/api/config`; com client id, mostra o botão oficial do Google e, logado, "Olá, <nome>" e Sair da conta; sessão no `localStorage` e enviada em `create/join/resume`.
- [ ] Ranking: tela com as 4 abas, aberta pela Home e pelo Lobby.
- [ ] Lobby: terceiro modo, selos "no ranking" e "visitante", botão de bot escondido no contra o relógio.
- [ ] RaceEngine no contra o relógio: outros pilotos semitransparentes; fantasmas (`seatedRacer` com material transparente, azul e dourado) tocando as amostras a partir do início de cada volta; HUD com volta atual, última, melhor da sessão e melhor de sempre; Encerrar treino para o anfitrião.
- [ ] Verificar no navegador: login simulado com sessão de teste, ranking aparecendo, treino com fantasma da volta anterior. Commit.

### Task 7: Fechamento
- [ ] README: login, ranking, contra o relógio e o passo a passo do Coolify (variáveis e volume).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- [ ] Revisão final por revisor independente; corrigir críticos e importantes com teste.
- [ ] PR para `main`.
