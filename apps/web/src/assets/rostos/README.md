# Rostos

Cada expressão do boneco é a **textura do corpo inteira**, com olhos, sobrancelhas e boca pintados.
Escolher um rosto no crachá troca a textura do boneco por esta. O rosto fica parado como foi pintado:
o olho não pisca e o arremesso não põe a cara brava do modelo por cima.

Os arquivos desta pasta são gerados pelo `scripts/optimize-assets.mjs` a partir dos originais em
`assets-src/rostos/`. Não edite aqui.

## Como fazer uma expressão nova

1. Pinte por cima da textura do boneco (a de `assets-src/rostos/01_neutro.png`, 2048 × 2048), sem
   mexer no mapa de UV. A malha, o mapa de normais e o resto da textura ficam iguais.
2. Salve como PNG em `assets-src/rostos/`, com o número seguinte na frente: `07_bravo.png`.
3. Rode `node scripts/optimize-assets.mjs`. Ele gera aqui `07_bravo.jpg` (no mesmo tamanho, 2048 px)
   e `07_bravo_iris.png` (a máscara da íris).
4. Acrescente o nome no fim de `FACES` (`packages/shared/src/data/avatar.ts`) e uma linha no fim de
   `ROSTOS` (`apps/web/src/game/itens/pele-e-olhos.ts`):

```ts
{ texture: "bravo", iris: true },
```

- `iris`: se a íris aparece e pega a cor de olho do crachá. Use `false` para olho fechado.

## Cores

O jogo troca a cor da pele e da íris pela do crachá. Para isso funcionar:

- A pele tem de continuar no tom da textura original.
- A íris tem de ser marrom ou laranja forte.
- Traço escuro, branco do olho, boca e lágrima ficam como foram pintados.

## Máscara da íris

O traço grosso da pálpebra é do mesmo marrom da íris, então o script separa a íris pela forma: uma
região grossa, não uma faixa fina. Quando a íris tem partes de outro tom, essas partes ficam sem a cor
do crachá. Para resolver, pinte a máscara: um PNG do mesmo tamanho da textura, branco na íris e preto
no resto, salvo como `assets-src/rostos/<nome>_iris.png` (por exemplo `03_triste_iris.png`). Ela vale
no lugar da automática.

## Ordem

O boneco salvo guarda a **posição** do rosto na lista. Acrescente sempre no fim.
