# PRD: pacote de 8 ideias

Data: 28/10/2026. Base: o jogo no ar (tiroteio, Rally da Firma, Contra o relógio, ranking com login Google).
Decisões do Luan: fazer as ideias 2, 3, 4, 5, 6, 8, 9 e 10 da lista de melhorias; **um PR por ideia**; desafio da semana em **rodízio automático**; celular com **todos os modos**; **eu desenho** as duas pistas novas (estacionamento e copa), ajustáveis quando houver a planta real.
Tudo marcado **[decisão do Claude]** pode ser revisto.

## Ordem de entrega [decisão do Claude]

Das menores para as maiores, cada uma num PR que vai ao ar sozinho:

| # | PR | Tamanho |
|---|---|---|
| 1 | Convite com um link (ideia 2) | pequeno |
| 2 | Tela final com prêmios (ideia 5) | pequeno |
| 3 | Chat rápido e emotes (ideia 8) | pequeno |
| 4 | Painel do anfitrião (ideia 10) | médio |
| 5 | Replay do recorde (ideia 4) | médio |
| 6 | Desafio da semana (ideia 3) | médio |
| 7 | Mais pistas no Rally (ideia 9) | grande |
| 8 | Celular e tablet (ideia 6) | grande |

Celular fica por último porque precisa conhecer os controles de todas as telas que vieram antes.

## 1. Convite com um link

- No lobby, botão **Copiar convite**: copia `https://expedientecaotico.cavel.com.br/?sala=ABCDE` com uma frase curta ("Bora jogar Expediente Caótico? Sala ABCDE").
- Em celular com compartilhamento nativo, o botão abre o menu de compartilhar.
- **Prévia do link** no WhatsApp e no Teams: título, descrição e imagem (cartaz do jogo, 1200x630, estático em `/assets/og.png`). [decisão do Claude: imagem fixa, sem gerar uma por sala]
- Quem abre o link cai na tela inicial com o código preenchido (já funciona hoje).

## 2. Tela final com prêmios

- No fim de cada partida (tiroteio e Rally), até **3 prêmios bobos** sorteados entre os que se aplicam, com o nome de quem levou.
- Tiroteio [decisão do Claude]: Mais café derramado, Kamikaze (mais vezes eliminado), Pacifista (menos disparos), Mira de estagiário (pior aproveitamento), Esquivador profissional.
- Rally: Mais tempo na contramão, Rei do grampeador (mais itens acertados), Mais batidas no muro, Turista (mais tempo parado), Volta mais rápida.
- Contas feitas no servidor com o que ele já sabe; só entram prêmios com algum dado (nada de "0 batidas").
- Não valem pontos. Bots podem ganhar (é piada).

## 3. Chat rápido e emotes

- 8 frases prontas e 6 emotes, sem texto livre (nada para moderar). [decisão do Claude]
- Frases: "Café!", "Foi sem querer", "Rematch?", "Boa!", "Corre!", "Volto já", "GG", "Isso é RH".
- Emotes: 😂 😡 👏 ☕ 💀 🔥.
- Atalho: tecla **T** abre a roda; números 1 a 8 escolhem. Também clicável. A tecla entra nas configurações.
- Aparece num balão sobre o boneco ou a cadeira por 3 s e no canto do lobby.
- Limite no servidor: 1 mensagem a cada 2 s por jogador.

## 4. Painel do anfitrião

Só o anfitrião vê, no lobby:
- **Tiroteio:** duração (já existe), bots fácil, normal ou difícil.
- **Rally:** número de voltas (1 a 5), itens ligados ou desligados, bots fácil, normal ou difícil, e a pista (depois do PR 7).
- Os outros veem as escolhas, sem poder mudar.
- **Ranking:** partidas com voltas diferentes do padrão ou sem itens continuam valendo vitória e pódio; recorde de volta vale sempre. [decisão do Claude]

## 5. Replay do recorde

- Na aba **Recordes de volta**, botão **Assistir** em cada linha.
- Abre a pista sem servidor, só com a cadeira daquela volta (o fantasma já guardado), com cronômetro.
- Câmeras: atrás da cadeira, de cima e livre (arrastar). Pausar e velocidade 0,5x, 1x e 2x.
- A cadeira aparece com o boneco e a cadeira atuais da pessoa (sem dados novos: usa o que o servidor já guarda; se não houver, boneco padrão). [decisão do Claude]
- O fantasma sai por um endereço novo `GET /api/replay?pista=X&linha=N`, sem expor a conta Google.

## 6. Desafio da semana

- Lista fixa de cerca de 12 desafios no código, sorteada toda **segunda 0h de Brasília**, igual para todos (sorteio pela semana, sem guardar nada). [decisão do Claude]
- Exemplos: "Volta abaixo de 52 s no Circuito Corporativo", "3 vitórias no tiroteio", "Terminar 5 corridas", "10 eliminações numa partida", "Pódio em 3 pistas diferentes".
- Vale só para quem está logado e só em partidas que contam no ranking (regra de hoje), exceto desafios de volta, que valem no Contra o relógio.
- Cumpriu: **+8 pontos** no funcionário do mês, uma vez por semana. Aviso na tela no momento.
- Tela inicial e ranking mostram o desafio atual, quanto falta e quem já cumpriu.

## 7. Mais pistas no Rally

- Duas pistas novas, desenhadas por mim: **Estacionamento** (rápida, curvas abertas, vagas e pilares) e **Copa** (curta e travada, mesas, geladeira e máquina de café). O Circuito Corporativo continua.
- O anfitrião escolhe a pista (painel do anfitrião). O Contra o relógio também.
- **Recorde e fantasma por pista**; a aba de recordes ganha um seletor de pista.
- O desafio "pódio em 3 pistas" passa a fazer sentido aqui.

## 8. Celular e tablet

- Detecta toque e mostra controles na tela, só quando a tela é de toque.
- **Rally e treino:** volante (arrastar à esquerda e à direita), botões de acelerar, ré, derrapar, item e R.
- **Tiroteio:** analógico à esquerda para andar, arrastar à direita para mirar, botão de disparo, botões das 3 habilidades, esquiva e placar. Tiro automático opcional ao segurar.
- Tela deitada obrigatória durante a partida (aviso para girar o celular).
- Menus (crachá, lobby, ranking, configurações) já adaptam; revisar em 375 px.
- Qualidade **Leve** ligada por padrão no celular.

## Fora do escopo

- Chat de texto livre.
- Desafios criados por pessoas (rodízio automático).
- Mapa do escritório real (ideia 1, fica para quando houver a planta).
- App instalável na loja.

## Pronto quando

- Cada PR com testes das regras novas (prêmios, limite do chat, sorteio da semana, cumprimento do desafio, recorde por pista, opções do anfitrião), typecheck, lint e build verdes, e conferido no navegador.
- PR 8 conferido no modo celular do navegador (375 x 812 e tablet).
