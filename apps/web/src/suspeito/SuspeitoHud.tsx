import { useState } from "react";
import type {
  SuspeitoPrivate,
  SuspeitoRole,
  SuspeitoSabotageState,
  SuspeitoSnapshot,
} from "@ec/shared";
import { SECTORS } from "@ec/shared";
import { net } from "../store";

interface SuspeitoHudProps {
  myId: string;
  snap: SuspeitoSnapshot;
  me: SuspeitoPrivate | null;
  onOpenSabotage: () => void;
  onOpenTask: (taskId: string) => void;
}

export function SuspeitoHud({
  myId,
  snap,
  me,
  onOpenSabotage,
  onOpenTask,
}: SuspeitoHudProps) {
  const [tasksOpen, setTasksOpen] = useState(true);

  if (!me) return null;

  const currentSectorInfo = SECTORS[snap.players.find((p) => p.id === myId)?.sector ?? "reuniao"];
  const isSabotador = me.role === "sabotador";
  const killCooldownSec = Math.ceil(me.killCooldownMs / 1000);
  const taskProgressPercent = Math.round(snap.taskProgress * 100);

  // Ação primária de interação
  const handleInteract = () => {
    if (!me.nearbyInteractable) return;
    const { kind, id } = me.nearbyInteractable;

    if (kind === "task") {
      net.send({ t: "suspeitoStartTask", taskId: id });
      onOpenTask(id);
    } else if (kind === "emergency") {
      net.send({ t: "suspeitoEmergency" });
    } else if (kind === "sabotage") {
      net.send({ t: "suspeitoFixSabotage" });
    } else if (kind === "body") {
      net.send({ t: "suspeitoReport", bodyId: id });
    }
  };

  const handleKill = () => {
    if (!me.canKill || !me.killTargetId) return;
    net.send({ t: "suspeitoKill", targetId: me.killTargetId });
  };

  const handleReport = () => {
    if (!me.canReport || !me.reportTargetBodyId) return;
    net.send({ t: "suspeitoReport", bodyId: me.reportTargetBodyId });
  };

  return (
    <div className="suspeito-hud-layer">
      {/* Tela de introdução com função secreta */}
      {snap.phase === "intro" && (
        <div className="suspeito-intro-splash">
          <div className={`suspeito-intro-card ${isSabotador ? "sabotador" : "colaborador"}`}>
            <span className="intro-role-subtitle">Sua função secreta</span>
            <h1 className="intro-role-title">
              {isSabotador ? "🔪 SABOTADOR" : "💼 COLABORADOR"}
            </h1>
            <p className="intro-role-desc">
              {isSabotador
                ? "Finja trabalhar, cause panes nos sistemas e elimine os colaboradores sem ser descoberto!"
                : "Realize suas tarefas de palavras (TERMO, CONEXO, CONTEXTO) e descubra os sabotadores infiltrados!"}
            </p>
          </div>
        </div>
      )}

      {/* Barra superior de progresso e setor */}
      <div className="suspeito-top-bar">
        <div className="suspeito-task-progress-box">
          <div className="task-progress-label">
            <span>Expediente Coletivo</span>
            <span>{taskProgressPercent}%</span>
          </div>
          <div className="task-progress-track">
            <div className="task-progress-fill" style={{ width: `${taskProgressPercent}%` }} />
          </div>
        </div>

        <div className="suspeito-sector-badge" style={{ borderColor: currentSectorInfo?.color }}>
          <span className="sector-dot" style={{ background: currentSectorInfo?.color }} />
          <span>{currentSectorInfo?.name ?? "Escritório"}</span>
        </div>

        <div className={`suspeito-role-pill ${isSabotador ? "sabotador" : "colaborador"}`}>
          {isSabotador ? "SABOTADOR" : "COLABORADOR"}
        </div>
      </div>

      {/* Alerta de sabotagem ativa */}
      {snap.sabotage?.active && (
        <div className={`suspeito-sabotage-banner ${snap.sabotage.critical ? "critical" : ""}`}>
          <div className="sabotage-alert-icon">⚠️</div>
          <div className="sabotage-alert-text">
            <strong>{snap.sabotage.title}</strong>
            <p>
              Conserte no setor <strong>{SECTORS[snap.sabotage.fixSector]?.name}</strong>!
              {snap.sabotage.critical && (
                <span className="sabotage-timer">
                  Tempo restante: {Math.ceil(snap.sabotage.remainingMs / 1000)}s
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Lista de tarefas lateral */}
      <div className={`suspeito-task-drawer ${tasksOpen ? "open" : "collapsed"}`}>
        <div className="task-drawer-header" onClick={() => setTasksOpen(!tasksOpen)}>
          <span>📋 Minhas Tarefas ({me.tasks.filter((t) => t.completed).length}/{me.tasks.length})</span>
          <button className="toggle-btn">{tasksOpen ? "▼" : "▲"}</button>
        </div>
        {tasksOpen && (
          <div className="task-drawer-content">
            {me.tasks.map((t) => (
              <div
                key={t.id}
                className={`task-drawer-item ${t.completed ? "done" : ""}`}
                onClick={() => !t.completed && onOpenTask(t.id)}
              >
                <span className="task-check">{t.completed ? "✓" : "○"}</span>
                <div className="task-item-info">
                  <span className="task-item-name">{t.name}</span>
                  <span className="task-item-sector">{SECTORS[t.sector]?.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botões de Ação na parte inferior */}
      <div className="suspeito-action-bar">
        {/* Botão de Reportar */}
        <button
          className="suspeito-action-btn report"
          disabled={!me.canReport}
          onClick={handleReport}
          title="Reportar ocorrência (R)"
        >
          <div className="btn-icon">🚨</div>
          <span>Reportar</span>
        </button>

        {/* Botões específicos do Sabotador */}
        {isSabotador && (
          <>
            <button
              className="suspeito-action-btn sabotage"
              onClick={onOpenSabotage}
              title="Abrir painel de sabotagem (F)"
            >
              <div className="btn-icon">⚡</div>
              <span>Sabotar</span>
            </button>

            <button
              className="suspeito-action-btn kill"
              disabled={!me.canKill}
              onClick={handleKill}
              title="Eliminar colaborador próximo (Q)"
            >
              <div className="btn-icon">🔪</div>
              <span>{killCooldownSec > 0 ? `${killCooldownSec}s` : "Eliminar"}</span>
            </button>
          </>
        )}

        {/* Botão de Interação Contextual (tarefas, conserto, botão de reunião) */}
        <button
          className={`suspeito-action-btn interact ${me.nearbyInteractable ? "active" : ""}`}
          disabled={!me.nearbyInteractable}
          onClick={handleInteract}
          title="Interagir com estação (E ou Espaço)"
        >
          <div className="btn-icon">✋</div>
          <span>{me.nearbyInteractable ? me.nearbyInteractable.label : "Usar"}</span>
        </button>
      </div>
    </div>
  );
}
