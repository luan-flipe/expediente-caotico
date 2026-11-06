import { useEffect, useState } from "react";
import type { ConexoTaskState } from "@ec/shared";
import { net } from "../../store";

interface ConexoModalProps {
  state: ConexoTaskState;
  onClose: () => void;
}

export function ConexoModal({ state, onClose }: ConexoModalProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleWord = (word: string) => {
    if (state.solved || state.failed) return;
    setFeedback(null);

    setSelectedWords((prev) => {
      if (prev.includes(word)) {
        return prev.filter((w) => w !== word);
      }
      if (prev.length >= 4) return prev;
      return [...prev, word];
    });
  };

  const submitGroup = () => {
    if (selectedWords.length !== 4) {
      setFeedback("Selecione exatamente 4 palavras!");
      return;
    }
    net.send({ t: "suspeitoTaskAction", conexoWords: selectedWords });
    setSelectedWords([]);
  };

  const deselectAll = () => setSelectedWords([]);

  // Dica de "Por um triz"
  useEffect(() => {
    if (state.oneAway) {
      setFeedback("Por um triz! Faltou apenas 1 palavra correta!");
    }
  }, [state.oneAway, state.mistakesRemaining]);

  // Auto-close on solve
  useEffect(() => {
    if (state.solved) {
      const timer = setTimeout(() => onClose(), 1400);
      return () => clearTimeout(timer);
    }
  }, [state.solved, onClose]);

  return (
    <div className="suspeito-modal-backdrop">
      <div className="suspeito-task-card conexo-card">
        <div className="suspeito-task-header">
          <h3>Mural CONEXO - Agrupamento de Conceitos</h3>
          <button className="btn small close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="suspeito-task-desc">
          Selecione 4 palavras que compartilham a mesma categoria corporativa.
        </p>

        {feedback && <div className="suspeito-error">{feedback}</div>}
        {state.solved && <div className="suspeito-success">🎉 Todos os 4 grupos encontrados! Tarefa concluída!</div>}
        {state.failed && <div className="suspeito-error">Você cometeu 4 erros. Tente novamente!</div>}

        {/* Grupos já resolvidos */}
        {state.solvedGroups.length > 0 && (
          <div className="conexo-solved-list">
            {state.solvedGroups.map((g, idx) => (
              <div key={idx} className={`conexo-solved-group group-color-${idx}`}>
                <strong>{g.title}</strong>
                <span>{g.words.join(", ")}</span>
              </div>
            ))}
          </div>
        )}

        {/* Grade de palavras ativas */}
        {state.allWords.length > 0 && (
          <div className="conexo-grid">
            {state.allWords.map((word) => {
              const isSelected = selectedWords.includes(word);
              return (
                <button
                  key={word}
                  className={`conexo-word-btn ${isSelected ? "selected" : ""}`}
                  onClick={() => toggleWord(word)}
                >
                  {word}
                </button>
              );
            })}
          </div>
        )}

        {/* Rodapé com tentativas restantes e botões */}
        <div className="conexo-footer">
          <div className="conexo-mistakes">
            <span className="muted">Erros restantes:</span>
            <div className="mistake-dots">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`dot ${i < state.mistakesRemaining ? "active" : "used"}`}
                />
              ))}
            </div>
          </div>

          <div className="conexo-actions">
            <button className="btn small" onClick={deselectAll} disabled={selectedWords.length === 0}>
              Desmarcar
            </button>
            <button
              className="btn primary"
              onClick={submitGroup}
              disabled={selectedWords.length !== 4 || state.solved || state.failed}
            >
              Enviar grupo ({selectedWords.length}/4)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
