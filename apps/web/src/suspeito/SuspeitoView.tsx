import { useCallback, useEffect, useRef, useState } from "react";
import { net, setState, useStore } from "../store";
import { SuspeitoEngine } from "./suspeitoEngine";
import { SuspeitoHud } from "./SuspeitoHud";
import { FpsCounter } from "./FpsCounter";
import { MeetingOverlay } from "./modals/MeetingOverlay";
import {
  KillCutsceneOverlay,
  type KillCutsceneData,
} from "./modals/KillCutsceneOverlay";
import { TermoModal } from "./modals/TermoModal";
import { ConexoModal } from "./modals/ConexoModal";
import { ContextoModal } from "./modals/ContextoModal";
import { QuickTaskModal } from "./modals/QuickTaskModal";
import { QteModal } from "./modals/QteModal";
import { SabotageModal } from "./modals/SabotageModal";
import { SuspeitoMapModal } from "./modals/SuspeitoMapModal";
import {
  playEliminationCutsceneSound,
  playReportAlarmSound,
  playRoleRevealSound,
  playSabotageBeepSound,
} from "./suspeitoSound";

export function SuspeitoView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visionRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SuspeitoEngine | null>(null);

  const players = useStore((s) => s.lobby?.players);
  const ssnap = useStore((s) => s.ssnap);
  const sme = useStore((s) => s.sme);

  const fpsSink = useRef<((fps: number) => void) | null>(null);
  const [sabotageOpen, setSabotageOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [activeTaskModalId, setActiveTaskModalId] = useState<string | null>(null);
  const [killCutscene, setKillCutscene] = useState<KillCutsceneData | null>(null);

  const prevPhaseRef = useRef<string | null>(null);
  const prevSabotageRef = useRef<boolean>(false);
  const playedIntroRef = useRef<boolean>(false);
  const prevAliveRef = useRef<boolean>(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new SuspeitoEngine(canvasRef.current, myId);
    engine.onFpsUpdate = (val) => fpsSink.current?.(val);
    engine.setVisionElement(visionRef.current);
    engineRef.current = engine;

    if (players) engine.setAvatars(players);
    if (ssnap) engine.applySnapshot(ssnap, sme);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [myId]);

  useEffect(() => {
    if (players) engineRef.current?.setAvatars(players);
  }, [players]);

  useEffect(() => {
    if (ssnap) engineRef.current?.applySnapshot(ssnap, sme);
  }, [ssnap, sme]);

  // Detecta quando o jogador local é eliminado no expediente e dispara a animação estilo Among Us
  useEffect(() => {
    if (!ssnap) return;
    const mePub = ssnap.players.find((p) => p.id === myId);
    if (!mePub) return;

    if (prevAliveRef.current && !mePub.alive && ssnap.phase === "working") {
      // Identifica o Sabotador que executou a eliminação (vindo de sme.killedBy ou jogador mais próximo)
      let killerName = sme?.killedBy?.name;
      let killerAvatar = sme?.killedBy?.avatar;

      if (!killerName || !killerAvatar) {
        let bestDist = Infinity;
        for (const other of ssnap.players) {
          if (other.id === myId || !other.alive) continue;
          const d = Math.hypot(other.pos.x - mePub.pos.x, other.pos.z - mePub.pos.z);
          if (d < bestDist) {
            bestDist = d;
            killerName = other.name;
            killerAvatar = other.avatar;
          }
        }
      }

      setActiveTaskModalId(null);
      setSabotageOpen(false);
      setMapOpen(false);
      playEliminationCutsceneSound();
      setKillCutscene({
        killerName: killerName ?? "Sabotador Misterioso",
        killerAvatar: killerAvatar ?? mePub.avatar,
        victimName: mePub.name,
        victimAvatar: mePub.avatar,
      });
    }

    prevAliveRef.current = mePub.alive;
  }, [ssnap, sme?.killedBy, myId]);

  // Efeitos sonoros de transição de fase e sabotagem
  useEffect(() => {
    if (!ssnap) return;
    if (ssnap.phase === "intro" && sme && !playedIntroRef.current) {
      playedIntroRef.current = true;
      playRoleRevealSound(sme.role === "sabotador");
    }
    if (ssnap.phase === "meeting" && prevPhaseRef.current !== "meeting") {
      playReportAlarmSound();
    }
    prevPhaseRef.current = ssnap.phase;

    const sabActive = !!ssnap.sabotage?.active;
    if (sabActive && !prevSabotageRef.current) {
      playSabotageBeepSound();
    }
    prevSabotageRef.current = sabActive;
  }, [ssnap?.phase, ssnap?.sabotage?.active, sme?.role]);

  // Se entrar em reunião, fecha modais de tarefas, mapa, sabotagem e cutscene
  useEffect(() => {
    if (
      ssnap?.phase === "meeting" ||
      ssnap?.phase === "voting" ||
      ssnap?.phase === "vote_result" ||
      ssnap?.phase === "over"
    ) {
      setActiveTaskModalId(null);
      setSabotageOpen(false);
      setMapOpen(false);
      setKillCutscene(null);
    }
  }, [ssnap?.phase]);

  // O modal só existe enquanto o servidor mantém o desafio dessa tarefa; se recusar ou encerrar, fecha
  const serverTaskId = sme?.activeTaskId ?? null;
  const seenOnServer = useRef(false);
  useEffect(() => {
    if (!activeTaskModalId) return;
    if (serverTaskId === activeTaskModalId) {
      seenOnServer.current = true;
      return;
    }
    if (seenOnServer.current) {
      setActiveTaskModalId(null);
      return;
    }
    const t = setTimeout(() => setActiveTaskModalId(null), 1000);
    return () => clearTimeout(t);
  }, [activeTaskModalId, serverTaskId]);

  const handleOpenTask = (taskId: string) => {
    seenOnServer.current = false;
    setActiveTaskModalId(taskId);
    net.send({ t: "suspeitoStartTask", taskId });
  };

  const closeTask = useCallback(() => setActiveTaskModalId(null), []);
  const closeSabotage = useCallback(() => setSabotageOpen(false), []);
  const toggleMap = useCallback(() => setMapOpen((p) => !p), []);
  const closeMap = useCallback(() => setMapOpen(false), []);
  const closeKillCutscene = useCallback(() => setKillCutscene(null), []);
  const handleTouchMove = useCallback((mx: number, mz: number) => {
    engineRef.current?.setTouchMove(mx, mz);
  }, []);

  const taskModalOpen =
    !!activeTaskModalId &&
    serverTaskId === activeTaskModalId &&
    !!sme?.activeTaskState;
  const isMeetingPhase =
    ssnap?.phase === "meeting" ||
    ssnap?.phase === "voting" ||
    ssnap?.phase === "vote_result";
  const inputLocked =
    taskModalOpen || sabotageOpen || isMeetingPhase || !!killCutscene;

  useEffect(() => {
    engineRef.current?.setInputLocked(inputLocked);
  }, [inputLocked]);

  useEffect(() => {
    if (!taskModalOpen) return;
    setState({ suspeitoTaskOpen: true, chatOpen: false });
    return () => setState({ suspeitoTaskOpen: false });
  }, [taskModalOpen]);

  useEffect(() => {
    if (!taskModalOpen && !sabotageOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setActiveTaskModalId(null);
      setSabotageOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskModalOpen, sabotageOpen]);

  const currentTask = sme?.tasks.find(
    (t) => t.id === (activeTaskModalId ?? sme.activeTaskId),
  );

  return (
    <div className="suspeito-game-view">
      <canvas ref={canvasRef} className="suspeito-canvas" />
      <canvas ref={visionRef} className="suspeito-vision-mask" />

      {/* Contador Discreto de FPS no canto superior direito */}
      <FpsCounter sink={fpsSink} />

      {ssnap && (
        <SuspeitoHud
          myId={myId}
          snap={ssnap}
          me={sme}
          onOpenSabotage={() => setSabotageOpen(true)}
          onOpenTask={handleOpenTask}
          inputLocked={inputLocked}
          onToggleMap={toggleMap}
          onTouchMove={handleTouchMove}
        />
      )}

      {/* Cutscene de Eliminação Estilo Among Us quando você é eliminado */}
      {killCutscene && (
        <KillCutsceneOverlay
          data={killCutscene}
          onClose={closeKillCutscene}
        />
      )}

      {/* Overlay de Reunião e Votação */}
      {ssnap &&
        (ssnap.phase === "meeting" ||
          ssnap.phase === "voting" ||
          ssnap.phase === "vote_result") &&
        ssnap.meeting && (
          <MeetingOverlay
            meeting={ssnap.meeting}
            players={ssnap.players}
            myId={myId}
            myVote={sme?.myVote ?? null}
            phaseRemainingMs={ssnap.phaseRemainingMs}
          />
        )}

      {/* Modal do Mapa de Setores e Tarefas */}
      {mapOpen && ssnap && sme && (
        <SuspeitoMapModal
          myId={myId}
          snap={ssnap}
          myTasks={sme.tasks}
          onClose={closeMap}
        />
      )}

      {/* Painel do Sabotador */}
      {sabotageOpen && sme && (
        <SabotageModal
          cooldownMs={sme.sabotageCooldownMs}
          activeSabotage={!!ssnap?.sabotage?.active}
          onClose={closeSabotage}
        />
      )}

      {/* Modais de Tarefas e Minijogos */}
      {taskModalOpen && sme?.activeTaskState && (
        <>
          {sme.activeTaskState.type === "termo" && (
            <TermoModal
              state={sme.activeTaskState.state}
              onClose={closeTask}
            />
          )}

          {sme.activeTaskState.type === "conexo" && (
            <ConexoModal
              state={sme.activeTaskState.state}
              onClose={closeTask}
            />
          )}

          {sme.activeTaskState.type === "contexto" && (
            <ContextoModal
              state={sme.activeTaskState.state}
              onClose={closeTask}
            />
          )}

          {sme.activeTaskState.type === "quick" && currentTask && (
            <QuickTaskModal
              title={currentTask.name}
              description={currentTask.description}
              state={sme.activeTaskState.state}
              onClose={closeTask}
            />
          )}

          {sme.activeTaskState.type === "qte" && currentTask && (
            <QteModal
              title={currentTask.name}
              state={sme.activeTaskState.state}
              onClose={closeTask}
            />
          )}
        </>
      )}
    </div>
  );
}
