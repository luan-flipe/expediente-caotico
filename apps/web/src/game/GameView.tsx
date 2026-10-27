import { useEffect, useRef, useState } from "react";
import { Hud } from "../hud/Hud";
import { getState, net, useStore } from "../store";
import { Engine, type UiSignal } from "./engine";

export function GameView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const players = useStore((s) => s.lobby?.players);
  const [locked, setLocked] = useState(false);
  const [hitAt, setHitAt] = useState(0);
  const [hurtAt, setHurtAt] = useState(0);

  useEffect(() => {
    const onUi = (s: UiSignal) => {
      if (s === "lock") setLocked(true);
      if (s === "unlock") setLocked(false);
      if (s === "hit") setHitAt(performance.now());
      if (s === "hurt") setHurtAt(performance.now());
    };
    const engine = new Engine(canvasRef.current!, myId, onUi);
    engineRef.current = engine;
    engine.setAvatars(getState().lobby?.players ?? []);
    const { snap, me } = getState();
    if (snap) engine.applySnapshot(snap, me);
    const off = net.listen((m) => {
      if (m.t === "snap") engine.applySnapshot(m.s, m.me);
    });
    return () => {
      off();
      engine.dispose();
      engineRef.current = null;
    };
  }, [myId]);

  useEffect(() => {
    if (players) engineRef.current?.setAvatars(players);
  }, [players]);

  return (
    <div className="game">
      <canvas ref={canvasRef} className="view" />
      <Hud myId={myId} locked={locked} hitAt={hitAt} hurtAt={hurtAt} />
    </div>
  );
}
