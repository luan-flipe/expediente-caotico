import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DROP_SECONDS, DeslizeDeJoelhos, SLIDE_DIST, SLIDE_SECONDS, poseWeight, slideDistance } from "./joelhos";

/** Esqueleto mínimo com os nomes dos ossos do boneco (só o que a pose mexe). */
function boneco(): { figure: THREE.Group; bone: (n: string) => THREE.Bone } {
  const figure = new THREE.Group();
  const mk = (name: string, parent: THREE.Object3D, y = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.y = y;
    parent.add(b);
    return b;
  };
  const root = mk("root", figure, 0.149);
  const tronco = mk("tronco", root, 0.4);
  mk("cabeca", tronco, 0.5);
  for (const s of ["D", "E"]) {
    const ombro = mk(`ombro_${s}`, tronco, 0.345);
    ombro.rotation.z = s === "D" ? 1.3 : -1.3;
    mk(`cotovelo_${s}`, ombro);
    const perna = mk(`perna_${s}`, root, 0.33);
    const joelho = mk(`joelho_${s}`, perna, -0.24);
    mk(`pe_${s}`, joelho, -0.16);
  }
  return { figure, bone: (n) => figure.getObjectByName(n) as THREE.Bone };
}

/** Rotação em x de um osso (radianos). */
const rx = (o: THREE.Object3D) => new THREE.Euler().setFromQuaternion(o.quaternion).x;
const rz = (o: THREE.Object3D) => new THREE.Euler().setFromQuaternion(o.quaternion).z;

describe("deslize de joelhos", () => {
  it("o deslize sai rápido, desacelera e para em SLIDE_DIST", () => {
    expect(slideDistance(0)).toBe(0);
    expect(slideDistance(SLIDE_SECONDS)).toBeCloseTo(SLIDE_DIST);
    expect(slideDistance(SLIDE_SECONDS * 5)).toBeCloseTo(SLIDE_DIST);
    const a = slideDistance(0.2) - slideDistance(0);
    const b = slideDistance(SLIDE_SECONDS) - slideDistance(SLIDE_SECONDS - 0.2);
    expect(a).toBeGreaterThan(b * 3);
  });

  it("a pose entra em DROP_SECONDS e fica", () => {
    expect(poseWeight(0)).toBe(0);
    expect(poseWeight(DROP_SECONDS)).toBe(1);
    expect(poseWeight(10)).toBe(1);
  });

  it("no instante 0 os ossos ficam como estavam", () => {
    const { figure, bone } = boneco();
    const antes = bone("joelho_D").quaternion.clone();
    new DeslizeDeJoelhos(figure).apply(0);
    expect(bone("joelho_D").quaternion.angleTo(antes)).toBeCloseTo(0);
    expect(bone("root").position.y).toBeCloseTo(0.149);
  });

  it("na pose: joelhos dobrados, tronco para trás, braços abertos e quadril baixo", () => {
    const { figure, bone } = boneco();
    new DeslizeDeJoelhos(figure).apply(1);
    expect(rx(bone("joelho_D"))).toBeGreaterThan(1.5);
    expect(rx(bone("joelho_E"))).toBeGreaterThan(1.5);
    expect(rx(bone("tronco"))).toBeLessThan(-0.3);
    // braço aberto: o direito (lado -x) sobe com z negativo, o esquerdo com z positivo
    expect(rz(bone("ombro_D"))).toBeLessThan(0);
    expect(rz(bone("ombro_E"))).toBeGreaterThan(0);
    expect(bone("root").position.y).toBeLessThan(0.149 - 0.12);
  });

  it("chamar de novo a cada quadro não afunda o quadril", () => {
    const { figure, bone } = boneco();
    const d = new DeslizeDeJoelhos(figure);
    for (let t = 0.5; t < 3; t += 1 / 60) d.apply(t);
    const y = bone("root").position.y;
    d.apply(3);
    expect(bone("root").position.y).toBeCloseTo(y);
  });

  it("empurra o boneco para onde ele olha, só visual", () => {
    const { figure } = boneco();
    figure.rotation.y = Math.PI / 2;
    figure.position.set(10, 0, 5);
    new DeslizeDeJoelhos(figure).apply(SLIDE_SECONDS);
    expect(figure.position.x).toBeCloseTo(10 + SLIDE_DIST);
    expect(figure.position.z).toBeCloseTo(5);
  });

  it("restore devolve os ossos ao que eram", () => {
    const { figure, bone } = boneco();
    const q = bone("ombro_D").quaternion.clone();
    const d = new DeslizeDeJoelhos(figure);
    d.apply(2);
    d.restore();
    expect(bone("ombro_D").quaternion.angleTo(q)).toBeCloseTo(0);
    expect(bone("root").position.y).toBeCloseTo(0.149);
  });
});
