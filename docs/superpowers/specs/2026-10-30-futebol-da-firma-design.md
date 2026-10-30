# Spec: Futebol da Firma (novo modo de jogo)

Data: 30/10/2026. Base: main em `6a8166b`. Branch: `feat/futebol-da-firma`.
Tudo marcado **[decisão do Claude]** foi proposto por mim e não confirmado pelo Luan; pode ser revisto antes do plano.

## Por quê

O Expediente Caótico tem tiroteio e Rally. Futebol é o assunto que mais junta a turma do escritório, e um modo de time (até 4 contra 4) dá um motivo para chamar mais gente para a mesma sala. O jogo precisa ter a sensação dos bons jogos de futebol (movimento fluido, passe e chute com peso e direção), e o humor do Expediente Caótico entra nas comemorações.

## O que é

- Modo novo **Futebol da Firma**, jogado no mapa do **Ipatingão** (`ipatingao-3d.glb`, fornecido pelo Luan).
- Formatos: **1 contra 1, 2 contra 2, 3 contra 3, 4 contra 4** (jogadores de linha por time).
- **Goleiros sempre da IA** nesta versão, em todos os formatos.
- Duração escolhida pelo anfitrião: **3, 5 ou 10 minutos**.
- **Bots completam as vagas** de linha automaticamente quando faltar gente. [decisão do Claude: o nível dos bots segue o seletor Fácil/Normal/Difícil que já existe na sala]
- **Câmera atrás do próprio jogador**, como no tiroteio (cada um controla um boneco só).

## Times e uniformes

- O boneco de cada jogador é o do crachá (rosto, cabelo, corpo), com a **roupa trocada pelo uniforme do time**.
- Na sala de espera, cada time escolhe **nome do time, modelo do uniforme e cor**.
- [decisão do Claude] Quem escolhe é o primeiro humano de cada time; o anfitrião pode alterar tudo. Os jogadores escolhem o time na sala (como no modo de times atual); o anfitrião pode mover jogadores e equilibrar.
- [decisão do Claude] Nomes com filtro de tamanho e de palavras (o servidor sanitiza, como já faz com nomes de jogador). Os dois times não podem ter a mesma cor principal.

## Controles

**Teclado e mouse**
- **WSAD** move. **Toque duplo para frente** corre (corrida dura enquanto segurar W).
- Mira pelo mouse (direção do chute e do passe), como a mira do tiroteio.
- Dois botões do mouse, contextuais:
  - **Com a bola:** um chuta, o outro passa. **Segurar carrega a força** (barra de força perto do boneco); soltar executa.
  - **Sem a bola:** um **disputa** (tentativa de desarme em pé), o outro dá **carrinho**.
  - [decisão do Claude] Esquerdo = chute / carrinho; direito = passe / disputa. Remapeável nas Configurações.

**Celular** [decisão do Claude]
- Analógico virtual à esquerda; empurrar até a borda corre.
- Dois botões à direita: **Chute** e **Passe** (segurar carrega a força). Sem a bola, viram **Carrinho** e **Disputa**.
- A mira segue a direção do analógico.

## Regras

- **Sem impedimento.**
- **Falta:** carrinho ou disputa que acerta o jogador antes da bola (ou por trás) vira falta, com cobrança no local. [decisão do Claude] Falta dentro da área vira pênalti.
- **Cartões:** carrinho imprudente dá **amarelo**; segundo amarelo vira **vermelho**. [decisão do Claude] Carrinho violento por trás dá vermelho direto. Expulso sai da partida e o time joga com um a menos (o bot não repõe). No 1 contra 1, o vermelho dá a vitória ao adversário.
- **Lateral, escanteio e tiro de meta:** a bola sai e o jogo para. O jogador do time mais perto cobra (mira e passa ou chuta com os mesmos botões). Tiro de meta é do goleiro da IA.
- **Tempo de cobrança:** quem cobra (falta, lateral, escanteio) tem **8 segundos**; nos **últimos 3**, um contador aparece na tela. Esgotado, a IA cobra.
- **Empate no tempo normal vai para os pênaltis.** [decisão do Claude] Cinco cobranças alternadas por time; persistindo o empate, uma por vez até um errar. Os cobradores giram entre os jogadores de linha do time (humanos primeiro). O goleiro da IA defende. Cobrança: mirar e carregar a força como no chute normal.

## Campo

- **O campo encolhe por formato:** é uma área menor dentro do gramado do estádio, que cresce do 1 contra 1 ao 4 contra 4. Linhas, áreas e gols são reposicionados conforme o formato (pintura própria por cima do gramado do modelo). Medidas exatas por formato ficam no plano, ajustadas no teste. [decisão do Claude: ponto de partida 30 x 20 m no 1v1 até 60 x 38 m no 4v4]

## Bola e física

