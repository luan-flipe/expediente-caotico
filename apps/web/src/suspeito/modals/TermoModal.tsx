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

const emptyLetters = (n: number) => Array.from({ length: n }, () => "");

export function TermoModal({ state, onClose }: TermoModalProps) {
  const [letters, setLetters] = useState(() => emptyLetters(state.wordLength));
  const [cursor, setCursor] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLetters(emptyLetters(state.wordLength));
    setCursor(0);
  }, [state.wordLength, state.guesses.length]);

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

  const done = state.solved || state.failed;
  const last = state.wordLength - 1;

  const handleKey = (key: string) => {
    if (done) return;
    setErrorMsg(null);

    if (key === "ENTER") {
      if (letters.some((l) => !l)) {
        playTaskErrorSound();
        setErrorMsg(`A palavra precisa de ${state.wordLength} letras`);
        return;
      }
      playTaskStepSound(state.guesses.length);
      net.send({ t: "suspeitoTaskAction", termoGuess: letters.join("") });
      setLetters(emptyLetters(state.wordLength));
      setCursor(0);
    } else if (key === "BACKSPACE" || key === "⌫") {
      if (letters[cursor]) {
        setLetters(letters.map((l, i) => (i === cursor ? "" : l)));
      } else if (cursor > 0) {
        setLetters(letters.map((l, i) => (i === cursor - 1 ? "" : l)));
        setCursor(cursor - 1);
      }
    } else if (key === "DELETE") {
      setLetters(letters.map((l, i) => (i === cursor ? "" : l)));
    } else if (key === "LEFT") {
      setCursor(Math.max(0, cursor - 1));
    } else if (key === "RIGHT") {
      setCursor(Math.min(last, cursor + 1));
    } else if (key === "HOME") {
      setCursor(0);
    } else if (key === "END") {
      setCursor(last);
    } else if (/^[A-Z]$/.test(key)) {
      const next = letters.map((l, i) => (i === cursor ? key : l));
      setLetters(next);
      const nextEmpty = next.findIndex((l, i) => i > cursor && !l);
      setCursor(nextEmpty >= 0 ? nextEmpty : Math.min(last, cursor + 1));
    }
  };

  useEffect(() => {
    const KEY_MAP: Record<string, string> = {
      Enter: "ENTER",
      Backspace: "BACKSPACE",
      Delete: "DELETE",
      ArrowLeft: "LEFT",
      ArrowRight: "RIGHT",
      Home: "HOME",
      End: "END",
    };
    // fase de captura + stopPropagation: as teclas do Termo não chegam aos atalhos do HUD/engine (E, Q, R, F, M, espaço)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Escape") return;
      const mapped = KEY_MAP[e.key] ?? (/^[a-zA-Z]$/.test(e.key) ? e.key.toUpperCase() : null);
      if (!mapped && e.key !== " " && e.key !== "Tab" && !e.key.startsWith("Arrow")) return;
      e.preventDefault();
      e.stopPropagation();
      if (mapped && (!e.repeat || mapped === "BACKSPACE" || mapped === "LEFT" || mapped === "RIGHT")) handleKey(mapped);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [letters, cursor, state.solved, state.failed, state.guesses.length, state.wordLength]);

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
    const isCurrent = r === state.guesses.length && !done;
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
        const letter = letters[c] ?? "";
        tiles.push(
          <div
            key={c}
            className={`termo-tile termo-editable ${letter ? "termo-active" : ""} ${c === cursor ? "termo-cursor" : ""}`}
            onClick={() => setCursor(c)}
          >
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
          Descubra o termo corporativo de {state.wordLength} letras. Use ← → (ou clique) para escolher a casa.
        </p>
        <div className="termo-legend">
          <span><i className="termo-swatch termo-correct" /> Lugar certo</span>
          <span><i className="termo-swatch termo-present" /> Existe, outro lugar</span>
          <span><i className="termo-swatch termo-absent" /> Não existe</span>
        </div>

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
                    tabIndex={-1}
                    className={`termo-kb-key ${k.length > 1 ? "termo-kb-wide" : ""} ${st ? `termo-${st}` : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
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
