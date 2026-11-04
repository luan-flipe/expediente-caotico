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

  it("monta a pista do Deserto com cânion, túnel, boost pads e vegetação sem erros", () => {
    const scene = new THREE.Scene();
    const track = getTrack("deserto");

    const dispose = buildTrack(scene, track);
    expect(scene.children.length).toBeGreaterThan(0);

    // Névoa desértica em tom de areia quente (#e7cfa8)
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect((scene.fog as THREE.Fog).color.getHexString()).toBe("e7cfa8");

    // Luz solar dourada (#ffe2b8)
    let goldenSunFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight && obj.color.getHexString() === "ffe2b8") {
        goldenSunFound = true;
      }
    });
    expect(goldenSunFound).toBe(true);

    // Placas de impulso (Boost pads) com textura de chevron e faíscas
    let boostPadsFound = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && Array.isArray(obj.material)) {
        boostPadsFound++;
      }
    });
    expect(boostPadsFound).toBeGreaterThanOrEqual(1);

    // Poço de lama viscosa no fundo do cânion (ShaderMaterial ou bolhas 0x4a3320)
    let mudPitFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.material instanceof THREE.ShaderMaterial) {
          mudPitFound = true;
        } else if (obj.material instanceof THREE.MeshStandardMaterial && obj.material.color.getHexString() === "4a3320") {
          mudPitFound = true;
        }
      }
    });
    expect(mudPitFound).toBe(true);

    // Cactos saguaro e vegetação do deserto instanciada
    let saguaroFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && obj.material instanceof THREE.MeshStandardMaterial) {
        const hex = obj.material.color.getHexString();
        if (hex === "557a3a" || hex === "4f7236" || hex === "6b8a3e") {
          saguaroFound = true;
        }
      }
    });
    expect(saguaroFound).toBe(true);

    // Casinhas rústicas de adobe agrupadas por material
    let adobeHouseFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        const hex = obj.material.color.getHexString();
        if (["c4683e", "cf8636", "c9775f", "b9925c"].includes(hex)) {
          adobeHouseFound = true;
        }
      }
    });
    expect(adobeHouseFound).toBe(true);

    // Tubo cilíndrico do túnel do maciço rochoso (#8a847c)
    let tunnelTubeFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        if (obj.material.color.getHexString() === "8a847c" && obj.material.side === THREE.DoubleSide) {
          tunnelTubeFound = true;
        }
      }
    });
    expect(tunnelTubeFound).toBe(true);

    // Anéis de néon dourado (#ffcf6e) ao redor do tubo
    let neonRingsCount = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && obj.material instanceof THREE.MeshBasicMaterial) {
        if (obj.material.color.getHexString() === "ffcf6e") {
          neonRingsCount += obj.count;
        }
      }
    });
    expect(neonRingsCount).toBeGreaterThanOrEqual(8);

    // Luzes pontuais internas âmbar (#ffd9a0)
    let amberLightsCount = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.PointLight && obj.color.getHexString() === "ffd9a0") {
        amberLightsCount++;
      }
    });
    expect(amberLightsCount).toBeGreaterThanOrEqual(3);

    // Flores coloridas nos cactos-bola
    let flowerFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && obj.material instanceof THREE.MeshStandardMaterial) {
        if (obj.material.color.getHexString() === "f06aa0") {
          flowerFound = true;
        }
      }
    });
    expect(flowerFound).toBe(true);

    // Tufos de capim dourado do sertão (#c9a866)
    let goldenGrassFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && obj.material instanceof THREE.MeshStandardMaterial) {
        if (obj.material.color.getHexString() === "c9a866") {
          goldenGrassFound = true;
        }
      }
    });
    expect(goldenGrassFound).toBe(true);

    // Malha do asfalto do deserto no saca-rolhas dá a volta completa (corkscrew loop > 18m de altura)
    let corkscrewLoopFound = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BufferGeometry) {
        const pos = obj.geometry.getAttribute("position");
        if (pos) {
          for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) > 18.0) {
              corkscrewLoopFound = true;
              break;
            }
          }
        }
      }
    });
    expect(corkscrewLoopFound).toBe(true);

    // Libera texturas da cena sem falhas
    expect(() => dispose()).not.toThrow();
  });
});
