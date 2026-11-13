import { describe, expect, it } from "vitest";
import type { FutSnapshot } from "@ec/shared";
import { alvoDoPasse } from "./passeAlvo";

type Jogador = FutSnapshot["players"][number];
const j = (id: string, side: 0 | 1, x: number, z: number, extra: Partial<Jogador> = {}): Jogador => ({
  id, name: id, side, role: "linha", x, z, vx: 0, vz: 0, facing: 0, sliding: false, down: false, yellow: 0, sentOff: false, isBot: true, connected: true, ...extra,
});

// eu em (0,0) olhando para +x (facing = 90 graus)
const eu = { id: "eu", side: 0 as const, x: 0, z: 0, facing: Math.PI / 2 };

describe("alvo do passe", () => {
  it("escolhe o companheiro mais alinhado com a direção do meu boneco", () => {
    const lista = [j("eu", 0, 9, 9), j("frente", 0, 10, 1), j("lado", 0, 0, 10), j("rival", 1, 5, 0)];
    expect(alvoDoPasse(eu, lista, () => undefined)).toBe("frente");
  });

  it("usa a posição desenhada, não a do snapshot", () => {
    const lista = [j("a", 0, 10, 0), j("b", 0, 0, 10)];
    const desenhado = (id: string) => (id === "a" ? { x: 0, z: -10 } : id === "b" ? { x: 10, z: 0.5 } : undefined);
    expect(alvoDoPasse(eu, lista, desenhado)).toBe("b");
  });

  it("ignora goleiro, expulso e caído; sem ninguém, null", () => {
    const lista = [j("gk", 0, 10, 0, { role: "goleiro" }), j("exp", 0, 10, 0, { sentOff: true }), j("caido", 0, 10, 0, { down: true })];
    expect(alvoDoPasse(eu, lista, () => undefined)).toBeNull();
  });
});
