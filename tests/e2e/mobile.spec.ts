import { expect, test, type Locator, type Page } from "@playwright/test";

const appPath = "/";

async function startLearningTour(page: Page) {
  await page.addInitScript(() => {
    (
      window as typeof window & {
        __QUARKATAMARI_PERFORMANCE_REQUESTED__?: boolean;
      }
    ).__QUARKATAMARI_PERFORMANCE_REQUESTED__ = true;
  });
  await page.goto(appPath);
  await page.getByRole("button", { name: "Play Learning Tour" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
}

async function closeGeometry(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth);
    const bottom = top + (viewport?.height ?? window.innerHeight);
    return {
      width: rect.width,
      height: rect.height,
      inside:
        rect.left >= left &&
        rect.top >= top &&
        rect.right <= right &&
        rect.bottom <= bottom,
    };
  });
}

test("iPhone gameplay leaves the world dominant in portrait and landscape", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startLearningTour(page);

  await expect(page.locator(".fact-card")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.locator(".atlas-trigger")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open rolled-up field guide" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open game menu" })).toBeVisible();

  for (const viewport of [
    { name: "portrait", width: 420, height: 719 },
    { name: "landscape", width: 794, height: 370 },
  ]) {
    await page.setViewportSize(viewport);

    const layout = await page.evaluate(() => {
      const visualWidth = window.visualViewport?.width ?? window.innerWidth;
      const visualHeight = window.visualViewport?.height ?? window.innerHeight;
      const visibleRects = [
        ".brand",
        ".actions button",
        ".scale-card",
        ".stats",
        ".fact-card",
        ".toast",
        ".touch-tip",
        ".surge-button",
      ].flatMap((selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity) > 0 &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .map((element) => element.getBoundingClientRect()),
      );
      const sample = 4;
      let covered = 0;
      for (let y = 0; y < visualHeight; y += sample) {
        for (let x = 0; x < visualWidth; x += sample) {
          if (
            visibleRects.some(
              (rect) =>
                x >= rect.left &&
                x < rect.right &&
                y >= rect.top &&
                y < rect.bottom,
            )
          ) {
            covered += sample * sample;
          }
        }
      }
      const rectFor = (selector: string) =>
        document.querySelector(selector)?.getBoundingClientRect() ?? null;
      const shell = rectFor(".shell");
      const world = rectFor(".world");
      const canvas = rectFor(".three-canvas");
      const scaleCard = rectFor(".scale-card");
      const stats = rectFor(".stats");
      const surge = rectFor(".surge-button");
      return {
        visualWidth,
        visualHeight,
        coverage: covered / (visualWidth * visualHeight),
        shellBottom: shell?.bottom ?? 0,
        worldBottom: world?.bottom ?? 0,
        canvasBottom: canvas?.bottom ?? 0,
        scaleHeight: scaleCard?.height ?? Number.POSITIVE_INFINITY,
        statsWidth: stats?.width ?? Number.POSITIVE_INFINITY,
        statsHeight: stats?.height ?? Number.POSITIVE_INFINITY,
        surgeBottom: surge?.bottom ?? 0,
        surgeTop: surge?.top ?? 0,
        centerHasHud: document
          .elementsFromPoint(visualWidth / 2, visualHeight / 2)
          .some((element) => element.classList.contains("hud")),
      };
    });

    expect(layout.shellBottom, viewport.name).toBeCloseTo(layout.visualHeight, 0);
    expect(layout.worldBottom, viewport.name).toBeCloseTo(layout.visualHeight, 0);
    expect(layout.canvasBottom, viewport.name).toBeCloseTo(layout.visualHeight, 0);
    expect(layout.coverage, viewport.name).toBeLessThan(0.3);
    expect(layout.scaleHeight, viewport.name).toBeLessThanOrEqual(72);
    expect(layout.statsWidth, viewport.name).toBeLessThan(250);
    expect(layout.statsHeight, viewport.name).toBeLessThanOrEqual(52);
    expect(layout.surgeBottom, viewport.name).toBeLessThanOrEqual(
      layout.visualHeight,
    );
    expect(layout.surgeTop, viewport.name).toBeGreaterThan(
      layout.visualHeight - 80,
    );
    expect(layout.centerHasHud, viewport.name).toBe(false);
  }

  await page.setViewportSize({ width: 420, height: 719 });
  let pickedName: string | null = null;
  await expect
    .poll(
      async () => {
        pickedName = await page.evaluate(
          () =>
            (
              window as typeof window & {
                __QUARKATAMARI_PERFORMANCE__?: {
                  collectCurrentPickup: () => string | null;
                };
              }
            ).__QUARKATAMARI_PERFORMANCE__?.collectCurrentPickup() ?? null,
        );
        return pickedName;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  await expect(page.locator(".fact-card")).toBeVisible();
  await expect(page.locator(".fact-card h2")).toHaveText(pickedName!);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.locator(".touch-tip")).toHaveCount(0);
  const bottomSlots = await page.evaluate(() => {
    const fact = document.querySelector(".fact-card")?.getBoundingClientRect();
    const stats = document.querySelector(".stats")?.getBoundingClientRect();
    return {
      factBottom: fact?.bottom ?? 0,
      statsTop: stats?.top ?? 0,
    };
  });
  expect(bottomSlots.factBottom).toBeLessThanOrEqual(bottomSlots.statsTop);
});

