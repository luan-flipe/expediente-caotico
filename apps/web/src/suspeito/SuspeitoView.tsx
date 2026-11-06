import { useCallback, useEffect, useRef, useState } from "react";
import { net, useStore } from "../store";
import { SuspeitoEngine } from "./suspeitoEngine";
import { SuspeitoHud } from "./SuspeitoHud";
import { FpsCounter } from "./FpsCounter";
import { MeetingOverlay } from "./modals/MeetingOverlay";
import { TermoModal } from "./modals/TermoModal";
import { ConexoModal } from "./modals/ConexoModal";
import { ContextoModal } from "./modals/ContextoModal";
import { QuickTaskModal } from "./modals/QuickTaskModal";
import { QteModal } from "./modals/QteModal";
import { SabotageModal } from "./modals/SabotageModal";
import { SuspeitoMapModal } from "./modals/SuspeitoMapModal";

export function SuspeitoView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visionRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SuspeitoEngine | null>(null);

  const players = useStore((s) => s.lobby?.players);
  const ssnap = useStore((s) => s.ssnap);
  const sme = useStore((s) => s.sme);

  const [fps, setFps] = useState(60);
  const [sabotageOpen, setSabotageOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [activeTaskModalId, setActiveTaskModalId] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new SuspeitoEngine(canvasRef.current, myId);
    engine.onFpsUpdate = (val) => setFps(val);
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

  // Se entrar em reunião, fecha modais de tarefas, mapa e sabotagem
  useEffect(() => {
    if (ssnap?.phase === "meeting" || ssnap?.phase === "voting" || ssnap?.phase === "vote_result") {
      setActiveTaskModalId(null);
      setSabotageOpen(false);
      setMapOpen(false);
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

  const taskModalOpen = !!activeTaskModalId && serverTaskId === activeTaskModalId && !!sme?.activeTaskState;
  const isMeetingPhase = ssnap?.phase === "meeting" || ssnap?.phase === "voting" || ssnap?.phase === "vote_result";
  const inputLocked = taskModalOpen || sabotageOpen || isMeetingPhase;

  useEffect(() => {
    engineRef.current?.setInputLocked(inputLocked);
  }, [inputLocked]);

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

  const currentTask = sme?.tasks.find((t) => t.id === (activeTaskModalId ?? sme.activeTaskId));

  return (
    <div className="suspeito-game-view">
      <canvas ref={canvasRef} className="suspeito-canvas" />
      <div ref={visionRef} className="suspeito-vision-mask" />

      {/* Contador Discreto de FPS no canto superior direito */}
      <FpsCounter fps={fps} />

      {ssnap && (
        <SuspeitoHud
          myId={myId}
          snap={ssnap}
          me={sme}
          onOpenSabotage={() => setSabotageOpen(true)}
          onOpenTask={handleOpenTask}
          inputLocked={inputLocked}
          onToggleMap={toggleMap}
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
