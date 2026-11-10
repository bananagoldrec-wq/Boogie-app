/* Service worker network-first do app "Tarefas": busca a versão
   mais recente quando online, cai para o cache quando estiver offline. */
const CACHE = "tarefas-v2";
const PRECACHE = [
  "./tarefas.html",
  "./css/tarefas.css",
  "./js/tarefas.js",
  "./manifest-tarefas.json",
  "./icons/icon-tarefas-192.png",
  "./icons/icon-tarefas-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
