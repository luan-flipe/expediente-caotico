import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_AVATAR, DEFAULT_CHAIR } from "@ec/shared";
import { buildChair, seatedRacer } from "./chairMesh";
import { createCharacter } from "../game/character";

describe("Dinâmica da Cadeira de Escritório e Piloto (Mario Kart 8 style)", () => {
  it("buildChair cria cadeira procedural com suspensão, pistão e rodinhas rollerblade", () => {
    const chair = buildChair({ ...DEFAULT_CHAIR, wheels: 2, back: 2 });
    expect(chair.group).toBeDefined();
    expect(chair.anchors.seatTop).toBeGreaterThan(0);
    expect(chair.exhaust).toBeDefined();

    // Estado inicial
    expect(chair.pistonOffset).toBe(0);
    expect(chair.rollAngle).toBe(0);
    expect(chair.backAngle).toBe(0);

    // Simula pulo e aterrissagem (air: true -> false)
    chair.update(0.016, 10, 0, 0, false, true); // no ar
    chair.update(0.016, 10, 0, 0, false, false); // aterrissa!
    // Pistão deve ceder para baixo (compressão negativa)
    expect(chair.pistonOffset).toBeLessThan(0);

    // Simula ativação de turbo boost
    chair.update(0.016, 12, 0, 0, true, false);
    // Encosto flexiona para trás pela inércia da aceleração extrema
    expect(chair.backAngle).toBeLessThan(0);

    // Simula curva e drift (roll / bank do conjunto assento/encosto)
    chair.update(0.016, 10, 1.0, 1);
    expect(chair.rollAngle).toBeLessThan(0); // inclina para dentro da curva à direita

    chair.dispose();
  });

  it("rodinhas têm materiais de silicone translúcido e cubo central cromado", () => {
    const chair = buildChair({ ...DEFAULT_CHAIR, wheels: 2 });
    let foundSilicone = false;
    let foundChrome = false;

    chair.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mat = o.material as THREE.MeshStandardMaterial;
        if (mat.roughness === 0.15 && mat.metalness >= 0.8) {
          foundChrome = true;
        }
        if (mat.transparent && mat.roughness === 0.15) {
          foundSilicone = true;
        }
      }
    });

    expect(foundChrome).toBe(true);
    expect(foundSilicone).toBe(true);
    chair.dispose();
  });

  it("seatedRacer sincroniza o piloto com a suspensão do pistão e inclinação do assento", () => {
    const racer = seatedRacer(DEFAULT_AVATAR, DEFAULT_CHAIR);
    const initialY = racer.char.root.position.y;

    // Turbo e pouso comprimem o pistão
    racer.update(0.016, 12, 0, 0, true, undefined, false);
    // O boneco deve descer junto com o assento comprimido pelo pistão
    expect(racer.char.root.position.y).toBeLessThanOrEqual(initialY);

    // Drift inclina o assento e o boneco sentado
    racer.update(0.016, 10, 1, 1, false);
    expect(racer.char.root.rotation.z).not.toBe(0);

    racer.dispose();
  });

  it("Luigi Death Stare: piloto vira a cabeça sutilmente para encarar rival próximo", () => {
    const char = createCharacter(DEFAULT_AVATAR);
    char.sit();

    // Sem rival: cabeça reta à frente
    char.updateSeated?.(0.1, 8, 0, 0, false);
    const headRotY_solo = char.root.getObjectByName("Cabeca")?.rotation.y ?? 0;

    // Rival ao lado direito (+X local, 2 metros de distância)
    const rivalDir = new THREE.Vector3(2.0, 0, 0.5);
    char.updateSeated?.(0.1, 8, 0, 0, false, rivalDir);
    const headRotY_stare = char.root.getObjectByName("Cabeca")?.rotation.y ?? 0;

    // A cabeça deve ter virado para a direita (rotação Y negativa)
    expect(headRotY_stare).toBeLessThan(headRotY_solo);

    char.dispose();
  });
});
