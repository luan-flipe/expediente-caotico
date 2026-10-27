import { useEffect, useState } from "react";
import { ABILITIES, BALANCE, roomNameAt } from "@ec/shared";
import { useStore } from "../store";
import { Evolution } from "./Evolution";
import { Scoreboard } from "./Scoreboard";

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const STATUS_TEXT: Record<string, string> = {
  stun: "Atordoado",
  blind: "Cego de café",
  slow: "Lento",
  haste: "Cafeinado",
  shield: "Escudo",
  invuln: "Intocável",
};

function Slot({ k, label, level, readyInMs, cooldownMs, color, small }: { k: string; label: string; level?: number; readyInMs: number; cooldownMs: number; color?: string; small?: boolean }) {
  const pct = cooldownMs > 0 ? Math.min(1, readyInMs / cooldownMs) : 0;
  return (
    <div className={`slot-ab ${small ? "small" : ""}`} style={{ borderColor: readyInMs <= 0 && color ? color : undefined }}>
      <span className="key">{k}</span>
      <span className="ico">{label}</span>
      {level ? <span className="lv">{["", "I", "II", "III", "IV", "V"][level]}</span> : null}
      {readyInMs > 0 && (
        <div className="cd" style={{ background: `conic-gradient(rgba(0,0,0,0.72) ${pct * 360}deg, rgba(0,0,0,0.25) 0)` }}>
          {Math.ceil(readyInMs / 1000)}
        </div>
      )}
    </div>
  );
}

export function Hud({ myId, locked, hitAt, hurtAt }: { myId: string; locked: boolean; hitAt: number; hurtAt: number }) {
  const snap = useStore((s) => s.snap);
  const me = useStore((s) => s.me);
  const feed = useStore((s) => s.feed);
  const scoreboard = useStore((s) => s.scoreboard);
  const online = useStore((s) => s.online);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 120);
    return () => clearInterval(t);
  }, []);

  if (!snap) return <div className="hud center-msg">Entrando no escritório...</div>;
  const now = performance.now();
  const self = snap.players.find((p) => p.id === myId);
  const top = [...snap.players].sort((a, b) => b.score - a.score || b.kills - a.kills).slice(0, 4);
  const obj = snap.objective;
  const objOwner = obj.owner ? snap.players.find((p) => p.id === obj.owner)?.name : null;
  const flags = self?.flags.filter((f) => STATUS_TEXT[f] && f !== "invuln") ?? [];

  let arrowRot = 0;
  let objDist = 0;
  if (self) {
    objDist = Math.hypot(obj.x - self.x, obj.z - self.z);
    arrowRot = Math.atan2(obj.x - self.x, obj.z - self.z) - self.yaw;
  }

  return (
    <div className="hud">
      {me && me.blindMs > 0 && <div className="blind" style={{ opacity: Math.min(1, me.blindMs / 600) }} />}
      <div className={`dmg-flash ${now - hurtAt < 120 ? "on" : ""}`} />
      <div className={`crosshair ${now - hitAt < 150 ? "hit" : ""}`} />

      <div className="hud-top">
        <div className="panel timer">{fmt(snap.remainingMs)}</div>
        <div className="panel zone-pill">
          <span className="zone-arrow" style={{ transform: `rotate(${-arrowRot}rad)` }} />
          <span>
            Reunião Relâmpago · {roomNameAt(obj.x, obj.z)} · {Math.round(objDist)} m
          </span>
          <span style={{ color: obj.contested ? "#ff4d3d" : obj.owner === myId ? "#1fae6b" : "#ffe14d" }}>
            {obj.contested ? "disputada" : objOwner ? `com ${obj.owner === myId ? "você" : objOwner}` : "livre"}
          </span>
          <span className="muted" style={{ color: "#cfc8b8" }}>
            muda em {fmt(obj.cycleMs)}
          </span>
        </div>
      </div>

      <div className="feed">
        {!online && <div className="me">Conexão perdida. Reconectando...</div>}
        {feed
          .filter((f) => now - f.at < 6000)
          .map((f) => (
            <div key={f.id} className={f.kind}>
              {f.text}
            </div>
          ))}
      </div>

      <div className="panel mini-board">
        {top.map((p, i) => (
          <div key={p.id} className={`r ${p.id === myId ? "me" : ""}`}>
            <span>
              {i + 1}. {p.name}
            </span>
            <span className="num">{p.score}</span>
          </div>
        ))}
        <div className="r" style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>
          <span>Tab: placar completo</span>
        </div>
      </div>

      {self && me && (
        <div className="panel status-panel">
          <div className="name">
            <span>{self.name}</span>
            <span className="lvl">NÍVEL {me.level}</span>
          </div>
          <div className="bar hp">
            <i className="hp" style={{ width: `${(self.hp / self.maxHp) * 100}%` }} />
            <i className="sh" style={{ width: `${Math.min(1, self.shield / self.maxHp) * 100}%`, height: 5 }} />
            <span>
              {self.hp} / {self.maxHp}
              {self.shield > 0 ? ` +${self.shield}` : ""}
            </span>
          </div>
          <div className="bar xp">
            <i style={{ width: `${(me.xp / me.xpNext) * 100}%` }} />
          </div>
          <div className="effects">
            {flags.map((f) => (
              <span key={f} className="fx">
                {STATUS_TEXT[f]}
              </span>
            ))}
            {me.synergies.map((s) => (
              <span key={s} className="fx syn">
                Sinergia: {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {me && (
        <div className="abilities">
          {[0, 1, 2].map((i) => {
            const a = me.abilities[i];
            const def = a ? ABILITIES[a.id] : null;
            return (
              <Slot
                key={i}
                k={"QER"[i]}
                label={def ? def.short : "vazio"}
                level={a?.level}
                readyInMs={a?.readyInMs ?? 0}
                cooldownMs={a?.cooldownMs ?? 1}
                color={def?.color}
              />
            );
          })}
          <Slot k="ESP" label="Esquiva" readyInMs={me.dodgeInMs} cooldownMs={BALANCE.dodgeCooldownMs} small color="#fff" />
        </div>
      )}

      {me?.options && <Evolution options={me.options} msLeft={me.optionsInMs} pending={me.pendingLevels} abilities={me.abilities} />}

      {snap.phase === "countdown" && (
        <div className="center-msg">
          <div className="big-count">{Math.max(1, Math.ceil(snap.countdownMs / 1000))}</div>
        </div>
      )}

      {self && !self.alive && me && (
        <div className="center-msg">
          <div className="death">
            <h2>Você foi demitido!</h2>
            <div>Recontratação em {Math.ceil(me.respawnInMs / 1000)} s</div>
          </div>
        </div>
      )}

      {!locked && snap.phase !== "finished" && <div className="panel lock-hint">Clique na tela para mirar com o mouse</div>}
      {scoreboard && <Scoreboard snap={snap} myId={myId} />}
    </div>
  );
}
