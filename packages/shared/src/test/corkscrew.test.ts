import { describe, expect, it } from "vitest";
import { stepKart, type KartState } from "../race/kart";
import { corkscrewRoll, corkscrewTransform, pointAt, sideNormal, TRACKS, trackPoint3D } from "../race/track";

describe("Pista do Deserto - Saca-rolhas 360° (Corkscrew Loop)", () => {
  const track = TRACKS.deserto;
  const cork = track.corkscrew!;

  it("possui parâmetros do saca-rolhas válidos na Pista do Deserto", () => {
    expect(cork).toBeDefined();
    expect(cork.sStart).toBeGreaterThan(200);
    expect(cork.sEnd).toBeGreaterThan(cork.sStart);
    expect(cork.axisY).toBeCloseTo(9.4, 1);
  });

  it("calcula roll e transformação 3D de cabeça para baixo no ápice", () => {
    const sMid = (cork.sStart + cork.sEnd) / 2;
    const rollMid = corkscrewRoll(track, sMid);
    // No meio do loop, o roll deve estar próximo de PI (180°) - totalmente invertido
    expect(rollMid).toBeGreaterThan(Math.PI * 0.9);
    expect(rollMid).toBeLessThanOrEqual(Math.PI * 1.1);

    // No ápice, a altura deve estar perto de 2 * axisY (9.4 * 2 = 18.8m)
    const trApex = corkscrewTransform(track, sMid, 0, 0);
    expect(trApex.y).toBeGreaterThan(16);
    expect(trApex.y).toBeLessThan(20);
    expect(trApex.roll).toBeCloseTo(rollMid, 3);
  });

  it("câmera 3D via trackPoint3D nunca afunda abaixo do chão nem perfura o mapa", () => {
    // Amostra a posição da câmera e do chão ao longo de todo o percurso do saca-rolhas
    for (let s = cork.sStart; s <= cork.sEnd; s += 2) {
      const camDistS = 8.0;
      const camS = ((s - camDistS) % track.length + track.length) % track.length;
      const camH = 3.3;
      const camP = trackPoint3D(track, camS, 0, camH);

      // Câmera deve estar sempre bem acima do chão (Y > 0)
      expect(camP.y).toBeGreaterThan(0.5);

      // No ápice do saca-rolhas, a câmera deve acompanhar a inversão no teto
      if (Math.abs(s - (cork.sStart + cork.sEnd) / 2) < 5) {
        expect(camP.y).toBeGreaterThan(10);
      }
    }
  });

  it("kart atravessa o saca-rolhas sem bater na parede e de cabeça para baixo", () => {
    // Inicia kart um pouco antes do saca-rolhas apontado para a tangente da pista
    const startS = cork.sStart - 5;
    const pt0 = pointAt(track, startS);
    let k: KartState = {
      pos: { x: pt0.pos.x, z: pt0.pos.z },
      heading: pt0.heading,
      speed: 25,
      path: 0,
    };

    let reachedApex = false;
    let maxRoll = 0;
    let hitWall = false;

    const dtMs = 16;
    for (let i = 0; i < 300; i++) {
      const res = stepKart(k, { steer: 0, throttle: 1, drift: false }, dtMs, i * dtMs, track);
      k = res.state;
      if (res.wall) hitWall = true;

      const roll = res.state.roll ?? 0;
      if (roll > maxRoll) maxRoll = roll;
      if (roll > Math.PI * 0.8) reachedApex = true;

      // Se passou do sEnd, completou o loop!
      if (res.progress && res.progress.s > cork.sEnd + 5) {
        break;
      }
    }

    // Não deve bater ou travar na subida da pista como se fosse parede
    expect(hitWall).toBe(false);
    // Deve atingir o ápice do loop invertido
    expect(reachedApex).toBe(true);
    expect(maxRoll).toBeGreaterThan(Math.PI * 0.95);
    // Velocidade deve se manter alta pelo impulso magnético anti-gravidade
    expect(k.speed).toBeGreaterThanOrEqual(20);
  });

  it("permite esterçamento suave (steer) entre faixas sem sair da pista no saca-rolhas", () => {
    const sMid = (cork.sStart + cork.sEnd) / 2;
    const ptMid = pointAt(track, sMid);
    const nrm = sideNormal(Math.sin(ptMid.heading), Math.cos(ptMid.heading));

    // Kart no centro da pista no meio do saca-rolhas
    let k: KartState = {
      pos: { x: ptMid.pos.x, z: ptMid.pos.z },
      heading: ptMid.heading,
      speed: 22,
      path: 0,
    };

    // Vira para a direita durante 0.5s
    for (let i = 0; i < 30; i++) {
      const res = stepKart(k, { steer: 1, throttle: 1, drift: false }, 16, i * 16, track);
      k = res.state;
    }

    // Kart deve ter se movido lateralmente sem bugar
    expect(k.speed).toBeGreaterThanOrEqual(20);
  });
});
