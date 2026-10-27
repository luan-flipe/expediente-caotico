# PRD: Modo Corrida ("Rally da Firma")

Data: 27/10/2026. Base: jogo atual descrito em `docs/SPEC.md`.
Decisões do Luan nesta rodada: veículo é cadeira de escritório; pista própria passando pelo escritório; power-ups com ajuda leve para quem está atrás; 3 voltas, até 8 participantes com bots.
Toda decisão marcada **[decisão do Claude]** pode ser revista.

## 1. Problema

O tiroteio premia mira e build. O grupo quer um segundo modo, rápido de entender, em que vence quem pilota melhor, mantendo a graça de se reconhecer nos bonecos e o tema de escritório. Sem um modo diferente, as partidas ficam repetitivas depois de algumas semanas.

## 2. Objetivos

1. **Pilotagem decide:** entre dois jogadores de mesma habilidade, os itens mudam o resultado às vezes; entre um bom e um mediano, o bom vence na grande maioria das corridas.
2. **Entrar e correr:** quem já joga o tiroteio aprende os controles da corrida na primeira volta, sem tutorial.
3. **Personalizar sem vantagem:** cada pessoa monta a própria cadeira; todas têm a mesma física.
4. **Mesma sala, dois modos:** o anfitrião troca entre tiroteio e corrida no lobby, sem sair da sala.

## 3. Não-objetivos

| Fora | Por quê |
|---|---|
| Várias pistas | Uma pista bem feita valida o modo. A estrutura aceita outras depois. |
| Atributos diferentes por cadeira | Pedido explícito: só muda a aparência. |
| Item que persegue o líder | Contraria "quem pilota melhor ganha". |
| Rampas, saltos e andares | O jogo é 2.5D (chão plano). Fica para uma pista futura. |
| Modo contra o relógio e recordes | Bom de ter, não entra na v1 do modo. |
| Copiar itens, pistas ou nomes de jogos de kart existentes | Itens e pista são originais, com tema de escritório. |

## 4. Como funciona

### 4.1 Fluxo
Lobby ganha o seletor **Modo: Tiroteio | Corrida** (só o anfitrião muda). Em Corrida, os campos de duração somem e aparece "3 voltas". Iniciar leva à largada: grid em fileiras de 2, contagem 3, 2, 1, VAI. Fim: tela de resultados com posição, tempo total e melhor volta, e "Voltar ao lobby".

### 4.2 Controles
| Tecla | Ação |
|---|---|
| W / S | acelerar / frear e dar ré |
| A / D | virar |
| Espaço (segurar) | derrapar na curva; soltar dá turbo curto conforme o tempo de derrapagem |
| Clique ou E | usar o item |
| R | voltar para a pista (reposiciona no último checkpoint, perde 2 s) |
| Tab | classificação |

Mouse não é necessário. A câmera segue atrás da cadeira, um pouco acima.

### 4.3 Física (igual para todas as cadeiras) **[decisão do Claude]**
- Velocidade máxima 16 m/s, aceleração até a máxima em ~2 s, ré até 5 m/s.
- Curva com raio mínimo que cresce com a velocidade (curvas fechadas exigem tirar o pé).
- **Derrapagem:** segurar Espaço virando entra em derrapagem: curva mais fechada com leve deslize. Soltar após 0,8 s dá turbo nível 1 (0,6 s); após 1,6 s, nível 2 (1,0 s). É a principal ferramenta de habilidade.
- Bater em parede corta 50% da velocidade e desliza ao longo dela.
- Cadeiras colidem entre si (empurrão, sem dano).
- Dentro do traçado o piso é rápido; o "carpete" nas bordas internas de algumas curvas corta a velocidade máxima para 60%.

### 4.4 Pista: "Circuito Corporativo" **[decisão do Claude]**
Volta de ~350 m (cerca de 40 s numa volta limpa), definida por uma linha central fechada com largura variável (8 a 12 m). Passa, em ordem: recepção (largada) → corredor longo → área de mesas (chicane entre ilhas de mesas) → copa (curva fechada contornando o balcão) → sala de reunião (curva larga ao redor da mesa, paredes de vidro) → TI (zigue-zague entre racks) → volta à recepção. Paredes geradas automaticamente dos dois lados da linha central. Decoração reaproveita peças do mapa atual (mesas, plantas, racks, sofás) fora do traçado.
Checkpoints a cada ~20 m garantem a contagem de voltas: só conta a volta quem passou por todos em ordem. Posição na corrida = voltas + progresso ao longo da linha central.

### 4.5 Power-ups
Caixas de arquivo flutuando em fileiras de 4, em 4 pontos da volta. Quem passa pega um item aleatório se estiver com o espaço de item vazio (1 item por vez). Caixa reaparece em 4 s.

