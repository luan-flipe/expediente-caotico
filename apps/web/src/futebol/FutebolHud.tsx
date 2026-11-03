import { createContext, memo, useContext, useEffect, useRef, useState, type RefObject } from "react";
import { FUT, FUT_COLORS, type FutEvent, type FutSnapshot, type RestartKind, type TeamSide } from "@ec/shared";
import { keyLabel, useSettings } from "../settings";
import { net, useStore } from "../store";
import { IS_TOUCH } from "../touch";
import { CAM_KINDS, CAM_LABELS, type CamKind } from "./cameras";
import type { FutCamUi } from "./futebolEngine";

const fmt = (ms: number) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const RESTART_TEXT: Record<RestartKind, string> = {
  lateral: "Lateral",
  escanteio: "Escanteio",
  meta: "Tiro de meta",
  falta: "Falta",
  penalti: "Pênalti",
  saida: "Saída de bola",
};

/** Cor de texto legível sobre a cor do time. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#14120f" : "#fffdf7";
}

interface Banner {
  id: number;
  until: number;
  kind: "goal" | "card-yellow" | "card-red" | "info";
  text: string;
  sub?: string;
}

let bannerId = 0;

/** Transforma os eventos do snapshot em avisos na tela. */
function bannersFor(s: FutSnapshot, myId: string, now: number): Banner[] {
  const name = (id: string | null) => s.players.find((p) => p.id === id)?.name ?? "alguém";
  const out: Banner[] = [];
  for (const e of s.events as FutEvent[]) {
    if (e.type === "goal") {
      const team = s.teams[e.side].name;
      out.push({ id: ++bannerId, until: now + 3800, kind: "goal", text: e.own ? "Gol contra!" : "GOOOL!", sub: e.scorerId ? `${name(e.scorerId)} (${team})` : team });
    } else if (e.type === "card") {
      out.push({ id: ++bannerId, until: now + 3000, kind: e.card === "yellow" ? "card-yellow" : "card-red", text: e.card === "yellow" ? "Juiz mostra o amarelo" : "Juiz mostra o vermelho", sub: name(e.id) });
    } else if (e.type === "foul") {
      out.push({ id: ++bannerId, until: now + 2000, kind: "info", text: "Falta", sub: e.id === myId ? "Você cometeu a falta" : e.victimId === myId ? `${name(e.id)} em você` : `de ${name(e.id)}` });
    } else if (e.type === "whistle") {
      const text = e.kind === "start" ? "Bola rolando!" : e.kind === "half" ? "Fim do primeiro tempo" : "Fim de jogo";
      out.push({ id: ++bannerId, until: now + 2500, kind: "info", text });
    } else if (e.type === "pen") {
      out.push({ id: ++bannerId, until: now + 2500, kind: "info", text: e.scored ? "Gol de pênalti!" : "Defendeu!", sub: name(e.takerId) });
    }
  }
  return out;
}

function Dots({ goals, taken }: { goals: number; taken: number }) {
  const total = Math.max(5, taken);
  return (
    <span className="fut-dots">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < taken ? (i < goals ? "ok" : "miss") : ""} />
      ))}
    </span>
  );
}

/** Seleciona um pedaço do snapshot e só re-renderiza quando ele muda de verdade (comparação por valor; as partes são pequenas). */
function useFut<T>(sel: (s: FutSnapshot) => T): T | null {
  const last = useRef<T | null>(null);
  return useStore((st) => {
    const v = st.fsnap ? sel(st.fsnap) : null;
    if (JSON.stringify(v) === JSON.stringify(last.current)) return last.current;
    last.current = v;
    return v;
  });
}

