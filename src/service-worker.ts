/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { base, build, files, prerendered, version } from "$service-worker";

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE_NAMESPACE = "quarkatamari-";
const CACHE = `${CACHE_NAMESPACE}v2-${version}`;
const APP_SHELL = `${base}/`;
const RESCUE_ROUTE = `${base}/rescue`;
const STATIC_FILES = files.filter((path) => {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return !fileName.startsWith("_") && !fileName.endsWith(".html");
});
const ASSETS = [
  ...new Set([
    ...build,
    ...STATIC_FILES,
    ...prerendered,
    APP_SHELL,
    RESCUE_ROUTE,
  ]),
];

worker.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)),
  );
});

worker.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") {
    void worker.skipWaiting();
  }
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_NAMESPACE) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

// A lie-fi connection should fall back to the cached shell instead of
// hanging a PWA launch until the network fully fails.
const NAVIGATION_TIMEOUT_MS = 3500;

function fetchWithTimeout(request: Request, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

worker.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin) return;

  // Cache writes happen after the response is returned so they never sit on
  // the critical path of a page load.
  const storeInCache = (
    key: Request | string,
    response: Response,
  ) => {
    const copy = response.clone();
    event.waitUntil(
      caches.open(CACHE).then((cache) => cache.put(key, copy)),
    );
  };

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (event.request.mode === "navigate") {
        try {
          const response = await fetchWithTimeout(
            event.request,
            NAVIGATION_TIMEOUT_MS,
          );
          if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);
          storeInCache(event.request, response);
          return response;
        } catch {
          return (
            (await cache.match(event.request)) ??
            (await cache.match(APP_SHELL)) ??
            Response.error()
          );
        }
      }

      if (ASSETS.includes(url.pathname)) {
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          storeInCache(event.request, response);
        }
        return response;
      } catch {
        return (await cache.match(event.request)) ?? Response.error();
      }
    })(),
  );
});
