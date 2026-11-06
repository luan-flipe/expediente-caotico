import * as THREE from "three";

/** O que todo confete tem em comum, tirado uma vez do arquivo da comemoração. */
interface Molde {
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
  pedacos: { nome: string; cor: THREE.Color; pos: THREE.Vector3; rot: THREE.Quaternion; esc: THREE.Vector3 }[];
}

const moldes = new WeakMap<THREE.Object3D, Molde>();

/** No arquivo são 170 malhas iguais, cada uma com material próprio, só em 7 cores: o material vira branco e a cor vai por pedaço. */
function moldeDe(cena: THREE.Object3D): Molde | null {
  const salvo = moldes.get(cena);
  if (salvo) return salvo;
  const malhas = cena.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true);
  if (!malhas.length) return null;
  const material = (malhas[0].material as THREE.MeshStandardMaterial).clone();
  material.color.set("#ffffff");
  const molde: Molde = {
    geometria: malhas[0].geometry,
    material,
    pedacos: malhas.map((m) => ({ nome: m.name, cor: (m.material as THREE.MeshStandardMaterial).color.clone(), pos: m.position.clone(), rot: m.quaternion.clone(), esc: m.scale.clone() })),
  };
  moldes.set(cena, molde);
  return molde;
}

export interface Confete {
  root: THREE.Group;
  /** Passa para o desenho a posição que a animação deu a cada pedaço. Só faz algo enquanto o confete está visível. */
  atualizar(): void;
  dispose(): void;
}

/**
 * Confete da chegada desenhado de uma vez só. Os nós com o nome de cada pedaço continuam na árvore porque é neles que
 * a animação do arquivo escreve. Geometria e material são compartilhados entre os karts. Nasce escondido.
 */
export function criarConfete(cena: THREE.Object3D): Confete | null {
  const molde = moldeDe(cena);
  if (!molde) return null;
  const root = new THREE.Group();
  root.name = "confete";
  root.visible = false;
  const malha = new THREE.InstancedMesh(molde.geometria, molde.material, molde.pedacos.length);
  // os pedaços voam para longe da origem: a esfera calculada na primeira posição cortaria o confete
  malha.frustumCulled = false;
  malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const nos = molde.pedacos.map((p, i) => {
    const no = new THREE.Object3D();
    no.name = p.nome;
    no.position.copy(p.pos);
    no.quaternion.copy(p.rot);
    no.scale.copy(p.esc);
    // ninguém desenha estes nós: sem isso a cena recalcularia 170 matrizes por kart em todo quadro
    no.matrixAutoUpdate = false;
    no.matrixWorldAutoUpdate = false;
    root.add(no);
    malha.setColorAt(i, p.cor);
    return no;
  });
  root.add(malha);
  const passar = () => {
    nos.forEach((no, i) => {
      no.updateMatrix();
      malha.setMatrixAt(i, no.matrix);
    });
    malha.instanceMatrix.needsUpdate = true;
  };
  passar();
  return {
    root,
    atualizar() {
      if (root.visible) passar();
    },
    dispose() {
      malha.dispose();
    },
  };
}
