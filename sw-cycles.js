/* Service worker do Cycles Visual.
   - Na instalação, guarda TUDO que o app precisa (código, 3D, análise e as
     obras do banco listadas em refs/refs.json): no show, funciona sem internet.
   - Com internet, busca sempre a versão mais nova (rede primeiro) e atualiza
     o que está guardado; sem internet, usa o guardado.
   Registrado com escopo ./cycles.html pra não interferir nos outros apps do site. */
const CACHE = "cycles-visual-v53";
const CORE = [
  "cycles.html",
  "css/cycles.css",
  "js/cycles.js",
  "js/cycles-analise.js",
  "js/p2-ouvido.js",
  "js/fm-engine.js",
  "js/fm-panel.js",
  "js/fm-figures.js",
  "js/cycles-3d.js",
  "js/projeto2.js",
  "js/endless-climb.js",
  "js/bauhaus-orbital-024.js",
  "js/infinite-microcosmos-030.js",
  "js/bauhaus-scenes.js",
  "js/vendor/three-r128.min.js",
  "manifest-cycles.json",
  "icons/icon-cycles-192.png",
  "icons/icon-cycles-512.png",
  "icons/apple-touch-icon-cycles.png",
  "refs/refs.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // as obras do banco (cada uma separada: se uma falhar, as outras ficam)
    try {
      const r = await fetch("refs/refs.json", { cache: "no-cache" });
      const m = await r.json();
      const srcs = m.sets.flatMap((s) => s.items.map((it) => it.src));
      await Promise.all(srcs.map((src) => c.add(src).catch(() => {})));
    } catch { /* sem banco: o app funciona sem as obras */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("cycles-visual-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      // "no-cache": sempre confere com o servidor (o GitHub manda guardar por 10 min,
      // e sem isso a versão nova demorava a aparecer)
      const res = await fetch(e.request, { cache: "no-cache" });
      if (res.ok) {
        const copy = res.clone();
        // guarda sem o ?v=… pra o guardado valer pra qualquer versão
        caches.open(CACHE).then((c) => c.put(url.origin + url.pathname, copy)).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(url.origin + url.pathname) || await caches.match(e.request, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});

// a página pergunta quantos arquivos já estão guardados (indicador "pronto pra usar offline")
self.addEventListener("message", async (e) => {
  if (e.data !== "status") return;
  const c = await caches.open(CACHE);
  const keys = await c.keys();
  e.source && e.source.postMessage({ type: "status", files: keys.length, cache: CACHE });
});
