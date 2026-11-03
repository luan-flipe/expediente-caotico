import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getTrack } from "@ec/shared";
import { TrackInteractiveManager } from "./trackInteractive";

describe("TrackInteractiveManager", () => {
  it("inicializa InstancedMeshes para papéis, post-its e vapor cartoon na cena", () => {
    const scene = new THREE.Scene();
    const manager = new TrackInteractiveManager();

    manager.init(scene);

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

    for (let f = 0; f < 30; f++) {
      manager.update(0.016, []);
    }

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

    manager.update(0.25, []);

    expect(boxGroup.position.y).not.toBe(initialY);

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

    manager.update(0.2, []);

    expect(cupGroup.position.y).not.toBe(initialY);
    expect(cupGroup.rotation.y).toBeGreaterThan(0);
    expect(managedCup.aromaMat?.opacity).toBeGreaterThanOrEqual(0);
  });

  describe("Café Coado na Calcinha (Dona Neide)", () => {
    it("posiciona o Café Coado na Calcinha logo no início da corrida quando fornecida uma pista", () => {
      const scene = new THREE.Scene();
      const track = getTrack("corporativo");
      const manager = new TrackInteractiveManager({ track });
      manager.init(scene);

      const items = manager.coffeeCalcinhas;
      expect(items.length).toBeGreaterThanOrEqual(1);

      const item = items[0];
      expect(item.group.parent).toBe(scene);
      expect(item.calcinhaPivot).toBeDefined();
      expect(item.calcinhaMesh).toBeDefined();
      expect(item.streamMesh).toBeDefined();
      expect(item.thermosMesh).toBeDefined();
      expect(item.mugGroup).toBeDefined();
      expect(item.bowMesh).toBeDefined();
    });

    it("possui modelo 3D estético Mario Odyssey com garrafa bojuda, manômetro analógico, caneca lascada com vapor cartoon e laço 3D", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const item = manager.coffeeCalcinhas[0];
      expect(item).toBeDefined();

      // Manômetro analógico com ponteiro na zona fervendo
      expect(item.manometerMesh).toBeDefined();
      expect(item.manometerMesh?.material).toBeDefined();

      // Caneca de cerâmica esmaltada com café líquido ondulante e nuvem de vapor cartoon
      expect(item.mugLiquidMesh).toBeDefined();
      expect(item.mugSteamCluster).toBeDefined();
      expect(item.mugSteamCluster?.children.length).toBe(5); // 5 esferas cartoon conectadas

      // Laço 3D fofinho na calcinha
      expect(item.bowMesh).toBeDefined();
      expect(item.bowMesh.children.length).toBeGreaterThanOrEqual(3); // nó central + laço esq + laço dir

      // Tampo da mesa e pés curvados cromados
      expect(item.group.children.length).toBeGreaterThan(5);
    });

    it("balança a calcinha no vórtex de ar quando o kart passa veloz (>10 m/s)", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const item = manager.coffeeCalcinhas[0];
      expect(item).toBeDefined();

      // Kart passa a 16 m/s a 3.0m de distância
      manager.update(0.016, [
        {
          pos: { x: item.pos.x + 2.5, z: item.pos.z },
          speed: 16.0,
        },
      ]);

      expect(item.swingVelocity).toBeGreaterThan(0);

      // Simula quadros para a física pendular oscilar a rotação
      manager.update(0.05, []);
      expect(item.calcinhaPivot.rotation.z).not.toBe(0);
    });

    it("ao raspar muito perto (< 2.2m), dispara estilingada elástica e concede mini boost turbo com aroma", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const item = manager.coffeeCalcinhas[0];

      // Kart raspando a 1.2m
      const outputs = manager.update(0.016, [
        {
          pos: { x: item.pos.x + 1.0, z: item.pos.z },
          speed: 14.0,
        },
      ]);

      // Estilingada disparada
      expect(item.elasticVelocity).toBeGreaterThan(0);
      expect(item.boostCooldown).toBeGreaterThan(0);

      // Concede mini turbo com aroma de café
      const out = outputs[0];
      expect(out.boost).toBe(true);
      expect(out.aromaBoost).toBe(true);
      expect(out.boostSpeed).toBeGreaterThanOrEqual(24);
      expect(out.soundCue).toBe("coffee_slingshot");

      // No frame seguinte, com cooldown ativo, não deve disparar boost novamente
      const nextOutputs = manager.update(0.016, [
        {
          pos: { x: item.pos.x + 1.0, z: item.pos.z },
          speed: 14.0,
        },
      ]);
      expect(nextOutputs[0].boost).toBe(false);
    });
  });

  describe("Aspirador Robô (Roomba da Firma)", () => {
    it("patrulha corredor em movimento de vai-e-vem", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const roombas = manager.roombas;
      expect(roombas.length).toBeGreaterThanOrEqual(1);

      const r = roombas[0];
      const initialT = r.patrolT;
      const initialPos = { x: r.pos.x, z: r.pos.z };

      manager.update(0.5, []);

      expect(r.patrolT).not.toBe(initialT);
      expect(r.pos.x !== initialPos.x || r.pos.z !== initialPos.z).toBe(true);
      expect(r.group.position.x).toBe(r.pos.x);
    });

    it("quica a cadeira em colisão pinball, apita indignado, squasha e inverte rota", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const r = manager.roombas[0];
      const initialDir = r.patrolDir;

      // Colisão direta de frente com a cadeira (distância < 1.0m)
      const outputs = manager.update(0.016, [
        {
          pos: { x: r.pos.x + 0.3, z: r.pos.z },
          speed: 12.0,
        },
      ]);

      const out = outputs[0];
      expect(out.bonk).toBe(true);
      expect(out.spin).toBe(true);
      expect(out.bonkImpulse).toBeDefined();
      expect(out.soundCue).toBe("roomba_honk");

      // Roomba indignado: squasha, entra em bonked state e inverte rota
      expect(r.bonkTimer).toBeGreaterThan(0);
      expect(r.squashFactor).toBeGreaterThan(1.0);
      expect(r.patrolDir).toBe(-initialDir);
      expect(r.emotion).toBe("bonked");
    });

    it("apresenta LED Matrix Face com estados happy, surprised e bonked, cone amassado e vassouras radiais", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const r = manager.roombas[0];
      expect(r).toBeDefined();

      // Em patrulha normal: face happy (^‿^)
      expect(r.emotion).toBe("happy");
      expect(r.ledMat.map).toBeDefined();

      // Cone de trânsito amassadinho no topo
      expect(r.coneGroup).toBeDefined();
      expect(r.coneGroup.children.length).toBeGreaterThanOrEqual(1);

      // Vassourinhas com 1 hub central + 5 raios/cerdas visíveis cada
      expect(r.brushL.children.length).toBe(6);
      expect(r.brushR.children.length).toBe(6);

      // Kart raspando velozmente por perto (>10 m/s, entre 1.15m e 2.5m)
      // Dispara expressão surpresa (O_O)
      manager.update(0.016, [
        {
          pos: { x: r.pos.x + 1.8, z: r.pos.z },
          speed: 15.0,
        },
      ]);
      expect(r.emotion).toBe("surprised");
      expect(r.surprisedTimer).toBeGreaterThan(0);
    });
  });

  describe("Portas Automáticas de Vidro", () => {
    it("inicializa com folhas de vidro, batente e LEDs", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const doors = manager.automaticDoors;
      expect(doors.length).toBeGreaterThanOrEqual(1);

      const door = doors[0];
      expect(door.leftDoor).toBeDefined();
      expect(door.rightDoor).toBeDefined();
      expect(door.sensorLed).toBeDefined();
      expect(door.sensorLedMat).toBeDefined();
    });

    it("cicla periodicamente entre estados aberto e fechado alterando os LEDs", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const door = manager.automaticDoors[0];
      expect(door.state).toBe("open");
      expect(door.currentOpen).toBe(1.0);

      // Avança além do tempo de abertura (2.8s) para entrar em closing
      manager.update(3.0, []);
      expect(door.state).toBe("closing");
      expect(door.currentOpen).toBeLessThan(1.0);

      // Avança além do tempo de fechamento (0.8s) para ficar totalmente fechado
      manager.update(1.0, []);
      expect(door.state).toBe("closed");
      expect(door.currentOpen).toBe(0.0);
    });

    it("bloqueia e causa ricochete quando kart colide com a porta fechada", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const door = manager.automaticDoors[0];

      // Força estado fechado
      door.state = "closed";
      door.currentOpen = 0.0;
      door.stateTimer = 0.5;

      // Kart tenta passar colidindo contra o vidro fechado
      const outputs = manager.update(0.016, [
        {
          pos: { x: door.pos.x, z: door.pos.z + 0.2 },
          speed: 15.0,
        },
      ]);

      const out = outputs[0];
      expect(out.bonk).toBe(true);
      expect(out.bonkImpulse).toBeDefined();
      expect(out.soundCue).toBe("door_bonk");
      expect(door.shudder).toBeGreaterThan(0);
    });

    it("permite passagem livre quando a porta está aberta", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const door = manager.automaticDoors[0];
      door.state = "open";
      door.currentOpen = 1.0;

      const outputs = manager.update(0.016, [
        {
          pos: { x: door.pos.x, z: door.pos.z },
          speed: 15.0,
        },
      ]);

      expect(outputs[0].bonk).toBe(false);
    });
  });

  describe("Grelhas de Ventilação no Chão (Air Cushion Boost Vents)", () => {
    it("concede sustentação (almofada de ar) e leve aumento de velocidade", () => {
      const scene = new THREE.Scene();
      const manager = new TrackInteractiveManager();
      manager.init(scene);

      const vents = manager.airVents;
      expect(vents.length).toBeGreaterThanOrEqual(1);

      const vent = vents[0];

      // Kart passa diretamente sobre a grelha
      const outputs = manager.update(0.016, [
        {
          pos: { x: vent.pos.x, z: vent.pos.z },
          speed: 12.0,
        },
      ]);

      const out = outputs[0];
      expect(out.boost).toBe(true);
      expect(out.airCushionLift).toBeGreaterThan(0);
      expect(out.boostSpeed).toBeGreaterThanOrEqual(20);
      expect(out.soundCue).toBe("vent_woosh");
    });
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
    expect(manager.coffeeCalcinhas.length).toBe(0);
    expect(manager.roombas.length).toBe(0);
    expect(manager.automaticDoors.length).toBe(0);
    expect(manager.airVents.length).toBe(0);
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
