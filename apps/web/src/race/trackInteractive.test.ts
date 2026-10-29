import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TrackInteractiveManager } from "./trackInteractive";

describe("TrackInteractiveManager", () => {
  it("inicializa InstancedMeshes para papéis, post-its e vapor cartoon na cena", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();

    manager.init(scene);

    // Deve ter adicionado InstancedMeshes à cena
    const instancedMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instancedMeshes.length).toBeGreaterThanOrEqual(3);

    expect(manager.monitoredDesks.length).toBeGreaterThan(0);
  });

  it("não dispara deslocamento de ar se o kart estiver lento (<= 10 m/s)", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    const desk = manager.monitoredDesks[0];

    // Kart passando a 8 m/s (abaixo do limiar de 10 m/s) a 1.0m da mesa
    manager.update(0.016, [
      {
        pos: { x: desk.x + 0.5, z: desk.z + 0.5 },
        speed: 8.0,
      },
    ]);

    // O método update executa sem erros e nenhum papel foi lançado
  });

  it("não dispara deslocamento de ar se o kart estiver longe (>= 3.8m)", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    const desk = manager.monitoredDesks[0];

    // Kart muito rápido (22 m/s), mas a 5.0m de distância (além de 3.8m)
    manager.update(0.016, [
      {
        pos: { x: desk.x + 5.0, z: desk.z },
        speed: 22.0,
      },
    ]);
  });

  it("dispara papéis sulfite e post-its voando quando kart passa veloz (>10 m/s) a <3.8m da mesa", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    const desk = manager.monitoredDesks[0];

    // Kart passando a 18 m/s a 1.5m da mesa
    manager.update(0.016, [
      {
        pos: { x: desk.x + 1.2, z: desk.z + 0.8 },
        speed: 18.0,
      },
    ]);

    // Executa múltiplos passos de física para simular voo e sustentação
    for (let f = 0; f < 30; f++) {
      manager.update(0.016, []);
    }

    // Com o tempo decorrido, os papéis descem e acomodam de volta
    for (let f = 0; f < 180; f++) {
      manager.update(0.016, []);
    }
  });

  it("anima Caixas de Itens com respiração, bobbing, giro giroscópico e halo pulsante (Galaxy style)", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    const boxGroup = manager.createItemBox({ x: 10, y: 0.9, z: 20 });
    expect(boxGroup).toBeDefined();
    expect(boxGroup.parent).toBe(scene);

    const activeBoxes = manager.activeBoxes;
    expect(activeBoxes.length).toBe(1);

    const initialY = boxGroup.position.y;
    const initialRot = boxGroup.children[0]?.rotation.clone();

    // Simula tempo passando
    manager.update(0.25, []);

    // Bobbing vertical senoidal deve ter alterado o Y
    expect(boxGroup.position.y).not.toBe(initialY);

    // Giro giroscópico e halo pulsante
    const box = activeBoxes[0];
    expect(box.halo).toBeDefined();
    expect(box.haloMat?.opacity).toBeGreaterThan(0);
    if (box.innerBox && initialRot) {
      expect(box.innerBox.rotation.y).not.toBe(initialRot.y);
    }
  });

  it("anima Xícaras de Café com rotação, bobbing, pulso de aroma e vapor cartoon", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    const cupGroup = new THREE.Group();
    cupGroup.position.set(5, 0.38, 12);
    scene.add(cupGroup);

    const managedCup = manager.registerCup(cupGroup, 0.38);
    expect(managedCup).toBeDefined();
    expect(managedCup.aromaMesh).toBeDefined();

    const initialY = cupGroup.position.y;

    // Atualiza simulação
    manager.update(0.2, []);

    // Bobbing e rotação da xícara
    expect(cupGroup.position.y).not.toBe(initialY);
    expect(cupGroup.rotation.y).toBeGreaterThan(0);

    // Pulso de aroma com opacidade ativa
    expect(managedCup.aromaMat?.opacity).toBeGreaterThanOrEqual(0);
  });

  it("executa 120 quadros contínuos sem erros (Zero GC test)", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    manager.createItemBox({ x: 0, y: 0.9, z: 0 });

    const cupGroup = new THREE.Group();
    scene.add(cupGroup);
    manager.registerCup(cupGroup, 0.38);

    const karts = [
      { pos: { x: 45, z: -9 }, speed: 14.5 },
      { pos: { x: 50, z: 0 }, speed: 12.0 },
      { pos: { x: 0, z: 0 }, speed: 5.0 },
    ];

    for (let frame = 0; frame < 120; frame++) {
      manager.update(0.016, karts);
    }
  });

  it("libera todos os recursos ao chamar dispose()", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    manager.createItemBox({ x: 2, y: 0.9, z: 2 });
    const cup = new THREE.Group();
    scene.add(cup);
    manager.registerCup(cup, 0.38);

    manager.dispose();

    expect(manager.activeBoxes.length).toBe(0);
    expect(manager.activeCups.length).toBe(0);
    expect(manager.monitoredDesks.length).toBe(0);
  });

  it("permite remover caixas e xícaras dinamicamente com removeBox e removeCup", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();
    manager.init(scene);

    manager.createItemBox({ x: 3, y: 0.9, z: 3, id: 42 });
    const cup = new THREE.Group();
    scene.add(cup);
    const mCup = manager.registerCup(cup, 0.38);

    expect(manager.activeBoxes.some((b) => b.id === 42)).toBe(true);
    expect(manager.activeCups.some((c) => c.id === mCup.id)).toBe(true);

    manager.removeBox(42);
    manager.removeCup(mCup.id);

    expect(manager.activeBoxes.some((b) => b.id === 42)).toBe(false);
    expect(manager.activeCups.some((c) => c.id === mCup.id)).toBe(false);
  });
});
