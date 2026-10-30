import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Loading } from "./screens/Loading";
import { captarInstalacao, registrarSw } from "./pwa/registrar";
import { getState, net, savedSession, setState, useStore } from "./store";
import "./styles.css";
import { IS_TOUCH } from "./touch";

// PWA: o service worker só em produção; o botão de instalar escuta o aviso do navegador desde já
registrarSw(() => getState().code !== null);
captarInstalacao();

// aparelho de toque: o CSS aumenta os alvos e troca as dicas de teclado
if (IS_TOUCH) document.documentElement.classList.add("touch");

// Só React, a tela de carregamento e o estado entram no primeiro código; o resto (Three.js, telas, modos) vem depois.
// O código das telas já começa a baixar junto com os modelos, e a mesma tela de carregamento segura as duas esperas
// (trocar por um fallback de Suspense remontava a tela e ela piscava).
const appModule = import("./App");

const wanted = new URLSearchParams(location.search).get("sala")?.toUpperCase();
const session = savedSession();
if (session && (!wanted || wanted === session.code)) net.resume();

// se o código de carregamento nem baixar, o jogo abre mesmo assim, com os bonecos procedurais
import("./boot").catch((err) => {
  console.warn("carregamento dos modelos falhou, usando versões procedurais", err);
  setState({ assetsReady: true });
});

type AppComponent = (typeof import("./App"))["App"];

function Root() {
  const assetsReady = useStore((s) => s.assetsReady);
  const [App, setApp] = useState<AppComponent | null>(null);
  useEffect(() => {
    void appModule.then((m) => setApp(() => m.App));
  }, []);
  return assetsReady && App ? <App /> : <Loading />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
