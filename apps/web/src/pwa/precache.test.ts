import { describe, expect, it } from "vitest";
import { entraNoPrecache, gerarPrecache, montarSw, versaoDe } from "./precache";

const DIST = [
  "index.html",
  "manifest.webmanifest",
  "privacidade.html",
  "sw.js",
  "assets/index-AbC123.js",
  "assets/index-AbC123.js.map",
  "assets/App-Zz9.js",
  "assets/index-Q1.css",
  "assets/characters/boneco.glb",
  "assets/audio/turbo_pixel_drift.mp3",
  "assets/og.png",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png",
];

describe("lista de pré-cache", () => {
  it("leva o casco do app: html, JS/CSS do build, manifesto e ícones", () => {
    expect(gerarPrecache(DIST)).toEqual([
      "/assets/App-Zz9.js",
      "/assets/index-AbC123.js",
      "/assets/index-Q1.css",
      "/icons/apple-touch-icon.png",
      "/icons/icon-192.png",
      "/index.html",
      "/manifest.webmanifest",
      "/privacidade.html",
    ]);
  });

  it("deixa de fora modelos, áudio, imagens soltas, mapas e o próprio sw.js", () => {
    const lista = gerarPrecache(DIST);
    for (const fora of ["/sw.js", "/assets/og.png", "/assets/characters/boneco.glb", "/assets/index-AbC123.js.map"]) expect(lista).not.toContain(fora);
  });

  it("aceita separador do Windows", () => {
    expect(entraNoPrecache("assets\\index-A.js")).toBe(true);
    expect(gerarPrecache(["assets\\index-A.js"])).toEqual(["/assets/index-A.js"]);
  });
});

describe("versão", () => {
  it("é estável para o mesmo conteúdo e muda quando o conteúdo muda", () => {
    const a = versaoDe([["a.js", "1"], ["b.js", "2"]]);
    expect(versaoDe([["b.js", "2"], ["a.js", "1"]])).toBe(a);
    expect(versaoDe([["a.js", "1"], ["b.js", "3"]])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{10}$/);
  });
});

describe("montagem do sw.js", () => {
  it("injeta as constantes, tira o export da rota e anexa o corpo", () => {
    const sw = montarSw({ precache: ["/index.html"], versaoShell: "abc", versaoAssets: "def", rota: "export function estrategiaDe() {}\nexport const x = 1;", corpo: "self.addEventListener('fetch', () => {});" });
    expect(sw).toContain('const PRECACHE = ["/index.html"];');
    expect(sw).toContain('const CACHE_SHELL = "ec-shell-abc";');
    expect(sw).toContain('const CACHE_ASSETS = "ec-assets-def";');
    expect(sw).not.toMatch(/^export /m);
    expect(sw).toContain("function estrategiaDe() {}");
    expect(sw).toContain("addEventListener('fetch'");
  });
});
