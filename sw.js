/* Service worker network-first: sempre busca a versão mais recente quando
   online (evita o app instalado ficar preso numa versão antiga em cache).
   Cai para o cache só quando estiver offline. */
const CACHE = "disco-boogie-v1";

self.addEventListener("install", (e) => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // guarda uma cópia para fallback offline
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Mostra notificação pedida pelo app (funciona mesmo com app minimizado no iOS PWA)
self.addEventListener("message", (e) => {
  if (e.data?.type !== "SHOW_NOTIFICATION") return;
  e.waitUntil(
    self.registration.showNotification(e.data.title, {
      body:  e.data.body,
      icon:  "/Boogie-app/icons/icon-192.png",
      badge: "/Boogie-app/icons/icon-192.png",
      tag:   e.data.tag || "rotina",
      renotify: true,
      requireInteraction: true,
      vibrate: [600, 300, 600, 300, 600, 300, 600],
    })
  );
});

// Ao tocar na notificação, abre/foca o app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const tracker = list.find(c => c.url.includes("tracker.html"));
      if (tracker) return tracker.focus();
      return self.clients.openWindow("/Boogie-app/tracker.html");
    })
  );
});

