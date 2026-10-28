import { useEffect, useRef, useState } from "react";
import { getTrack, type ReplayData, type Track } from "@ec/shared";
import { fetchReplay } from "../net/session";
import { setState, useStore } from "../store";
import { fmtRace } from "./RaceHud";
import { REPLAY_SPEEDS, ReplayEngine, type ReplayCam } from "./replayEngine";

const CAMS: { id: ReplayCam; label: string }[] = [
  { id: "atras", label: "Atrás" },
  { id: "cima", label: "De cima" },
  { id: "livre", label: "Livre" },
];

const close = () => setState({ replay: null });

/** Replay da volta recorde: busca a gravação e a repete numa pista sem servidor de jogo. */
export function ReplayView() {
  const target = useStore((s) => s.replay);
  const [data, setData] = useState<ReplayData | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setData(null);
    setFail(null);
    fetchReplay(target.pista, target.linha)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setFail(e.message));
    return () => {
      alive = false;
    };
  }, [target]);

  // Esc volta ao ranking
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !e.repeat) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (data && target) return <Player data={data} track={getTrack(target.pista)} />;
  return (
    <div className="screen">
      <div className="wrap stack">
        {fail ? <div className="error">{fail}</div> : <p className="muted">Carregando o replay...</p>}
        <button className="btn" onClick={close}>
          Voltar ao ranking
        </button>
      </div>
    </div>
  );
}

function Player({ data, track }: { data: ReplayData; track: Track }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ReplayEngine | null>(null);
  const [time, setTime] = useState(0);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cam, setCam] = useState<ReplayCam>("atras");

  useEffect(() => {
    const engine = new ReplayEngine(canvasRef.current!, data, track);
    engineRef.current = engine;
    if (import.meta.env.DEV) Object.assign(window, { __replay: engine });
    engine.onTick = (ms, done) => {
      setTime(ms);
      setEnded(done);
      setPlaying(engine.isPlaying);
    };
    return () => {
      engine.onTick = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [data, track]);

  // espaço pausa e continua
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // com um botão em foco o próprio espaço já o aciona
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        engineRef.current?.togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickSpeed = (v: number) => {
    engineRef.current?.setSpeed(v);
    setSpeed(v);
  };
  const pickCam = (c: ReplayCam) => {
    engineRef.current?.setCam(c);
    setCam(c);
  };

  return (
    <div className="game">
      <canvas ref={canvasRef} className="view" />
      <div className="replay-hud">
        <div className="replay-top">
          <div className="panel replay-info">
            <strong>{data.name}</strong>
            <span>Volta de {fmtRace(data.ms)}</span>
          </div>
          <div className="panel timer">{fmtRace(time)}</div>
          <button className="btn small" onClick={close}>
            Voltar ao ranking (Esc)
          </button>
        </div>
        <div className="replay-bar panel">
          <button className="btn small" onClick={() => engineRef.current?.togglePlay()}>
            {ended ? "Rever" : playing ? "Pausar" : "Continuar"}
          </button>
          <div className="seg" role="group" aria-label="Velocidade">
            {REPLAY_SPEEDS.map((v) => (
              <button key={v} className={speed === v ? "on" : ""} onClick={() => pickSpeed(v)}>
                {String(v).replace(".", ",")}x
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Câmera">
            {CAMS.map((c) => (
              <button key={c.id} className={cam === c.id ? "on" : ""} onClick={() => pickCam(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          {cam === "livre" && <span className="replay-hint">Arraste para girar, roda do mouse para aproximar</span>}
        </div>
      </div>
    </div>
  );
}
