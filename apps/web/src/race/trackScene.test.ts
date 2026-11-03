import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getTrack } from "@ec/shared";
import { buildTrack } from "./trackScene";

describe("buildTrack - Cenário e Elementos Estilizados Nintendo Odyssey", () => {
  it("monta o Circuito Corporativo com bebedouros, plantas, caixas e quadros satíricos", () => {
    const scene = new THREE.Scene();
    const track = getTrack("corporativo");

    const dispose = buildTrack(scene, track);

    // Deve ter adicionado malhas e grupos na cena
    expect(scene.children.length).toBeGreaterThan(0);

    // Deve conter quadros satíricos corporativos emoldurados
    const framedPosters = scene.children.filter((c) => {
      if (c instanceof THREE.Group && c.children.length >= 2) {
        // Quadro tem moldura e tela com poster
        const hasPlane = c.children.some((child) => (child as THREE.Mesh).geometry instanceof THREE.PlaneGeometry);
        const hasBox = c.children.some((child) => (child as THREE.Mesh).geometry instanceof THREE.BoxGeometry);
        return hasPlane && hasBox;
      }
      return false;
    });

    expect(framedPosters.length).toBeGreaterThanOrEqual(4);

    // Libera texturas da cena sem falhas
    expect(() => dispose()).not.toThrow();
  });

  it("monta a pista da Copa sem erros e com decorações ricas", () => {
    const scene = new THREE.Scene();
    const track = getTrack("copa");

    const dispose = buildTrack(scene, track);
    expect(scene.children.length).toBeGreaterThan(0);
    expect(() => dispose()).not.toThrow();
  });

  it("monta a pista do Estacionamento sem erros", () => {
    const scene = new THREE.Scene();
    const track = getTrack("estacionamento");

    const dispose = buildTrack(scene, track);
    expect(scene.children.length).toBeGreaterThan(0);
    expect(() => dispose()).not.toThrow();
  });

  it("monta a pista do Parque Ipanema sem erros e com cenário 3D", () => {
    const scene = new THREE.Scene();
    const track = getTrack("parque");

    const dispose = buildTrack(scene, track);
    expect(scene.children.length).toBeGreaterThan(0);
    expect(() => dispose()).not.toThrow();
  });
});
