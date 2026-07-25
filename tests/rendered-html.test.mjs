import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const indexHtml = await readFile(
    new URL("../dist/client/index.html", import.meta.url),
    "utf8",
  );
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/" || pathname === "/index.html") {
            return new Response(indexHtml, {
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          }
          return new Response("Not found", { status: 404 });
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /QUARKATAMARI/);
  assert.doesNotMatch(html, /BACKLOG COMPLETE/);
  assert.match(html, /BEGIN WHERE THE MAP RUNS OUT/);
  assert.match(html, /Begin becoming/);
  assert.match(html, /manifest\.webmanifest/);

  const workerSource = await readFile(workerUrl, "utf8");
  assert.doesNotMatch(workerSource, /vinext|app-router|image-optimization/i);
});
