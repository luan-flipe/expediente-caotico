/* eslint-disable no-undef -- roda no service worker (URL é global dele) */
// Decide como o service worker trata cada requisição. Este arquivo é injetado no sw.js
// (o plugin tira o "export"), então só pode usar JavaScript puro, sem imports.

/**
 * @param {{ url: string; method: string; mode: string; range: boolean }} req
 * @param {string} origem origem do site (location.origin do SW)
 * @returns {"rede" | "cache-primeiro" | "navegacao" | "ignorar"}
 */
export function estrategiaDe(req, origem) {
  if (req.method !== "GET" || req.range) return "ignorar";
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return "ignorar";
  }
  // fontes do Google, login do Google e afins ficam com o navegador
  if (url.origin !== origem) return "ignorar";
  const p = url.pathname;
  if (p.startsWith("/api/") || p === "/ws" || p === "/health" || p === "/sw.js") return "rede";
  if (req.mode === "navigate") return "navegacao";
  if (p.startsWith("/assets/") || p.startsWith("/icons/") || p === "/manifest.webmanifest") return "cache-primeiro";
  return "rede";
}
