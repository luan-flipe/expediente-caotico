import { useState } from "react";
import { BALANCE, DURATIONS_MS, RACE } from "@ec/shared";
import { avatarThumbnail } from "../game/character";
import { chairThumbnail } from "../race/chairMesh";
import { leaveRoom, net, setState, useStore } from "../store";

export function Lobby() {
  const lobby = useStore((s) => s.lobby)!;
  const myId = useStore((s) => s.myId);
  const error = useStore((s) => s.error);
  const online = useStore((s) => s.online);
  useStore((s) => s.modelReady);
  const [copied, setCopied] = useState(false);
  const isHost = lobby.hostId === myId;
  const me = lobby.players.find((p) => p.id === myId);
  const link = `${location.origin}${location.pathname}?sala=${lobby.code}`;
  const bots = lobby.players.filter((p) => p.isBot).length;
  const full = lobby.players.length >= BALANCE.maxPlayers;
  const race = lobby.mode === "race";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copie o link:", link);
    }
  };

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="brand" style={{ marginBottom: 0 }}>
            <h1>
              Sala de <span>espera</span>
            </h1>
          </div>
          <div className="postit">
            <p className="label" style={{ color: "#1d1b17" }}>
              Código da sala
            </p>
            <div className="code">{lobby.code}</div>
            <button className="btn small" onClick={copy}>
              {copied ? "Link copiado" : "Copiar link de convite"}
            </button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {!online && <div className="error">Reconectando ao servidor...</div>}

        <div>
          <p className="label">
            Participantes {lobby.players.length}/{BALANCE.maxPlayers}
          </p>
          <div className="roster">
            {lobby.players.map((p) => (
              <div className="slot" key={p.id}>
                {p.id === lobby.hostId && <span className="tag host">ANFITRIÃO</span>}
                <img src={race ? chairThumbnail(p.avatar, p.chair) : avatarThumbnail(p.avatar)} alt={p.name} />
                <div className="who">
                  <span>
                    {p.name}
                    {p.id === myId ? " (você)" : ""}
                  </span>
                  {!p.connected ? <span className="tag off">CAIU</span> : p.isBot ? <span className="tag">BOT</span> : p.ready ? <span className="tag ok">PRONTO</span> : <span className="tag">...</span>}
                </div>
              </div>
            ))}
            {Array.from({ length: BALANCE.maxPlayers - lobby.players.length }, (_, i) => (
              <div className="slot empty" key={`e${i}`}>
                vaga livre
              </div>
            ))}
          </div>
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="card stack">
            <p className="label" style={{ margin: 0 }}>
              Você
            </p>
            <div className="row">
              {!isHost && (
                <button className={`btn ${me?.ready ? "" : "primary"}`} onClick={() => net.send({ t: "ready", ready: !me?.ready })}>
                  {me?.ready ? "Cancelar pronto" : "Estou pronto"}
                </button>
              )}
              <button className="btn" onClick={() => setState({ editing: true })}>
                {race ? "Editar boneco e cadeira" : "Editar boneco"}
              </button>
              <button className="btn" onClick={leaveRoom}>
                Sair da sala
              </button>
            </div>
          </div>

          <div className="card stack">
            <p className="label" style={{ margin: 0 }}>
              {isHost ? "Controle do anfitrião" : "Configuração da partida"}
            </p>
            <div className="row">
              <span className="muted">Modo:</span>
              <div className="seg">
                <button className={!race ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "mode", mode: "shooter" })}>
                  Tiroteio
                </button>
                <button className={race ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "mode", mode: "race" })}>
                  Rally da Firma
                </button>
              </div>
            </div>
            {race ? (
              <div className="row">
                <span className="muted">Corrida de cadeiras: {RACE.laps} voltas no Circuito Corporativo, até {RACE.maxPlayers} pilotos.</span>
              </div>
            ) : (
              <div className="row">
                <span className="muted">Duração:</span>
                <div className="seg">
                  {DURATIONS_MS.map((ms) => (
                    <button key={ms} className={lobby.durationMs === ms ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "duration", ms })}>
                      {ms / 60000} min
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isHost && (
              <>
                <div className="row">
                  <button className="btn small" disabled={full} onClick={() => net.send({ t: "addBot" })}>
                    + Bot estagiário
                  </button>
                  <button className="btn small" disabled={bots === 0} onClick={() => net.send({ t: "removeBot" })}>
                    - Bot
                  </button>
                </div>
                <button className="btn primary" onClick={() => net.send({ t: "start" })}>
                  {race ? "Iniciar corrida" : "Iniciar expediente"}
                </button>
              </>
            )}
            {!isHost && <p className="muted" style={{ margin: 0 }}>O anfitrião inicia quando todos estiverem prontos.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
