import { createHash } from "node:crypto";

// Auxiliares do build (rodam no Node, dentro do plugin do Vite).

/** Casco do app: html, JS/CSS do build, manifesto e ícones. Modelos, áudio e imagens grandes vão pelo cache em tempo de execução. */
export function entraNoPrecache(arquivo: string): boolean {
  const f = arquivo.replace(/\\/g, "/");
  if (f === "sw.js" || f.endsWith(".map")) return false;
  if (f.startsWith("icons/")) return f.endsWith(".png");
  if (f.startsWith("assets/")) return /^assets\/[^/]+\.(js|css)$/.test(f);
  return /^[^/]+\.(html|webmanifest)$/.test(f);
}

/** Caminhos (com "/" na frente) ordenados, para a lista não mudar à toa entre builds. */
export function gerarPrecache(arquivos: string[]): string[] {
  return arquivos
    .filter(entraNoPrecache)
    .map((f) => "/" + f.replace(/\\/g, "/"))
    .sort();
}

/** Hash curto de pares [caminho, conteúdo], independente da ordem. */
export function versaoDe(itens: [string, string | Uint8Array][]): string {
  const h = createHash("sha1");
  for (const [caminho, conteudo] of [...itens].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    h.update(caminho).update("\0").update(conteudo).update("\0");
  }
  return h.digest("hex").slice(0, 10);
}

export interface PartesSw {
  precache: string[];
  versaoShell: string;
  versaoAssets: string;
  rota: string;
  corpo: string;
}

/** Junta constantes do build + rota (sem "export") + corpo do service worker. */
export function montarSw(p: PartesSw): string {
  return [
    "// Gerado no build por apps/web/src/pwa/plugin.ts. Não edite.",
    `const PRECACHE = ${JSON.stringify(p.precache)};`,
    `const CACHE_SHELL = ${JSON.stringify("ec-shell-" + p.versaoShell)};`,
    `const CACHE_ASSETS = ${JSON.stringify("ec-assets-" + p.versaoAssets)};`,
    p.rota.replace(/^export\s+/gm, ""),
    p.corpo,
  ].join("\n");
}
