import * as THREE from "three";
import { OFFICE_MAP } from "@ec/shared";
import { createOutdoorGroundMaterial } from "./floorTextures";

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Monta o mapa como um campo gramado aberto, sem paredes nem móveis de escritório, com relevos e escadas. */
export function buildOffice(scene: THREE.Scene): void {
  const W = OFFICE_MAP.width;
  const D = OFFICE_MAP.depth;

  // Gramado contínuo cobrindo toda a arena e o horizonte visível
  const groundMat = createOutdoorGroundMaterial();
  const ground = mesh(new THREE.PlaneGeometry(W + 60, D + 50), groundMat, 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Materiais orgânicos para os relevos e escadas campestres
  const earthBase = new THREE.MeshStandardMaterial({ color: "#54463a", roughness: 0.95, flatShading: true });
  const plateauGrass = new THREE.MeshStandardMaterial({ color: "#4f7d3d", roughness: 0.9, flatShading: true });
  const rusticWood = new THREE.MeshStandardMaterial({ color: "#7a5c3e", roughness: 0.85, flatShading: true });
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#757c82", roughness: 0.9, flatShading: true });
  const flowerWhite = new THREE.MeshStandardMaterial({ color: "#fefefe", roughness: 0.8 });
  const flowerYellow = new THREE.MeshStandardMaterial({ color: "#f7d038", roughness: 0.8 });
  const bushMat = new THREE.MeshStandardMaterial({ color: "#3d6e32", roughness: 0.95, flatShading: true });

  // =========================================================================
  // RELEVOS E PLATAFORMAS ELEVADAS (COLINAS / PLATÔS DO CAMPO GRAMADO)
  // =========================================================================
  if (OFFICE_MAP.elevations) {
    for (const elev of OFFICE_MAP.elevations) {
      const baseH = elev.h;
      // Base sólida de terra / rocha da colina
      scene.add(mesh(new THREE.BoxGeometry(elev.w, baseH, elev.d), earthBase, elev.x, baseH / 2, elev.z));
      // Topo gramado do platô elevado
      scene.add(mesh(new THREE.BoxGeometry(elev.w + 0.1, 0.08, elev.d + 0.1), plateauGrass, elev.x, elev.h + 0.04, elev.z));

      // Pequenas pedras ao redor da base da colina
      const rockGeo = new THREE.DodecahedronGeometry(0.35, 0);
      scene.add(mesh(rockGeo, stoneMat, elev.x - elev.w / 2 - 0.2, 0.2, elev.z + elev.d / 2 - 0.4));
      scene.add(mesh(rockGeo, stoneMat, elev.x + elev.w / 2 + 0.2, 0.2, elev.z - elev.d / 2 + 0.4));
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
          // Bloco rústico do degrau
          scene.add(mesh(new THREE.BoxGeometry(stepW * 1.02, curY, stair.d), earthBase, curX, curY / 2, stair.z));
          // Pisada de madeira rústica do degrau
          scene.add(mesh(new THREE.BoxGeometry(stepW * 1.06, stepThick, stair.d + 0.06), rusticWood, curX, curY + stepThick / 2, stair.z));
        }
      } else {
        const stepD = stair.d / n;
        const zStart = stair.z - stair.d / 2 + stepD / 2;
        for (let i = 0; i < n; i++) {
          const progress = (i + 1) / n;
          const curY = stair.h0 + (stair.direction > 0 ? progress : 1 - i / n) * (stair.h1 - stair.h0);
          const curZ = zStart + (stair.direction > 0 ? i : n - 1 - i) * stepD;
          scene.add(mesh(new THREE.BoxGeometry(stair.w, curY, stepD * 1.02), earthBase, stair.x, curY / 2, curZ));
          scene.add(mesh(new THREE.BoxGeometry(stair.w + 0.06, stepThick, stepD * 1.06), rusticWood, stair.x, curY + stepThick / 2, curZ));
        }
      }
    }
  }

  // =========================================================================
  // DETALHES NATURAIS DO CAMPO ABERTO (FLORES E PEQUENAS PEDRAS DECORATIVAS)
  // Sem colisores físicos, campo 100% desobstruído para tiros e movimentação.
  // =========================================================================
  const flowerGeo = new THREE.DodecahedronGeometry(0.12, 0);
  const rockSmallGeo = new THREE.DodecahedronGeometry(0.28, 0);

  // Espalha pequenas flores e detalhes decorativos pelo gramado
  const decorPoints: [number, number][] = [
    [-22, -8], [-12, -14], [8, -16], [24, -6],
    [-24, 6], [-10, 15], [10, 8], [22, 12],
    [-5, -10], [6, -4], [-8, 4], [4, 12],
  ];

  for (let i = 0; i < decorPoints.length; i++) {
    const [dx, dz] = decorPoints[i];
    const isFlower = i % 2 === 0;
    if (isFlower) {
      const fMat = i % 4 === 0 ? flowerYellow : flowerWhite;
      scene.add(mesh(flowerGeo, fMat, dx, 0.12, dz, false));
      scene.add(mesh(flowerGeo, fMat, dx + 0.25, 0.14, dz - 0.2, false));
    } else {
      scene.add(mesh(rockSmallGeo, stoneMat, dx, 0.18, dz, true));
    }
  }

  // Arbustos decorativos suaves nos limites externos do campo gramado
  const bushGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const edgeBushes: [number, number][] = [
    [-34, -20], [-34, 0], [-34, 20],
    [34, -20], [34, 0], [34, 20],
    [-18, -21], [0, -21], [18, -21],
    [-18, 21], [0, 21], [18, 21],
  ];
  for (const [bx, bz] of edgeBushes) {
    scene.add(mesh(bushGeo, bushMat, bx, 0.65, bz, true));
  }
}
