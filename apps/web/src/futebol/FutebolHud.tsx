import { useEffect, useRef, useState, type RefObject } from "react";
import { FUT, FUT_COLORS, type FutEvent, type FutSnapshot, type RestartKind, type TeamSide } from "@ec/shared";
import { keyLabel, useSettings } from "../settings";
import { useStore } from "../store";
import { IS_TOUCH } from "../touch";

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
      out.push({ id: ++bannerId, until: now + 3000, kind: e.card === "yellow" ? "card-yellow" : "card-red", text: e.card === "yellow" ? "Cartão amarelo" : "Cartão vermelho", sub: name(e.id) });
    } else if (e.type === "foul") {
      out.push({ id: ++bannerId, until: now + 2000, kind: "info", text: "Falta", sub: e.id === myId ? "Você cometeu a falta" : `de ${name(e.id)}` });
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

export function FutebolHud({ myId, locked, powerRef, fillRef }: { myId: string; locked: boolean; powerRef: RefObject<HTMLDivElement | null>; fillRef: RefObject<HTMLDivElement | null> }) {
  const snap = useStore((s) => s.fsnap);
  const scoreboard = useStore((s) => s.scoreboard);
  const keys = useSettings().keys.futebol;
  const [banners, setBanners] = useState<Banner[]>([]);
  const lastT = useRef(-1);

  // eventos chegam uma vez por snapshot; os avisos expiram sozinhos
  useEffect(() => {
    if (!snap || snap.t === lastT.current) return;
    lastT.current = snap.t;
    const add = bannersFor(snap, myId, performance.now());
    if (add.length) setBanners((b) => [...b, ...add].slice(-4));
  }, [snap, myId]);
  useEffect(() => {
    const t = setInterval(() => setBanners((b) => (b.some((x) => x.until < performance.now()) ? b.filter((x) => x.until >= performance.now()) : b)), 250);
    return () => clearInterval(t);
  }, []);

  if (!snap) return <div className="hud center-msg">Entrando no campo...</div>;

  const [t0, t1] = snap.teams;
  const hex = (side: TeamSide) => FUT_COLORS[snap.teams[side].color]?.hex ?? "#888";
  const me = snap.players.find((p) => p.id === myId);
  const r = snap.restart;
  const counting = r !== null && r.leftMs <= FUT.restartCountdownMs && snap.phase !== "penalties";
  const iTake = r?.takerId === myId;
  const penTaker = snap.phase === "penalties" ? snap.pens?.takerId : null;
  const half = snap.elapsedMs < snap.durationMs / 2 ? "1º tempo" : "2º tempo";
  const clock = snap.phase === "penalties" ? "Pênaltis" : snap.elapsedMs >= snap.durationMs ? "Acabou" : `${fmt(snap.durationMs - snap.elapsedMs)} · ${half}`;

  return (
    <div className="hud fut-hud">
      <div className="fut-top">
        <div className="fut-team" style={{ background: hex(0), color: inkOn(hex(0)) }}>
          <span className="n">{t0.name}</span>
          <b>{snap.score[0]}</b>
        </div>
        <div className="panel fut-clock">{clock}</div>
        <div className="fut-team right" style={{ background: hex(1), color: inkOn(hex(1)) }}>
          <b>{snap.score[1]}</b>
          <span className="n">{t1.name}</span>
        </div>
      </div>

      {snap.pens && (
        <div className="panel fut-pens">
          <div>
            <span>{t0.name}</span>
            <Dots goals={snap.pens.goals[0]} taken={snap.pens.taken[0]} />
            <b>{snap.pens.goals[0]}</b>
          </div>
          <div>
            <span>{t1.name}</span>
            <Dots goals={snap.pens.goals[1]} taken={snap.pens.taken[1]} />
            <b>{snap.pens.goals[1]}</b>
          </div>
        </div>
      )}

      {r && snap.phase !== "penalties" && (
        <div className="panel fut-restart">
          {RESTART_TEXT[r.kind]}
          {iTake ? " (você cobra)" : ` (${snap.players.find((p) => p.id === r.takerId)?.name ?? "alguém"} cobra)`}
        </div>
      )}
      {penTaker && <div className="panel fut-restart">{penTaker === myId ? "Sua vez de bater o pênalti" : `${snap.players.find((p) => p.id === penTaker)?.name ?? "Alguém"} vai bater`}</div>}
      {counting && r && <div className="fut-count">{Math.max(1, Math.ceil(r.leftMs / 1000))}</div>}

      <div className="fut-banners">
        {banners.map((b) => (
          <div key={b.id} className={`fut-banner ${b.kind}`}>
            {(b.kind === "card-yellow" || b.kind === "card-red") && <i className="card" />}
            <strong>{b.text}</strong>
            {b.sub && <span>{b.sub}</span>}
          </div>
        ))}
      </div>

      {me?.down && <div className="panel fut-state">No chão...</div>}
      {me?.sentOff && <div className="panel fut-state">Você foi expulso. Seu time joga com um a menos.</div>}

      <div className="fut-power" ref={powerRef} style={{ display: "none" }}>
        <div className="fill" ref={fillRef} />
      </div>

      {!IS_TOUCH && (
        <div className="fut-keys">
          {keyLabel(keys.frente)} {keyLabel(keys.esquerda)} {keyLabel(keys.tras)} {keyLabel(keys.direita)} andar · {keyLabel(keys.frente)} duas vezes corre · esquerdo chuta (segure para força) · direito passa · sem a bola: carrinho e disputa
        </div>
      )}
      {!locked && !IS_TOUCH && snap.phase !== "over" && <div className="panel lock-hint">Clique na tela para jogar com o mouse</div>}
      {scoreboard && <FutScoreboard snap={snap} myId={myId} />}
    </div>
  );
}

function FutScoreboard({ snap, myId }: { snap: FutSnapshot; myId: string }) {
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
