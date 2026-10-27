import { GameView } from "./game/GameView";
import { Creator } from "./screens/Creator";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Results } from "./screens/Results";
import { useStore } from "./store";

export function App() {
  const editing = useStore((s) => s.editing);
  const lobby = useStore((s) => s.lobby);
  const results = useStore((s) => s.results);
  const myId = useStore((s) => s.myId);

  if (lobby?.phase === "match" && myId) return <GameView myId={myId} />;
  if (editing) return <Creator />;
  if (!lobby) return <Home />;
  if (lobby.phase === "results" && results) return <Results />;
  return <Lobby />;
}
