import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const clientRoot = fileURLToPath(new URL("../../dist/client/", import.meta.url));
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("build is a standalone, subpath-safe static PWA", async () => {
  assert.equal(await pathExists(resolve(projectRoot, "dist/server")), false);
  assert.equal(await pathExists(resolve(projectRoot, "dist/.openai")), false);

  const manifest = JSON.parse(
    await readFile(resolve(clientRoot, "manifest.webmanifest"), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.ok(manifest.icons.every((icon) => icon.purpose.includes("maskable")));

  for (const icon of ["icon-192.png", "icon-512.png"]) {
    assert.ok((await stat(resolve(clientRoot, icon))).size > 1_000);
  }

  const html = await readFile(resolve(clientRoot, "index.html"), "utf8");
  const packageMetadata = JSON.parse(
    await readFile(resolve(projectRoot, "package.json"), "utf8"),
  );
  const buildMetadata = JSON.parse(
    await readFile(resolve(clientRoot, "_app/version.json"), "utf8"),
  );
  const buildHash = buildMetadata.version.match(
    /(?:^|g)([0-9a-f]{7,40})(?:-dirty)?$/,
  )?.[1];
  const buildLabel = `${buildHash?.slice(0, 7) ?? buildMetadata.version}${
    buildMetadata.version.endsWith("-dirty") ? "+dirty" : ""
  }`;
  assert.match(html, /<title>Quarkatamari/);
  assert.match(html, /data-release="v2-sveltekit"/);
  assert.match(html, /data-testid="build-stamp"/);
  assert.ok(html.includes(`v${packageMetadata.version} · ${buildLabel}`));
  assert.equal(typeof buildMetadata.version, "string");
  assert.ok(buildMetadata.version.length > 0);
  assert.match(html, /BEGIN WHERE THE MAP RUNS OUT/);
  assert.match(html, /Begin becoming/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.doesNotMatch(html, /vinext|__next|react-server|rsc/i);

  const relativeAssets = [
    ...html.matchAll(/(?:href|src)="(\.\/[^"#?]+)"/g),
  ].map((match) => match[1]);
  assert.ok(relativeAssets.some((path) => path.startsWith("./_app/")));
  for (const asset of relativeAssets) {
    assert.equal(
      await pathExists(resolve(clientRoot, asset)),
      true,
      `${asset} must resolve inside the deployable app`,
    );
  }
});

test("cold installation caches every deployable code chunk", async () => {
  const serviceWorker = await readFile(
    resolve(clientRoot, "service-worker.js"),
    "utf8",
  );
  assert.match(serviceWorker, /quarkatamari-/);
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /request\.mode===`navigate`/);
  assert.doesNotMatch(serviceWorker, /skipWaiting|clients\.claim/);

  const codeAssets = (await filesBelow(clientRoot))
    .filter((path) => /\.(?:css|js)$/.test(path))
    .filter((path) => relative(clientRoot, path) !== "service-worker.js")
    .map((path) => relative(clientRoot, path).split(sep).join("/"))
    .sort();

  assert.ok(codeAssets.length > 0);
  for (const asset of codeAssets) {
    assert.ok(
      serviceWorker.includes(`/${asset}`),
      `${asset} must be present in the generated precache`,
    );
  }

  let threeChunk;
  for (const asset of codeAssets.filter((path) => path.endsWith(".js"))) {
    const source = await readFile(resolve(clientRoot, asset), "utf8");
    if (/WebGLRenderer/.test(source)) {
      threeChunk = asset;
      break;
    }
  }
  assert.ok(threeChunk, "the lazy Three.js chunk must be deployed");
  assert.ok(
    serviceWorker.includes(`/${threeChunk}`),
    "the lazy Three.js chunk must work on the first offline launch",
  );
  assert.equal(
    (await readFile(resolve(clientRoot, "index.html"), "utf8")).includes(
      `/${threeChunk}`,
    ),
    false,
    "the welcome screen must not eagerly load Three.js",
  );
});