| Item | Efeito |
|---|---|
| **Café Expresso** | Turbo de 1,2 s |
| **Café Expresso Triplo** | 3 turbos, um a cada uso |
| **Grampeador** | Dispara um grampo reto à frente; quem é atingido rodopia e perde controle por 1 s |
| **Poça de Café** | Deixa uma poça atrás; quem passa derrapa por 0,8 s. Some após um acerto ou 20 s |
| **Resma de Papel** | Larga uma pilha atrás que funciona como obstáculo sólido até ser atingida |
| **Aviãozinho de Papel** | Voa até a cadeira imediatamente à frente (até 40 m); parede ou Pasta do Jurídico bloqueia |
| **Pasta do Jurídico** | Bloqueia o próximo ataque recebido, dura 8 s |
| **Post-it na Tela** | A cadeira imediatamente à frente fica com a visão parcialmente coberta por 2 s |

**Ajuda leve para quem está atrás:** a chance de cada item depende da metade do pelotão em que você está. Primeira metade: mais Grampeador, Poça, Resma e Pasta. Segunda metade: mais Café Expresso, Triplo e Aviãozinho. Nenhum item mira o primeiro colocado nem dá mais de 1,2 s de turbo por uso. Tabela de pesos em `race/items.ts`.

### 4.6 Cadeira (personalização)
Nova aba "Cadeira" no editor do crachá, com prévia 3D do boneco sentado:
- Cor do estofado (10), cor da base (6), tipo de rodas (comuns, neon, de patinete), encosto (baixo, alto, gamer).
- Enfeite: nenhum, bandeirinha, buzina, caneca no porta-copo, plantinha, adesivos.
Salvo junto com o boneco no navegador. O servidor só valida que os valores existem; nenhum muda a física.

### 4.7 Bots
Seguem a linha central com um desvio aleatório pequeno, derrapam nas curvas marcadas na pista, pegam caixas e usam o item com regras simples (turbo nas retas, ataque se há alguém à frente a menos de 25 m). Nível único, competitivo o bastante para não ficar sempre em último.

### 4.8 Fim da corrida
Quando o primeiro cruza a terceira volta, começa uma contagem de 30 s para os demais. Quem não termina fica classificado pela posição atual. Desempate impossível (progresso contínuo); empate exato fica com quem cruzou antes no tick.

## 5. Requisitos

### P0
- [ ] Seletor de modo no lobby; servidor guarda o modo da sala; partida de corrida usa o mesmo ciclo (contagem, ativa, fim, resultados, voltar ao lobby).
- [ ] Física da cadeira no `packages/shared`, determinística, rodando no servidor; cliente prevê a própria cadeira com a mesma função e corrige pelo servidor.
- [ ] Pista com paredes, checkpoints, contagem de voltas válida e posição ao vivo.
- [ ] Derrapagem com turbo em dois níveis.
- [ ] 8 itens da tabela, distribuição pela metade do pelotão, 1 item por vez.
- [ ] Editor da cadeira com prévia, salvo no navegador, validado no servidor.
- [ ] Bots que completam a corrida.
- [ ] HUD: posição (1º/8), volta (2/3), item atual, tempo, minimapa da pista com os pontos de cada participante, contagem de largada.
- [ ] Resultados: posição, tempo total, melhor volta, e os itens mais usados por jogador.
- [ ] Testes: física (aceleração, curva, parede, derrapagem), voltas (atalho invertido não conta), posição, cada item, pesos da distribuição, corrida inteira só com bots termina.

### P1
- [ ] Sons de motor, turbo, item e batida.
- [ ] Fantasma da melhor volta da sala.
- [ ] Rastros de derrapagem no chão.

### P2
- [ ] Mais pistas (estacionamento, terraço) e editor de pista como lista de pontos.
- [ ] Contra o relógio com recordes.

## 6. Métricas de sucesso
- Uma corrida com 4 humanos e 4 bots termina sem queda e com classificação igual em todas as telas.
- Nas primeiras 10 corridas do grupo, o vencedor não é decidido por um único item na última volta em mais de 2 delas (perguntar ao grupo).
- O grupo alterna entre os dois modos na mesma sessão.

## 7. Perguntas em aberto
| Pergunta | Quem | Bloqueia? |
|---|---|---|
| Nome do modo no menu ("Rally da Firma"?) | Luan | Não |
| A pista deve imitar o escritório real quando o mapa real existir? | Luan e grupo | Não |
| O romulo-h quer modelar a cadeira em GLB como fez com o boneco? Se sim, a cadeira procedural vira fallback | romulo-h | Não |
