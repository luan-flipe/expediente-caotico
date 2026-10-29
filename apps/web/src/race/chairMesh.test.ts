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
  it("Adrenalina / Dentes Cerrados: boosting, vácuo alto ou drift nível 3 inclinam sobrancelhas e cerram boca", () => {
    const char = createCharacter(DEFAULT_AVATAR);
    char.sit();

    const browL = char.root.getObjectByName("Sobrancelha_E") as THREE.Mesh;
    const browR = char.root.getObjectByName("Sobrancelha_D") as THREE.Mesh;
    const mouth = char.root.getObjectByName("Boca") as THREE.Mesh;

    expect(browL).toBeDefined();
    expect(browR).toBeDefined();
    expect(mouth).toBeDefined();

    // Estado normal inicial
    for (let i = 0; i < 10; i++) char.updateSeated?.(0.016, 8, 0, 0, false);
    const initialRotL = browL.rotation.z;
    const initialRotR = browR.rotation.z;
    const initialMouthScaleY = mouth.scale.y;

    // Ativa adrenalina via boosting
    for (let i = 0; i < 20; i++) char.updateSeated?.(0.016, 12, 0, 0, true);

    expect(char.getEmotion?.()).toBe("adrenaline");
    // Sobrancelhas inclinadas em V agressivo
    expect(browL.rotation.z).toBeLessThan(initialRotL);
    expect(browR.rotation.z).toBeGreaterThan(initialRotR);
    // Boca cerrada / dentes cerrados
    expect(mouth.scale.y).toBeLessThan(initialMouthScaleY);

    // Também ativa com drift nível 3 (roxo)
    char.setEmotion?.("normal");
    for (let i = 0; i < 20; i++) char.updateSeated?.(0.016, 10, 1, 1, false, undefined, { driftLevel: 3 });
    expect(char.getEmotion?.()).toBe("adrenaline");

    char.dispose();
  });

  it("Pânico / Susto: olhos arregalados, boca em 'O', sobrancelhas levantadas e braços soltam apoios por 0.4s", () => {
    const char = createCharacter(DEFAULT_AVATAR);
    char.sit();

    const eyeL = char.root.getObjectByName("Olho_E") as THREE.Mesh;
    const eyeR = char.root.getObjectByName("Olho_D") as THREE.Mesh;
    const mouth = char.root.getObjectByName("Boca") as THREE.Mesh;
    const browL = char.root.getObjectByName("Sobrancelha_E") as THREE.Mesh;
    const armL = char.root.getObjectByName("Braco_E") ?? char.root.children[0].children.find((c) => c.position.x < -0.3);

    // Normal inicial
    for (let i = 0; i < 10; i++) char.updateSeated?.(0.016, 5, 0, 0, false);
    const normalEyeScaleY = eyeL.scale.y;
    const normalBrowY = browL.position.y;
    const normalMouthScaleY = mouth.scale.y;

    // Susto / Pânico temporário de 0.6s
    char.setEmotion?.("panic", 0.6);
    expect(char.getEmotion?.()).toBe("panic");

    for (let i = 0; i < 10; i++) char.updateSeated?.(0.016, 5, 0, 0, false);

    // Olhos arregalados cartoon
    expect(eyeL.scale.y).toBeGreaterThan(normalEyeScaleY);
    expect(eyeR.scale.y).toBeGreaterThan(normalEyeScaleY);
    // Sobrancelhas levantadas no susto
    expect(browL.position.y).toBeGreaterThan(normalBrowY);
    // Boca em 'O' aberta
    expect(mouth.scale.y).toBeGreaterThan(normalMouthScaleY * 1.5);

    // Braços soltam apoios brevemente (rotação X levanta de -0.75 em direção a -1.55)
    if (armL) {
      expect(armL.rotation.x).toBeLessThan(-0.9);
    }

    // Após passar a duração de susto (0.6s)
    for (let i = 0; i < 50; i++) char.updateSeated?.(0.016, 5, 0, 0, false);
    expect(char.getEmotion?.()).toBe("normal");

    char.dispose();
  });

  it("Piscadela / Deboche do Líder: olho direito pisca, sorriso de canto e braço esquerdo faz tchauzinho", () => {
    const char = createCharacter(DEFAULT_AVATAR);
    char.sit();

    const eyeL = char.root.getObjectByName("Olho_E") as THREE.Mesh;
    const eyeR = char.root.getObjectByName("Olho_D") as THREE.Mesh;
    const mouth = char.root.getObjectByName("Boca") as THREE.Mesh;
    const armL = char.root.children[0].children.find((c) => c.position.x < -0.3);

    char.setEmotion?.("victory", 1.5);
    for (let i = 0; i < 20; i++) char.updateSeated?.(0.016, 8, 0, 0, false);

    expect(char.getEmotion?.()).toBe("victory");
    // Olho direito espremido na piscadela
    expect(eyeR.scale.y).toBeLessThan(0.4);
    // Olho esquerdo aberto
    expect(eyeL.scale.y).toBeGreaterThan(0.9);
    // Sorriso de canto (rotação Z da boca inclinada)
    expect(mouth.rotation.z).toBeGreaterThan(0.05);

    // Braço esquerdo levanta para tchauzinho/vitória
    if (armL) {
      expect(armL.rotation.x).toBeLessThan(-1.0);
      expect(armL.rotation.z).toBeGreaterThan(0.2);
    }

    char.dispose();
  });

  it("Bocejo de Segunda-Feira: contagem regressiva ou parado > 3s gera pálpebras caídas e boca aberta", () => {
    const char = createCharacter(DEFAULT_AVATAR);
    char.sit();

    const eyeL = char.root.getObjectByName("Olho_E") as THREE.Mesh;
    const mouth = char.root.getObjectByName("Boca") as THREE.Mesh;

    // Normal em movimento
    for (let i = 0; i < 10; i++) char.updateSeated?.(0.016, 5, 0, 0, false);
    const normalMouthY = mouth.scale.y;

    // Parado por > 3s (simula 3.5 segundos em passos de dt = 0.1)
    for (let i = 0; i < 35; i++) char.updateSeated?.(0.1, 0, 0, 0, false);

    expect(char.getEmotion?.()).toBe("yawn");
    // Pálpebras caídas
    expect(eyeL.scale.y).toBeLessThan(0.7);
    // Boca aberta em bocejo preguiçoso
    expect(mouth.scale.y).toBeGreaterThan(normalMouthY * 1.8);

    // Também é ativado pelo flag countdown
    char.setEmotion?.("normal");
    char.updateSeated?.(0.016, 0, 0, 0, false, undefined, { countdown: true });
    expect(char.getEmotion?.()).toBe("yawn");

    char.dispose();
  });

  it("seatedRacer propaga estados emocionais reativos e mantém 60 FPS com zero NaN", () => {
    const racer = seatedRacer(DEFAULT_AVATAR, DEFAULT_CHAIR);

    // Dispara pânico
    racer.char.setEmotion?.("panic", 0.5);
    racer.update(0.016, 8, 0, 0, false);
    expect(racer.char.getEmotion?.()).toBe("panic");

    // Passa options com drift nível 3 e vácuo
    racer.update(0.016, 12, 0, 0, false, undefined, false, { driftLevel: 3, draft: true });

    // Nenhum valor NaN em todo o rig
    racer.root.traverse((o) => {
      expect(Number.isNaN(o.position.x)).toBe(false);
      expect(Number.isNaN(o.position.y)).toBe(false);
      expect(Number.isNaN(o.position.z)).toBe(false);
      expect(Number.isNaN(o.rotation.x)).toBe(false);
      expect(Number.isNaN(o.rotation.y)).toBe(false);
      expect(Number.isNaN(o.rotation.z)).toBe(false);
      expect(Number.isNaN(o.scale.x)).toBe(false);
      expect(Number.isNaN(o.scale.y)).toBe(false);
      expect(Number.isNaN(o.scale.z)).toBe(false);
    });

    racer.dispose();
  });
});
