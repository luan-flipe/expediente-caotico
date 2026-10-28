// Corpo do service worker. O plugin define PRECACHE, CACHE_SHELL, CACHE_ASSETS e estrategiaDe() antes dele.
/* eslint-disable no-undef -- globais do service worker e constantes injetadas no build */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("ec-") && n !== CACHE_SHELL && n !== CACHE_ASSETS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function cachePrimeiro(req) {
  const hit = (await caches.match(req)) ?? null;
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) {
    const copia = res.clone();
    caches.open(CACHE_ASSETS).then((c) => c.put(req, copia));
  }
  return res;
}

async function navegacao(req) {
  try {
    return await fetch(req);
  } catch {
    // sem rede: abre o casco do app (a tela inicial avisa que criar sala precisa de conexão)
    return (await caches.match("/index.html")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const modo = estrategiaDe({ url: req.url, method: req.method, mode: req.mode, range: req.headers.has("range") }, self.location.origin);
  if (modo === "cache-primeiro") event.respondWith(cachePrimeiro(req));
  else if (modo === "navegacao") event.respondWith(navegacao(req));
});
