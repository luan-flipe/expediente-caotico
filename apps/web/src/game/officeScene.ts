import * as THREE from "three";
import { OFFICE_MAP } from "@ec/shared";
import {
  createBushMaterial,
  createEarthMaterial,
  createOutdoorGroundMaterial,
  createStoneMaterial,
  createWoodMaterial,
} from "./floorTextures";

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Monta o mapa como um campo gramado aberto, com texturas PBR procedurais, relevos, escadas e coberturas detalhadas. */
export function buildOffice(scene: THREE.Scene): void {
  const W = OFFICE_MAP.width;
  const D = OFFICE_MAP.depth;

  // Gramado contínuo rico em lâminas e variações orgânicas cobrindo toda a arena e o horizonte visível
  const groundMat = createOutdoorGroundMaterial({ repeatX: 28, repeatY: 22, baseColor: "#4b6e38" });
  const ground = mesh(new THREE.PlaneGeometry(W + 70, D + 60), groundMat, 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Materiais PBR texturizados para os relevos, escadas, muretas de pedra e sebes campestres
  const earthBase = createEarthMaterial("#584636", 3, 1);
  const plateauGrass = createOutdoorGroundMaterial({ repeatX: 5, repeatY: 5, baseColor: "#477335" });
  const rusticWood = createWoodMaterial("#765436", 0.62, 2, 1);
  const stoneMat = createStoneMaterial("#767e85", 2, 1);
  const bushMat = createBushMaterial("#35682b", 2, 2);
  const bushLightMat = createBushMaterial("#468239", 2, 2);
  const trunkMat = createWoodMaterial("#543d28", 0.82, 1, 2);

  const flowerWhite = new THREE.MeshStandardMaterial({ color: "#fefefe", roughness: 0.65 });
  const flowerYellow = new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.65 });
  const flowerPink = new THREE.MeshStandardMaterial({ color: "#f472b6", roughness: 0.65 });
  const contactAoMat = new THREE.MeshBasicMaterial({
    color: "#0b1408",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  // =========================================================================
  // RELEVOS E PLATAFORMAS ELEVADAS (COLINAS / PLATÔS DO CAMPO GRAMADO)
  // =========================================================================
  if (OFFICE_MAP.elevations) {
    for (const elev of OFFICE_MAP.elevations) {
      const baseH = elev.h;
      // Sombra de contato AO na base da colina
      const ao = mesh(
        new THREE.PlaneGeometry(elev.w + 0.9, elev.d + 0.9),
        contactAoMat,
        elev.x,
        0.015,
        elev.z,
        false,
      );
      ao.rotation.x = -Math.PI / 2;
      scene.add(ao);

      // Base sólida de terra estratificada / rocha da colina
      scene.add(mesh(new THREE.BoxGeometry(elev.w, baseH, elev.d), earthBase, elev.x, baseH / 2, elev.z));
      // Topo gramado texturizado do platô elevado com borda saliente
      scene.add(
        mesh(
          new THREE.BoxGeometry(elev.w + 0.16, 0.1, elev.d + 0.16),
          plateauGrass,
          elev.x,
          elev.h + 0.04,
          elev.z,
        ),
      );

      // Pedras texturizadas ao redor da base da colina
      const rockGeo = new THREE.DodecahedronGeometry(0.38, 1);
      scene.add(mesh(rockGeo, stoneMat, elev.x - elev.w / 2 - 0.22, 0.2, elev.z + elev.d / 2 - 0.4));
      scene.add(mesh(rockGeo, stoneMat, elev.x + elev.w / 2 + 0.22, 0.2, elev.z - elev.d / 2 + 0.4));
    }
  }

  // =========================================================================
  // ESCADAS RÚSTICAS DE MADEIRA / PEDRA PARA SUBIR E DESCER
  // =========================================================================
  if (OFFICE_MAP.stairs) {
    for (const stair of OFFICE_MAP.stairs) {
      const n = stair.steps;
      const stepThick = 0.08;

      if (stair.axis === "x") {
        const stepW = stair.w / n;
        const xStart = stair.x - stair.w / 2 + stepW / 2;
        for (let i = 0; i < n; i++) {
          const progress = (i + 1) / n;
          const curY = stair.h0 + (stair.direction > 0 ? progress : 1 - i / n) * (stair.h1 - stair.h0);
          const curX = xStart + (stair.direction > 0 ? i : n - 1 - i) * stepW;
          scene.add(mesh(new THREE.BoxGeometry(stepW * 1.02, curY, stair.d), earthBase, curX, curY / 2, stair.z));
          scene.add(
            mesh(
              new THREE.BoxGeometry(stepW * 1.06, stepThick, stair.d + 0.08),
              rusticWood,
              curX,
              curY + stepThick / 2,
              stair.z,
            ),
          );
        }
      } else {
        const stepD = stair.d / n;
        const zStart = stair.z - stair.d / 2 + stepD / 2;
        for (let i = 0; i < n; i++) {
          const progress = (i + 1) / n;
          const curY = stair.h0 + (stair.direction > 0 ? progress : 1 - i / n) * (stair.h1 - stair.h0);
          const curZ = zStart + (stair.direction > 0 ? i : n - 1 - i) * stepD;
          scene.add(mesh(new THREE.BoxGeometry(stair.w, curY, stepD * 1.02), earthBase, stair.x, curY / 2, curZ));
          scene.add(
            mesh(
              new THREE.BoxGeometry(stair.w + 0.08, stepThick, stepD * 1.06),
              rusticWood,
              stair.x,
              curY + stepThick / 2,
              curZ,
            ),
          );
        }
      }
    }
  }

  // =========================================================================
  // COBERTURAS (mesmas caixas que colidem e bloqueiam tiro em OFFICE_MAP.boxes)
  // =========================================================================
  for (const b of OFFICE_MAP.boxes) {
    // Sombra de contato suave sob cada cobertura
    const boxAo = mesh(
      new THREE.PlaneGeometry(b.w + 0.45, b.d + 0.45),
      contactAoMat,
      b.x,
      0.016,
      b.z,
      false,
    );
    boxAo.rotation.x = -Math.PI / 2;
    scene.add(boxAo);

    if (b.kind === "plant") {
      // Sebe viva texturizada com topo orgânico folhoso
      scene.add(mesh(new THREE.BoxGeometry(b.w, b.h * 0.8, b.d), bushMat, b.x, (b.h * 0.8) / 2, b.z));
      scene.add(
        mesh(
          new THREE.BoxGeometry(b.w * 0.84, b.h * 0.2 + 0.06, b.d * 0.9),
          bushLightMat,
          b.x,
          b.h * 0.8 + (b.h * 0.2) / 2,
          b.z,
        ),
      );
    } else {
      // Mureta de alvenaria de pedra com capa de madeira rústica chanfrada
      scene.add(mesh(new THREE.BoxGeometry(b.w, b.h - 0.1, b.d), stoneMat, b.x, (b.h - 0.1) / 2, b.z));
      scene.add(mesh(new THREE.BoxGeometry(b.w + 0.12, 0.11, b.d + 0.12), rusticWood, b.x, b.h - 0.05, b.z));
    }
  }

  // =========================================================================
  // DETALHES NATURAIS DO CAMPO ABERTO (FLORES, ROCHAS E ÁRVORES DE PERÍMETRO)
  // Sem colisores físicos: só enfeite espalhado pelo gramado e bordas.
  // =========================================================================
  const flowerGeo = new THREE.DodecahedronGeometry(0.12, 0);
  const rockSmallGeo = new THREE.DodecahedronGeometry(0.3, 1);

  const decorPoints: [number, number][] = [
    [-22, -8],
    [-12, -14],
    [8, -16],
    [24, -6],
    [-24, 6],
    [-10, 15],
    [10, 8],
    [22, 12],
    [-5, -10],
    [6, -4],
    [-8, 4],
    [4, 12],
  ];

  for (let i = 0; i < decorPoints.length; i++) {
    const [dx, dz] = decorPoints[i];
    const isFlower = i % 2 === 0;
    if (isFlower) {
      const fMat = i % 6 === 0 ? flowerPink : i % 4 === 0 ? flowerYellow : flowerWhite;
      scene.add(mesh(flowerGeo, fMat, dx, 0.12, dz, false));
      scene.add(mesh(flowerGeo, fMat, dx + 0.25, 0.14, dz - 0.2, false));
      scene.add(mesh(flowerGeo, flowerYellow, dx - 0.18, 0.11, dz + 0.18, false));
    } else {
      scene.add(mesh(rockSmallGeo, stoneMat, dx, 0.18, dz, true));
    }
  }

  // Arbustos e árvores campestres nos limites externos do campo gramado
  const bushGeo = new THREE.IcosahedronGeometry(0.95, 1);
  const canopyTopGeo = new THREE.IcosahedronGeometry(1.15, 1);
  const edgeBushes: [number, number][] = [
    [-34, -20],
    [-34, 0],
    [-34, 20],
    [34, -20],
    [34, 0],
    [34, 20],
    [-18, -21],
    [0, -21],
    [18, -21],
    [-18, 21],
    [0, 21],
    [18, 21],
  ];
  for (let i = 0; i < edgeBushes.length; i++) {
    const [bx, bz] = edgeBushes[i];
    scene.add(mesh(bushGeo, bushMat, bx, 0.65, bz, true));
    scene.add(mesh( rockSmallGeo, bushLightMat, bx + 0.45, 0.95, bz - 0.25, false));

    // Intercala árvores campestres fora da área jogável para emoldurar o horizonte
    if (i % 2 === 0) {
      const tx = bx * 1.12;
      const tz = bz * 1.12;
      scene.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), trunkMat, tx, 1.1, tz, true));
      scene.add(mesh(canopyTopGeo, bushMat, tx, 2.6, tz, true));
      scene.add(mesh(bushGeo, bushLightMat, tx + 0.4, 3.2, tz - 0.3, true));
    }
  }
}
