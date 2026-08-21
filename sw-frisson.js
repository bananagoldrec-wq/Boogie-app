/* Service worker network-first: sempre busca a versão mais recente quando
   online (evita o app instalado ficar preso numa versão antiga em cache).
   Cai para o cache só quando estiver offline. Só existe pra habilitar a
   instalação como app — a agenda em si depende do Firestore online. */
const CACHE = "frisson-agenda-v1";

self.addEventListener("install", (e) => self.skipWaiting());

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
