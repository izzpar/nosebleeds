// The Nosebleeds service worker: shows game alerts sent by /api/notify and
// opens the linked page when one is tapped. No offline caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "The Nosebleeds", body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "The Nosebleeds", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin) && "focus" in w) { await w.navigate(url).catch(() => {}); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
