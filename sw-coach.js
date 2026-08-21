/* Service worker do Coach: rede primeiro, cache como rede de segurança.

   O app é útil offline (professor local, vocabulário salvo, palavra do dia),
   então vale guardar a casca; mas quando há rede, a versão nova vence — o
   app instalado nunca fica preso numa versão antiga. As chamadas à API do
   professor nunca são cacheadas. */
const CACHE = "coach-v1";
const SHELL = [
  "./coach.html",
  "./css/coach.css",
  "./js/coach/app.js",
  "./js/coach/views.js",
  "./js/coach/session.js",
  "./js/coach/engine.js",
  "./js/coach/content.js",
  "./js/coach/store.js",
  "./js/coach/speech.js",
  "./js/coach/ai.js",
  "./js/coach/ui.js",
  "./manifest-coach.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;   // professor: sempre online
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./coach.html")))
  );
});