- **Condução meio-termo (decisão do Luan):** a bola acompanha o pé em pequenos toques à frente. Correndo, o toque é mais longo e a bola escapa com mais facilidade (fica mais fácil de desarmar e de perder no giro). "Ter a bola" é estar dentro do raio de domínio dela; é isso que decide se os botões viram chute e passe ou disputa e carrinho.

- A bola é simulada no servidor (autoridade), como as cadeiras do Rally; os clientes preveem localmente para não ter atraso no próprio toque.
- Física com quique, atrito com o gramado, efeito de altura (chute rasteiro x alto conforme a força carregada).
- [decisão do Claude] Simulação 3D simples da bola (posição e velocidade em x, y, z) sobre o campo plano; os bonecos continuam na simulação 2D do jogo, com altura só para a bola.

## Comemorações

- **No gol:** câmera curta no autor do gol fazendo uma comemoração de escritório, com os colegas do time.
- **No fim do jogo:** time vencedor comemora; perdedor reage.
- [decisão do Claude] Ideias iniciais: carimbar o crachá do goleiro, chuva de papel da impressora, "dancinha da reunião que acabou mais cedo", brinde com caneca de café, deitar na cadeira giratória. Escolha aleatória entre as disponíveis; reaproveita as animações do boneco que já existem (`cafe`, `tchau`, comemoração).

## Ranking

- **Aba própria "Futebol"** no ranking, ao lado de Tiroteio e Rally (decisão do Luan).
- **Trava anti-farm:** a partida só pontua com pelo menos 2 humanos (decisão do Luan).
- **Gol, assistência e vitória** dão pontos. **Derrota não dá nem tira pontos.**
- Vitória nos pênaltis conta como vitória. [decisão do Claude] Gols de pênalti na disputa final não contam como gol para o ranking.
- Bots não pontuam. Visitantes (sem login) jogam, mas não entram no ranking (regra atual).
- [decisão do Claude] Valores dos pontos alinhados com os do tiroteio e do Rally; tabela definida no plano.

## Mapa

- O Ipatingão vem com 13.562 nós, 955 malhas, 950 materiais e 15 texturas PNG (18 MB). Precisa ser **simplificado** (juntar malhas e materiais, texturas em WebP/KTX2, meshopt) para carregar bem no celular. Meta [decisão do Claude]: abaixo de 4 MB no jogo.
- O campo jogável (gramado, linhas, áreas, gols) é definido em dados no código compartilhado, alinhado ao gramado do modelo; as arquibancadas são cenário.
- Bola e gol já modelados: `apps/web/src/assets/futebol/bola.glb` e `gol.glb` (gerados por `scripts/gerar-bola.mjs` e `scripts/gerar-gol.mjs`).

## Decisões técnicas da revisão [decisão do Claude]

- **Lotação:** a sala continua com até 8 humanos (limite atual). No 4 contra 4 são 8 de linha e 2 goleiros da IA, ou seja, 10 entidades simuladas no servidor. Os snapshots do futebol enviam só posição, direção e estado de cada boneco e a bola.
- **Rede:** servidor com autoridade sobre tudo. O cliente prevê só o próprio boneco, como o kart no Rally, e interpola a bola e os outros. Prever a bola fica para depois, se o toque parecer atrasado no teste com rede real.
- **Falta e cartões, critérios determinísticos (testáveis):**
  - Carrinho ou disputa que toca a bola primeiro, até 0,6 m do pé, é limpo.
  - Contato com o adversário sem tocar a bola antes é falta.
  - Falta com carrinho vindo de um ângulo de mais de 120° em relação à direção do adversário (por trás) dá vermelho.
  - Falta com carrinho em corrida dá amarelo.
  - Falta em disputa em pé é só falta.
- **Mapa:** a simplificação é parte do trabalho, com fase própria. Um script junta malhas por material, reduz as texturas para WebP e aplica meshopt. Sem KTX2 nesta versão, para não trazer transcoder. Se a meta de 4 MB não bater só com script, o plano registra o tamanho alcançado e segue.
- **Comemorações:** montadas com animações e props simples já possíveis no código: papel picado em partículas, caneca, crachá como sprite. Nenhuma animação nova feita à mão nesta versão.

## Fora do escopo (desta versão)

- Goleiro controlado por gente.
- Impedimento.
- Campeonato, tabela ou temporada.
- Escolha de comemoração pelo jogador.
- Narração.

## Pronto quando

- Uma partida em cada formato (1v1 a 4v4) roda do apito inicial ao final, com bots completando os times.
- Gol, lateral, escanteio, tiro de meta, falta, amarelo, vermelho e pênaltis funcionam e têm testes no código compartilhado.
- Ranking recebe gols, assistências e vitórias de quem está logado.
- Typecheck, lint, testes e build verdes; conferido no navegador no computador e no celular (375 px).
