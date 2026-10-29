# Calças

Cada `.glb` desta pasta vira uma opção de **Calça** no crachá. Não precisa mexer em
código: salve o arquivo aqui e recarregue o jogo.

As regras são as mesmas da pasta de cabelos (veja `../cabelos/README.md`):

- Exporte do **mesmo esqueleto** do boneco (`boneco_completo.glb`), com os mesmos nomes de
  ossos.
- A calça precisa ser uma malha **com pele** (skinned), com a cintura pesada em `tronco` e
  cada perna em `perna_D` e `perna_E` (até o tornozelo, `pe_D` e `pe_E`), para acompanhar o
  andar e a pose sentada.
- Exporte na pose de repouso, sem mover o boneco. Uma malha sem pele, como um `.obj`
  convertido, é ignorada e aparece um aviso no console.
- Malha leve: até uns 5 mil vértices.
- Nome e ordem seguem o nome do arquivo: use prefixo numérico (`01_jeans.glb`,
  `02_bermuda.glb`) e acrescente sempre no fim. O boneco salvo guarda a posição na lista.
