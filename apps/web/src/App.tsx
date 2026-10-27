import { lazy, Suspense } from "react";
import { Creator } from "./screens/Creator";
import { Home } from "./screens/Home";
import { Loading } from "./screens/Loading";
import { Lobby } from "./screens/Lobby";
import { Ranking } from "./screens/Ranking";
import { Results } from "./screens/Results";
import { useStore } from "./store";

// o código de cada modo só baixa quando a partida começa
const GameView = lazy(() => import("./game/GameView").then((m) => ({ default: m.GameView })));
const RaceView = lazy(() => import("./race/RaceView").then((m) => ({ default: m.RaceView })));
const RaceResults = lazy(() => import("./race/RaceResults").then((m) => ({ default: m.RaceResults })));

export function App() {
  const assetsReady = useStore((s) => s.assetsReady);
  const editing = useStore((s) => s.editing);
  const ranking = useStore((s) => s.ranking);
  const lobby = useStore((s) => s.lobby);
  const results = useStore((s) => s.results);
  const raceResults = useStore((s) => s.raceResults);
  const myId = useStore((s) => s.myId);

  const screen = () => {
    if (lobby?.phase === "match" && myId) return lobby.mode === "shooter" ? <GameView myId={myId} /> : <RaceView myId={myId} />;
    if (editing) return <Creator />;
    if (ranking) return <Ranking />;
    if (!lobby) return <Home />;
    if (lobby.phase === "results" && raceResults) return <RaceResults />;
    if (lobby.phase === "results" && results) return <Results />;
    return <Lobby />;
  };

  if (!assetsReady) return <Loading />;
  return <Suspense fallback={<Loading />}>{screen()}</Suspense>;
}