const FutBanners = memo(function FutBanners({ myId }: { myId: string }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const lastT = useRef(-1);

  // eventos chegam uma vez por snapshot; os avisos expiram sozinhos
  useEffect(() => {
    return net.listen((m) => {
      if (m.t !== "fsnap" || m.s.t === lastT.current) return;
      lastT.current = m.s.t;
      const add = bannersFor(m.s, myId, performance.now());
      if (add.length) setBanners((b) => [...b, ...add].slice(-4));
    });
  }, [myId]);
  useEffect(() => {
    const t = setInterval(() => setBanners((b) => (b.some((x) => x.until < performance.now()) ? b.filter((x) => x.until >= performance.now()) : b)), 250);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fut-banners">
      {banners.map((b) => (
        <div key={b.id} className={`fut-banner ${b.kind}`}>
          {(b.kind === "card-yellow" || b.kind === "card-red") && <i className="card" />}
          <strong>{b.text}</strong>
          {b.sub && <span>{b.sub}</span>}
        </div>
      ))}
    </div>
  );
});

/** Placar e relógio: o relógio muda por segundo, não por snapshot. */
const FutTop = memo(function FutTop() {
  const d = useFut((s) => {
    const half = s.elapsedMs < s.durationMs / 2 ? "1º tempo" : "2º tempo";
    const clock = s.phase === "penalties" ? "Pênaltis" : s.elapsedMs >= s.durationMs ? "Acabou" : `${fmt(s.durationMs - s.elapsedMs)} · ${half}`;
    return { teams: s.teams, score: s.score, clock };
  });
  if (!d) return null;
  const hex = (side: TeamSide) => FUT_COLORS[d.teams[side].color]?.hex ?? "#888";
  const [t0, t1] = d.teams;
  return (
    <div className="fut-top">
      <div className="fut-team" style={{ background: hex(0), color: inkOn(hex(0)) }}>
        <span className="n">{t0.name}</span>
        <b>{d.score[0]}</b>
      </div>
      <div className="panel fut-clock">{d.clock}</div>
      <div className="fut-team right" style={{ background: hex(1), color: inkOn(hex(1)) }}>
        <b>{d.score[1]}</b>
        <span className="n">{t1.name}</span>
      </div>
    </div>
  );
});

const FutPens = memo(function FutPens() {
  const d = useFut((s) => ({ pens: s.pens, names: [s.teams[0].name, s.teams[1].name] }));
  if (!d?.pens) return null;
  const { pens, names } = d;
  return (
    <div className="panel fut-pens">
      {([0, 1] as const).map((i) => (
        <div key={i}>
          <span>{names[i]}</span>
          <Dots goals={pens.goals[i]} taken={pens.taken[i]} />
          <b>{pens.goals[i]}</b>
        </div>
      ))}
    </div>
  );
});

/** Avisos de cobrança, contagem e estado do jogador: só texto e números, que mudam pouco. */
const FutNotices = memo(function FutNotices({ myId }: { myId: string }) {
  const d = useFut((s) => {
    const name = (id: string | undefined) => s.players.find((p) => p.id === id)?.name;
    const r = s.restart;
    const me = s.players.find((p) => p.id === myId);
    const counting = r !== null && r.leftMs <= FUT.restartCountdownMs && s.phase !== "penalties";
    const penTaker = s.phase === "penalties" ? s.pens?.takerId : null;
    return {
      restart: r && s.phase !== "penalties" ? `${RESTART_TEXT[r.kind]}${r.takerId === myId ? " (você cobra)" : ` (${name(r.takerId) ?? "alguém"} cobra)`}` : null,
      pen: penTaker ? (penTaker === myId ? "Sua vez de bater o pênalti" : `${name(penTaker) ?? "Alguém"} vai bater`) : null,
      count: counting && r ? Math.max(1, Math.ceil(r.leftMs / 1000)) : 0,
      down: !!me?.down,
      sentOff: !!me?.sentOff,
      over: s.phase === "over",
    };
  });
  const locked = useLocked();
  if (!d) return null;
  return (
    <>
      {d.restart && <div className="panel fut-restart">{d.restart}</div>}
      {d.pen && <div className="panel fut-restart">{d.pen}</div>}
      {d.count > 0 && <div className="fut-count">{d.count}</div>}
      {d.down && <div className="panel fut-state">No chão...</div>}
      {d.sentOff && <div className="panel fut-state">Você foi expulso. Seu time joga com um a menos.</div>}
      {!locked && !IS_TOUCH && !d.over && <div className="panel lock-hint">Clique na tela para jogar com o mouse</div>}
    </>
  );
});

const LockedContext = createContext(false);
const useLocked = () => useContext(LockedContext);

/** Câmeras: o espectador escolhe o ângulo; durante o replay de gol aparece o plano atual e o botão de pular. */
function FutCameras({ cam, onCam, onSkip }: { cam: FutCamUi; onCam: (k: CamKind) => void; onSkip: () => void }) {
  return (
    <>
      {cam.replay && (
        <div className="fut-replay">
          <b>REPLAY</b>
          <span>{cam.shot}</span>
          <button type="button" onClick={onSkip}>
            Pular{IS_TOUCH ? "" : " (Espaço)"}
          </button>
        </div>
      )}
      {cam.spectating && !cam.replay && (
        <div className="fut-cams" role="group" aria-label="Câmera">
          {CAM_KINDS.map((k, i) => (
            <button key={k} type="button" className={cam.cam === k ? "on" : ""} aria-pressed={cam.cam === k} onClick={() => onCam(k)}>
              {!IS_TOUCH && <i>{i + 1}</i>}
              {CAM_LABELS[k]}
            </button>
          ))}
          {cam.cam === "jogador" && !IS_TOUCH && <span>setas trocam o jogador</span>}
        </div>
      )}
    </>
  );
}

export function FutebolHud({
  myId,
  locked,
  powerRef,
  fillRef,
  cam,
  onCam,
  onSkip,
}: {
  myId: string;
  locked: boolean;
  powerRef: RefObject<HTMLDivElement | null>;
  fillRef: RefObject<HTMLDivElement | null>;
  cam: FutCamUi;
  onCam: (k: CamKind) => void;
  onSkip: () => void;
}) {
  const hasSnap = useStore((s) => !!s.fsnap);
  const scoreboard = useStore((s) => s.scoreboard);
  const keys = useSettings().keys.futebol;

  // a barra de força existe sempre: o motor a procura pelo ref e o HUD pode chegar antes do primeiro snapshot
  const power = (
    <div className="fut-power" ref={powerRef} style={{ display: "none" }}>
      <div className="fill" ref={fillRef} />
    </div>
  );
  if (!hasSnap) {
    return (
      <div className="hud fut-hud">
        <div className="center-msg">Entrando no campo...</div>
        {power}
      </div>
    );
  }

  return (
    <LockedContext.Provider value={locked}>
      <div className="hud fut-hud">
        <FutTop />
        <FutPens />
        <FutNotices myId={myId} />
        <FutBanners myId={myId} />
        <FutCameras cam={cam} onCam={onCam} onSkip={onSkip} />

        {power}

        {!IS_TOUCH && (
          <div className="fut-keys">
            {keyLabel(keys.frente)} {keyLabel(keys.esquerda)} {keyLabel(keys.tras)} {keyLabel(keys.direita)} andar · {keyLabel(keys.frente)} duas vezes corre · esquerdo chuta (segure para força; perto do gol, a mira escolhe o canto) · direito passa · sem a bola: carrinho e disputa
          </div>
        )}
        {scoreboard && <FutScoreboard myId={myId} />}
      </div>
    </LockedContext.Provider>
  );
}

function FutScoreboard({ myId }: { myId: string }) {
  const snap = useStore((s) => s.fsnap);
  if (!snap) return null;
  return (
    <div className="panel scoreboard fut-board">
      {([0, 1] as const).map((side) => {
        const color = FUT_COLORS[snap.teams[side].color]?.hex ?? "#888";
        return (
          <div key={side}>
            <h3 style={{ background: color, color: inkOn(color) }}>
              {snap.teams[side].name} {snap.score[side]}
            </h3>
            <ul>
              {snap.players
                .filter((p) => p.side === side && p.role === "linha")
                .map((p) => (
                  <li key={p.id} style={p.id === myId ? { color: "#ffe14d" } : undefined}>
                    {p.name}
                    {p.isBot ? " (bot)" : ""}
                    {!p.connected ? " (caiu)" : ""}
                    {p.yellow > 0 && <i className="card y" />}
                    {p.sentOff && <i className="card r" />}
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
