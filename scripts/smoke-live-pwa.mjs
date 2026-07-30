import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const expectedVersion = process.argv[2];
assert.ok(expectedVersion, "expected release commit is required");

const origin = "https://quantamari.royashbrook.com";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
const page = await context.newPage();

try {
  const rootResponse = await page.goto(`${origin}/`, {
    waitUntil: "networkidle",
  });
  assert.equal(rootResponse?.status(), 200);
  assert.match(
    rootResponse?.headers()["content-security-policy"] ?? "",
    /frame-ancestors 'none'/,
  );
  await page
    .getByRole("heading", { name: /You are not a ball/ })
    .waitFor({ state: "visible" });

  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("service worker did not become ready")),
          15_000,
        ),
      ),
    ]);
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.match(
    await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? "",
    ),
    /\/service-worker\.js$/,
  );

  const versionResponse = await context.request.get(
    `${origin}/_app/version.json`,
  );
  assert.equal(versionResponse.status(), 200);
  assert.equal((await versionResponse.json()).version, expectedVersion);

  await context.setOffline(true);
  await page.goto(`${origin}/rescue`);
  await page
    .getByRole("heading", { name: "Save rescue" })
    .waitFor({ state: "visible" });
  await page.goto(`${origin}/`);
  await page
    .getByRole("heading", { name: /You are not a ball/ })
    .waitFor({ state: "visible" });
} finally {
  await context.setOffline(false);
  await browser.close();
}

console.log(`production PWA smoke passed for ${expectedVersion}`);
