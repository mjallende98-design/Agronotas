/* Service worker — AgroNotas (Total Fruit Curacaví)
   Permite usar la app sin señal: guarda una copia en el iPad y,
   cuando hay internet, busca la versión más nueva en segundo plano. */
const CACHE = "agronotas-v8";
const ARCHIVOS = ["./", "./index.html", "./AgroNotas%20v3.html", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const esHTML = e.request.mode === "navigate" || e.request.url.indexOf(".html") > -1;
  if (esHTML) {
    /* páginas: RED PRIMERO (la versión nueva llega al tiro); sin señal, usa la copia guardada */
    e.respondWith(
      fetch(e.request).then(r => {
        if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  /* recursos: caché primero, actualizando en segundo plano */
  e.respondWith(
    caches.match(e.request).then(res => {
      const red = fetch(e.request).then(r => {
        if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => res);
      return res || red;
    })
  );
});
