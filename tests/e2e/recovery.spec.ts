import { expect, test } from "@playwright/test";

const appPath = "/";
const save = JSON.stringify({
  version: 4,
  mode: "journey",
  eraId: "theory-playground",
  progress: 0.25,
  picked: 7,
  unitemizedPicked: 0,
  x: 0,
  z: 0,
  zooms: 0,
  sound: false,
  mash: [],
  collection: [],
});

test("the built shell hydrates in the target browser", async ({ page }) => {
  await page.goto(appPath);
  await expect(
    page.getByRole("heading", { name: /You are not a ball/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.quarkatamariReady ?? "",
      ),
    )
    .toBe("true");
  await expect(page.locator("#boot-rescue")).toBeHidden();
});

test("edge routing serves strict root and rescue responses", async ({
  request,
}) => {
  for (const path of ["/", "/rescue"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
  }

  expect((await request.get("/not-a-real-quantamari-route")).status()).toBe(
    404,
  );
});

test("the in-game rescue link follows the deployed base path", async ({
  page,
}) => {
  await page.goto(appPath);
  await page.getByRole("button", { name: "Play Long Game" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("link", { name: "Save rescue" }).click();
  await expect(page).toHaveURL(/\/rescue$/);
  await expect(page.getByRole("heading", { name: "Save rescue" })).toBeVisible();
});

test("a dead module graph still reaches the installed save", async ({
  context,
  page,
}) => {
  await context.addInitScript((raw) => {
    localStorage.setItem("everything-roll-save-v4", raw);
  }, save);
  await page.route("**/_app/**", (route) => route.abort());

  await page.goto(appPath);
  await expect(page.locator("#boot-rescue")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Open save rescue" }).click();
  await expect(page.getByRole("heading", { name: "Save rescue" })).toBeVisible();
  await expect(page.locator("#status")).toContainText("readable");
  await expect(page.locator("#summary")).toContainText("7 rolled up");
  await expect(page.locator("#saveBox")).toHaveValue(save);
});

test("the root worker controls the app and keeps game plus rescue offline", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium provides deterministic offline network emulation",
  );

  await page.goto(appPath);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ""),
    )
    .toMatch(/\/service-worker\.js$/);

  await context.setOffline(true);
  try {
    await page.goto("/rescue");
    await expect(
      page.getByRole("heading", { name: "Save rescue" }),
    ).toBeVisible();
    await page.goto(appPath);
    await expect(
      page.getByRole("heading", { name: /You are not a ball/ }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("rescue is self-contained and rejects a structurally invalid save", async ({
  context,
  page,
}) => {
  await context.addInitScript((raw) => {
    localStorage.setItem("everything-roll-save-v4", raw);
  }, save);
  const extraRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/rescue") {
      extraRequests.push(request.url());
    }
  });

  await page.goto(`${appPath}rescue`);
  await expect(page.locator("#status")).toContainText("readable");
  await page.locator("#restoreBox").fill(JSON.stringify({ hello: "universe" }));
  await page.getByRole("button", { name: "Validate and restore" }).click();
  await expect(page.locator("#restoreMessage")).toContainText(
    "not a supported Quantamari",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("everything-roll-save-v4")),
  ).toBe(save);
  expect(extraRequests).toEqual([]);
});

test("repair preserves the save and unrelated same-origin caches", async ({
  context,
  page,
}) => {
  await context.addInitScript((raw) => {
    localStorage.setItem("everything-roll-save-v4", raw);
  }, save);
  await page.goto(`${appPath}rescue`);
  await page.evaluate(async () => {
    await caches.open("quarkatamari-v2-stale");
    await caches.open("another-project-cache");
  });

  await page.getByRole("button", { name: "Clear cached app files only" }).click();
  await expect(page.locator("#repairMessage")).toContainText(
    "Your save is still here",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("everything-roll-save-v4")),
  ).toBe(save);
  expect(await page.evaluate(() => caches.has("quarkatamari-v2-stale"))).toBe(
    false,
  );
  expect(await page.evaluate(() => caches.has("another-project-cache"))).toBe(
    true,
  );
});
