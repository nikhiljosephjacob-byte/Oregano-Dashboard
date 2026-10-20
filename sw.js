// Oregano Dashboard — phone notifications (build 601). Upload next to dashboard.js.
// It only shows the notifications the dashboard sends (the 9 am "data is ready" message). No caching, no offline mode —
// the dashboard loads exactly as before.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let m = { title: "Oregano Dashboard", body: "Open the dashboard for the latest update.", url: "/", tag: "dash" };
    try {
      const s = await self.registration.pushManager.getSubscription();
      const r = await fetch("/api/push/last?ep=" + encodeURIComponent(s ? s.endpoint : ""), { cache: "no-store" });
      if (r.ok) m = Object.assign(m, await r.json());
    } catch (x) {}
    await self.registration.showNotification(m.title, { body: m.body, tag: m.tag, renotify: true, data: { url: m.url || "/" } });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const ws = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of ws) {
      if (!w.url.startsWith(self.location.origin)) continue;
      try { await w.focus(); if (url !== self.location.origin + "/") await w.navigate(url); return; } catch (x) {}
    }
    await self.clients.openWindow(url);
  })());
});
