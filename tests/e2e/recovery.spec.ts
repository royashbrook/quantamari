import { expect, test } from "@playwright/test";

const appPath = "/quarkatamari/";
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

test("rescue is self-contained and rejects a structurally invalid save", async ({
  context,
  page,
}) => {
  await context.addInitScript((raw) => {
    localStorage.setItem("everything-roll-save-v4", raw);
  }, save);
  const extraRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/rescue.html")) {
      extraRequests.push(request.url());
    }
  });

  await page.goto(`${appPath}rescue.html`);
  await expect(page.locator("#status")).toContainText("readable");
  await page.locator("#restoreBox").fill(JSON.stringify({ hello: "universe" }));
  await page.getByRole("button", { name: "Validate and restore" }).click();
  await expect(page.locator("#restoreMessage")).toContainText(
    "not a supported Quarkatamari",
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
  await page.goto(`${appPath}rescue.html`);
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
