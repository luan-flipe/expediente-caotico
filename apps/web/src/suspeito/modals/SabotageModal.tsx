import type { SuspeitoSabotageType } from "@ec/shared";
import { net } from "../../store";

interface SabotageModalProps {
  cooldownMs: number;
  activeSabotage: boolean;
  onClose: () => void;
}

export function SabotageModal({ cooldownMs, activeSabotage, onClose }: SabotageModalProps) {
  const trigger = (type: SuspeitoSabotageType) => {
    net.send({ t: "suspeitoSabotage", sabotageType: type });
    onClose();
  };

  const disabled = cooldownMs > 0 || activeSabotage;

  return (
    <div className="suspeito-modal-backdrop">
      <div className="suspeito-task-card sabotage-card">
        <div className="suspeito-task-header">
          <h3 style={{ color: "#d32f2f" }}>Painel de Sabotagem Corporativa</h3>
          <button className="btn small close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="suspeito-task-desc">
          Provoque incidentes para distrair os colaboradores, separar grupos ou vencer por pane crítica no sistema.
        </p>

        {disabled && (
          <div className="suspeito-error">
            {activeSabotage
              ? "Uma sabotagem já está em andamento no escritório!"
              : `Recarga de sabotagem: ${Math.ceil(cooldownMs / 1000)}s`}
          </div>
        )}

        <div className="sabotage-grid">
          <button
            className="sabotage-item-btn critical"
            disabled={disabled}
            onClick={() => trigger("vazamento_dados")}
          >
            <div className="sabotage-badge">CRÍTICA (35s)</div>
            <strong>⚠️ Vazamento de Dados</strong>
            <p>Inicia contador de vazamento na Sala de Servidores. Se não conterem a tempo, os sabotadores vencem!</p>
          </button>

          <button
            className="sabotage-item-btn"
            disabled={disabled}
            onClick={() => trigger("falha_energia")}
          >
            <div className="sabotage-badge neutral">DISTRAÇÃO</div>
            <strong>💡 Falha de Energia</strong>
            <p>Reduz a visibilidade no escritório e apaga as lâmpadas até os disjuntores da Infra serem ligados.</p>
          </button>

          <button
            className="sabotage-item-btn"
            disabled={disabled}
            onClick={() => trigger("queda_rede")}
          >
            <div className="sabotage-badge neutral">DISTRAÇÃO</div>
            <strong>🌐 Queda de Rede</strong>
            <p>Trava os sistemas digitais e bloqueia telas até os switches em Desenvolvimento serem reiniciados.</p>
          </button>

          <button
            className="sabotage-item-btn"
            disabled={disabled}
            onClick={() => trigger("impressora_travada")}
          >
            <div className="sabotage-badge neutral">DISTRAÇÃO</div>
            <strong>🖨️ Impressora Travada</strong>
            <p>Gera fila e atolamento de papel para atrair colaboradores até a sala de Impressão.</p>
          </button>
        </div>
      </div>
    </div>
  );
}
