import { useEffect, useState } from "react";
import { leaveRoom, setState } from "../store";
import { IS_TOUCH, resetTouchInput } from "../touch";

/**
 * Menu de pausa por cima da partida. O jogo não congela (o servidor segue rodando para todo mundo),
 * mas enquanto ele está aberto o comando do jogador fica parado.
 */
export function PauseMenu() {
  const [confirming, setConfirming] = useState(false);
  const close = () => setState({ pauseOpen: false });

  // o dedo que estava no analógico ou no volante fica por baixo do menu: solta, para não voltar andando
  useEffect(() => resetTouchInput(), []);

  return (
    <div className="settings-overlay" role="dialog" aria-label="Menu de pausa">
      <div className="settings-panel pause-panel stack">
        <div className="brand" style={{ marginBottom: 0 }}>
          <h1>
            <span>{confirming ? "Sair da partida?" : "Pausa"}</span>
          </h1>
        </div>
        {confirming ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Você sai da sala e volta para a tela inicial. A partida continua para os outros.
            </p>
            <button className="btn primary" onClick={leaveRoom}>
              Sim, sair
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              A partida segue rodando enquanto este menu está aberto.{IS_TOUCH ? "" : " Esc volta ao jogo."}
            </p>
            <button className="btn primary" onClick={close} autoFocus>
              Continuar
            </button>
            <button className="btn" onClick={() => setState({ settingsOpen: true })}>
              Configurações
            </button>
            <button className="btn" onClick={() => setConfirming(true)}>
              Sair da partida
            </button>
          </>
        )}
      </div>
    </div>
  );
}
