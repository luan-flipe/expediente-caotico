# Spec: atalhos nas pistas e rampas com paraquedas de escritório (issue 38)

Data: 28/10/2026. Base: main em `11539dd` (Rally com 3 pistas, derrapagem nível 3, vácuo, xícaras, replay e Contra o relógio).
Tudo marcado **[decisão do Claude]** pode ser revisto antes de começar.

## Por quê

Hoje as três pistas são um corredor único: quem pilota bem e quem pilota mal fazem o mesmo caminho, e a corrida vira só "quem erra menos a curva". Atalhos dão uma escolha na hora (arrisco ou não?), e a rampa com paraquedas é o momento de risada que vira print no grupo. As duas coisas aumentam a vontade de jogar de novo na mesma pista.

## O que muda para quem joga

1. **Atalho:** em pontos marcados a pista se divide em duas. O caminho principal continua igual. O atalho é mais curto, porém mais estreito, com carpete ou obstáculo, e sem caixa de item. Bem feito ganha cerca de 0,5 a 1 s; mal feito perde mais que isso.
2. **Rampa:** uma lombada inclinada. Passou rápido, a cadeira decola. No alto o boneco abre um paraquedas de escritório e desce flutuando. Durante o voo:
   - não dá para virar muito (controle aéreo leve) nem começar derrapagem;
   - apertar **derrapar** no ar faz uma manobra; aterrissar depois dela dá o turbo de manobra (o `stuntBoost` que já existe no balanceamento);
   - itens no chão (poça, resma) não pegam quem está no ar; grampeador e avião pegam.
3. **Vão (risco da rampa):** algumas rampas pulam um vão (fosso da garagem, escada do mezanino). Quem chega devagar não atravessa: cai no vão e volta na rampa com a mesma penalidade do R.
4. **Paraquedas temático:** guarda-chuva, folha de flipchart, saco de papel do café ou pasta suspensa aberta. Cada jogador recebe um fixo, escolhido pela cadeira dele, para todo mundo ver sempre o mesmo. [decisão do Claude: sem tela de escolha nesta versão]

## Onde ficam [decisão do Claude, ajustável quando houver a planta real]

| Pista | Atalho | Rampa |
|---|---|---|
| Circuito Corporativo | Corta as ilhas de mesas (ctrl 5 a 8), estreito, sem caixa | Rampa sem vão no fim do corredor longo (ctrl 2 a 3), só diversão e manobra |
| Estacionamento | Rampa da garagem (ctrl 3 a 5): o atalho passa por cima do fosso do subsolo, com vão | O próprio atalho |
| Copa | Pela despensa (ctrl 9 a 11), estreito, com carpete | Nenhuma |

Uma pista sem rampa mostra que os atalhos não dependem dela.

## Regras (o que não pode quebrar)

- **Volta e checkpoint:** os dois caminhos contam a volta igual. O atalho converte a posição dele em distância da pista principal, então checkpoint, classificação ao vivo e "contramão" seguem funcionando. Ninguém consegue pular checkpoint por fora dos corredores.
- **Recorde e fantasma:** valem com atalho. O fantasma passa a guardar a altura; fantasmas antigos (sem altura) continuam tocando no chão.
- **Contra o relógio:** atalhos e rampas ativos, sem diferença.
- **Bots:** escolhem o caminho na bifurcação. Chance de pegar o atalho: fácil 10%, normal 40%, difícil 75%. Num atalho com vão, só vão se estiverem rápidos o bastante para atravessar. Um bot que cai volta igual a um humano. [decisão do Claude]
- **Reposição (R) e queda:** voltam ao centro do caminho em que a cadeira estava, um pouco antes do ponto.
- **Rede:** o servidor continua mandando. Quem joga prevê localmente a altura com a mesma física, sem salto ou tremida na hora de pousar.
- **Celular:** nada novo para tocar; a manobra usa o botão de derrapar.

## Fora do escopo

- Editor de pistas (issue 35).
- Escolher o paraquedas na tela do boneco (fica para depois, se pedirem).
- Física 3D de verdade (rampas laterais, capotar, colisão em altura com o cenário). A altura é só um número para cima, por cima do sim 2D.
- Mais de um atalho por pista.

## Pronto quando

- Testes cobrindo: progresso e checkpoint pelos dois caminhos; atalho dando o ganho esperado com piloto perfeito; queda no vão quando lento e travessia quando rápido; manobra dando turbo só ao pousar; hazard de chão ignorando quem está no ar; bot escolhendo caminho conforme o nível; fantasma de 4 e de 5 números.
- `race-track.test.ts` valida que atalho não encosta em outro trecho da pista fora das pontas.
- Typecheck, lint, build e testes verdes. Conferido no navegador: corrida com bots nas 3 pistas, Contra o relógio no Estacionamento, replay de volta com salto, celular 375 px.
- Entregue em **2 PRs**: primeiro os atalhos (só 2D), depois altura, rampas e paraquedas.
