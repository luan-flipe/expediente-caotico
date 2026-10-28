import type * as THREE from "three";

const acc = { frames: 0, logic: 0, render: 0, end: 0, worst: 0, since: 0, prev: 0 };

export function PERF_TMP(renderer: THREE.WebGLRenderer, frameStart: number, renderStart: number, renderEnd: number, tag: string): void {
  const now = performance.now();
  if (!acc.since) acc.since = now;
  acc.frames++;
  acc.logic += renderStart - frameStart;
  acc.render += renderEnd - renderStart;
  acc.end += now - renderEnd;
  if (acc.prev) acc.worst = Math.max(acc.worst, now - acc.prev);
  acc.prev = now;
  if (now - acc.since < 3000) return;
  const n = acc.frames;
  const fps = (n * 1000) / (now - acc.since);
  console.warn(
    `[perf] ${tag} fps=${fps.toFixed(1)} logic=${(acc.logic / n).toFixed(1)} render=${(acc.render / n).toFixed(1)} end=${(acc.end / n).toFixed(1)}ms worstGap=${acc.worst.toFixed(0)}ms calls=${renderer.info.render.calls} tris=${renderer.info.render.triangles}`,
  );
  Object.assign(acc, { frames: 0, logic: 0, render: 0, end: 0, worst: 0, since: now });
}
