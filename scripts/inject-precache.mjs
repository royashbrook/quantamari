import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const clientRoot = resolve(root, "dist/client");
const serviceWorkerPath = resolve(clientRoot, "sw.js");

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const relativePath = (path) =>
  `./${relative(clientRoot, path).split(sep).join("/")}`;

const chunkFiles = (await filesBelow(clientRoot))
  .filter((path) => /\.(?:css|js)$/.test(path) && path !== serviceWorkerPath)
  .sort((left, right) => relativePath(left).localeCompare(relativePath(right)));
const chunkPaths = chunkFiles.map(relativePath);
const shellFiles = [
  "index.html",
  "manifest.webmanifest",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
].map((path) => resolve(clientRoot, path));

const hash = createHash("sha256");
for (const path of [...shellFiles, ...chunkFiles]) {
  hash.update(relativePath(path));
  hash.update("\0");
  hash.update(await readFile(path));
}
const version = hash.digest("hex").slice(0, 12);

const chunkMarker = "  /* __PRECACHE_CHUNKS__ */";
const versionMarker = "__PRECACHE_VERSION__";
let serviceWorker = await readFile(serviceWorkerPath, "utf8");
if (!serviceWorker.includes(chunkMarker) || !serviceWorker.includes(versionMarker)) {
  throw new Error("dist/client/sw.js is missing its precache injection markers");
}

serviceWorker = serviceWorker
  .replace(
    chunkMarker,
    chunkPaths.map((path) => `  ${JSON.stringify(path)}`).join(",\n"),
  )
  .replace(versionMarker, version);

await writeFile(serviceWorkerPath, serviceWorker);
console.log(
  `Injected ${chunkPaths.length} JS/CSS chunks into service worker cache ${version}.`,
);
