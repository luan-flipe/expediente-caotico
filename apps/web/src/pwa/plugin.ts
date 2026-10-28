import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { entraNoPrecache, gerarPrecache, montarSw, versaoDe } from "./precache";

const AQUI = dirname(fileURLToPath(import.meta.url));

function listar(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(join(dir, e.name)) : [join(dir, e.name)]));
}

/** Depois do build, escreve dist/sw.js com a lista de pré-cache e as versões dos caches. */
export function pwaSw(): Plugin {
  let outDir = "";
  return {
    name: "ec-pwa-sw",
    apply: "build",
    configResolved(c) {
      outDir = join(c.root, c.build.outDir);
    },
    closeBundle() {
      const arquivos = listar(outDir)
        .map((f) => relative(outDir, f).replace(/\\/g, "/"))
        .filter((f) => f !== "sw.js");
      const precache = gerarPrecache(arquivos);
      const lido = (f: string): [string, Uint8Array] => [f, readFileSync(join(outDir, f))];
      const versaoShell = versaoDe(arquivos.filter(entraNoPrecache).map(lido));
      // modelos e áudio só trocam de cache quando mudam de verdade, para não rebaixar tudo a cada deploy
      const versaoAssets = versaoDe(arquivos.filter((f) => !entraNoPrecache(f) && f !== "sw.js" && f.startsWith("assets/")).map(lido));
      const sw = montarSw({
        precache,
        versaoShell,
        versaoAssets,
        rota: readFileSync(join(AQUI, "rota.js"), "utf8"),
        corpo: readFileSync(join(AQUI, "sw-corpo.js"), "utf8"),
      });
      writeFileSync(join(outDir, "sw.js"), sw);
    },
  };
}
