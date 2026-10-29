# Barbas

Cada `.glb` desta pasta vira uma opção de **Barba** no crachá. Não precisa mexer em código:
salve o arquivo aqui e recarregue o jogo.

## Como exportar

- Exporte do **mesmo esqueleto** do boneco (`boneco_completo.glb`): ossos `root`, `tronco`,
  `cabeca` etc., com os mesmos nomes.
- A barba precisa ser uma malha **com pele** (skinned), presa ao osso `cabeca` (a ponta de uma barba longa pode ir no `tronco`). Assim ela
  acompanha todas as animações. Sem textura, ela pega a cor da barba escolhida no crachá.
- Exporte na pose de repouso, sem mover o boneco. As animações dentro do arquivo são ignoradas.
- Malha leve: até uns 5 mil vértices. Arquivos grandes atrasam a carga do jogo.

## Nome e ordem

- O nome do arquivo vira o rótulo: `barba_longa.glb` aparece como "Barba longa".
- A ordem é a do nome do arquivo. O boneco salvo guarda a **posição** da barba na lista,
  então um arquivo novo no meio troca a barba de quem já escolheu. Para evitar isso, use
  prefixo numérico e acrescente sempre no fim: `01_barba.glb`, `02_barba_longa.glb`... O prefixo
  não aparece no rótulo.
- Máximo de 31 barbas.
