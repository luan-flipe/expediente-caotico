# Cabelos

Cada `.glb` desta pasta vira uma opção de **Cabelo** no crachá. Não precisa mexer em código:
salve o arquivo aqui e recarregue o jogo.

## Como exportar

- Exporte do **mesmo esqueleto** do boneco (`boneco_completo.glb`): ossos `root`, `tronco`,
  `cabeca` etc., com os mesmos nomes.
- O cabelo precisa ser uma malha **com pele** (skinned), presa ao osso `cabeca`. Assim ele
  acompanha todas as animações.
- Exporte na pose de repouso, sem mover o boneco. As animações dentro do arquivo são ignoradas.
- Malha leve: até uns 5 mil vértices. Arquivos grandes atrasam a carga do jogo.

## Nome e ordem

- O nome do arquivo vira o rótulo: `moicano_alto.glb` aparece como "Moicano alto".
- A ordem é a do nome do arquivo. O boneco salvo guarda a **posição** do cabelo na lista,
  então um arquivo novo no meio troca o cabelo de quem já escolheu. Para evitar isso, use
  prefixo numérico e acrescente sempre no fim: `01_cabelo.glb`, `02_moicano.glb`... O prefixo
  não aparece no rótulo.
- Máximo de 31 cabelos.
