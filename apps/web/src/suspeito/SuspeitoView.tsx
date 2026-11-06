import { useEffect, useRef, useState } from "react";
import { net, useStore } from "../store";
import { SuspeitoEngine } from "./suspeitoEngine";
import { SuspeitoHud } from "./SuspeitoHud";
import { MeetingOverlay } from "./modals/MeetingOverlay";
import { TermoModal } from "./modals/TermoModal";
import { ConexoModal } from "./modals/ConexoModal";
import { ContextoModal } from "./modals/ContextoModal";
import { QuickTaskModal } from "./modals/QuickTaskModal";
import { SabotageModal } from "./modals/SabotageModal";

export function SuspeitoView({ myId }: { myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SuspeitoEngine | null>(null);

  const players = useStore((s) => s.lobby?.players);
  const ssnap = useStore((s) => s.ssnap);
  const sme = useStore((s) => s.sme);

  const [sabotageOpen, setSabotageOpen] = useState(false);
  const [activeTaskModalId, setActiveTaskModalId] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new SuspeitoEngine(canvasRef.current, myId);
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

  // Se entrar em reunião, fecha modais de tarefas e sabotagem
  useEffect(() => {
    if (ssnap?.phase === "meeting" || ssnap?.phase === "voting" || ssnap?.phase === "vote_result") {
      setActiveTaskModalId(null);
      setSabotageOpen(false);
    }
  }, [ssnap?.phase]);

  const handleOpenTask = (taskId: string) => {
    setActiveTaskModalId(taskId);
    net.send({ t: "suspeitoStartTask", taskId });
  };

  const currentTask = sme?.tasks.find((t) => t.id === (activeTaskModalId ?? sme.activeTaskId));

  return (
    <div className="suspeito-game-view">
      <canvas ref={canvasRef} className="suspeito-canvas" />

      {ssnap && (
        <SuspeitoHud
          myId={myId}
          snap={ssnap}
          me={sme}
          onOpenSabotage={() => setSabotageOpen(true)}
          onOpenTask={handleOpenTask}
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

      {/* Painel do Sabotador */}
      {sabotageOpen && sme && (
        <SabotageModal
          cooldownMs={sme.sabotageCooldownMs}
          activeSabotage={!!ssnap?.sabotage?.active}
          onClose={() => setSabotageOpen(false)}
        />
      )}

      {/* Modais de Tarefas e Minijogos */}
      {activeTaskModalId && sme?.activeTaskState && (
        <>
          {sme.activeTaskState.type === "termo" && (
            <TermoModal
              state={sme.activeTaskState.state}
              onClose={() => setActiveTaskModalId(null)}
            />
          )}

          {sme.activeTaskState.type === "conexo" && (
            <ConexoModal
              state={sme.activeTaskState.state}
              onClose={() => setActiveTaskModalId(null)}
            />
          )}

          {sme.activeTaskState.type === "contexto" && (
            <ContextoModal
              state={sme.activeTaskState.state}
              onClose={() => setActiveTaskModalId(null)}
            />
          )}

          {sme.activeTaskState.type === "quick" && currentTask && (
            <QuickTaskModal
              title={currentTask.name}
              description={currentTask.description}
              state={sme.activeTaskState.state}
              onClose={() => setActiveTaskModalId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
