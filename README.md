# Expediente Caótico

Jogo de navegador ambientado no escritório. Cada pessoa monta um boneco parecido consigo, entra numa sala privada com os colegas (até 8, completando com bots) e o anfitrião escolhe o modo. Quem entra com a conta do Google aparece no ranking da firma; quem prefere joga como visitante, só com o nome.

- **Tiroteio:** partida curta em terceira pessoa com bolinhas de papel, habilidades de escritório e uma zona de controle que muda de sala.
- **Rally da Firma:** corrida de cadeiras de escritório, 3 voltas pelo Circuito Corporativo, com itens de escritório nas caixas da pista.
- **Contra o relógio:** treino de voltas livres no mesmo circuito, sem itens e sem colisão, correndo contra o fantasma da sua melhor volta e o do recordista.

- Ideia original: [docs/ideia-original-gemini.md](docs/ideia-original-gemini.md)
- Design refinado: [docs/superpowers/specs/2026-10-27-expediente-caotico-design.md](docs/superpowers/specs/2026-10-27-expediente-caotico-design.md)
- PRD: [docs/SPEC.md](docs/SPEC.md)
- Plano de implementação: [docs/superpowers/plans/2026-10-27-expediente-caotico-v1.md](docs/superpowers/plans/2026-10-27-expediente-caotico-v1.md)
- Modo corrida: [docs/SPEC-corrida.md](docs/SPEC-corrida.md) e [plano](docs/superpowers/plans/2026-10-27-modo-corrida.md)
- Ranking, Contra o relógio e configurações: [docs/SPEC-ranking-contra-relogio.md](docs/SPEC-ranking-contra-relogio.md) e [plano](docs/superpowers/plans/2026-10-27-ranking-contra-relogio.md)

## Requisitos

- Node 22 ou mais novo (na máquina da Actcon: `export PATH="/c/Users/luan.oliveira/tools/node22:$PATH"`, o Node 18 corporativo não roda o Vite).
- pnpm 10 (`npm i -g pnpm`).

## Comandos

```bash
pnpm install        # instala tudo
pnpm dev            # servidor em :2567 e cliente em http://localhost:5173
pnpm test           # testes (regras do jogo + integração WebSocket)
pnpm typecheck      # TypeScript nos 3 pacotes
pnpm lint           # ESLint
pnpm build          # build do cliente e do servidor
pnpm start          # produção: serve jogo e WebSocket em http://localhost:2567
node scripts/optimize-assets.mjs  # refaz os modelos e a música leves de apps/web/public/assets a partir de assets-src (à mão, fora do build)
```

Para jogar com colegas na mesma rede em modo dev, abra `http://SEU-IP:5173` (rode `pnpm --filter @ec/web dev -- --host`).

## Como jogar

| Tecla | Ação |
|---|---|
| WASD | andar |
| Mouse | mirar (clique na tela para prender o mouse) |
| Botão esquerdo (ou F) | atirar bolinha de papel |
| Q / E / R | habilidades |
| Espaço | esquiva |
| 1 / 2 / 3 | escolher evolução |
| Tab | placar completo |
| Esc | soltar o mouse e abrir as Configurações (a partida continua) |
| Setas | girar a câmera sem mouse |

Essas são as teclas padrão. Em **Configurações** (tela inicial, lobby ou Esc durante a partida) dá para trocar a tecla de cada ação, separada por modo, e também a sensibilidade do mouse, o volume (geral, música e efeitos) e a qualidade gráfica. Fica salvo no navegador.

Pontos: eliminação 100, assistência 40, 10 a cada 5 s sozinho na Reunião Relâmpago e 50 para quem dominou a reunião no ciclo. Desempate por eliminações e depois assistências.

### Rally da Firma (corrida)

| Tecla | Ação |
|---|---|
| W / S (ou setas) | acelerar / frear e dar ré |
| A / D | virar (parada, a cadeira gira no lugar) |
| Espaço (segurar) | derrapar na curva; soltar depois de 0,8 s dá turbo, depois de 1,6 s dá turbo maior |
| E ou clique | usar o item |
| R | voltar para a pista (no último checkpoint, 2 s parado) |
| M | ligar e desligar o som |
| Tab | classificação |
| Esc | abrir as Configurações (a corrida continua) |

Dá para correr de cadeira ou de patinete elétrico. Todos têm a mesma física; a aba **Veículo** do editor muda só a aparência (veículo, cores, rodas, encosto da cadeira e enfeite).

| Item (caixas de arquivo na pista) | Efeito |
|---|---|
| Café Expresso | turbo de 1,2 s |
| Café Expresso Triplo | 3 turbos |
| Grampeador | grampo reto à frente; quem leva rodopia 1 s |
| Poça de Café | fica no chão; quem passa derrapa 0,8 s |
| Resma de Papel | obstáculo atrás de você; quem bate perde velocidade |
| Aviãozinho de Papel | persegue quem está logo à frente (nunca o 1º) |
| Pasta do Jurídico | bloqueia o próximo ataque por 8 s |
| Post-it na Tela | cobre a tela de quem está logo à frente por 2 s (nunca o 1º) |

