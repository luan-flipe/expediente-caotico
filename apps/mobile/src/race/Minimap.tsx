import { useMemo } from "react";
import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { TRACK, trackEdges, type RaceKartPublic } from "@ec/shared";

const PAD = 4;

/** Traçado da pista visto de cima, com um ponto por participante (desenhado com Skia). */
export function Minimap({ karts, myId, size }: { karts: RaceKartPublic[]; myId: string; size: number }) {
  const { path, minX, minZ, scale, h } = useMemo(() => {
    const e = trackEdges(TRACK);
    const all = [...e.plus, ...e.minus];
    // x invertido: com a câmera atrás da cadeira, +x fica à esquerda da tela
    const xs = all.map((p) => -p.x);
    const zs = all.map((p) => -p.z);
    const minX = Math.min(...xs) - PAD;
    const minZ = Math.min(...zs) - PAD;
    const w = Math.max(...xs) + PAD - minX;
    const hh = Math.max(...zs) + PAD - minZ;
    const b = Skia.PathBuilder.Make();
    TRACK.points.forEach((pt, i) => (i ? b.lineTo(-pt.x - minX, -pt.z - minZ) : b.moveTo(-pt.x - minX, -pt.z - minZ)));
    b.close();
    return { path: b.build(), minX, minZ, scale: size / w, h: hh };
  }, [size]);
  const start = TRACK.points[0];
  const order = [...karts].sort((a) => (a.id === myId ? 1 : -1));

  return (
    <Canvas style={{ width: size, height: h * scale }}>
      <Group transform={[{ scale }]}>
        <Path path={path} style="stroke" strokeWidth={11} strokeJoin="round" color="rgba(20,18,15,0.75)" />
        <Path path={path} style="stroke" strokeWidth={7} strokeJoin="round" color="#e9e2d2" />
        <Circle cx={-start.x - minX} cy={-start.z - minZ} r={2.2} color="#1d1b17" />
        {order.map((k) => (
          <Group key={k.id}>
            <Circle cx={-k.x - minX} cy={-k.z - minZ} r={k.id === myId ? 3.4 : 2.4} color={k.id === myId ? "#ffd23f" : k.isBot ? "#8e949b" : "#ff5a3d"} />
            <Circle cx={-k.x - minX} cy={-k.z - minZ} r={k.id === myId ? 3.4 : 2.4} style="stroke" strokeWidth={1} color="#1d1b17" />
          </Group>
        ))}
      </Group>
    </Canvas>
  );
}
