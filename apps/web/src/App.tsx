import { lazy, Suspense, useEffect } from "react";
import { ChallengeToast } from "./screens/ChallengeCard";
import { Creator } from "./screens/Creator";
import { Home } from "./screens/Home";
import { Loading } from "./screens/Loading";
import { Lobby } from "./screens/Lobby";
import { escAction } from "./pause";
import { PauseMenu } from "./screens/PauseMenu";
import { Perfil } from "./screens/Perfil";
import { QuickChat } from "./screens/QuickChat";
import { Ranking } from "./screens/Ranking";
import { Results } from "./screens/Results";
import { Settings } from "./screens/Settings";
import { startLobbyMusic, stopLobbyMusic } from "./sound";
import { getState, setState, useStore } from "./store";

// o código de cada modo só baixa quando a partida começa
const GameView = lazy(() => import("./game/GameView").then((m) => ({ default: m.GameView })));
const RaceView = lazy(() => import("./race/RaceView").then((m) => ({ default: m.RaceView })));
const ReplayView = lazy(() => import("./race/ReplayView").then((m) => ({ default: m.ReplayView })));
const RaceResults = lazy(() => import("./race/RaceResults").then((m) => ({ default: m.RaceResults })));

export function App() {
  const assetsReady = useStore((s) => s.assetsReady);
  const editing = useStore((s) => s.editing);
  const ranking = useStore((s) => s.ranking);
  const replay = useStore((s) => s.replay);
  const perfil = useStore((s) => s.perfil);
  const lobby = useStore((s) => s.lobby);
  const results = useStore((s) => s.results);
  const raceResults = useStore((s) => s.raceResults);
  const myId = useStore((s) => s.myId);
  const settingsOpen = useStore((s) => s.settingsOpen);

  const inMatch = lobby?.phase === "match";
  const pauseOpen = useStore((s) => s.pauseOpen) && inMatch;

  // Esc abre o menu de pausa durante a partida e fecha as telas por cima (a captura de tecla e o chat tratam o próprio Esc antes, em outra fase)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat) return;
      const st = getState();
      const act = escAction({ settingsOpen: st.settingsOpen, pauseOpen: st.pauseOpen, inMatch: st.lobby?.phase === "match", pointerLocked: !!document.pointerLockElement });
      if (act === "closeSettings") setState({ settingsOpen: false });
      else if (act === "closePause") setState({ pauseOpen: false });
      else if (act === "openPause") setState({ pauseOpen: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a música da sala toca na tela inicial e na sala, sem recomeçar quando uma vira a outra
  const showsLobby = !!lobby && !inMatch && !(lobby.phase === "results" && (raceResults || results));
  const menuMusic = assetsReady && !editing && !ranking && !perfil && (!lobby || showsLobby);
  useEffect(() => {
    if (!menuMusic) return;
    startLobbyMusic();
    return () => stopLobbyMusic();
  }, [menuMusic]);

  // a partida acabou com o menu aberto: ele não volta sozinho na próxima
  useEffect(() => {
    if (!inMatch && getState().pauseOpen) setState({ pauseOpen: false });
  }, [inMatch]);

  const screen = () => {
    if (lobby?.phase === "match" && myId) return lobby.mode === "shooter" ? <GameView myId={myId} /> : <RaceView myId={myId} />;
    if (editing) return <Creator />;
    if ((ranking || perfil) && replay) return <ReplayView />;
    if (perfil) return <Perfil id={perfil} />;
    if (ranking) return <Ranking />;
    if (!lobby) return <Home />;
    if (lobby.phase === "results" && raceResults) return <RaceResults />;
    if (lobby.phase === "results" && results) return <Results />;
    return <Lobby />;
  };

  if (!assetsReady) return <Loading />;
  return (
    <>
      <Suspense fallback={<Loading />}>{screen()}</Suspense>
      <QuickChat />
      <ChallengeToast />
      {pauseOpen && <PauseMenu />}
      {settingsOpen && <Settings />}
    </>
  );
}
