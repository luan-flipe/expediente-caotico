import { useEffect, useRef, useState } from "react";
import type { SuspeitoPrivate, SuspeitoSnapshot } from "@ec/shared";
import { SECTORS } from "@ec/shared";
import { net } from "../store";

interface SuspeitoHudProps {
  myId: string;
  snap: SuspeitoSnapshot;
  me: SuspeitoPrivate | null;
  onOpenSabotage: () => void;
  onOpenTask: (taskId: string) => void;
  inputLocked: boolean;
}

export function SuspeitoHud({
  myId,
  snap,
  me,
  onOpenSabotage,
  onOpenTask,
  inputLocked,
}: SuspeitoHudProps) {
  const [tasksOpen, setTasksOpen] = useState(true);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});

  // Suporte a atalhos de teclado (E/Espaço = Usar, Q = Eliminar, R = Reportar, F = Sabotar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!me) {
    keyHandler.current = () => {};
    return null;
  }

  const mePublic = snap.players.find((p) => p.id === myId);
  const currentSectorInfo = SECTORS[mePublic?.sector ?? "reuniao"];
  const isSabotador = me.role === "sabotador";
  const isGhost = mePublic ? !mePublic.alive : false;
  const working = snap.phase === "working";
  const killCooldownSec = Math.ceil(me.killCooldownMs / 1000);
  const sabotageCooldownSec = Math.ceil(me.sabotageCooldownMs / 1000);
  const taskProgressPercent = Math.round(snap.taskProgress * 100);

  const targetPlayer = me.killTargetId ? snap.players.find((p) => p.id === me.killTargetId) : null;
  const allies = me.sabotadorTeammates
    ? snap.players.filter((p) => me.sabotadorTeammates?.includes(p.id))
    : [];

  // Ação primária de interação
  const handleInteract = () => {
    if (!me.nearbyInteractable || me.nearbyInteractable.blocked) return;
    const { kind, id } = me.nearbyInteractable;

    if (kind === "task") {
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

  keyHandler.current = (e: KeyboardEvent) => {
    if (e.repeat || inputLocked || !working) return;
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    const k = e.key.toLowerCase();
    if (k === "e" || e.code === "Space") {
      if (me.nearbyInteractable) {
        e.preventDefault();
        handleInteract();
      }
    } else if (k === "q" && isSabotador && me.canKill) {
      e.preventDefault();
      handleKill();
    } else if (k === "r" && me.canReport) {
      e.preventDefault();
      handleReport();
    } else if (k === "f" && isSabotador) {
      e.preventDefault();
      onOpenSabotage();
    }
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
          {isSabotador ? "🔪 SABOTADOR" : "💼 COLABORADOR"}
          {allies.length > 0 && (
            <span className="ally-tag" title={`Parceiro: ${allies.map((a) => a.name).join(", ")}`}>
              (Aliado: {allies[0].name})
            </span>
          )}
        </div>
      </div>

      {isGhost && working && (
        <div className="suspeito-ghost-banner">
          👻 Você foi eliminado.{" "}
          {isSabotador
            ? "Ainda pode sabotar o escritório, mas não pode eliminar ninguém."
            : "Atravesse paredes e termine suas tarefas para ajudar a equipe!"}
        </div>
      )}

      {/* Alerta de sabotagem ativa */}
      {snap.sabotage?.active && (
        <div className={`suspeito-sabotage-banner ${snap.sabotage.critical ? "critical" : ""}`}>
          <div className="sabotage-alert-icon">⚠️</div>
          <div className="sabotage-alert-text">
            <strong>{snap.sabotage.title}</strong>
            <p>
              {snap.sabotage.description} Siga o marcador vermelho até{" "}
              <strong>{SECTORS[snap.sabotage.fixSector]?.name}</strong>!
              {snap.sabotage.critical && (
                <span className="sabotage-timer">
                  Tempo restante: {Math.ceil(snap.sabotage.remainingMs / 1000)}s
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Prompts Flutuantes Centrais (Ação Imediata na Mira) */}
      <div className="suspeito-floating-prompts-container">
        {isSabotador && me.canKill && targetPlayer && (
          <div className="suspeito-floating-prompt kill-prompt" onClick={handleKill}>
            <span className="prompt-badge">Q</span>
            <span className="prompt-text">
              🔪 Eliminar <strong>{targetPlayer.name}</strong> ao alcance!
            </span>
          </div>
        )}

        {me.nearbyInteractable && !inputLocked && (
          <div
            className={`suspeito-floating-prompt interact-prompt ${me.nearbyInteractable.blocked ? "blocked" : ""}`}
            onClick={handleInteract}
          >
            <span className="prompt-badge">{me.nearbyInteractable.blocked ? "⛔" : "E"}</span>
            <span className="prompt-text">
              {me.nearbyInteractable.blocked ? "" : "✋ "}
              <strong>{me.nearbyInteractable.label}</strong>
              {me.nearbyInteractable.blocked ? "" : " (Toque ou Espaço)"}
            </span>
          </div>
        )}
      </div>

      {/* Lista de tarefas lateral */}
      <div className={`suspeito-task-drawer ${tasksOpen ? "open" : "collapsed"}`}>
        <div className="task-drawer-header" onClick={() => setTasksOpen(!tasksOpen)}>
          <div className="task-drawer-title-wrap">
            <span>
              {isSabotador
                ? `🎭 Tarefas Falsas (${me.tasks.filter((t) => t.completed).length}/${me.tasks.length})`
                : `📋 Minhas Tarefas (${me.tasks.filter((t) => t.completed).length}/${me.tasks.length})`}
            </span>
            {isSabotador && <small className="fake-task-hint">Finja trabalhar para despistar</small>}
          </div>
          <button className="toggle-btn">{tasksOpen ? "▼" : "▲"}</button>
        </div>

        {tasksOpen && (
          <div className="task-drawer-content">
            {me.tasks.map((t) => {
              const isHere = me.nearbyInteractable?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`task-drawer-item ${t.completed ? "done" : ""} ${isHere ? "here" : ""}`}
                  onClick={() => {
                    if (isHere) handleInteract();
                  }}
                  title={isHere ? "Você está nesta estação! Clique para abrir" : "Vá até o marcador amarelo deste setor"}
                >
                  <span className="task-check">{t.completed ? "✓" : isHere ? "👉" : "○"}</span>
                  <div className="task-item-info">
                    <span className="task-item-name">{t.name}</span>
                    <span className="task-item-sector">
                      {SECTORS[t.sector]?.name}
                      {isHere && <strong className="here-tag"> (VOCÊ ESTÁ AQUI)</strong>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de Ações Inferior com Botões Grandes e Intuitivos */}
      <div className="suspeito-action-bar">
        {/* Botão de Reportar */}
        {!isGhost && (
        <button
          className={`suspeito-action-btn report ${me.canReport ? "ready pulse" : ""}`}
          disabled={!me.canReport}
          onClick={handleReport}
          title="Reportar ocorrência de corpo (R)"
        >
          <div className="btn-icon">🚨</div>
          <span className="btn-label">Reportar</span>
          <span className="btn-shortcut">[R]</span>
        </button>
        )}

        {/* Botões específicos do Sabotador */}
        {isSabotador && (
          <>
            <button
              className={`suspeito-action-btn sabotage ${sabotageCooldownSec <= 0 ? "ready" : ""}`}
              onClick={onOpenSabotage}
              title="Abrir painel de sabotagem (F)"
            >
              <div className="btn-icon">⚡</div>
              <span className="btn-label">
                {sabotageCooldownSec > 0 ? `${sabotageCooldownSec}s` : "Sabotar"}
              </span>
              <span className="btn-shortcut">[F]</span>
            </button>

            {!isGhost && (
            <button
              className={`suspeito-action-btn kill ${me.canKill ? "ready pulse-kill" : ""}`}
              disabled={!me.canKill}
              onClick={handleKill}
              title={
                targetPlayer
                  ? `Eliminar ${targetPlayer.name} (Q)`
                  : killCooldownSec > 0
                  ? `Recarga: ${killCooldownSec}s`
                  : "Aproxime-se de um colaborador para eliminar (Q)"
              }
            >
              <div className="btn-icon">🔪</div>
              <span className="btn-label">
                {killCooldownSec > 0
                  ? `${killCooldownSec}s`
                  : targetPlayer
                  ? targetPlayer.name.slice(0, 8)
                  : "Eliminar"}
              </span>
              <span className="btn-shortcut">[Q]</span>
            </button>
            )}
          </>
        )}

        {/* Botão de Interação Contextual (tarefas, conserto, botão de reunião) */}
        <button
          className={`suspeito-action-btn interact ${me.nearbyInteractable && !me.nearbyInteractable.blocked ? "active pulse-gold" : ""}`}
          disabled={!me.nearbyInteractable || me.nearbyInteractable.blocked}
          onClick={handleInteract}
          title="Interagir com estação (E ou Espaço)"
        >
          <div className="btn-icon">{me.nearbyInteractable ? "⚙️" : "✋"}</div>
          <span className="btn-label">
            {me.nearbyInteractable ? me.nearbyInteractable.label.slice(0, 16) : "Usar"}
          </span>
          <span className="btn-shortcut">[E]</span>
        </button>
      </div>
    </div>
  );
}
