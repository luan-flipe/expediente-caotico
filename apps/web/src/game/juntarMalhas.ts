import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Junta as malhas paradas de um modelo em poucas malhas, uma por material, para desenhar com menos draw calls.
 *
 * Cada malha entra na junção do "nó de apoio" dela: o ancestral mais próximo que está em `moveis` (nós que o jogo
 * gira, escala ou move depois) ou a própria `raiz`. A malha juntada vira filha desse nó, então continua acompanhando
 * o movimento dele. Malhas em `moveis` ficam como estão (com os filhos que não forem juntados).
 *
 * Materiais iguais em tudo (cor, rugosidade, texturas...) contam como um só: os modelos exportados costumam repetir o
 * mesmo material em várias peças. SkinnedMesh, InstancedMesh, malhas com morph e materiais com shader próprio ficam de
 * fora. Os atributos viram Float32 antes da junção (os GLB comprimidos usam inteiros normalizados).
 *
 * Devolve as geometrias criadas: quem chama é dono delas e faz o dispose. As geometrias e materiais originais não são
 * tocados (podem ser do modelo compartilhado).
 */
export function juntarMalhas(raiz: THREE.Object3D, moveis: Iterable<THREE.Object3D> = []): THREE.BufferGeometry[] {
  const fixos = new Set(moveis);
  raiz.updateMatrixWorld(true);

  const candidatas: THREE.Mesh[] = [];
  raiz.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && podeJuntar(m) && !fixos.has(m)) candidatas.push(m);
  });

  const grupos = new Map<string, { apoio: THREE.Object3D; malhas: THREE.Mesh[] }>();
  for (const m of candidatas) {
    const apoio = noDeApoio(m, raiz, fixos);
    if (!apoio) continue;
    const chave = `${apoio.uuid}|${chaveMaterial(m.material as THREE.Material)}|${chaveAtributos(m.geometry)}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${m.layers.mask}`;
    let g = grupos.get(chave);
    if (!g) grupos.set(chave, (g = { apoio, malhas: [] }));
    g.malhas.push(m);
  }

  const criadas: THREE.BufferGeometry[] = [];
  const inversa = new THREE.Matrix4();
  const relativa = new THREE.Matrix4();
  for (const { apoio, malhas } of grupos.values()) {
    if (malhas.length < 2) continue;
    inversa.copy(apoio.matrixWorld).invert();
    const geos = malhas.map((m) => {
      relativa.multiplyMatrices(inversa, m.matrixWorld);
      return paraApoio(m.geometry, relativa);
    });
    // caixas e cilindros são indexados, o icosaedro não: mistura vira tudo não indexado
    const mista = geos.some((g) => !g.index) && geos.some((g) => g.index);
    const prontas = mista ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
    const junta = mergeGeometries(prontas, false);
    for (const g of new Set([...geos, ...prontas])) g.dispose();
    if (!junta) continue;
    const primeira = malhas[0];
    const nova = new THREE.Mesh(junta, primeira.material);
    nova.name = `${primeira.name || "malha"}_junta`;
    nova.castShadow = primeira.castShadow;
    nova.receiveShadow = primeira.receiveShadow;
    nova.renderOrder = primeira.renderOrder;
    nova.layers.mask = primeira.layers.mask;
    for (const m of malhas) {
      // filhos que não entram na junção (nós móveis, sprites...) sobem para o pai sem sair do lugar
      for (const filho of [...m.children]) m.parent?.attach(filho);
      m.removeFromParent();
    }
    apoio.add(nova);
    criadas.push(junta);
  }
  return criadas;
}

function podeJuntar(m: THREE.Mesh): boolean {
  if ((m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return false;
  if (Array.isArray(m.material) || !m.visible) return false;
  const g = m.geometry;
  if (Object.keys(g.morphAttributes).length > 0 || g.groups.length > 0 || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  const mat = m.material as THREE.Material;
  return !(mat as THREE.ShaderMaterial).isShaderMaterial;
}

/** Nó de apoio da malha, ou null se algum nó no caminho estiver escondido (pode aparecer depois, não entra). */
function noDeApoio(m: THREE.Mesh, raiz: THREE.Object3D, fixos: Set<THREE.Object3D>): THREE.Object3D | null {
  let p = m.parent;
  while (p && p !== raiz && !fixos.has(p)) {
    if (!p.visible) return null;
    p = p.parent;
  }
  return p ?? raiz;
}

/** Materiais com os mesmos valores dão a mesma chave. Material já com shader alterado só junta consigo mesmo. */
function chaveMaterial(mat: THREE.Material): string {
  if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || Object.keys(mat.userData).length > 0) return mat.uuid;
  const partes: unknown[] = [mat.type, mat.side, mat.transparent, mat.opacity, mat.alphaTest, mat.depthWrite, mat.depthTest, mat.blending, mat.vertexColors, mat.toneMapped];
  // lê as propriedades pelo nome, valendo para qualquer tipo de material (as que não existem dão undefined)
  const props = mat as unknown as Record<string, unknown>;
  for (const k of ["color", "emissive", "specular", "sheenColor"]) if ((props[k] as THREE.Color | undefined)?.isColor) partes.push((props[k] as THREE.Color).getHexString());
  for (const k of ["roughness", "metalness", "emissiveIntensity", "envMapIntensity", "flatShading", "wireframe", "fog", "clearcoat", "transmission"]) partes.push(props[k]);
  for (const [k, v] of Object.entries(props)) if ((v as THREE.Texture | null)?.isTexture) partes.push(`${k}:${(v as THREE.Texture).uuid}`);
  return partes.join(";");
}

function chaveAtributos(g: THREE.BufferGeometry): string {
  return Object.entries(g.attributes)
    .map(([k, a]) => `${k}${a.itemSize}`)
    .sort()
    .join(",");
}

/** Cópia da geometria em Float32, levada para o espaço do nó de apoio. Espelhada (determinante < 0) inverte os triângulos. */
function paraApoio(src: THREE.BufferGeometry, matriz: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [nome, a] of Object.entries(src.attributes)) {
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(nome, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const espelhada = matriz.determinant() < 0;
  if (src.index) {
    const idx = Array.from(src.index.array);
    if (espelhada) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
  } else if (espelhada) {
    const idx: number[] = [];
    for (let i = 0; i < g.attributes.position.count; i += 3) idx.push(i, i + 2, i + 1);
    g.setIndex(idx);
  }
  g.applyMatrix4(matriz);
  return g;
}
