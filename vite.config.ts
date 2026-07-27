import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
  build: {
    chunkSizeWarningLimit: 800,
    // Production-only failures need real stack frames. The host copies these
    // alongside the hashed chunks and CI verifies that they survive deployment.
    sourcemap: true,
  },
});
