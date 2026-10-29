import { useEffect, useState } from "react";
import { getLobbyMusicEnabled, getLobbyMusicVolume, setLobbyMusicEnabled, setLobbyMusicVolume, subscribeLobbyMusic } from "../sound";

/** Liga, desliga e ajusta o volume da música da tela inicial e da sala (a mesma faixa e a mesma preferência). */
export function MenuMusicControl({ label }: { label: string }) {
  const [on, setOn] = useState(() => getLobbyMusicEnabled());
  const [volume, setVolume] = useState(() => getLobbyMusicVolume());

  useEffect(
    () =>
      subscribeLobbyMusic(() => {
        setOn(getLobbyMusicEnabled());
        setVolume(getLobbyMusicVolume());
      }),
    [],
  );

  const audible = on && volume > 0;
  const shown = Math.round((on ? volume : 0) * 100);
  return (
    <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <span className="muted" style={{ fontSize: "13px" }}>
        🎵 {label}:
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          className={`btn small ${audible ? "on" : ""}`}
          onClick={() => {
            setLobbyMusicEnabled(!audible);
            if (!on && volume === 0) setLobbyMusicVolume(0.8);
          }}
          title={audible ? "Desligar a música" : "Ligar a música"}
        >
          {audible ? "🔊 Ligada" : "🔇 Desligada"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={on ? volume : 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!on && v > 0) setLobbyMusicEnabled(true);
            setLobbyMusicVolume(v);
          }}
          style={{ width: "80px", cursor: "pointer" }}
          title={`Volume da música: ${shown}%`}
        />
        <span className="muted" style={{ fontSize: "12px", minWidth: "32px", textAlign: "right" }}>
          {shown}%
        </span>
      </div>
    </div>
  );
}
