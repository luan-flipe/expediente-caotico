import { useEffect, useState } from "react";
import type { ContextoTaskState } from "@ec/shared";
import { net } from "../../store";

interface ContextoModalProps {
  state: ContextoTaskState;
  onClose: () => void;
}

export function ContextoModal({ state, onClose }: ContextoModalProps) {
  const [guessInput, setGuessInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const submitGuess = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (state.solved) return;
    const word = guessInput.trim().toUpperCase();
    if (!word) return;

    if (state.guesses.some((g) => g.word === word)) {
      setFeedback("Você já tentou essa palavra!");
      return;
    }

    setFeedback(null);
    net.send({ t: "suspeitoTaskAction", contextoGuess: word });
    setGuessInput("");
  };

  useEffect(() => {
    if (state.solved) {
      const timer = setTimeout(() => onClose(), 1400);
      return () => clearTimeout(timer);
    }
  }, [state.solved, onClose]);

  return (
    <div className="suspeito-modal-backdrop">
      <div className="suspeito-task-card contexto-card">
        <div className="suspeito-task-header">
          <h3>Investigação CONTEXTO - Proximidade Semântica</h3>
          <button className="btn small close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="contexto-hint-box">
          <span className="contexto-cat-badge">{state.category}</span>
          <p className="contexto-hint-text">{state.hint}</p>
        </div>

        {feedback && <div className="suspeito-error">{feedback}</div>}
        {state.solved && <div className="suspeito-success">🎉 Palavra secreta encontrada! Tarefa concluída!</div>}

        <form className="contexto-form" onSubmit={submitGuess}>
          <input
            className="field"
            placeholder="Digite uma palavra relacionada..."
            value={guessInput}
            maxLength={24}
            disabled={state.solved}
            onChange={(e) => setGuessInput(e.target.value.toUpperCase())}
            autoFocus
          />
          <button className="btn primary" type="submit" disabled={!guessInput.trim() || state.solved}>
            Testar
          </button>
        </form>

        <div className="contexto-stats-row">
          <span>Tentativas: {state.guesses.length}</span>
          {state.bestDistance < 9999 && (
            <span className="contexto-best">
              Melhor aproximação: <strong>#{state.bestDistance}</strong>
            </span>
          )}
        </div>

        <div className="contexto-history">
          {state.guesses.map((g, idx) => {
            const barWidth = Math.max(8, Math.min(100, Math.round(100 - (g.distance / 500) * 100)));
            return (
              <div key={idx} className={`contexto-guess-row temp-${g.temperature}`}>
                <div className="contexto-guess-word">{g.word}</div>
                <div className="contexto-bar-container">
                  <div className={`contexto-bar temp-${g.temperature}`} style={{ width: `${barWidth}%` }} />
                </div>
                <div className="contexto-guess-rank">#{g.distance}</div>
              </div>
            );
          })}
          {state.guesses.length === 0 && (
            <p className="muted" style={{ textAlign: "center", margin: "20px 0" }}>
              Nenhuma tentativa ainda. Digite palavras associadas ao escritório!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
