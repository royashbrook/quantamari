const CACHE_PREFIX = "quarkatamari-";
const CACHE = "quarkatamari-v17-__PRECACHE_VERSION__";
// Paths are RELATIVE to the service worker's own directory, so this works whether the app is served
// at a domain root or under a subpath (e.g. /quarkatamari). Root-absolute paths would resolve to the
// hosting site's root and precache the wrong files.
//
// NOTE: "./" only, never "./index.html". Some static hosts 30x-redirect /index.html -> / and
// cache.addAll REJECTS a redirected response, and it's all-or-nothing, so that one entry silently
// aborts the entire precache and the app never works offline. "./" serves the same shell at a 200.
const appUrl = (path) => new URL(path, self.location.href).href;
const SHELL_PATHS = [
  "./",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png"
];
const PRECACHE_CHUNKS = [
  /* __PRECACHE_CHUNKS__ */
];
const PRECACHE = [...SHELL_PATHS, ...PRECACHE_CHUNKS].map(appUrl);
const APP_SHELL = appUrl("./");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

const remember = async (request, response) => {
  if (response.ok) {
    await caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
  }
  return response;
};

const handleNavigation = async (request) => {
  try {
    return await remember(request, await fetch(request));
  } catch {
    const cache = await caches.open(CACHE);
    return (
      (await cache.match(request)) ||
      (await cache.match(APP_SHELL)) ||
      Response.error()
    );
  }
};

const handleAsset = async (request) => {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  return remember(request, await fetch(request));
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    request.mode === "navigate"
      ? handleNavigation(request)
      : handleAsset(request),
  );
});
