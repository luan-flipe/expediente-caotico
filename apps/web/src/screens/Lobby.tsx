import { useEffect, useState } from "react";
import { BALANCE, BOT_LEVELS, BOT_LEVEL_NAMES, DURATIONS_MS, LAPS_MAX, LAPS_MIN, RACE, TRACK_IDS, TRACKS } from "@ec/shared";
import { avatarThumbnail } from "../game/character";
import { chairThumbnail } from "../race/chairMesh";
import { canNativeShare, inviteText } from "../invite";
import { getLobbyMusicEnabled, getLobbyMusicVolume, setLobbyMusicEnabled, setLobbyMusicVolume, startLobbyMusic, stopLobbyMusic, subscribeLobbyMusic } from "../sound";
import { leaveRoom, net, setState, useStore } from "../store";

const LAP_CHOICES = Array.from({ length: LAPS_MAX - LAPS_MIN + 1 }, (_, i) => LAPS_MIN + i);

export function Lobby() {
  const lobby = useStore((s) => s.lobby)!;
  const myId = useStore((s) => s.myId);
  const error = useStore((s) => s.error);
  const online = useStore((s) => s.online);
  useStore((s) => s.modelReady);
  const [copied, setCopied] = useState(false);
  const [lobbyMusicOn, setLobbyMusicOn] = useState(() => getLobbyMusicEnabled());
  const [lobbyVolume, setLobbyVolume] = useState(() => getLobbyMusicVolume());

  useEffect(() => {
    startLobbyMusic();
    return () => {
      stopLobbyMusic();
    };
  }, []);

  useEffect(() => {
    return subscribeLobbyMusic(() => {
      setLobbyMusicOn(getLobbyMusicEnabled());
      setLobbyVolume(getLobbyMusicVolume());
    });
  }, []);
  const isHost = lobby.hostId === myId;
  const me = lobby.players.find((p) => p.id === myId);
  const bots = lobby.players.filter((p) => p.isBot).length;
  const full = lobby.players.length >= BALANCE.maxPlayers;
  const trial = lobby.mode === "timetrial";
  const race = lobby.mode === "race" || trial;
  const isZombies = !race && lobby.shooterSubmode === "zombies";

  const opts = lobby.options;
  const botRow = (
    <div className="row">
      <span className="muted">Bots:</span>
      <div className="seg">
        {BOT_LEVELS.map((level) => (
          <button key={level} className={opts.botLevel === level ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "options", botLevel: level })}>
            {BOT_LEVEL_NAMES[level]}
          </button>
        ))}
      </div>
    </div>
  );

  const trackRow = (
    <div className="row">
      <span className="muted">Pista:</span>
      <div className="seg">
        {TRACK_IDS.map((id) => (
          <button key={id} className={opts.track === id ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "options", track: id })}>
            {TRACKS[id].name}
          </button>
        ))}
      </div>
    </div>
  );

  const copy = async () => {
    const text = inviteText(location.origin, lobby.code);
    // Celular com toque: abre o menu nativo de compartilhar (WhatsApp, Teams...).
    if (canNativeShare(navigator)) {
      try {
        await navigator.share({ title: "Expediente Caótico", text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // a pessoa fechou o menu
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copie o convite:", text);
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
              {copied ? "Copiado!" : "Copiar convite"}
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
                {!p.isBot && <span className={`tag seal ${p.ranked ? "ranked" : ""}`}>{p.ranked ? "NO RANKING" : "VISITANTE"}</span>}
                <img src={race ?chairThumbnail(p.avatar, p.chair) : avatarThumbnail(p.avatar)} alt={p.name} />
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

        <div className="grid-2 even">
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
              <button className="btn" onClick={() => setState({ ranking: true })}>
                Ranking
              </button>
              <button className="btn" onClick={() => setState({ settingsOpen: true })}>
                Configurações
              </button>
              <button className="btn" onClick={leaveRoom}>
                Sair da sala
              </button>
            </div>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="muted" style={{ fontSize: "13px" }}>
                🎵 Música da sala:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  className={`btn small ${lobbyMusicOn && lobbyVolume > 0 ? "on" : ""}`}
                  onClick={() => {
                    setLobbyMusicEnabled(!(lobbyMusicOn && lobbyVolume > 0));
                    if (!lobbyMusicOn && lobbyVolume === 0) setLobbyMusicVolume(0.8);
                  }}
                  title={lobbyMusicOn && lobbyVolume > 0 ? "Desligar a música da sala" : "Ligar a música da sala"}
                >
                  {lobbyMusicOn && lobbyVolume > 0 ? "🔊 Ligada" : "🔇 Desligada"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={lobbyMusicOn ? lobbyVolume : 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!lobbyMusicOn && v > 0) setLobbyMusicEnabled(true);
                    setLobbyMusicVolume(v);
                  }}
                  style={{ width: "80px", cursor: "pointer" }}
                  title={`Volume da música da sala: ${Math.round((lobbyMusicOn ? lobbyVolume : 0) * 100)}%`}
                />
                <span className="muted" style={{ fontSize: "12px", minWidth: "32px", textAlign: "right" }}>
                  {Math.round((lobbyMusicOn ? lobbyVolume : 0) * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="card stack">
            <p className="label" style={{ margin: 0 }}>
              {isHost ? "Controle do anfitrião" : "Configuração da partida"}
            </p>
            <div className="row">
              <span className="muted">Modo:</span>
              <div className="seg">
                <button className={lobby.mode === "shooter" ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "mode", mode: "shooter" })}>
                  Tiroteio
                </button>
                <button className={lobby.mode === "race" ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "mode", mode: "race" })}>
                  Rally da Firma
                </button>
                <button className={trial ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "mode", mode: "timetrial" })}>
                  Contra o relógio
                </button>
              </div>
            </div>
            {!race && (
              <div className="row">
                <span className="muted">Tipo:</span>
                <div className="seg">
                  <button
                    className={!isZombies ? "on" : ""}
                    disabled={!isHost}
                    onClick={() => net.send({ t: "shooterSubmode", submode: "pvp" })}
                  >
                    Versus (PvP)
                  </button>
                  <button
                    className={isZombies ? "on" : ""}
                    disabled={!isHost}
                    onClick={() => net.send({ t: "shooterSubmode", submode: "zombies" })}
                  >
                    🧟 Modo Zumbis (Co-op)
                  </button>
                </div>
              </div>
            )}

            {trial ? (
              <>
                {trackRow}
                <div className="row">
                  <span className="muted">Voltas livres sozinho ou com a sala, sem itens e sem colisão. Fantasma da sua melhor volta e do recorde nesta pista.</span>
                </div>
              </>
            ) : race ? (
              <>
                {trackRow}
                <div className="row">
                  <span className="muted">Voltas:</span>
                  <div className="seg">
                    {LAP_CHOICES.map((n) => (
                      <button key={n} className={opts.laps === n ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "options", laps: n })}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row">
                  <span className="muted">Itens:</span>
                  <div className="seg">
                    <button className={opts.items ? "on" : ""} disabled={!isHost} onClick={() => net.send({ t: "options", items: true })}>
                      Ligados
                    </button>
                    <button className={opts.items ? "" : "on"} disabled={!isHost} onClick={() => net.send({ t: "options", items: false })}>
                      Desligados
                    </button>
                  </div>
                </div>
                {botRow}
                <div className="row">
                  <span className="muted">Corrida de cadeiras no {TRACKS[opts.track].name}, até {RACE.maxPlayers} pilotos.</span>
                </div>
              </>
            ) : (
              <>
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
                {botRow}
              </>
            )}

            {isHost && (
              <>
                {!trial && (
                  <div className="row">
                    <button className="btn small" disabled={full} onClick={() => net.send({ t: "addBot" })}>
                      + Bot estagiário
                    </button>
                    <button className="btn small" disabled={bots === 0} onClick={() => net.send({ t: "removeBot" })}>
                      - Bot
                    </button>
                  </div>
                )}
                <button className="btn primary" onClick={() => net.send({ t: "start" })}>
{trial ? "Iniciar treino" : race ? "Iniciar corrida" : isZombies ? "Iniciar Sobrevivência Zumbi" : "Iniciar expediente"}
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
