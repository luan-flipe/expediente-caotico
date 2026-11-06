import { fileURLToPath } from "node:url";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { NodeIO, type Animation, type Document } from "@gltf-transform/core";
import { MeshoptDecoder } from "meshoptimizer";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIP_OF, CLIP_RANGE } from "./character";

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

/** Clipes de locomoção que o boneco procura por nome (loop("parado") etc.). */
const LOCOMOTION_CLIPS = ["parado", "andar", "correr"];

/** Ossos e nós que character.ts busca por nome com getObjectByName. */
const BONES = [
  "tronco",
  "cabeca",
  "perna_D",
  "perna_E",
  "joelho_D",
  "joelho_E",
  "pe_D",
  "pe_E",
  "ombro_D",
  "ombro_E",
  "cotovelo_D",
  "cotovelo_E",
  "punho_D",
  "punho_E",
  "dedos_D",
  "dedos_E",
  "dedos2_D",
  "dedos2_E",
  "polegar_D",
  "polegar_E",
];

/** Duração de um clipe: maior tempo entre os samplers. */
function durationOf(anim: Animation): number {
  let max = 0;
  for (const s of anim.listSamplers()) {
    const t = s.getInput()?.getMax([]);
    if (t && t[0] > max) max = t[0];
  }
  return max;
}

// o arquivo fonte é a referência; o de public/ é a versão otimizada (meshopt) que o jogo realmente carrega
describe.each([
  ["assets-src/characters/boneco_completo.glb"],
  ["apps/web/public/assets/characters/boneco_completo.glb"],
])("contrato do boneco: %s", (file) => {
  let doc: Document;
  beforeAll(async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    doc = await io.read(root(file));
  });

  it("tem os clipes de locomoção", () => {
    const names = doc.getRoot().listAnimations().map((a) => a.getName());
    for (const n of LOCOMOTION_CLIPS) expect(names, n).toContain(n);
  });

  it("tem o clipe de cada ação (CLIP_OF)", () => {
    const names = doc.getRoot().listAnimations().map((a) => a.getName());
    for (const [action, clip] of Object.entries(CLIP_OF)) expect(names, `${action} -> ${clip}`).toContain(clip);
  });

  it("a duração de cada clipe cobre o trecho útil (CLIP_RANGE)", () => {
    for (const [action, [from, to]] of Object.entries(CLIP_RANGE)) {
      const anim = doc.getRoot().listAnimations().find((a) => a.getName() === CLIP_OF[action as keyof typeof CLIP_OF]);
      expect(anim, action).toBeDefined();
      expect(from, action).toBeGreaterThanOrEqual(0);
      expect(to, action).toBeGreaterThan(from);
      expect(durationOf(anim!) + 1e-3, action).toBeGreaterThanOrEqual(to);
    }
  });

  it("toda faixa de animação aponta para um nó existente", () => {
    const nodes = new Set(doc.getRoot().listNodes());
    for (const anim of doc.getRoot().listAnimations()) {
      expect(anim.listChannels().length, anim.getName()).toBeGreaterThan(0);
      for (const ch of anim.listChannels()) {
        const node = ch.getTargetNode();
        expect(node, `${anim.getName()}:${ch.getTargetPath()}`).not.toBeNull();
        expect(nodes.has(node!), `${anim.getName()}:${node?.getName()}`).toBe(true);
      }
    }
  });

  it("tem os ossos buscados por nome", () => {
    const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
    for (const b of BONES) expect(names.has(b), b).toBe(true);
  });
});
