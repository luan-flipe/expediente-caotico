import { useEffect, useState } from "react";
import type { TermoTaskState } from "@ec/shared";
import { net } from "../../store";
import { playTaskCompleteSound, playTaskErrorSound, playTaskStepSound } from "../suspeitoSound";

interface TermoModalProps {
  state: TermoTaskState;
  onClose: () => void;
}

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

export function TermoModal({ state, onClose }: TermoModalProps) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mapeia letras usadas para cores do teclado
  const letterStatuses: Record<string, "correct" | "present" | "absent"> = {};
  for (const g of state.guesses) {
    for (const ev of g.evaluations) {
      const prev = letterStatuses[ev.letter];
      if (ev.status === "correct") {
        letterStatuses[ev.letter] = "correct";
      } else if (ev.status === "present" && prev !== "correct") {
        letterStatuses[ev.letter] = "present";
      } else if (!prev) {
        letterStatuses[ev.letter] = "absent";
      }
    }
  }

  const handleKey = (key: string) => {
    if (state.solved || state.failed) return;
    setErrorMsg(null);

    if (key === "ENTER") {
      if (currentGuess.length !== state.wordLength) {
        playTaskErrorSound();
        setErrorMsg(`A palavra precisa de ${state.wordLength} letras`);
        return;
      }
      playTaskStepSound(state.guesses.length);
      net.send({ t: "suspeitoTaskAction", termoGuess: currentGuess });
      setCurrentGuess("");
    } else if (key === "BACKSPACE" || key === "⌫") {
      setCurrentGuess((prev) => prev.slice(0, -1));
    } else if (/^[A-Z]$/.test(key) && currentGuess.length < state.wordLength) {
      setCurrentGuess((prev) => prev + key);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "Enter") handleKey("ENTER");
      else if (e.key === "Backspace") handleKey("BACKSPACE");
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentGuess, state.solved, state.failed]);

  // Se o desafio for resolvido, fecha automaticamente após 1.4s
  useEffect(() => {
    if (state.solved) {
      playTaskCompleteSound();
      const timer = setTimeout(() => onClose(), 1400);
      return () => clearTimeout(timer);
    }
    if (state.failed) {
      playTaskErrorSound();
    }
  }, [state.solved, state.failed, onClose]);

  const rows = [];
  for (let r = 0; r < state.maxGuesses; r++) {
    const guess = state.guesses[r];
    const isCurrent = r === state.guesses.length && !state.solved && !state.failed;
    const tiles = [];

    for (let c = 0; c < state.wordLength; c++) {
      if (guess) {
        const ev = guess.evaluations[c];
        tiles.push(
          <div key={c} className={`termo-tile termo-${ev?.status ?? "absent"}`}>
            {ev?.letter ?? guess.word[c]}
          </div>
        );
      } else if (isCurrent) {
        const letter = currentGuess[c] ?? "";
        tiles.push(
          <div key={c} className={`termo-tile ${letter ? "termo-active" : ""}`}>
            {letter}
          </div>
        );
      } else {
        tiles.push(<div key={c} className="termo-tile termo-empty" />);
      }
    }
    rows.push(
      <div key={r} className="termo-row">
        {tiles}
      </div>
    );
  }

  return (
    <div className="suspeito-modal-backdrop">
      <div className="suspeito-task-card termo-card">
        <div className="suspeito-task-header">
          <h3>Terminal TERMO - Palavra Corporativa</h3>
          <button className="btn small close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="suspeito-task-desc">
          Descubra o termo corporativo de 5 letras. Verde = posição correta, Amarelo = existe na palavra, Cinza = não existe.
        </p>

        {errorMsg && <div className="suspeito-error">{errorMsg}</div>}
        {state.solved && <div className="suspeito-success">🎉 Palavra correta! Tarefa concluída!</div>}
        {state.failed && <div className="suspeito-error">Tentativas esgotadas. Tente novamente!</div>}

        <div className="termo-grid">{rows}</div>

        <div className="termo-keyboard">
          {KEYBOARD_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="termo-kb-row">
              {row.map((k) => {
                const st = letterStatuses[k];
                return (
                  <button
                    key={k}
                    className={`termo-kb-key ${k.length > 1 ? "termo-kb-wide" : ""} ${st ? `termo-${st}` : ""}`}
                    onClick={() => handleKey(k)}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
