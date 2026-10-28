import { useEffect, useRef } from "react";
import { getTrack } from "@ec/shared";
import { TouchControls } from "../hud/TouchControls";
import { getState, net, useStore } from "../store";
import { IS_TOUCH } from "../touch";
import { RaceEngine } from "./raceEngine";
import { RaceHud } from "./RaceHud";

export function RaceView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const players = useStore((s) => s.lobby?.players);
  const ghosts = useStore((s) => s.ghosts);
  useStore((s) => s.modelReady);

  useEffect(() => {
    // a pista não muda durante a partida: vale a do lobby na largada
    const engine = new RaceEngine(canvasRef.current!, myId, getTrack(getState().lobby?.options.track));
    engineRef.current = engine;
    if (import.meta.env.DEV) Object.assign(window, { __race: engine });
    engine.setPeople(getState().lobby?.players ?? []);
    const { rsnap, rme } = getState();
    if (rsnap) engine.applySnapshot(rsnap, rme);
    const off = net.listen((m) => {
      if (m.t === "rsnap") engine.applySnapshot(m.s, m.me);
      else if (m.t === "chat") engine.showChat(m.from, m.kind, m.index);
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
      {IS_TOUCH && <TouchControls mode="race" />}
      <RaceHud myId={myId} />
    </div>
  );
}
