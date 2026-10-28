import { GameView } from "./game/GameView";
import { Creator } from "./screens/Creator";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Results } from "./screens/Results";
import { RaceResults } from "./race/RaceResults";
import { RaceView } from "./race/RaceView";
import { useStore } from "./store";

export function App() {
  const editing = useStore((s) => s.editing);
  const lobby = useStore((s) => s.lobby);
  const results = useStore((s) => s.results);
  const raceResults = useStore((s) => s.raceResults);
  const myId = useStore((s) => s.myId);

  if (lobby?.phase === "match" && myId) return lobby.mode === "race" ? <RaceView myId={myId} /> : <GameView myId={myId} />;
  if (editing) return <Creator />;
  if (!lobby) return <Home />;
  if (lobby.phase === "results" && raceResults) return <RaceResults />;
  if (lobby.phase === "results" && results) return <Results />;
  return <Lobby />;
}
