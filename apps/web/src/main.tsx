import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Loading } from "./screens/Loading";
import { net, savedSession, setState, useStore } from "./store";
import "./styles.css";

// Só React, a tela de carregamento e o estado entram no primeiro código; o resto (Three.js, telas, modos) vem depois.
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

const wanted = new URLSearchParams(location.search).get("sala")?.toUpperCase();
const session = savedSession();
if (session && (!wanted || wanted === session.code)) net.resume();

// se o código de carregamento nem baixar, o jogo abre mesmo assim, com os bonecos procedurais
import("./boot").catch((err) => {
  console.warn("carregamento dos modelos falhou, usando versões procedurais", err);
  setState({ assetsReady: true });
});

function Root() {
  const assetsReady = useStore((s) => s.assetsReady);
  return assetsReady ? (
    <Suspense fallback={<Loading />}>
      <App />
    </Suspense>
  ) : (
    <Loading />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
