import adapter from "@sveltejs/adapter-static";
import { execFileSync } from "node:child_process";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

function sourceVersion() {
  const explicitVersion =
    process.env.QUANTAMARI_REF ?? process.env.APP_VERSION;
  if (explicitVersion) return explicitVersion;
  try {
    return execFileSync(
      "git",
      ["describe", "--tags", "--always", "--long", "--dirty"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "development";
  }
}

/** @type {import("@sveltejs/kit").Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "dist/client",
      assets: "dist/client",
      strict: true,
    }),
    paths: {
      base: "",
      relative: true,
    },
    version: {
      name: sourceVersion(),
    },
    serviceWorker: {
      // Registration is explicit in +page.svelte so an installed update can
      // wait for the player to choose a safe save-and-reload point.
      register: false,
    },
  },
};

export default config;
