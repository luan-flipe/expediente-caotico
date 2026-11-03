import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { FUT_FORMATS, IPATINGAO, fieldFor } from "@ec/shared";
import { Arena } from "./arena";
import { campoDoMapa } from "./arenaLayout";

// o Arena desenha em canvas: um canvas falso basta para listar o que ele põe na cena
beforeAll(() => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => undefined), set: () => true });
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  vi.stubGlobal("Image", class {});
});
afterEach(() => vi.clearAllMocks());

/** Planos de piso (moldura) que o Arena põe na cena: mesh comum girado para deitar no chão. */
function pisos(scene: THREE.Scene): number {
  let n = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) n++;
  });
  return n;
}

describe("5v5 Estádio usa só o que o mapa já tem", () => {
  it("só o formato 5 é o campo do mapa", () => {
    expect(FUT_FORMATS.filter((fm) => campoDoMapa(fieldFor(fm)))).toEqual([5]);
  });

  it("o Arena não põe a moldura de piso sobre o gramado do mapa, e nos outros formatos põe as 4 faixas", () => {
    for (const fm of FUT_FORMATS) {
      const scene = new THREE.Scene();
      const a = new Arena(scene, fieldFor(fm), []);
      expect(pisos(scene)).toBe(fm === 5 ? 0 : 4);
      a.dispose();
    }
  });

  it("áreas e marca do pênalti da sim batem com as linhas pintadas no glb (medidas na textura, tolerância 0,3 m)", () => {
    const f = fieldFor(5);
    expect(f.halfL).toBeCloseTo(IPATINGAO.grassHalfL, 1);
    expect(Math.abs(f.boxL - 14.72)).toBeLessThan(0.3);
    expect(Math.abs(f.boxHalfW - 17.85)).toBeLessThan(0.3);
    expect(Math.abs(f.penaltySpot - 10.59)).toBeLessThan(0.3);
  });
});
