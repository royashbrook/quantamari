import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

test("ships a standalone offline-capable browser app", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../dist/client/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
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
  assert.match(serviceWorker, /index\.html/);

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
