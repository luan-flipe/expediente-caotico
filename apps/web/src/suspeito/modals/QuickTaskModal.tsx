import { useEffect } from "react";
import type { QuickTaskState } from "@ec/shared";
import { net } from "../../store";
import { playTaskCompleteSound, playTaskStepSound } from "../suspeitoSound";

interface QuickTaskModalProps {
  title: string;
  description: string;
  state: QuickTaskState;
  onClose: () => void;
}

interface QuickThemeStep {
  icon: string;
  label: string;
  actionText: string;
}

function getQuickTaskTheme(title: string, totalSteps: number): {
  badge: string;
  steps: QuickThemeStep[];
} {
  const lower = title.toLowerCase();
  if (lower.includes("café") || lower.includes("copa")) {
    return {
      badge: "☕ COPA & CAFÉ",
      steps: [
        { icon: "🫘", label: "Filtro e Pó Torrado", actionText: "Adicionar Pó no Filtro" },
        { icon: "💧", label: "Reservatório Térmico", actionText: "Abastecer Água Filtrada" },
        { icon: "🔥", label: "Extração Expresso", actionText: "Ligar Cafeteira Industrial" },
      ].slice(0, totalSteps),
    };
  }
  if (lower.includes("papel") || lower.includes("bandeja")) {
    return {
      badge: "🖨️ IMPRESSÃO",
      steps: [
        { icon: "📂", label: "Gaveta A4 Inferior", actionText: "Abrir Gaveta e Destravar Guia" },
        { icon: "📄", label: "Resma 500 Folhas", actionText: "Inserir e Alinhar Folhas A4" },
        { icon: "✅", label: "Calibração de Rolo", actionText: "Fechar Bandeja e Testar Puxada" },
      ].slice(0, totalSteps),
    };
  }
  if (lower.includes("crachá") || lower.includes("visitante")) {
    return {
      badge: "🪪 RECEPÇÃO",
      steps: [
        { icon: "📸", label: "Captura de Foto", actionText: "Fotografar Visitante na Webcam" },
        { icon: "🔏", label: "Permissão de Acesso", actionText: "Gravar Chip RFID Provisório" },
        { icon: "🖨️", label: "Emissão de Crachá", actionText: "Imprimir e Liberar Catraca" },
      ].slice(0, totalSteps),
    };
  }
  if (lower.includes("pasta") || lower.includes("contrato") || lower.includes("arquivo")) {
    return {
      badge: "🗂️ ARQUIVO MORTO",
      steps: [
        { icon: "📑", label: "Triagem de Protocolos", actionText: "Carimbar Lote Fiscal" },
        { icon: "🗃️", label: "Ordem Alfabética", actionText: "Arquivar na Gaveta A-M" },
        { icon: "🔒", label: "Lacração de Auditoria", actionText: "Registrar Baixa no Livro" },
      ].slice(0, totalSteps),
    };
  }
  if (lower.includes("servidor") || lower.includes("disjuntor")) {
    return {
      badge: "🖥️ SERVIDORES",
      steps: [
        { icon: "⚡", label: "Barramento Primário", actionText: "Rearmar Disjuntor Rack A" },
        { icon: "❄️", label: "Refrigeração Auxiliar", actionText: "Ativar Ventoinhas de Emergência" },
        { icon: "🟢", label: "Serviços de Produção", actionText: "Reiniciar Daemon Principal" },
      ].slice(0, totalSteps),
    };
  }
  return {
    badge: "🔌 INFRAESTRUTURA",
    steps: [
      { icon: "🟦", label: "Porta WAN Principal", actionText: "Crimpar e Conectar UTP Azul" },
      { icon: "🟨", label: "Link de Redundância", actionText: "Engatar Patch Cord Amarelo" },
      { icon: "🟩", label: "Sincronismo Óptico", actionText: "Testar Sinal de Fibra (Ping OK)" },
    ].slice(0, totalSteps),
  };
}

export function QuickTaskModal({ title, description, state, onClose }: QuickTaskModalProps) {
  const theme = getQuickTaskTheme(title, state.totalSteps);

  const advance = () => {
    if (state.completed) return;
    playTaskStepSound(state.step);
    net.send({ t: "suspeitoTaskAction", quickAdvance: true });
  };

  useEffect(() => {
    if (state.completed) {
      playTaskCompleteSound();
      const timer = setTimeout(() => onClose(), 1200);
      return () => clearTimeout(timer);
    }
  }, [state.completed, onClose]);

  const progressPercent = Math.round((state.step / state.totalSteps) * 100);
  const currentStepInfo = theme.steps[state.step];

  return (
    <div className="suspeito-modal-backdrop">
      <div className="suspeito-task-card quick-card">
        <div className="suspeito-task-header">
          <div>
            <span className="quick-theme-badge">{theme.badge}</span>
            <h3>{title}</h3>
          </div>
          <button className="btn small close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="suspeito-task-desc">{description}</p>

        {state.completed && <div className="suspeito-success">✅ Procedimento finalizado com sucesso!</div>}

        {/* Painel visual interativo de etapas */}
        <div className="quick-interactive-steps">
          {theme.steps.map((st, idx) => {
            const isDone = idx < state.step || state.completed;
            const isCurrent = idx === state.step && !state.completed;
            return (
              <div
                key={idx}
                className={`quick-step-module ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
                onClick={() => {
                  if (isCurrent) advance();
                }}
              >
                <div className="quick-step-icon">{isDone ? "✓" : st.icon}</div>
                <div className="quick-step-info">
                  <span className="quick-step-num">ETAPA {idx + 1}</span>
                  <strong className="quick-step-label">{st.label}</strong>
                </div>
                <div className={`quick-step-led ${isDone ? "on" : isCurrent ? "blink" : ""}`} />
              </div>
            );
          })}
        </div>

        <div className="quick-progress-container">
          <div className="quick-progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="muted" style={{ textAlign: "center", margin: "6px 0 12px" }}>
          Etapa {state.step} de {state.totalSteps}
        </p>

        <div className="quick-action-area">
          <button className="btn primary big" onClick={advance} disabled={state.completed}>
            {state.completed
              ? "✓ Concluído"
              : currentStepInfo
              ? `⚡ ${currentStepInfo.actionText} (${state.step + 1}/${state.totalSteps})`
              : "Acionar próxima etapa (Clique)"}
          </button>
        </div>
      </div>
    </div>
  );
}
