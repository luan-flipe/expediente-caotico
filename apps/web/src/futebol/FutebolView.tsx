import { useEffect, useRef, useState } from "react";
import { TouchControls } from "../hud/TouchControls";
import { getState, net, setState, useStore } from "../store";
import { IS_TOUCH } from "../touch";
import { FutebolHud } from "./FutebolHud";
import { FutebolEngine, type FutCamUi, type FutUiSignal } from "./futebolEngine";

export function FutebolView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const powerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FutebolEngine | null>(null);
  const players = useStore((s) => s.lobby?.players);
  const [locked, setLocked] = useState(false);
  const [cam, setCam] = useState<FutCamUi>({ spectating: false, cam: "tv", replay: false, shot: "" });

  useEffect(() => {
    const onUi = (s: FutUiSignal) => {
      if (s === "lock") setLocked(true);
      if (s === "unlock") {
        setLocked(false);
        // Esc solta o mouse e abre o menu de pausa; perder o foco ou abrir o chat solta sem abrir
        const st = getState();
        if (document.hasFocus() && !st.chatOpen && !st.settingsOpen) setState({ pauseOpen: true });
      }
    };
    const engine = new FutebolEngine(canvasRef.current!, myId, onUi, setCam);
    engine.powerRef = powerRef;
    engine.powerFillRef = fillRef;
    engineRef.current = engine;
    if (import.meta.env.DEV) Object.assign(window, { __fut: engine });
    engine.setAvatars(getState().lobby?.players ?? []);
    const { fsnap, fme } = getState();
    if (fsnap) engine.applySnapshot(fsnap, fme);
    const off = net.listen((m) => {
      if (m.t === "fsnap") engine.applySnapshot(m.s, m.me);
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
      {IS_TOUCH && <TouchControls mode="futebol" />}
      <FutebolHud myId={myId} locked={locked} powerRef={powerRef} fillRef={fillRef} cam={cam} onCam={(k) => engineRef.current?.setCam(k)} onSkip={() => engineRef.current?.skipReplay()} />
    </div>
  );
}
