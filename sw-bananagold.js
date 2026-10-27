/* Service worker network-first: sempre busca a versão mais recente quando
   online (evita o app instalado ficar preso numa versão antiga em cache).
   Cai para o cache só quando estiver offline. Só existe pra habilitar a
   instalação como app — a agenda em si sincroniza pelo Firestore quando online. */
const CACHE = "bananagold-v2";

self.addEventListener("install", (e) => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // do próprio site: sempre confere com o servidor (no-cache revalida),
  // pra página e o código nunca virem de versões diferentes
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  const req = sameOrigin ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" }) : e.request;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
