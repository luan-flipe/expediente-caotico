import { useEffect, useRef, useState } from "react";
import type { QteTaskState } from "@ec/shared";
import { net } from "../../store";

export function QteModal({
  title,
  state,
  onClose,
}: {
  title: string;
  state: QteTaskState;
  onClose: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fecha automaticamente ao resolver com breve feedback de sucesso
  useEffect(() => {
    if (state.completed) {
      const t = setTimeout(onClose, 800);
      return () => clearTimeout(t);
    }
  }, [state.completed, onClose]);

  return (
    <div className="suspeito-modal-overlay">
      <div className="suspeito-task-modal qte-modal">
        <div className="suspeito-modal-header">
          <div className="task-title-wrap">
            <span className="task-badge">QTE</span>
            <h3>{title}</h3>
          </div>
          <button className="suspeito-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="suspeito-modal-body">
          {state.completed ? (
            <div className="suspeito-task-success">
              <span className="success-icon">✓</span>
              <h4>Procedimento Concluído com Sucesso!</h4>
            </div>
          ) : (
            <>
              {state.kind === "timing" && (
                <TimingGame state={state} onError={(err) => setErrorMsg(err)} />
              )}
              {state.kind === "sequence" && (
                <SequenceGame state={state} onError={(err) => setErrorMsg(err)} />
              )}
              {state.kind === "wires" && <WiresGame state={state} />}
              {state.kind === "printer" && <PrinterGame state={state} />}

              {errorMsg && <div className="suspeito-task-error">{errorMsg}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TimingGame({
  state,
  onError,
}: {
  state: Extract<QteTaskState, { kind: "timing" }>;
  onError: (err: string) => void;
}) {
  const [cursorPos, setCursorPos] = useState(0.1);
  const dirRef = useRef(1);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setCursorPos((prev) => {
        let next = prev + dirRef.current * 0.8 * dt;
        if (next >= 0.98) {
          next = 0.98;
          dirRef.current = -1;
        } else if (next <= 0.02) {
          next = 0.02;
          dirRef.current = 1;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleHit = () => {
    if (cursorPos >= state.targetMin && cursorPos <= state.targetMax) {
      onError("");
      net.send({
        t: "suspeitoTaskAction",
        qteAction: { kind: "timing", timingValue: cursorPos },
      });
    } else {
      onError("Fora da área verde! Tente novamente.");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleHit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="qte-timing-container">
      <p className="qte-instruction">
        Pressione <strong>ESPAÇO</strong> ou clique no botão quando o ponteiro estiver na{" "}
        <span style={{ color: "#00e676", fontWeight: "bold" }}>ÁREA VERDE</span>:
      </p>

      <div className="timing-bar-track">
        {/* Zona Verde Alvo */}
        <div
          className="timing-target-zone"
          style={{
            left: `${state.targetMin * 100}%`,
            width: `${(state.targetMax - state.targetMin) * 100}%`,
          }}
        />

        {/* Agulha / Ponteiro móvel */}
        <div
          className="timing-needle"
          style={{
            left: `${cursorPos * 100}%`,
          }}
        />
      </div>

      <button className="qte-action-btn" onClick={handleHit}>
        CALIBRAR (ESPAÇO)
      </button>
    </div>
  );
}

function SequenceGame({
  state,
  onError,
}: {
  state: Extract<QteTaskState, { kind: "sequence" }>;
  onError: (err: string) => void;
}) {
  const handleKeyInput = (key: string) => {
    net.send({
      t: "suspeitoTaskAction",
      qteAction: { kind: "sequence", key },
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (/^[A-Z0-9]$/.test(k)) {
        handleKeyInput(k);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="qte-sequence-container">
      <p className="qte-instruction">
        Digite a sequência autorizada na ordem correta:
      </p>

      <div className="sequence-display">
        {state.sequence.map((char, idx) => {
          const isDone = idx < state.currentIndex;
          const isCurrent = idx === state.currentIndex;
          return (
            <div
              key={idx}
              className={`sequence-slot ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
            >
              {char}
            </div>
          );
        })}
      </div>

      <div className="sequence-keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "A", "W", "S", "D"].map((k) => (
          <button
            key={k}
            className="keypad-btn"
            onClick={() => handleKeyInput(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function WiresGame({
  state,
}: {
  state: Extract<QteTaskState, { kind: "wires" }>;
}) {
  const handleConnectWire = (color: string) => {
    net.send({
      t: "suspeitoTaskAction",
      qteAction: { kind: "wire", color },
    });
  };

  return (
    <div className="qte-wires-container">
      <p className="qte-instruction">
        Clique nos cabos para conectá-los ao patch panel do servidor:
      </p>

      <div className="wires-list">
        {state.colors.map((color) => {
          const isConnected = state.connected.includes(color);
          return (
            <div key={color} className="wire-row">
              <button
                className={`wire-btn color-${color} ${isConnected ? "connected" : ""}`}
                disabled={isConnected}
                onClick={() => handleConnectWire(color)}
              >
                {isConnected ? `✓ Cabo ${color.toUpperCase()} Conectado` : `Ligar Cabo ${color.toUpperCase()}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrinterGame({
  state,
}: {
  state: Extract<QteTaskState, { kind: "printer" }>;
}) {
  const handleNextStep = () => {
    net.send({
      t: "suspeitoTaskAction",
      qteAction: { kind: "printer", printerStep: state.step },
    });
  };

  return (
    <div className="qte-printer-container">
      <p className="qte-instruction">
        Execute o procedimento de manutenção da impressora:
      </p>

      <div className="printer-steps-list">
        {state.stepLabels.map((label, idx) => {
          const isDone = idx < state.step;
          const isCurrent = idx === state.step;
          return (
            <div
              key={idx}
              className={`printer-step-item ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
            >
              <span className="step-num">{isDone ? "✓" : idx + 1}</span>
              <span className="step-label">{label}</span>
            </div>
          );
        })}
      </div>

      <button className="qte-action-btn" onClick={handleNextStep}>
        {state.stepLabels[state.step] ?? "Finalizar"}
      </button>
    </div>
  );
}