Antes da largada, o Comandante chega de helicóptero na cena de abertura e depois sobrevoa a pista durante a corrida (modelo em `apps/web/public/assets/characters/comandante_helicoptero.glb`, cena em `apps/web/src/race/commander.ts`).

Quem está na metade de trás tira mais turbo e aviãozinho; quem está na frente, mais defesa e armadilha. Em modo dev, as teclas 1 a 8 dão um item específico para testar.

### Contra o relógio (treino)

Terceiro modo do lobby, só com gente (os bots saem). Mesmas teclas do Rally, menos o item.

| Regra | Como funciona |
|---|---|
| Voltas | livres, sem número de voltas. O cronômetro mostra a volta atual, a última e a melhor da sessão |
| Fantasma azul | a sua melhor volta de sempre |
| Fantasma dourado | a volta do recordista, com o nome dele |
| Fantasma novo | quando você faz uma volta melhor, ela vira o fantasma a partir da volta seguinte |
| Colegas | aparecem semitransparentes, sem colisão |
| Itens | não existem, a pista não tem caixas |
| Encerrar treino | botão do anfitrião. Os outros saem antes com **Sair da sala**. A sessão acaba sozinha em 20 min |
| Visitante | vê só o fantasma do recordista e a melhor volta dele na sessão |

Os fantasmas são gravados pelo servidor, não pelo navegador.

## Ranking da firma

