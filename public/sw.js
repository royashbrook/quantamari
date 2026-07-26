const CACHE = "quarkatamari-v16";
// Paths are RELATIVE to the service worker's own directory, so this works whether the app is served
// at a domain root or under a subpath (e.g. /quarkatamari). Root-absolute paths would resolve to the
// hosting site's root and precache the wrong files.
//
// NOTE: "./" only, never "./index.html". Some static hosts 30x-redirect /index.html -> / and
// cache.addAll REJECTS a redirected response, and it's all-or-nothing, so that one entry silently
// aborts the entire precache and the app never works offline. "./" serves the same shell at a 200.
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        }).catch(() => caches.match("/index.html")),
    ),
  );
});
