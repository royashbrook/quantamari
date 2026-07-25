import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Expected the project root");

const generatedServerOnlyPaths = [
  "dist/server/assets",
  "dist/server/ssr",
  "dist/server/.vite",
  "dist/server/__vite_rsc_assets_manifest.js",
  "dist/server/image-config.json",
  "dist/server/vinext-externals.json",
  "dist/server/vinext-prerender.json",
  "dist/server/vinext-server.json",
  "dist/client/assets/_vinext_fonts",
];

for (const path of generatedServerOnlyPaths) {
  await rm(resolve(root, path), { recursive: true, force: true });
}
