import { useEffect, useRef } from "react";
import { getState, net, useStore } from "../store";
import { RaceEngine } from "./raceEngine";
import { RaceHud } from "./RaceHud";

export function RaceView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const players = useStore((s) => s.lobby?.players);
  const ghosts = useStore((s) => s.ghosts);
  useStore((s) => s.modelReady);

  useEffect(() => {
    const engine = new RaceEngine(canvasRef.current!, myId);
    engineRef.current = engine;
    if (import.meta.env.DEV) Object.assign(window, { __race: engine });
    engine.setPeople(getState().lobby?.players ?? []);
    const { rsnap, rme } = getState();
    if (rsnap) engine.applySnapshot(rsnap, rme);
    const off = net.listen((m) => {
      if (m.t === "rsnap") engine.applySnapshot(m.s, m.me);
    });
    return () => {
      off();
      engine.dispose();
      engineRef.current = null;
    };
  }, [myId]);

  useEffect(() => {
    if (players) engineRef.current?.setPeople(players);
  }, [players]);

  // fantasmas chegam logo na largada (talvez antes desta tela montar): o store guarda o último
  useEffect(() => {
    engineRef.current?.setGhosts(ghosts);
  }, [ghosts]);

  return (
    <div className="game">
      <canvas ref={canvasRef} className="view" />
      <RaceHud myId={myId} />
    </div>
  );
}
