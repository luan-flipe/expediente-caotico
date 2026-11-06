import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { criarConfete } from "./confete";

function arquivo(): THREE.Group {
  const cena = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.06, 0.035);
  ["#ff0000", "#00ff00", "#0000ff"].forEach((cor, i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, side: THREE.DoubleSide }));
    m.name = `confete_${i}`;
    m.position.set(i, 2, 0);
    cena.add(m);
  });
  return cena;
}

const instancia = (root: THREE.Object3D) => root.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;

describe("confete", () => {
  it("desenha todos os pedaços de uma vez, com a cor de cada um e o material do arquivo", () => {
    const c = criarConfete(arquivo())!;
    const m = instancia(c.root);
    expect(m.count).toBe(3);
    const cor = new THREE.Color();
    m.getColorAt(1, cor);
    expect(cor.getHexString()).toBe("00ff00");
    const mat = m.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe("ffffff");
    expect(mat.roughness).toBe(0.6);
    expect(mat.side).toBe(THREE.DoubleSide);
  });

  it("nasce escondido e os nós têm o nome que a animação procura", () => {
    const c = criarConfete(arquivo())!;
    expect(c.root.visible).toBe(false);
    expect(c.root.getObjectByName("confete_2")).toBeDefined();
  });

  it("segue a animação escrita nos nós, só enquanto está visível", () => {
    const c = criarConfete(arquivo())!;
    const m = instancia(c.root);
    const pos = (i: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(m.instanceMatrix.array, i * 16));
    c.root.getObjectByName("confete_1")!.position.set(5, 6, 7);
    c.atualizar();
    expect(pos(1).x).toBe(1);
    c.root.visible = true;
    c.atualizar();
    expect(pos(1).toArray()).toEqual([5, 6, 7]);
  });

  it("os karts dividem geometria e material", () => {
    const cena = arquivo();
    const a = instancia(criarConfete(cena)!.root);
    const b = instancia(criarConfete(cena)!.root);
    expect(a.material).toBe(b.material);
    expect(a.geometry).toBe(b.geometry);
  });

  it("arquivo sem malhas não quebra a corrida", () => {
    expect(criarConfete(new THREE.Group())).toBeNull();
  });
});
