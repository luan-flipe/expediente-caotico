import { describe, expect, it } from "vitest";
import { estrategiaDe } from "./rota.js";

const ORIGEM = "https://jogo.exemplo";
const get = (path: string, extra: Record<string, unknown> = {}) => estrategiaDe({ url: ORIGEM + path, method: "GET", mode: "no-cors", range: false, ...extra }, ORIGEM);

describe("estratégia de cache por URL", () => {
  it("API e websocket vão sempre para a rede", () => {
    expect(get("/api/config")).toBe("rede");
    expect(get("/api/ranking?x=1")).toBe("rede");
    expect(get("/ws")).toBe("rede");
    expect(get("/health")).toBe("rede");
  });

  it("modelos, áudio e JS/CSS de /assets/ usam cache primeiro", () => {
    expect(get("/assets/characters/boneco.glb")).toBe("cache-primeiro");
    expect(get("/assets/audio/turbo_pixel_drift.mp3")).toBe("cache-primeiro");
    expect(get("/assets/index-AbC123.js")).toBe("cache-primeiro");
  });

  it("ícones e manifesto usam cache primeiro", () => {
    expect(get("/icons/icon-192.png")).toBe("cache-primeiro");
    expect(get("/manifest.webmanifest")).toBe("cache-primeiro");
  });

  it("navegação tenta a rede e cai no index.html em cache", () => {
    expect(get("/", { mode: "navigate" })).toBe("navegacao");
    expect(get("/?sala=ABCDE", { mode: "navigate" })).toBe("navegacao");
  });

  it("o próprio sw.js nunca passa pelo cache", () => {
    expect(get("/sw.js")).toBe("rede");
  });

  it("POST, Range e outra origem são ignorados", () => {
    expect(get("/assets/x.glb", { method: "POST" })).toBe("ignorar");
    expect(get("/assets/x.mp3", { range: true })).toBe("ignorar");
    expect(estrategiaDe({ url: "https://fonts.googleapis.com/css2?x", method: "GET", mode: "cors", range: false }, ORIGEM)).toBe("ignorar");
  });

  it("URL inválida é ignorada", () => {
    expect(estrategiaDe({ url: "::", method: "GET", mode: "no-cors", range: false }, ORIGEM)).toBe("ignorar");
  });
});
