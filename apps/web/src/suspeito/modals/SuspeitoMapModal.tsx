import { useEffect } from "react";
import {
  SECTORS,
  EMERGENCY_BUTTON_POS,
  type SuspeitoSnapshot,
  type SuspeitoTask,
  type SuspeitoSectorId,
} from "@ec/shared";

interface SuspeitoMapModalProps {
  myId: string;
  snap: SuspeitoSnapshot;
  myTasks: SuspeitoTask[];
  onClose: () => void;
}

export function SuspeitoMapModal({
  myId,
  snap,
  myTasks,
  onClose,
}: SuspeitoMapModalProps) {
  const mePlayer = snap.players.find((p) => p.id === myId);
  const playerPos = mePlayer?.pos ?? { x: -4, z: 0 };
  const playerYaw = mePlayer?.yaw ?? 0;
  const isDead = mePlayer ? !mePlayer.alive : false;

  // Fecha no ESC, TAB ou M
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab" || e.key.toLowerCase() === "m") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Ângulo do cone de visão do jogador no SVG (yaw do ThreeJS: 0 = sul/positivo Z, PI/2 = oeste)
  const angleDeg = (playerYaw * 180) / Math.PI;

  return (
    <div className="suspeito-modal-backdrop" onClick={onClose}>
      <div
        className="suspeito-map-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="map-modal-header">
          <div className="map-header-left">
            <span className="map-icon">🗺️</span>
            <div>
              <h2 className="map-modal-title">Planta do Escritório</h2>
              <span className="map-modal-subtitle">
                Localize os setores e suas estações de trabalho
              </span>
            </div>
          </div>
          <button className="map-modal-close-btn" onClick={onClose} title="Fechar [TAB / ESC]">
            ✕
          </button>
        </div>

        {/* Alerta de sabotagem se houver */}
        {snap.sabotage?.active && (
          <div className="map-sabotage-strip">
            <span className="sabotage-pulse-icon">⚠️</span>
            <span>
              <strong>ALERTA DE SABOTAGEM:</strong> {snap.sabotage.title} no setor{" "}
              <strong>{SECTORS[snap.sabotage.fixSector]?.name}</strong>!
            </span>
          </div>
        )}

        <div className="suspeito-map-viewport">
          <svg
            viewBox="-32 -24 64 48"
            className="suspeito-office-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <pattern id="gridPattern" width="4" height="4" patternUnits="userSpaceOnUse">
                <path d="M 4 0 L 0 0 0 4" fill="none" stroke="#233549" strokeWidth="0.1" />
              </pattern>
              {/* Filtro de brilho para os beacons */}
              <filter id="glowYellow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.6" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glowCyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.8" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.9" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Fundo escuro com grid técnico */}
            <rect x="-32" y="-24" width="64" height="48" fill="#0d1520" />
            <rect x="-32" y="-24" width="64" height="48" fill="url(#gridPattern)" />

            {/* Corredores principais (conectores) */}
            <rect x="-26" y="-19" width="52" height="38" fill="#141f2d" rx="2" stroke="#1f3347" strokeWidth="0.3" />
            <rect x="-5" y="-18" width="10" height="36" fill="#182738" />
            <rect x="-26" y="-3" width="52" height="6" fill="#182738" />

            {/* Renderiza as salas e setores */}
            {Object.values(SECTORS).map((sector) => {
              const sx = sector.x - sector.w / 2;
              const sz = sector.z - sector.d / 2;
              const isHere = mePlayer?.sector === sector.id;
              const isSabotaged = snap.sabotage?.active && snap.sabotage.fixSector === sector.id;

              return (
                <g key={sector.id} className="sector-group">
                  {/* Piso da sala */}
                  <rect
                    x={sx}
                    y={sz}
                    width={sector.w}
                    height={sector.d}
                    fill={isSabotaged ? "#3e1215" : isHere ? "#1b384f" : "#132130"}
                    stroke={isSabotaged ? "#ef4444" : isHere ? "#38bdf8" : sector.color}
                    strokeWidth={isHere || isSabotaged ? 0.6 : 0.35}
                    rx="1"
                    strokeDasharray={isSabotaged ? "1,0.5" : "none"}
                  />

                  {/* Nome da sala */}
                  <text
                    x={sector.x}
                    y={sector.z - sector.d / 2 + 2.2}
                    fill="#ffffff"
                    fontSize="1.6"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="map-room-title"
                  >
                    {sector.name.toUpperCase()}
                  </text>

                  {/* Indicador de você está aqui */}
                  {isHere && (
                    <text
                      x={sector.x}
                      y={sector.z + sector.d / 2 - 1.2}
                      fill="#38bdf8"
                      fontSize="1.1"
                      fontWeight="bold"
                      textAnchor="middle"
                      className="map-you-are-here"
                    >
                      ● VOCÊ ESTÁ AQUI
                    </text>
                  )}
                </g>
              );
            })}

            {/* Mesa de reuniões e Botão de Emergência Central */}
            <rect
              x={-7.5}
              y={-1.8}
              width={7}
              height={3.6}
              fill="#2b1d16"
              stroke="#5d4037"
              strokeWidth="0.3"
              rx="0.8"
            />
            <circle
              cx={EMERGENCY_BUTTON_POS.x}
              cy={EMERGENCY_BUTTON_POS.z}
              r="0.9"
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth="0.2"
              filter="url(#glowRed)"
            />
            <text
              x={EMERGENCY_BUTTON_POS.x}
              y={EMERGENCY_BUTTON_POS.z + 0.35}
              fill="#ffffff"
              fontSize="0.8"
              fontWeight="bold"
              textAnchor="middle"
            >
              🚨
            </text>

            {/* Ponto de Sabotagem Ativa com pulso */}
            {snap.sabotage?.active && (
              <g
                transform={`translate(${snap.sabotage.fixPos.x}, ${snap.sabotage.fixPos.z})`}
                filter="url(#glowRed)"
              >
                <circle r="1.8" fill="#ef4444" opacity="0.35" className="map-beacon-pulse" />
                <circle r="1.0" fill="#dc2626" stroke="#ffffff" strokeWidth="0.2" />
                <text x="0" y="0.45" fill="#ffffff" fontSize="1.1" fontWeight="bold" textAnchor="middle">
                  ⚠️
                </text>
              </g>
            )}

            {/* Marcadores de Tarefas Pendentes do Jogador (! Amarelo) */}
            {myTasks
              .filter((t) => !t.completed)
              .map((t) => (
                <g
                  key={t.id}
                  transform={`translate(${t.pos.x}, ${t.pos.z})`}
                  filter="url(#glowYellow)"
                  className="map-task-beacon"
                >
                  <circle r="1.5" fill="#facc15" opacity="0.4" className="map-beacon-pulse" />
                  <circle r="0.9" fill="#eab308" stroke="#ffffff" strokeWidth="0.2" />
                  <text
                    x="0"
                    y="0.45"
                    fill="#1e1e1e"
                    fontSize="1.1"
                    fontWeight="900"
                    textAnchor="middle"
                  >
                    !
                  </text>
                </g>
              ))}

            {/* Posição e Cone de Visão do Jogador Local */}
            {!isDead && (
              <g
                transform={`translate(${playerPos.x}, ${playerPos.z}) rotate(${angleDeg})`}
                filter="url(#glowCyan)"
              >
                {/* Cone direcional de visão */}
                <polygon
                  points="0,0 -2,3.5 2,3.5"
                  fill="#38bdf8"
                  opacity="0.3"
                />
                {/* Marcador do corpo */}
                <circle r="0.8" fill="#0284c7" stroke="#ffffff" strokeWidth="0.25" />
                <circle r="0.4" fill="#38bdf8" />
                {/* Nariz / seta frontal */}
                <polygon points="0,1.1 -0.3,0.7 0.3,0.7" fill="#ffffff" />
              </g>
            )}
          </svg>
        </div>

        {/* Legenda do Mapa */}
        <div className="map-legend-bar">
          <div className="legend-item">
            <span className="legend-dot task-dot">!</span>
            <span>Sua Tarefa Pendente</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot player-dot">●</span>
            <span>Você</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot emergency-dot">🚨</span>
            <span>Botão de Emergência (Reunião)</span>
          </div>
          {snap.sabotage?.active && (
            <div className="legend-item active-alert">
              <span className="legend-dot sabotage-dot">⚠️</span>
              <span>Sabotagem Ativa</span>
            </div>
          )}
          <div className="legend-shortcut">
            Atalho: Pressione <strong>[TAB]</strong> ou <strong>[M]</strong> para abrir/fechar
          </div>
        </div>
      </div>
    </div>
  );
}
