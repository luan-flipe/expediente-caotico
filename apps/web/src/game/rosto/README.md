# Rosto vetorial

O rosto do boneco não é imagem. Cada expressão é uma lista de formas (olho, sobrancelha, boca, lágrima,
rubor) que o shader do corpo desenha por cima da pele lisa da textura do boneco. As formas seguem as
pinturas do designer e ficam paradas: o olho não pisca e o arremesso não põe a cara brava por cima.

- `vetor.ts`: tipos de forma, montadores (`openEye`, `closedEye`, `brow`, `mouthLine`, `openMouth`,
  `tear`, `blush`) e a codificação que o shader lê. Não depende do three.js.
- `expressoes.ts`: as seis expressões, na ordem de `FACES` (`packages/shared/src/data/avatar.ts`).
- `../rosto.ts`: o shader (pele e cor de olho do crachá, mais o laço que desenha as formas).

## Medidas

Tudo em centímetros, na vista de frente do rosto, nas coordenadas do corpo antigo: x para o lado
esquerdo do boneco (a direita de quem olha), y para cima, olhos perto de y = 114 e boca perto de y = 98.
O shader desconta quanto o osso `root` subiu no corpo atual, então as medidas não mudam se o corpo for
trocado por um com a mesma cabeça.

## Formas

- **fill**: forma fechada; **stroke**: traço com espessura no começo, no meio e no fim. Os caminhos são
  pontos de passagem alternando âncora e ponto do meio da curva: `[âncora, meio, âncora, meio, âncora]`.
- **ellipse** / **ring**: elipse cheia ou só o contorno; **tear**: gota.
- `clip`: a forma só aparece dentro de outra anterior (a íris dentro do branco do olho).
- `paint`: cor hex, ou `{ iris: fator }` para a cor de olho do crachá vezes o fator (sombra e brilho).
- `fade`: a opacidade cai de 1 a 0 entre dois pontos; `feather`: borda esfumada (rubor).

Limites do shader: 48 camadas por expressão e 12 curvas por caminho (`MAX_LAYERS`, `MAX_SEGMENTS`).
Um olho aberto usa umas 10 camadas.

## Expressão nova

1. Acrescente a lista de formas no fim de `EXPRESSOES` e o nome no fim de `FACES`. O boneco salvo guarda
   a **posição** do rosto: nunca mude a ordem.
2. Olhos simétricos: desenhe o lado x > 0 com `openEye` e use `both` (espelha). Os brilhos não espelham:
   a luz vem do mesmo lado nos dois olhos.
3. Confira de frente e de lado (3/4), com cor de olho e de pele diferentes.
