import { describe, expect, it } from "vitest";
import { FUT_FORMATS, fieldFor } from "@ec/shared";
import { BOARD_LEN, BOARD_OFF_END, BOARD_OFF_SIDE, GRASS_EDGE, adIndex, adStep, boardSlots, boardsFit, frameRects } from "./arenaLayout";
import { ANUNCIANTES } from "./anunciantes";
import { MAX_CROWD, STANDS, bounce, cellKey, crowdCount, crowdEnergy, ringCandidate, rng } from "./torcidaLayout";

const formats = FUT_FORMATS;

describe("moldura do entorno", () => {
  it("cobre o gramado fora do campo sem invadir o campo, em todo formato", () => {
    for (const fm of formats) {
      const f = fieldFor(fm);
      const rects = frameRects(f);
      expect(rects.length).toBe(4);
      let area = 0;
      for (const r of rects) {
        area += r.w * r.d;
        // nenhuma faixa entra no retângulo do campo
        const overlapX = Math.min(r.x + r.w / 2, f.halfL) - Math.max(r.x - r.w / 2, -f.halfL);
        const overlapZ = Math.min(r.z + r.d / 2, f.halfW) - Math.max(r.z - r.d / 2, -f.halfW);
        expect(overlapX > 1e-6 && overlapZ > 1e-6).toBe(false);
      }
      // área das faixas = gramado - campo
      expect(area).toBeCloseTo(GRASS_EDGE.halfL * 2 * GRASS_EDGE.halfW * 2 - f.halfL * 2 * f.halfW * 2, 4);
    }
  });

  it("não há moldura quando o campo ocupa o gramado", () => {
    const f = { ...fieldFor(4), halfL: GRASS_EDGE.halfL, halfW: GRASS_EDGE.halfW };
    expect(frameRects(f)).toEqual([]);
  });
});

describe("placas de publicidade", () => {
  it("ficam fora do campo, afastadas da linha, e deixam o vão atrás dos gols", () => {
    for (const fm of formats) {
      const f = fieldFor(fm);
      const slots = boardSlots(f);
      expect(slots.length).toBeGreaterThan(4);
      for (const s of slots) {
        const side = Math.abs(s.z) - f.halfW;
        const end = Math.abs(s.x) - f.halfL;
        // lateral ou fundo, nunca dentro do campo
        expect(side >= BOARD_OFF_SIDE - 1e-6 || end >= BOARD_OFF_END - 1e-6).toBe(true);
        if (end >= BOARD_OFF_END - 1e-6) {
          // atrás do gol: a placa inteira fica fora da boca do gol com folga
          expect(Math.abs(s.z) - BOARD_LEN / 2).toBeGreaterThanOrEqual(f.goalHalfW + 3 - 1e-6);
        }
      }
    }
  });

  it("a face aponta para o centro do campo", () => {
    const f = fieldFor(2);
    for (const s of boardSlots(f)) {
      const nx = Math.sin(s.yaw);
      const nz = Math.cos(s.yaw);
      expect(nx * -s.x + nz * -s.z).toBeGreaterThan(0);
    }
  });

  it("trechos curtos não têm placa", () => {
    expect(boardsFit(3.9)).toBe(0);
    expect(boardsFit(BOARD_LEN)).toBe(1);
  });

  it("rodízio: cada passo desloca os anunciantes e volta ao início", () => {
    const n = ANUNCIANTES.length;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(adIndex(0, 0, n)).toBe(0);
    expect(adIndex(0, 1, n)).toBe(1);
    expect(adIndex(2, n, n)).toBe(2);
    expect(adIndex(n - 1, 1, n)).toBe(0);
    expect(adStep(7.9, 8)).toBe(0);
    expect(adStep(8, 8)).toBe(1);
    // em um passo todos os anunciantes aparecem em placas diferentes
    expect(new Set(Array.from({ length: n }, (_, i) => adIndex(i, 3, n))).size).toBe(n);
  });

  it("a lista de anunciantes tem o destaque e só os nomes fictícios esperados", () => {
    expect(ANUNCIANTES[0].nome).toBe("ANUNCIE AQUI");
    expect(ANUNCIANTES[0].destaque).toBe(true);
    // lista fechada: um anunciante novo (real) exige conferir este teste de propósito
    expect(ANUNCIANTES.map((a) => a.nome)).toEqual(["ANUNCIE AQUI", "Expediente Caótico", "Café da Copa", "Grampeador Turbo", "RH Express", "Impressora Descontrolada"]);
    const marcas = /coca|pepsi|nike|adidas|samsung|apple|google|microsoft|ambev|brahma|skol|itau|bradesco|petrobras|vivo|claro|globo|amazon|nestle|nescafe|3m|epson|canon|brother|bic|stanley/i;
    for (const a of ANUNCIANTES) expect(a.nome).not.toMatch(marcas);
  });
});

describe("torcida", () => {
  it("candidatos caem no anel das arquibancadas e o sorteio é determinístico", () => {
    const a = rng(5);
    const b = rng(5);
    for (let i = 0; i < 200; i++) {
      const p = ringCandidate(a);
      expect(ringCandidate(b)).toEqual(p);
      const s = Math.hypot(p.x / STANDS.a, p.z / STANDS.b);
      expect(s).toBeGreaterThanOrEqual(STANDS.sMin - 1e-9);
      expect(s).toBeLessThanOrEqual(STANDS.sMax + 1e-9);
      // olha para o centro
      expect(Math.sin(p.yaw) * -p.x + Math.cos(p.yaw) * -p.z).toBeGreaterThan(0);
    }
  });

  it("energia: cheia no começo e zero depois de 3 s", () => {
    expect(crowdEnergy(0)).toBe(1);
    expect(crowdEnergy(2)).toBe(1);
    expect(crowdEnergy(2.7)).toBeGreaterThan(0);
    expect(crowdEnergy(2.7)).toBeLessThan(1);
    expect(crowdEnergy(3)).toBe(0);
    expect(crowdEnergy(-1)).toBe(0);
  });

  it("pula mais com energia e nunca afunda", () => {
    let calm = 0;
    let wild = 0;
    for (let t = 0; t < 4; t += 0.05) {
      calm = Math.max(calm, bounce(t, 1, 0));
      wild = Math.max(wild, bounce(t, 1, 1));
      expect(bounce(t, 1, 0)).toBeGreaterThanOrEqual(0);
    }
    expect(calm).toBeLessThan(0.06);
    expect(wild).toBeGreaterThan(0.4);
  });

  it("modo Leve usa metade e a grade evita sobreposição", () => {
    expect(crowdCount(MAX_CROWD, "leve")).toBe(MAX_CROWD / 2);
    expect(crowdCount(MAX_CROWD, "alta")).toBe(MAX_CROWD);
    expect(cellKey(0, 0)).toBe(cellKey(0.2, 0.2));
    expect(cellKey(0, 0)).not.toBe(cellKey(3, 0));
  });
});
