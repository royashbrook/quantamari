import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

test("ships a standalone offline-capable browser app", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../dist/client/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.ok(manifest.icons.every((icon) => icon.purpose.includes("maskable")));

  const serviceWorker = await readFile(
    new URL("../dist/client/sw.js", import.meta.url),
    "utf8",
  );
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /quarkatamari-v17-[a-f0-9]{12}/);
  assert.match(serviceWorker, /const CACHE_PREFIX = "quarkatamari-"/);
  assert.match(serviceWorker, /new URL\(path, self\.location\.href\)/);
  assert.doesNotMatch(
    serviceWorker,
    /caches\.match\(/,
    "lookups must stay inside the current versioned app cache",
  );
  assert.doesNotMatch(serviceWorker, /__PRECACHE_(?:CHUNKS|VERSION)__/);
  assert.doesNotMatch(
    serviceWorker,
    /skipWaiting|clients\.claim/,
    "an update must not replace and evict code beneath an already-open game",
  );
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.equal(
    serviceWorker.match(/cache\.match\(APP_SHELL\)/g)?.length,
    1,
    "only the navigation handler may fall back to the HTML shell",
  );

  const manifestMatch = serviceWorker.match(
    /const PRECACHE_CHUNKS = (\[[\s\S]*?\]);/,
  );
  assert.ok(manifestMatch, "the generated worker must contain a chunk manifest");
  const precacheChunks = JSON.parse(manifestMatch[1]);
  assert.ok(
    precacheChunks.every(
      (path) => path.startsWith("./") && !path.startsWith("../"),
    ),
    "precache paths must remain app-relative for subpath hosting",
  );

  const clientRoot = fileURLToPath(
    new URL("../dist/client/", import.meta.url),
  );
  const expectedChunks = (await filesBelow(clientRoot))
    .filter(
      (path) =>
        /\.(?:css|js)$/.test(path) &&
        relative(clientRoot, path).split(sep).join("/") !== "sw.js",
    )
    .map(
      (path) =>
        `./${relative(clientRoot, path).split(sep).join("/")}`,
    )
    .sort();
  assert.deepEqual(
    [...precacheChunks].sort(),
    expectedChunks,
    "cold installation must precache every deployable JS/CSS chunk",
  );
  assert.ok(
    precacheChunks.some((path) => /three(?:\.module)?-[^/]+\.js$/.test(path)),
    "the lazy Three.js chunk must work on the first offline launch",
  );

  for (const icon of ["icon-192.png", "icon-512.png"]) {
    assert.ok(
      (await stat(new URL(`../dist/client/${icon}`, import.meta.url))).size > 1000,
    );
  }

  const serverFiles = await readdir(
    new URL("../dist/server", import.meta.url),
  );
  assert.deepEqual(
    serverFiles.sort(),
    ["index.js", "wrangler.json"],
    "the deployable artifact must not contain an SSR application",
  );
});
