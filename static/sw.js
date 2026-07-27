// Permanent tombstone for Quarkatamari's pre-SvelteKit worker.
//
// Older versions registered ./sw.js. Returning 404 here can leave that worker
// alive with obsolete files, so the old path now removes only Quarkatamari
// caches, unregisters itself, and reloads its own clients into the current app.
// Keep this file for as long as an old installed copy might exist.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("quarkatamari-")) await caches.delete(key);
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url);
      }
    })(),
  );
});
