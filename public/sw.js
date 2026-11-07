/* Gadu Sorteos — service worker mínimo para que la PWA sea instalable.
 *
 * Estrategia:
 *  - Navegación: red primero, cache como respaldo si no hay conexión.
 *  - Estáticos (_next/static, imágenes, íconos): cache primero.
 *  - Nunca cachea /api, /auth ni métodos que no sean GET.
 */
const CACHE = "gadu-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  const esEstatico =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons") ||
    /\.(png|jpg|jpeg|webp|svg|css|js|woff2?)$/.test(url.pathname);

  if (esEstatico) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copia = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
  }
});