test("iPhone dialogs never autofocus a zooming input and always keep an exit", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startLearningTour(page);

  const guideTrigger = page.getByRole("button", {
    name: "Open rolled-up field guide",
  });
  await guideTrigger.click();
  const guide = page.getByRole("dialog", {
    name: "Your rolled-up field guide",
  });
  const guideClose = guide.getByRole("button", { name: "Close field guide" });
  const search = guide.getByRole("searchbox", {
    name: "Find a rolled-up thing",
  });
  await expect(guide).toBeVisible();
  await expect(guideClose).toBeFocused();
  await expect(search).not.toBeFocused();
  expect(
    Number.parseFloat(await search.evaluate((input) => getComputedStyle(input).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const portraitGuideClose = await closeGeometry(guideClose);
  expect(portraitGuideClose.width).toBeGreaterThanOrEqual(44);
  expect(portraitGuideClose.height).toBeGreaterThanOrEqual(44);
  expect(portraitGuideClose.inside).toBe(true);
  await search.focus();
  expect((await closeGeometry(guideClose)).inside).toBe(true);
  await guideClose.click();
  await expect(guide).toBeHidden();
  await expect(guideTrigger).toBeFocused();

  await page.setViewportSize({ width: 794, height: 370 });
  await guideTrigger.click();
  await expect(guide).toBeVisible();
  await expect(guideClose).toBeFocused();
  await expect(search).not.toBeFocused();
  expect(
    Number.parseFloat(
      await search.evaluate((input) => getComputedStyle(input).fontSize),
    ),
  ).toBeGreaterThanOrEqual(16);
  const landscapeGuideClose = await closeGeometry(guideClose);
  expect(landscapeGuideClose.width).toBeGreaterThanOrEqual(44);
  expect(landscapeGuideClose.height).toBeGreaterThanOrEqual(44);
  expect(landscapeGuideClose.inside).toBe(true);
  await guideClose.click();

  await page.getByRole("button", { name: "Open game menu" }).click();
  const menu = page.getByRole("dialog", { name: "Game menu" });
  const menuClose = menu.getByRole("button", { name: "Resume game" });
  await expect(menu).toBeVisible();
  const menuCloseGeometry = await closeGeometry(menuClose);
  expect(menuCloseGeometry.width).toBeGreaterThanOrEqual(44);
  expect(menuCloseGeometry.height).toBeGreaterThanOrEqual(44);
  expect(menuCloseGeometry.inside).toBe(true);

  await menu.getByRole("button", { name: "Scale & science" }).click();
  const atlas = page.getByRole("dialog", { name: "Scale and science atlas" });
  const atlasClose = atlas.getByRole("button", { name: "Close atlas" });
  await expect(atlas).toBeVisible();
  const atlasCloseGeometry = await closeGeometry(atlasClose);
  expect(atlasCloseGeometry.width).toBeGreaterThanOrEqual(44);
  expect(atlasCloseGeometry.height).toBeGreaterThanOrEqual(44);
  expect(atlasCloseGeometry.inside).toBe(true);
  await atlasClose.click();
  await expect(atlas).toBeHidden();
  await expect(menu).toBeVisible();
  await menuClose.click();
  await expect(menu).toBeHidden();
});

test("iPhone update notice replaces the scale card instead of stacking", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startLearningTour(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          "__QUARKATAMARI_UPDATE_DEBUG__" in
          (window as typeof window & {
            __QUARKATAMARI_UPDATE_DEBUG__?: unknown;
          }),
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    const updateWindow = window as typeof window & {
      __QUARKATAMARI_UPDATE_DEBUG__?: {
        showUpdateReady: (worker: ServiceWorker) => void;
      };
    };
    updateWindow.__QUARKATAMARI_UPDATE_DEBUG__?.showUpdateReady({
      state: "installed",
      addEventListener: () => undefined,
      postMessage: () => undefined,
    } as unknown as ServiceWorker);
  });

  const banner = page.getByRole("status", { name: "Update ready" });
  await expect(banner).toBeVisible();
  await expect(page.locator(".scale-card")).toBeHidden();
  for (const viewport of [
    { width: 420, height: 719 },
    { width: 794, height: 370 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await closeGeometry(banner);
    expect(geometry.inside).toBe(true);
    expect(geometry.width).toBeLessThanOrEqual(360);
  }
});
