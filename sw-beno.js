/* Service worker network-first: sempre busca a versão mais recente quando
   online, pra o app instalado não ficar preso numa versão antiga em cache
   — que é justamente o problema que o ?v= do beno.html existe pra evitar.
   Cai para o cache só quando estiver offline.

   Os dados do app ficam no localStorage do aparelho, então offline ele
   abre e mostra tudo o que já estava lá; só não busca o que é de rede. */
const CACHE = "beno-negocia-v1";

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
