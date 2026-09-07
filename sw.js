/* Service worker — AgroNotas (Total Fruit Curacaví)
   Permite usar la app sin señal: guarda una copia en el iPad y,
   cuando hay internet, busca la versión más nueva en segundo plano. */
const CACHE = "agronotas-v105";
const ORTOS = "agronotas-ortos"; // ortofotos del dron: caché aparte, no se borra al actualizar la app
const ARCHIVOS = ["./", "./index.html", "./AgroNotas%20v3.html", "./apple-touch-icon.png"];
const ORTOFOTOS = ["./santa_sara_orto.webp", "./cuesta_vieja_orto.webp"];
const esOrto = url => /\.webp(\?.*)?$/i.test(url);

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => {
      c.add("https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js").catch(()=>{});
      return c.addAll(ARCHIVOS).catch(()=>{});
    }),
    /* ortofotos: se bajan una sola vez (si ya están, no se vuelven a descargar); cada una por separado */
    caches.open(ORTOS).then(c => Promise.all(ORTOFOTOS.map(u => c.match(u).then(r => r ? null : c.add(u).catch(()=>{})))))
  ]));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== ORTOS).map(k => caches.delete(k)))));
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
  /* recursos: caché primero, actualizando en segundo plano (las ortofotos van a su propia caché) */
  const nom = esOrto(e.request.url) ? ORTOS : CACHE;
  e.respondWith(
    caches.match(e.request).then(res => {
      const red = fetch(e.request).then(r => {
        if (r && r.ok) caches.open(nom).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => res);
      return res || red;
    })
  );
});
