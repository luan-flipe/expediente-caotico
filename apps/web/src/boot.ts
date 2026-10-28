import { loadAssets } from "./assets";
import { preloadCharacter, preloadZombie } from "./game/character";
import { preloadChair } from "./race/chairMesh";
import { getState, setState } from "./store";

// Fica fora do main.tsx para o código do Three.js (modelos) baixar depois da tela de carregamento já estar desenhada.
// boneco e cadeira seguram a tela de carregamento; helicóptero e música baixam por trás.
// A barra nunca anda para trás (a conta muda de arquivos para bytes quando o servidor informa o tamanho).
void loadAssets((done, total) => {
  if (total > 0) setState({ loadProgress: Math.max(getState().loadProgress, done / total) });
}).then(() => setState({ assetsReady: true }));
// os modelos chegam antes de redesenhar miniaturas e prévias (mesmo se passarem do tempo da tela)
Promise.all([preloadCharacter(), preloadChair(), preloadZombie()]).then((ok) => ok.some(Boolean) && setState({ modelReady: true }));
