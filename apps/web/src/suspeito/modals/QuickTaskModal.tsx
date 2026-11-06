import { useEffect } from "react";
import type { QuickTaskState } from "@ec/shared";
import { net } from "../../store";

interface QuickTaskModalProps {
  title: string;
  description: string;
  state: QuickTaskState;
  onClose: () => void;
}

export function QuickTaskModal({ title, description, state, onClose }: QuickTaskModalProps) {
  const advance = () => {
    if (state.completed) return;
    net.send({ t: "suspeitoTaskAction", quickAdvance: true });
  };

  useEffect(() => {
    if (state.completed) {
      const timer = setTimeout(() => onClose(), 1200);
      return () => clearTimeout(timer);
    }
  }, [state.completed, onClose]);

  const progressPercent = Math.round((state.step / state.totalSteps) * 100);

  return (
    <div className="suspeito-modal-backdrop">
      <div className="suspeito-task-card quick-card">
        <div className="suspeito-task-header">
          <h3>{title}</h3>
          <button className="btn small close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="suspeito-task-desc">{description}</p>

        {state.completed && <div className="suspeito-success">✅ Procedimento finalizado com sucesso!</div>}

        <div className="quick-progress-container">
          <div className="quick-progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          Etapa {state.step} de {state.totalSteps}
        </p>

        <div className="quick-action-area">
          <button className="btn primary big" onClick={advance} disabled={state.completed}>
            {state.completed ? "Concluído" : "Acionar próxima etapa (Clique)"}
          </button>
        </div>
      </div>
    </div>
  );
}
