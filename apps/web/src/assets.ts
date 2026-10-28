import { AudioLoader } from "three";
import { preloadCharacter } from "./game/character";
import { preloadChair } from "./race/chairMesh";
import { preloadCommander } from "./race/commander";

/** A tela de carregamento nunca segura o jogo por mais que isso (o que faltar segue baixando). */
export const LOADING_TIMEOUT_MS = 15000;

const music = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Faixa da corrida, baixada e decodificada uma vez só por visita. Falhou: tenta de novo na próxima
 * corrida em vez de guardar o erro.
 */
export function loadMusic(url: string): Promise<AudioBuffer | null> {
  let p = music.get(url);
  if (!p) {
    p = new AudioLoader().loadAsync(url).catch((err) => {
      console.warn("música da corrida não carregou", err);
      music.delete(url);
      return null;
    });
    music.set(url, p);
  }
  return p;
}

/**
 * Carrega o que a primeira tela precisa: o boneco e a cadeira (editor e lobby). O helicóptero e a música
 * só começam a baixar depois deles e não seguram nada. `onProgress(feito, total)` conta bytes quando o servidor
 * informa o tamanho dos dois arquivos, senão conta arquivos concluídos. Resolve quando os dois
 * chegam ou falham, ou no limite de tempo.
 */
export function loadAssets(onProgress: (done: number, total: number) => void): Promise<void> {
  const files = [
    { loaded: 0, total: 0, done: false },
    { loaded: 0, total: 0, done: false },
  ];
  const report = () => {
    if (files.every((f) => f.total > 0)) {
      onProgress(
        files.reduce((n, f) => n + (f.done ? f.total : Math.min(f.loaded, f.total)), 0),
        files.reduce((n, f) => n + f.total, 0),
      );
    } else {
      onProgress(files.filter((f) => f.done).length, files.length);
    }
  };
  const track = (i: number, start: (p: (e: ProgressEvent) => void) => Promise<boolean>) =>
    start((e) => {
      if (e.lengthComputable) {
        files[i].loaded = e.loaded;
        files[i].total = e.total;
        report();
      }
    }).then((ok) => {
      files[i].done = true;
      report();
      return ok;
    });

  const blocking = Promise.all([track(0, preloadCharacter), track(1, preloadChair)]).then(() => undefined);
  // helicóptero e música só começam depois, para não disputar banda com o que a tela de carregamento espera
  let background = false;
  const startBackground = () => {
    if (background) return;
    background = true;
    void preloadCommander();
    void import("./sound").then((m) => {
      m.preloadSounds();
      // só a faixa da primeira corrida; a outra baixa quando chegar a vez dela
      void loadMusic(m.peekRaceTrack());
    });
  };

  report();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      startBackground();
      resolve();
    }, LOADING_TIMEOUT_MS);
    void blocking.then(() => {
      clearTimeout(timer);
      startBackground();
      resolve();
    });
  });
}
