import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { preloadCharacter } from "./game/character";
import { preloadChair } from "./race/chairMesh";
import { preloadCommander } from "./race/commander";
import { net, savedSession, setState } from "./store";
import "./styles.css";

const wanted = new URLSearchParams(location.search).get("sala")?.toUpperCase();
const session = savedSession();
if (session && (!wanted || wanted === session.code)) net.resume();
// os dois modelos chegam antes de redesenhar miniaturas e prévias
void preloadCommander();
Promise.all([preloadCharacter(), preloadChair()]).then((ok) => ok.some(Boolean) && setState({ modelReady: true }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
