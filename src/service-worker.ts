/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { base, build, files, prerendered, version } from "$service-worker";

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE_NAMESPACE = "quarkatamari-";
const CACHE = `${CACHE_NAMESPACE}v2-${version}`;
const APP_SHELL = `${base}/`;
const ASSETS = [...new Set([...build, ...files, ...prerendered, APP_SHELL])];

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

worker.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (event.request.mode === "navigate") {
        try {
          const response = await fetch(event.request);
          if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);
          await cache.put(event.request, response.clone());
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
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(event.request)) ?? Response.error();
      }
    })(),
  );
});
