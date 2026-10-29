import { useEffect, useRef, useState } from "react";
import { Hud } from "../hud/Hud";
import { TouchControls } from "../hud/TouchControls";
import { getState, net, setState, useStore } from "../store";
import { IS_TOUCH } from "../touch";
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
      if (s === "unlock") {
        setLocked(false);
        // Esc solta o mouse e abre o menu de pausa; perder o foco (Alt+Tab) também solta, mas aí não abre
        // (o chat rápido também solta o mouse de propósito, e aí o menu não abre)
        const st = getState();
        if (document.hasFocus() && !st.chatOpen && !st.settingsOpen) setState({ pauseOpen: true });
      }
      if (s === "hit") setHitAt(performance.now());
      if (s === "hurt") setHurtAt(performance.now());
    };
    const engine = new Engine(canvasRef.current!, myId, onUi);
    engineRef.current = engine;
    if (import.meta.env.DEV) Object.assign(window, { __engine: engine });
    engine.setAvatars(getState().lobby?.players ?? []);
    const { snap, me } = getState();
    if (snap) engine.applySnapshot(snap, me);
    const off = net.listen((m) => {
      if (m.t === "snap") engine.applySnapshot(m.s, m.me);
      else if (m.t === "chat") engine.showChat(m.from, m.kind, m.index);
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
      {/* por baixo do HUD: as cartas de evolução ficam por cima e recebem o toque */}
      {IS_TOUCH && <TouchControls mode="shooter" />}
      <Hud myId={myId} locked={locked} hitAt={hitAt} hurtAt={hurtAt} />
    </div>
  );
}
