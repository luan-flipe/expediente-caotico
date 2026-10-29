# Camisetas

Cada `.glb` desta pasta vira uma opção de **Camiseta** no crachá. Não precisa mexer em
código: salve o arquivo aqui e recarregue o jogo.

As regras são as mesmas da pasta de cabelos (veja `../cabelos/README.md`):

- Exporte do **mesmo esqueleto** do boneco (`boneco_completo.glb`), com os mesmos nomes de
  ossos.
- A camiseta precisa ser uma malha **com pele** (skinned), com pesos em `tronco`, `ombro_D` e
  `ombro_E` (manga longa também em `punho_D` e `punho_E`), para acompanhar braços e tronco nas
  animações.
- Exporte na pose de repouso, sem mover o boneco. Uma malha sem pele, como um `.obj`
  convertido, é ignorada e aparece um aviso no console.
- Malha leve: até uns 5 mil vértices.
- Nome e ordem seguem o nome do arquivo: use prefixo numérico (`01_polo.glb`,
  `02_regata.glb`) e acrescente sempre no fim. O boneco salvo guarda a posição na lista.
