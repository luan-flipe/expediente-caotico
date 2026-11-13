import * as THREE from "three";

/**
 * Troca o PBR (MeshStandardMaterial) do cenário parado por Lambert, guardando cor, textura, emissivo e AO. O PBR com IBL
 * custava metade do quadro em tela cheia (Suspeito, estádio do futebol); no cenário a diferença quase não aparece.
 */
export function useLambert(root: THREE.Object3D, skip: Set<THREE.Object3D> = new Set()): void {
  const swapped = new Map<THREE.Material, THREE.Material>();
  const convert = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshStandardMaterial)) return m;
    let l = swapped.get(m);
    if (!l) {
      const lambert = new THREE.MeshLambertMaterial();
      THREE.Material.prototype.copy.call(lambert, m);
      lambert.color.copy(m.color);
      lambert.map = m.map;
      lambert.emissive.copy(m.emissive);
      lambert.emissiveMap = m.emissiveMap;
      lambert.emissiveIntensity = m.emissiveIntensity;
      lambert.aoMap = m.aoMap;
      lambert.aoMapIntensity = m.aoMapIntensity;
      lambert.alphaMap = m.alphaMap;
      lambert.flatShading = m.flatShading;
      l = lambert;
      swapped.set(m, l);
      m.dispose();
    }
    return l;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || skip.has(mesh)) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}
