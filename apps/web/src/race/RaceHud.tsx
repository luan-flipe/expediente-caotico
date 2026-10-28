import { useEffect, useState } from "react";
import { ITEM_NAMES, RACE, type ItemId } from "@ec/shared";
import { keyLabel, useSettings } from "../settings";
import { net, useStore } from "../store";
import { Minimap } from "./Minimap";

export const ITEM_ICON: Record<ItemId, string> = {
  expresso: "☕",
  triplo: "☕☕☕",
  grampeador: "📎",
  poca: "💧",
  resma: "📄",
  aviao: "✈️",
  pasta: "📁",
  postit: "🟨",
};

export const fmtRace = (ms: number | null) => {
  if (ms === null) return "--:--.-";
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}.${Math.floor((t % 1000) / 100)}`;
};

export function RaceHud({ myId }: { myId: string }) {
  const snap = useStore((s) => s.rsnap);
  const me = useStore((s) => s.rme);
  const feed = useStore((s) => s.feed);
  const scoreboard = useStore((s) => s.scoreboard);
  const online = useStore((s) => s.online);
  const ghosts = useStore((s) => s.ghosts);
  const isHost = useStore((s) => s.lobby?.hostId === myId);
  const keys = useSettings().keys.race;
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 120);
    return () => clearInterval(t);
  }, []);

  if (!snap) return <div className="hud center-msg">Ajustando a cadeira...</div>;
  const now = performance.now();
  const order = [...snap.karts].sort((a, b) => a.place - b.place);
  const frozen = snap.karts.find((k) => k.id === myId)?.flags.includes("frozen");
  const introLeft = snap.phase === "countdown" ? snap.countdownMs - (RACE.countdownMs - RACE.introMs) : 0;
  const trial = snap.timeTrial;

  if (introLeft > 0) {
    const first = introLeft > RACE.introMs * 0.45;
    return (
      <div className="hud cutscene">
        <div className="bar top" />
        <div className="bar bottom">
          <div className="speech">
            <strong>Comandante</strong>
            {first ? "Bom dia, firma! Aqui é o Comandante, sobrevoando o Circuito Corporativo." : "Cintos afivelados, café na mão. Pilotos, liberados para a largada!"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hud">
      {me && me.blindMs > 0 && (
        <div className="postit-cover" style={{ opacity: Math.min(1, me.blindMs / 400) }}>
          <span>Reunião às 15h!!</span>
        </div>
      )}

      <div className="hud-top">
        <div className="panel timer">{fmtRace(me?.raceMs ?? snap.elapsedMs)}</div>
        {trial && isHost && snap.phase === "active" && (
          <button className="btn small end-training" onClick={() => net.send({ t: "endTraining" })}>
            Encerrar treino
          </button>
        )}
        {snap.graceMs !== null && <div className="panel zone-pill">Fim da corrida em {Math.ceil(snap.graceMs / 1000)} s</div>}
      </div>

      {me && trial && (
        <div className="race-place trial">
          <div className="lap">Volta {me.lap}</div>
          <div className="now">{fmtRace(me.lapMs > 0 ? me.lapMs : null)}</div>
          <div className="times">
            <span>Última {fmtRace(me.lastLapMs)}</span>
            <span>Melhor da sessão {fmtRace(me.sessionBestMs)}</span>
            <span>Melhor de sempre {fmtRace(ghosts?.mine?.ms ?? null)}</span>
            <span className="record">Recorde {ghosts?.record ? `${fmtRace(ghosts.record.ms)} (${ghosts.record.name})` : "--:--.-"}</span>
          </div>
        </div>
      )}

      {me && !trial && (
        <div className="race-place">
          <span className="pos">
            {me.place}
            <small>º</small>
          </span>
          <span className="of">/{me.total}</span>
          <div className="lap">
            Volta {me.lap}/{snap.laps}
          </div>
          <div className="times">
            <span>Esta volta {fmtRace(me.finished ? null : me.lapMs)}</span>
            <span>Melhor {fmtRace(me.bestLapMs)}</span>
          </div>
        </div>
      )}

      {me && !trial && !snap.itemsOff && (
        <div className={`race-item ${me.item ? "full" : ""}`}>
          <div className="ico">{me.item ? ITEM_ICON[me.item] : ""}</div>
          <div className="name">{me.item ? `${ITEM_NAMES[me.item]}${me.charges > 1 ? ` x${me.charges}` : ""}` : "Sem item"}</div>
          <div className="key">{me.item ? `${keyLabel(keys.item)} ou clique` : "Passe numa caixa"}</div>
        </div>
      )}

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

      <div className="panel minimap-wrap">
        <Minimap karts={snap.karts} myId={myId} />
      </div>

      {snap.phase === "countdown" && (
        <div className="center-msg">
          <div className="big-count">{Math.max(1, Math.ceil(snap.countdownMs / 1000))}</div>
          <div className="panel race-help">{keyLabel(keys.acelerar)} acelera · {keyLabel(keys.esquerda)}/{keyLabel(keys.direita)} vira · {keyLabel(keys.derrapar)} derrapa (solte para o turbo){trial || snap.itemsOff ? "" : ` · ${keyLabel(keys.item)} usa item`} · {keyLabel(keys.voltar)} volta para a pista · {keyLabel(keys.mudo)} som</div>
        </div>
      )}
      {snap.phase === "active" && snap.elapsedMs < 900 && (
        <div className="center-msg">
          <div className="big-count">VAI!</div>
        </div>
      )}
      {me?.wrongWay && !me.finished && (
        <div className="center-msg">
          <div className="wrong-way">Contramão! Dê meia-volta</div>
        </div>
      )}
      {frozen && <div className="panel lock-hint">Voltando para a pista...</div>}
      {me?.finished && (
        <div className="center-msg">
          <div className="death">
            <h2>Você chegou em {me.place}º!</h2>
            <div>Tempo {fmtRace(me.raceMs)} · melhor volta {fmtRace(me.bestLapMs)}</div>
          </div>
        </div>
      )}

      {scoreboard && (
        <div className="panel scoreboard">
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Piloto</th>
                <th className="num">Volta</th>
              </tr>
            </thead>
            <tbody>
              {order.map((k) => (
                <tr key={k.id} style={k.id === myId ? { color: "#ffe14d" } : undefined}>
                  <td className="num">{k.place}</td>
                  <td>
                    {k.name}
                    {k.isBot ? " (bot)" : ""}
                    {!k.connected ? " (caiu)" : ""}
                    {k.finished ? " ✓" : ""}
                  </td>
                  <td className="num">{k.lap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
