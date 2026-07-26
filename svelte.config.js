import adapter from "@sveltejs/adapter-static";
import { execFileSync } from "node:child_process";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

function sourceVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execFileSync(
      "git",
      ["describe", "--tags", "--always", "--dirty"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "development";
  }
}

const production = process.env.NODE_ENV === "production";

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
      base: production ? "/quarkatamari" : "",
      relative: true,
    },
    version: {
      name: sourceVersion(),
    },
  },
};

export default config;
