import { expect, test, type Page } from "@playwright/test";

const appPath = "/quarkatamari/";

async function begin(page: Page, mode: "Long game" | "Learning tour" = "Learning tour") {
  await page.goto(appPath);
  await page.getByRole("button", { name: mode }).click();
  await page.getByRole("button", { name: "Begin becoming" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
}

test("boots the static game at its production subpath", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(appPath);
  await expect(
    page.getByRole("heading", { name: /You are not a ball/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Long game" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Learning tour" }).click();
  await expect(
    page.getByRole("button", { name: "Learning tour" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Begin becoming" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });

  const wrongPathResources = await page.evaluate((basePath) =>
    performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name))
      .filter((url) => url.origin === location.origin)
      .filter((url) => !url.pathname.startsWith(basePath))
      .map((url) => url.pathname), appPath);
  expect(wrongPathResources).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("field guide hydrates a stable-ID v4 collection", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "learning",
        eraId: "theory-playground",
        progress: 0.25,
        picked: 2,
        unitemizedPicked: 0,
        x: 0,
        z: 0,
        zooms: 0,
        sound: false,
        mash: [],
        collection: [
          {
            eraId: "theory-playground",
            curioId: "theory-playground/foam-bubble",
            count: 2,
            firstPick: 1,
            lastPick: 2,
          },
        ],
      }),
    );
  });

  await page.goto(appPath);
  await page.getByRole("button", { name: "Begin becoming" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Open rolled-up field guide" }).click();
  const guide = page.getByRole("dialog", { name: "Your rolled-up field guide" });
  await expect(guide).toBeVisible();
  await expect(guide.getByText("Foam bubble")).toBeVisible();
  await expect(guide.getByLabel("2 collected")).toBeVisible();
  await page.getByRole("button", { name: "Close field guide" }).click();
  await expect(guide).toBeHidden();
});

test("browser changes survive a page reload", async ({ page }) => {
  await begin(page);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.reload();

  await expect(
    page.getByRole("button", { name: "Learning tour" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Begin becoming" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Turn on sound" }),
  ).toBeVisible();
});

test("Scale Lab previews a layer without replacing the journey", async ({
  page,
}) => {
  await begin(page);
  const journeyLayer = await page.locator(".scale-card .kicker span").first().textContent();

  await page.getByRole("button", { name: "Open scale and science atlas" }).click();
  const atlas = page.getByRole("dialog", { name: "Scale and science atlas" });
  await expect(atlas).toBeVisible();
  await page.getByLabel("Choose a scale layer").fill("12");
  await expect(atlas.getByText("Dust Country", { exact: true })).toBeVisible();
  await atlas.getByRole("button", { name: "Preview in 3D" }).click();

  await expect(page.getByText("Scale Lab preview · progress paused")).toBeVisible();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Return to journey" }).click();
  await expect(page.getByText("Scale Lab preview · progress paused")).toBeHidden();
  await expect(page.locator(".scale-card .kicker span").first()).toHaveText(
    journeyLayer ?? "Theory Playground",
  );

  await page.keyboard.press("i");
  await expect(atlas).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(atlas).toBeHidden();
});

test("mobile layout keeps pointer steering and the canvas in the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await expect(page.getByText("◎ drag anywhere to roll")).toBeVisible();
  await expect(page.locator(".fact-card")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);

  await page.mouse.move(195, 500);
  await page.mouse.down();
  await page.mouse.move(285, 500, { steps: 4 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const savedPosition = await page.evaluate(() => {
    const save = JSON.parse(
      localStorage.getItem("everything-roll-save-v4") ?? "{}",
    );
    return { x: Number(save.x ?? 0), z: Number(save.z ?? 0) };
  });
  expect(Math.hypot(savedPosition.x, savedPosition.z)).toBeGreaterThan(0);
});

test("mobile battery mode enforces its measured draw-call budget", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await page.getByRole("button", { name: "Open scale and science atlas" }).click();
  await page.getByLabel("Choose a scale layer").fill("20");
  await page.getByRole("dialog", { name: "Scale and science atlas" })
    .getByRole("button", { name: "Preview in 3D" })
    .click();

  await expect
    .poll(
      async () => {
        const status = await page.locator(".quality-mode").textContent();
        const match = status?.match(/battery\s+·[^·]+·\s+(\d+)\s+draws/);
        return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
      },
      { timeout: 25_000 },
    )
    .toBeLessThanOrEqual(80);
});

test("a cold install can boot the lazy Three.js world offline", async ({
  context,
  page,
}) => {
  const legacyCache = "quarkatamari-v17-obsolete";
  await page.goto(`${appPath}favicon.svg`);
  await page.evaluate(async (name) => {
    await caches.open(name);
  }, legacyCache);
  expect(await page.evaluate((name) => caches.has(name), legacyCache)).toBe(true);

  await page.goto(appPath);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate((name) => caches.has(name), legacyCache))
    .toBe(false);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /You are not a ball/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Begin becoming" }).click();
    await expect(page.locator("canvas.three-canvas")).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await context.setOffline(false);
  }
});
