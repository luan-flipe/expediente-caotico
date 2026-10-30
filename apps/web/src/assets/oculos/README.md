# Óculos

Cada `.glb` desta pasta vira uma opção de **Óculos** no crachá. Não precisa mexer em código:
salve o arquivo aqui e recarregue o jogo.

## Como exportar

- Exporte do **mesmo esqueleto** do boneco (`boneco_completo.glb`): ossos `root`, `tronco`,
  `cabeca` etc., com os mesmos nomes.
- Os óculos precisam ser uma malha **com pele** (skinned), presa ao osso `cabeca`. Assim eles
  acompanham todas as animações.
- Exporte na pose de repouso, sem mover o boneco. As animações dentro do arquivo são ignoradas.
- Malha leve: até uns 5 mil vértices. Arquivos grandes atrasam a carga do jogo.

## Nome e ordem

- O nome do arquivo vira o rótulo: `01_redondo.glb` aparece como "Redondo", `02_quadrado.glb` aparece como "Quadrado".
- A ordem é a do nome do arquivo.
