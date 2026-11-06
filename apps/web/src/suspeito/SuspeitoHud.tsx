import { useEffect, useRef, useState } from "react";
import type { SuspeitoPrivate, SuspeitoSnapshot, Vec2 } from "@ec/shared";
import { SECTORS } from "@ec/shared";
import { net } from "../store";
import { IS_TOUCH } from "../touch";
import { playKillSound } from "./suspeitoSound";

interface SuspeitoHudProps {
  myId: string;
  snap: SuspeitoSnapshot;
  me: SuspeitoPrivate | null;
  onOpenSabotage: () => void;
  onOpenTask: (taskId: string) => void;
  inputLocked: boolean;
  onToggleMap: () => void;
  onTouchMove?: (mx: number, mz: number) => void;
}

function compassArrow(from: Vec2, to: Vec2): { arrow: string; dist: number; angleDeg: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.round(Math.hypot(dx, dz));
  const angleDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
  const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  const idx = Math.round(((angleDeg + 360) % 360) / 45) % 8;
  return { arrow: arrows[idx], dist, angleDeg };
}

export function SuspeitoHud({
  myId,
  snap,
  me,
  onOpenSabotage,
  onOpenTask,
  inputLocked,
  onToggleMap,
  onTouchMove,
}: SuspeitoHudProps) {
  const [tasksOpen, setTasksOpen] = useState(true);
  const [taskHint, setTaskHint] = useState<string | null>(null);
  const [trackedTaskId, setTrackedTaskId] = useState<string | null>(null);
  const [killFlash, setKillFlash] = useState(false);
  const [stickPos, setStickPos] = useState<{ x: number; y: number } | null>(null);
  const stickOriginRef = useRef<{ x: number; y: number } | null>(null);
  const prevAliveRef = useRef<boolean>(true);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});

  // Suporte a atalhos de teclado (E/Espaço = Usar, Q = Eliminar, R = Reportar, F = Sabotar, TAB/M = Mapa)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mePublic = snap.players.find((p) => p.id === myId);
  const isAlive = mePublic ? mePublic.alive : true;

  // Se o próprio jogador for eliminado, toca impacto e pisca a tela em vermelho
  useEffect(() => {
    if (prevAliveRef.current && !isAlive && snap.phase === "working") {
      playKillSound();
      setKillFlash(true);
      const t = setTimeout(() => setKillFlash(false), 650);
      prevAliveRef.current = isAlive;
      return () => clearTimeout(t);
    }
    prevAliveRef.current = isAlive;
  }, [isAlive, snap.phase]);

  if (!me) {
    keyHandler.current = () => {};
    return null;
  }

  const myPos = mePublic?.pos ?? { x: -4, z: 0 };
  const currentSectorInfo = SECTORS[mePublic?.sector ?? "reuniao"];
  const isSabotador = me.role === "sabotador";
  const isGhost = !isAlive;
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
    playKillSound();
    setKillFlash(true);
    setTimeout(() => setKillFlash(false), 500);
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
    if (e.key === "Tab" || k === "m") {
      e.preventDefault();
      onToggleMap();
    } else if (k === "e" || e.code === "Space") {
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

  // Bússola direcional para sabotagem ativa ou tarefa rastreada / mais próxima
  const pendingTasks = me.tasks.filter((t) => !t.completed);
  const trackedTask =
    pendingTasks.find((t) => t.id === trackedTaskId) ??
    pendingTasks.reduce<(typeof pendingTasks)[number] | null>((best, cur) => {
      if (!best) return cur;
      const dCur = Math.hypot(cur.pos.x - myPos.x, cur.pos.z - myPos.z);
      const dBest = Math.hypot(best.pos.x - myPos.x, best.pos.z - myPos.z);
      return dCur < dBest ? cur : best;
    }, null);

  const sabotageNav =
    snap.sabotage?.active && working
      ? {
          label: `⚠️ Consertar: ${SECTORS[snap.sabotage.fixSector]?.name}`,
          ...compassArrow(myPos, snap.sabotage.fixPos),
          critical: true,
        }
      : trackedTask && working
      ? {
          label: `📍 ${trackedTask.name} (${SECTORS[trackedTask.sector]?.name})`,
          ...compassArrow(myPos, trackedTask.pos),
          critical: false,
        }
      : null;

  // Controles de joystick virtual para telas sensíveis ao toque
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (inputLocked || !working) return;
    const t = e.touches[0];
    if (!t) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    stickOriginRef.current = { x: cx, y: cy };
    const dx = Math.max(-44, Math.min(44, t.clientX - cx));
    const dy = Math.max(-44, Math.min(44, t.clientY - cy));
    setStickPos({ x: dx, y: dy });
    onTouchMove?.(dx / 44, dy / 44);
  };

  const handleTouchMoveEvent = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!stickOriginRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = Math.max(-44, Math.min(44, t.clientX - stickOriginRef.current.x));
    const dy = Math.max(-44, Math.min(44, t.clientY - stickOriginRef.current.y));
    setStickPos({ x: dx, y: dy });
    onTouchMove?.(dx / 44, dy / 44);
  };

  const handleTouchEnd = () => {
    stickOriginRef.current = null;
    setStickPos(null);
    onTouchMove?.(0, 0);
  };

  return (
    <div className="suspeito-hud-layer">
      {/* Flash vermelho de eliminação */}
      {killFlash && <div className="suspeito-kill-flash-overlay" />}

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
            {allies.length > 0 && (
              <div className="intro-allies-pill">
                🤝 Parceiro(s) infiltrado(s): <strong>{allies.map((a) => a.name).join(", ")}</strong>
              </div>
            )}
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

        <button
          className="suspeito-map-btn-top"
          onClick={onToggleMap}
          title="Abrir mapa do escritório com setores e tarefas (TAB ou M)"
        >
          <span className="btn-icon">🗺️</span>
          <span>Mapa [TAB]</span>
        </button>
      </div>

      {/* Bússola direcional rápida para guiar o jogador sem precisar abrir o mapa o tempo todo */}
      {sabotageNav && (
        <div
          className={`suspeito-compass-pill ${sabotageNav.critical ? "critical" : ""}`}
          onClick={onToggleMap}
          title="Clique para abrir a planta do escritório"
        >
          <span className="compass-arrow">{sabotageNav.arrow}</span>
          <span className="compass-label">{sabotageNav.label}</span>
          <span className="compass-dist">{sabotageNav.dist}m</span>
        </div>
      )}

      {isGhost && working && (
        <div className="suspeito-ghost-banner">
          👻 Você foi eliminado.{" "}
          {isSabotador
            ? "Ainda pode sabotar o escritório, mas não pode eliminar ninguém."
            : "Atravesse paredes e termine suas tarefas para ajudar a equipe!"}
        </div>
      )}

      {/* Aviso de orientação para tarefas */}
      {taskHint && (
        <div className="suspeito-task-hint-toast" onClick={onToggleMap}>
          <span>{taskHint}</span>
          <button
            className="toast-map-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMap();
            }}
          >
            Ver no Mapa
          </button>
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
              const isTracked = trackedTask?.id === t.id && !t.completed;
              const nav = compassArrow(myPos, t.pos);
              return (
                <div
                  key={t.id}
                  className={`task-drawer-item ${t.completed ? "done" : ""} ${isHere ? "here" : ""} ${isTracked ? "tracked" : ""}`}
                  onClick={() => {
                    if (isHere) {
                      handleInteract();
                    } else if (!t.completed) {
                      setTrackedTaskId(t.id);
                      setTaskHint(`Bússola apontando para [${SECTORS[t.sector]?.name}] — ${t.name} (${nav.dist}m)`);
                      setTimeout(() => setTaskHint(null), 4000);
                    }
                  }}
                  title={
                    isHere
                      ? "Você está nesta estação! Clique para abrir (ou pressione E)"
                      : `Clique para rastrear na bússola até ${SECTORS[t.sector]?.name}`
                  }
                >
                  <span className="task-check">{t.completed ? "✓" : isHere ? "👉" : nav.arrow}</span>
                  <div className="task-item-info">
                    <span className="task-item-name">{t.name}</span>
                    <span className="task-item-sector">
                      {SECTORS[t.sector]?.name}
                      {!t.completed && !isHere && <span className="task-dist-tag"> • {nav.dist}m</span>}
                      {isHere && <strong className="here-tag"> (VOCÊ ESTÁ AQUI)</strong>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Joystick Virtual de Toque (Dispositivos Móveis / Tablets) */}
      {IS_TOUCH && working && !inputLocked && (
        <div
          className="suspeito-touch-joystick"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMoveEvent}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div
            className="suspeito-touch-knob"
            style={{
              transform: stickPos ? `translate(${stickPos.x}px, ${stickPos.y}px)` : "translate(0, 0)",
            }}
          />
        </div>
      )}

      {/* Barra de Ações Inferior com Botões Grandes e Intuitivos */}
      <div className="suspeito-action-bar">
        {/* Botão de Mapa */}
        <button
          className="suspeito-action-btn map"
          onClick={onToggleMap}
          title="Abrir planta do escritório e setores (TAB ou M)"
        >
          <div className="btn-icon">🗺️</div>
          <span className="btn-label">Mapa</span>
          <span className="btn-shortcut">[TAB]</span>
        </button>

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
