import * as THREE from "three";
import type { HazardKind } from "@ec/shared";

/** Materiais são da corrida, compartilhados entre os itens; a geometria é de cada item e é descartada com ele. */
export type MaterialDoItem = (chave: string, criar: () => THREE.Material) => THREE.Material;

/** Cor própria que não apaga na sombra nem some contra o piso claro. */
function solido(cor: string, brilho = 0.2, roughness = 0.6): () => THREE.Material {
  return () => new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: brilho, roughness, metalness: 0 });
}

function peca(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Poça com volume: uma mancha chata no chão some de longe, e o relevo do parque passa alguns centímetros do chão da física. */
function poca(mat: MaterialDoItem): THREE.Group {
  const g = new THREE.Group();
  const cafe = mat("poca", solido("#3a1c0c", 0.3, 0.12));
  const creme = mat("pocaCreme", solido("#b06f30", 0.35, 0.25));
  const mancha = (raio: number, alto: number, x: number, z: number, m: THREE.Material, y = 0.1) => {
    const geo = new THREE.SphereGeometry(1, 20, 8);
    geo.scale(raio, alto, raio);
    g.add(peca(geo, m, x, y, z));
  };
  mancha(1.15, 0.16, 0, 0, cafe);
  // beirada irregular dentro do raio de acerto (1,3 m)
  mancha(0.5, 0.13, 0.85, 0.35, cafe);
  mancha(0.55, 0.13, -0.7, 0.6, cafe);
  mancha(0.45, 0.13, -0.25, -0.88, cafe);
  mancha(0.45, 0.04, -0.2, 0.15, creme, 0.25);
  mancha(0.24, 0.03, 0.42, -0.35, creme, 0.25);

  // copo tombado: dá silhueta à poça de longe, na altura em que a câmera olha
  const copo = new THREE.Group();
  copo.add(peca(new THREE.CylinderGeometry(0.27, 0.19, 0.62, 14), mat("pocaCopo", solido("#ffffff", 0.25))));
  copo.add(peca(new THREE.CylinderGeometry(0.255, 0.225, 0.2, 14), mat("pocaCopoFaixa", solido("#e8452c", 0.3))));
  copo.position.set(0.3, 0.42, 0.25);
  copo.rotation.set(0.4, 0.5, 1.2);
  copo.traverse((o) => (o.castShadow = true));
  g.add(copo);
  return g;
}

/** Bloco de 500 folhas no tamanho da colisão (0,9 m), com a cinta e a etiqueta visíveis de qualquer lado. */
function resma(mat: MaterialDoItem): THREE.Group {
  const g = new THREE.Group();
  const papel = peca(new THREE.BoxGeometry(1.35, 0.62, 0.95), mat("papel", solido("#ffffff", 0.18, 0.8)), 0, 0.31, 0);
  const cinta = peca(new THREE.BoxGeometry(1.38, 0.26, 0.98), mat("faixa", solido("#1668e3", 0.35, 0.5)), 0, 0.31, 0);
  const etiqueta = peca(new THREE.BoxGeometry(0.5, 0.03, 0.4), mat("etiqueta", solido("#ffd23f", 0.4, 0.5)), 0, 0.635, 0);
  for (const m of [papel, cinta, etiqueta]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/**
 * Grampo gigante em U, com as pernas para a frente, e rastro. O metal puro saía quase preto (a cena não tem mapa de
 * ambiente) e branco some no piso claro: azul forte se destaca em todas as pistas. O rastro não é aditivo pelo mesmo motivo.
 */
function grampo(mat: MaterialDoItem): THREE.Group {
  const g = new THREE.Group();
  const metal = mat("grampo", solido("#0a5cff", 0.55, 0.35));
  g.add(peca(new THREE.BoxGeometry(0.95, 0.13, 0.15), metal, 0, 0, -0.25));
  g.add(peca(new THREE.BoxGeometry(0.13, 0.13, 0.62), metal, -0.41, 0, 0.03));
  g.add(peca(new THREE.BoxGeometry(0.13, 0.13, 0.62), metal, 0.41, 0, 0.03));
  g.traverse((o) => (o.castShadow = true));
  const geoRastro = new THREE.ConeGeometry(0.22, 1.3, 10);
  geoRastro.rotateX(-Math.PI / 2);
  const rastro = peca(
    geoRastro,
    mat("grampoRastro", () => new THREE.MeshBasicMaterial({ color: "#2fa8ff", transparent: true, opacity: 0.55, depthWrite: false })),
    0,
    0,
    -0.95,
  );
  g.add(rastro);
  return g;
}

/** Aviãozinho dobrado, com o bico em +z (o sentido do voo): em V, para não sumir quando visto de lado como uma folha plana. */
function aviao(mat: MaterialDoItem): THREE.Group {
  const triangulos = (pontos: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pontos, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const bico = [0, 0, 1];
  const rabo = [0, 0.02, -0.65];
  const quilha = [0, -0.2, -0.65];
  const asaE = [-0.72, 0.2, -0.75];
  const asaD = [0.72, 0.2, -0.75];
  const papel = mat("aviao", () => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.7, side: THREE.DoubleSide }));
  const faixa = mat("aviaoFaixa", () => new THREE.MeshStandardMaterial({ color: "#e8452c", emissive: "#e8452c", emissiveIntensity: 0.35, roughness: 0.7, side: THREE.DoubleSide }));
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(triangulos([...bico, ...asaE, ...rabo, ...bico, ...rabo, ...asaD]), papel);
  corpo.castShadow = true;
  g.add(corpo);
  // quilha e pontas das asas coloridas (estas um pouco acima do papel): branco puro some contra o piso e o céu
  const faixas = new THREE.Mesh(
    triangulos([
      ...bico, ...quilha, ...rabo,
      -0.72, 0.215, -0.75, -0.2, 0.08, -0.68, -0.4, 0.15, 0.05,
      0.72, 0.215, -0.75, 0.4, 0.15, 0.05, 0.2, 0.08, -0.68,
    ]),
    faixa,
  );
  g.add(faixas);
  return g;
}

/** Item no chão ou em voo. A origem fica no chão (poça e resma) ou no centro da peça (grampo e avião). */
export function criarItem(kind: HazardKind, mat: MaterialDoItem): THREE.Group {
  if (kind === "poca") return poca(mat);
  if (kind === "resma") return resma(mat);
  if (kind === "grampo") return grampo(mat);
  return aviao(mat);
}
