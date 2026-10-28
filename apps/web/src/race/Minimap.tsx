import { useMemo } from "react";
import { TRACK, trackEdges, type RaceKartPublic } from "@ec/shared";

const PAD = 4;

/** Traçado da pista visto de cima, com um ponto por participante. */
export function Minimap({ karts, myId }: { karts: RaceKartPublic[]; myId: string }) {
  const { path, box } = useMemo(() => {
    const e = trackEdges(TRACK);
    const all = [...e.plus, ...e.minus];
    const minX = Math.min(...all.map((p) => p.x)) - PAD;
    const maxX = Math.max(...all.map((p) => p.x)) + PAD;
    const minZ = Math.min(...all.map((p) => p.z)) - PAD;
    const maxZ = Math.max(...all.map((p) => p.z)) + PAD;
    // x invertido: com a câmera atrás da cadeira, +x fica à esquerda da tela
    const d = TRACK.points.map((p, i) => `${i ? "L" : "M"}${(-p.x).toFixed(1)} ${(-p.z).toFixed(1)}`).join(" ") + "Z";
    return { path: d, box: `${-maxX} ${-maxZ} ${maxX - minX} ${maxZ - minZ}` };
  }, []);
  const start = TRACK.points[0];

  return (
    <svg className="minimap" viewBox={box}>
      <path d={path} fill="none" stroke="rgba(20,18,15,0.75)" strokeWidth={11} strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#e9e2d2" strokeWidth={7} strokeLinejoin="round" />
      <circle cx={-start.x} cy={-start.z} r={2.2} fill="#1d1b17" />
      {[...karts]
        .sort((a) => (a.id === myId ? 1 : -1))
        .map((k) => (
          <circle key={k.id} cx={-k.x} cy={-k.z} r={k.id === myId ? 3.4 : 2.4} fill={k.id === myId ? "#ffd23f" : k.isBot ? "#8e949b" : "#ff5a3d"} stroke="#1d1b17" strokeWidth={1} />
        ))}
    </svg>
  );
}