A tela **Ranking da firma** abre pela tela inicial e pelo lobby, com quatro abas: Funcionário do mês, Tiroteio, Rally e Recordes de volta. Os dados ficam num arquivo JSON no servidor (veja [Deploy](#deploy)).

O que conta:

- Tiroteio e Rally só pontuam em partida com **2 ou mais pessoas logadas**. Bots e visitantes jogam, mas não contam. Isso evita farmar vitória contra bot.
- O **recorde de volta** vale sozinho: voltas do Rally e do Contra o relógio contam, mesmo com uma pessoa só na sala. Cada pessoa guarda a melhor volta dela no Circuito Corporativo.
- **Visitante não pontua** e não aparece no ranking.

Pontos do **funcionário do mês** por partida que conta (zera no dia 1, horário de Brasília):

| Colocação | Pontos |
|---|---|
| 1º | 10 |
| 2º | 6 |
| 3º | 4 |
| Demais | 1 |

Quem toma o recorde de volta de outra pessoa ganha mais **5 pontos** no mês. Melhorar o próprio recorde não dá o bônus. O vencedor do mês anterior fica guardado e aparece na tela.

## Estrutura

```
packages/shared   dados do jogo e TODA a regra (simulação pura, testada)
  src/data/       balance.ts, map.ts, avatar.ts, abilities.ts, synergies.ts
  src/sim/        colisão, combate, habilidades, evolução, pontuação, zona, bots, partida
  src/race/       modo corrida e contra o relógio: pista, física da cadeira, voltas, itens, bots, partida
  src/ranking/    regras do ranking: o que conta, pontos do mês, recorde de volta
  src/protocol.ts mensagens validadas com Zod
apps/server       Node + ws: salas, loop de 30 ticks/s, snapshots, serve o build web
  src/store.ts    arquivo de dados do ranking (escrita atômica)
  src/auth.ts     verificação do token do Google e sessão própria
apps/web          React (telas e HUD) + Three.js (cena, câmera, previsão, interpolação)
  src/race/       cena, cadeira 3D, fantasmas, HUD e resultados da corrida
  src/settings.ts configurações do jogador e teclas padrão (única fonte)
assets-src        originais dos modelos (GLB) e da música, fora do build
scripts           optimize-assets.mjs: comprime os originais para apps/web/public/assets
```

O servidor é a autoridade: o cliente só manda intenções (movimento, mira, botões, escolha de evolução).

## Ajustando o jogo

- **Números de balanceamento:** `packages/shared/src/data/balance.ts`.
- **Habilidades e especializações:** `packages/shared/src/data/abilities.ts` (cada habilidade é dado, os tipos de efeito ficam em `sim/abilities.ts`).
- **Mapa:** `packages/shared/src/data/map.ts`. O escritório é uma lista de caixas (`x`, `z` = centro, `w`, `d` = tamanho, `h` = altura, `kind` = aparência). A mesma lista gera o visual e a colisão do servidor, então trocar pela planta real do escritório é editar esse arquivo. Caixas com altura menor que 1,2 m bloqueiam passagem mas não tiros.
- **Pistas da corrida:** `packages/shared/src/race/track.ts` (Circuito Corporativo, Estacionamento e Copa, no registro `TRACKS`). Cada pista é uma lista de pontos da linha central com a largura em cada um; paredes, checkpoints, carpete e caixas saem dela. Para mudar uma pista, troque os pontos dela (o teste `race-tracks.test.ts` avisa se ficou curta, longa, dobrando ou encostando nela mesma, e roda corridas só com bots em cada dificuldade). A decoração por ambiente fica em `apps/web/src/race/trackScene.ts`.
- **Física e itens da corrida:** `packages/shared/src/race/balance.ts` e os pesos de sorteio em `race/items.ts`.
- **Boneco:** `apps/web/public/assets/characters/boneco_completo.glb` montado em `apps/web/src/game/character.ts`. As opções do crachá ficam em `packages/shared/src/data/avatar.ts` (o servidor valida por ali). O crachá tem quatro abas:

  | Aba | De onde vem |
  | --- | --- |
  | Começo | nome e os funcionários prontos (`PRESETS`) |
  | Pele e olhos | cores em `SKINS` e `EYE_COLORS`, pintadas por shader; rostos são texturas do corpo pintadas pelo designer em `apps/web/src/assets/rostos/`, listadas em `ROSTOS` (`apps/web/src/game/itens/pele-e-olhos.ts`) e trocadas em `apps/web/src/game/rosto.ts` |
  | Cabelo e barba | GLBs em `apps/web/src/assets/cabelos/` e `apps/web/src/assets/barbas/`; peça sem textura pega a cor do crachá |
  | Roupas | altura e os GLBs de `apps/web/src/assets/{camisetas,calcas,tenis}/` |

  Peça nova: o original em `assets-src/roupas/<pasta>/` com prefixo numérico no fim da lista (`06_moicano.glb`), uma linha em `WEARABLES` no `scripts/optimize-assets.mjs` e `node scripts/optimize-assets.mjs`. O README de cada pasta explica como exportar. Rosto novo: a textura pintada em `assets-src/rostos/`, `node scripts/optimize-assets.mjs`, uma linha em `ROSTOS` e o nome no fim de `FACES` (o README de `apps/web/src/assets/rostos/` explica).
- **Ranking:** pontos por colocação e bônus de recorde em `packages/shared/src/ranking/rules.ts`. A regra de "partida conta" (2 ou mais logados) fica no mesmo arquivo, com teste em `packages/shared/src/test/ranking.test.ts`.
- **Teclas padrão:** `apps/web/src/settings.ts` (`DEFAULT_SETTINGS`). É a única fonte, o jogo e os textos de ajuda leem de lá.
- **Modelos e música:** coloque o original em `assets-src/` e rode `node scripts/optimize-assets.mjs`. O script comprime a malha dos GLB (meshopt) e tira a capa embutida do MP3. O código procura nós e materiais pelo nome, então não use `gltf-transform optimize` direto: ele renomeia peças.

## Como colaborar

1. Crie uma branch a partir da `main` (`git checkout -b feat/minha-ideia`).
2. Faça a mudança e rode `pnpm lint && pnpm typecheck && pnpm test`.
3. Abra um Pull Request para a `main` preenchendo o modelo. O CI roda sozinho e o PR só entra com CI verde e aprovação.

Regras da casa: o servidor é quem decide dano, pontos e recargas (o cliente só manda intenções); números de balanceamento ficam em `packages/shared/src/data/`; regra nova de jogo vem com teste em `packages/shared/src/test/`.

## Deploy

Precisa de um host com WebSocket persistente (Render, Fly.io, Railway, VPS). Vercel serverless não serve para o servidor.

```bash
docker build -t expediente-caotico .
docker run -p 2567:2567 expediente-caotico
```

Variável `PORT` define a porta. Em produção, use HTTPS: o cliente troca para `wss://` sozinho.

### Variáveis e volume (Coolify)

O jogo está em `https://expedientecaotico.cavel.com.br`, com deploy a cada merge na `main`. Configure no Coolify:

| Variável | Para que serve |
|---|---|
| `GOOGLE_CLIENT_ID` | ID do cliente OAuth do Google. Sem ela, o botão do Google some e só entra visitante. Não é segredo |
| `SESSION_SECRET` | texto aleatório longo que assina as sessões (60 dias). Sem ela, o servidor sorteia uma a cada início e todo mundo cai da conta a cada reinício |
| `DATA_DIR` | pasta do arquivo do ranking. No Coolify, use `/data`. Padrão: `./data` |
| `TRUST_PROXY=1` | opcional. Atrás do proxy do Coolify, faz o limite de tentativas de login olhar o IP real |

Crie também um **volume persistente** montado em `/data`. Sem o volume, o ranking some a cada deploy.

### Login com Google: criar o ID do cliente

1. No [Google Cloud Console](https://console.cloud.google.com/), abra **APIs e serviços > Credenciais**.
2. **Criar credenciais > ID do cliente OAuth**, tipo **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas**, adicione `https://expedientecaotico.cavel.com.br` e `http://localhost:5173`.
4. Copie o ID do cliente para `GOOGLE_CLIENT_ID`. Para testar em dev, rode o servidor com a mesma variável.

Em dev, o Vite já repassa `/api` (e `/ws`) para o servidor em :2567, então o login e o ranking funcionam em `http://localhost:5173` sem configurar proxy.
