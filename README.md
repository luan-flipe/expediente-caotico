# Expediente Caótico

Jogo de navegador ambientado no escritório. Cada pessoa monta um boneco parecido consigo, entra numa sala privada com os colegas (até 8, completando com bots) e o anfitrião escolhe o modo:

- **Tiroteio:** partida curta em terceira pessoa com bolinhas de papel, habilidades de escritório e uma zona de controle que muda de sala.
- **Rally da Firma:** corrida de cadeiras de escritório, 3 voltas pelo Circuito Corporativo, com itens de escritório nas caixas da pista.

- Ideia original: [docs/ideia-original-gemini.md](docs/ideia-original-gemini.md)
- Design refinado: [docs/superpowers/specs/2026-10-27-expediente-caotico-design.md](docs/superpowers/specs/2026-10-27-expediente-caotico-design.md)
- PRD: [docs/SPEC.md](docs/SPEC.md)
- Plano de implementação: [docs/superpowers/plans/2026-10-27-expediente-caotico-v1.md](docs/superpowers/plans/2026-10-27-expediente-caotico-v1.md)
- Modo corrida: [docs/SPEC-corrida.md](docs/SPEC-corrida.md) e [plano](docs/superpowers/plans/2026-10-27-modo-corrida.md)

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
| Esc | soltar o mouse (a partida continua) |
| Setas | girar a câmera sem mouse |

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

Todas as cadeiras têm a mesma física; a aba **Cadeira** do editor muda só a aparência (estofado, base, rodas, encosto e enfeite).

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

## Estrutura

```
packages/shared   dados do jogo e TODA a regra (simulação pura, testada)
  src/data/       balance.ts, map.ts, avatar.ts, abilities.ts, synergies.ts
  src/sim/        colisão, combate, habilidades, evolução, pontuação, zona, bots, partida
  src/race/       modo corrida: pista, física da cadeira, voltas, itens, bots, partida
  src/protocol.ts mensagens validadas com Zod
apps/server       Node + ws: salas, loop de 30 ticks/s, snapshots, serve o build web
apps/web          React (telas e HUD) + Three.js (cena, câmera, previsão, interpolação)
  src/race/       cena, cadeira 3D, HUD e resultados da corrida
assets-src        originais dos modelos (GLB) e da música, fora do build; o script os comprime para apps/web/public/assets
```

O servidor é a autoridade: o cliente só manda intenções (movimento, mira, botões, escolha de evolução).

## Ajustando o jogo

- **Números de balanceamento:** `packages/shared/src/data/balance.ts`.
- **Habilidades e especializações:** `packages/shared/src/data/abilities.ts` (cada habilidade é dado, os tipos de efeito ficam em `sim/abilities.ts`).
- **Mapa:** `packages/shared/src/data/map.ts`. O escritório é uma lista de caixas (`x`, `z` = centro, `w`, `d` = tamanho, `h` = altura, `kind` = aparência). A mesma lista gera o visual e a colisão do servidor, então trocar pela planta real do escritório é editar esse arquivo. Caixas com altura menor que 1,2 m bloqueiam passagem mas não tiros.
- **Pista da corrida:** `packages/shared/src/race/track.ts`. A pista é uma lista de pontos da linha central com a largura em cada um; paredes, checkpoints, carpete e caixas saem dela. Para imitar o escritório real, troque os pontos de `CTRL` (o teste `race-track.test.ts` avisa se a pista ficou curta, longa ou encostando nela mesma).
- **Física e itens da corrida:** `packages/shared/src/race/balance.ts` e os pesos de sorteio em `race/items.ts`.
- **Bonecos:** opções em `packages/shared/src/data/avatar.ts`, montagem 3D em `apps/web/src/game/avatarMesh.ts`. Os 12 presets `funcionario_01..12` são pontos de partida para os colegas reais.

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
