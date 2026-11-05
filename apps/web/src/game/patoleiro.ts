import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * Cria o modelo 3D do PATOLEIRO (patinho de borracha clássico).
 *
 * Características:
 * - Corpo gordinho e fofo em amarelo borracha vibrante, com barriga e costas arredondadas;
 * - Rabinho arrebitado na traseira;
 * - Asinhas curvadas nas laterais;
 * - Pescoço e cabeça redondinha proporcional;
 * - Bico de pato achatado clássico em laranja vivo (com mandíbula superior e inferior);
 * - Olhinhos pretos brilhantes com pontinho de brilho (catchlight) branco.
 *
 * Olha para +z (frente do jogo).
 */
export function createPatoleiro(scale = 1, extras?: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();

  const yellow = new THREE.MeshStandardMaterial({
    color: "#ffd000",
    roughness: 0.35,
    metalness: 0.05,
  });
  const orange = new THREE.MeshStandardMaterial({
    color: "#ff6200",
    roughness: 0.38,
    metalness: 0.05,
  });
  const black = new THREE.MeshStandardMaterial({
    color: "#151515",
    roughness: 0.1,
    metalness: 0.1,
  });
  const white = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.2,
  });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    if (extras) extras.push(mesh);
    return mesh;
  };

  // 1. Corpo arredondado (achatado no Y, alongado no Z)
  const bodyGeo = new THREE.SphereGeometry(0.065, 18, 14);
  bodyGeo.scale(1.0, 0.85, 1.25);
  add(bodyGeo, yellow, 0, 0.055, 0);

  // 2. Rabinho arrebitado na traseira (-z)
  const tailGeo = new THREE.ConeGeometry(0.028, 0.06, 12);
  tailGeo.rotateX(Math.PI / 3.2);
  add(tailGeo, yellow, 0, 0.065, -0.075);

  // 3. Asas nas laterais (+x e -x)
  for (const s of [-1, 1]) {
    const wingGeo = new THREE.SphereGeometry(0.038, 12, 10);
    wingGeo.scale(0.3, 0.75, 1.15);
    add(wingGeo, yellow, s * 0.058, 0.055, -0.005, -0.12, s * 0.1, s * -0.2);
  }

  // 4. Pescoço conectando o peito à cabeça
  add(new THREE.CylinderGeometry(0.034, 0.046, 0.036, 14), yellow, 0, 0.09, 0.03);

  // 5. Cabeça redondinha
  add(new THREE.SphereGeometry(0.048, 18, 16), yellow, 0, 0.126, 0.035);

  // 6. Bico clássico de pato (laranja brilhante, pontas suaves)
  add(new RoundedBoxGeometry(0.048, 0.015, 0.042, 3, 0.006), orange, 0, 0.118, 0.078);
  add(new RoundedBoxGeometry(0.04, 0.01, 0.032, 2, 0.004), orange, 0, 0.108, 0.074);

  // 7. Olhinhos com brilho expressivo
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.0085, 12, 10), black, s * 0.033, 0.138, 0.066);
    add(new THREE.SphereGeometry(0.003, 8, 8), white, s * 0.0345, 0.1415, 0.074);
  }

  if (scale !== 1) {
    g.scale.setScalar(scale);
  }

  return g;
}

/**
 * Adiciona o Patoleiro posicionado diretamente a um objeto pai.
 */
export function addPatoleiro(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  scale = 1,
  extras?: THREE.Mesh[],
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Group {
  const duck = createPatoleiro(scale, extras);
  duck.position.set(x, y, z);
  if (rx || ry || rz) duck.rotation.set(rx, ry, rz);
  parent.add(duck);
  return duck;
}
