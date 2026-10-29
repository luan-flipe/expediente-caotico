# Tênis

Cada `.glb` desta pasta vira uma opção de **Tênis** no crachá. Não precisa mexer em
código: salve o arquivo aqui e recarregue o jogo.

As regras são as mesmas da pasta de cabelos (veja `../cabelos/README.md`):

- Exporte do **mesmo esqueleto** do boneco (`boneco_completo.glb`), com os mesmos nomes de
  ossos.
- O par pode vir em uma malha só ou em duas (uma por pé): todas as malhas **com pele**
  (skinned) do arquivo entram. Cada pé pesado em `pe_D` ou `pe_E`; o cano, se houver, em
  `perna_D` ou `perna_E`.
- Exporte na pose de repouso, sem mover o boneco. Uma malha sem pele, como um `.obj`
  convertido, é ignorada e aparece um aviso no console.
- Malha leve: até uns 5 mil vértices no par.
- Nome e ordem seguem o nome do arquivo: use prefixo numérico (`01_tenis.glb`,
  `02_sapato.glb`) e acrescente sempre no fim. O boneco salvo guarda a posição na lista.
