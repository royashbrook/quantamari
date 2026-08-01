import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  INSTALL_COACH_INSTALLED_VALUE,
  INSTALL_COACH_STORAGE_KEY,
} from "../../src/lib/pwa-install";

const appPath = "/";

async function startMode(
  page: Page,
  buttonName: "Play Learning Tour" | "Play Long Game",
) {
  await page.addInitScript(({ coachKey, installedValue }) => {
    (
      window as typeof window & {
        __QUARKATAMARI_PERFORMANCE_REQUESTED__?: boolean;
      }
    ).__QUARKATAMARI_PERFORMANCE_REQUESTED__ = true;
    localStorage.setItem(coachKey, installedValue);
  }, {
    coachKey: INSTALL_COACH_STORAGE_KEY,
    installedValue: INSTALL_COACH_INSTALLED_VALUE,
  });
  await page.goto(appPath);
  await page.getByRole("button", { name: buttonName }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
}

async function startLearningTour(page: Page) {
  await startMode(page, "Play Learning Tour");
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
      rect: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      viewport: { top, right, bottom, left },
      inside:
        rect.left >= left &&
        rect.top >= top &&
        rect.right <= right &&
        rect.bottom <= bottom,
    };
  });
}

async function collectCurrentPickup(page: Page) {
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
  return pickedName!;
}

test("iPhone gameplay uses one passive bottom dock across browser and PWA-sized viewports", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await startLearningTour(page);

  await expect(page.locator(".fact-card")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.locator(".surge-button")).toHaveCount(0);
  await expect(page.locator(".quick-action").first()).toBeHidden();
  await expect(page.locator(".quick-action").last()).toBeHidden();
  await expect(page.getByRole("button", { name: "Open game menu" })).toBeVisible();

  for (const viewport of [
    { name: "small portrait", width: 375, height: 812 },
    { name: "browser portrait", width: 420, height: 719 },
    { name: "standalone-sized portrait", width: 420, height: 912 },
    { name: "browser landscape", width: 794, height: 370 },
    { name: "standalone-sized Air landscape", width: 912, height: 420 },
  ]) {
    await page.setViewportSize(viewport);

    const layout = await page.evaluate(() => {
      const visualWidth = window.visualViewport?.width ?? window.innerWidth;
      const visualHeight = window.visualViewport?.height ?? window.innerHeight;
      const isVisible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const visibleRects = [
        ".brand",
        ".actions button",
        ".journey-dock",
        ".fact-card",
        ".toast",
        ".lab-banner",
      ].flatMap((selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .filter(isVisible)
          .map((element) => element.getBoundingClientRect()),
      );
      const bottomSurfaces = [
        ...document.querySelectorAll<HTMLElement>(
          ".journey-dock, .fact-card, .toast, .lab-banner",
        ),
      ].filter(isVisible);
      const topActions = [
        ...document.querySelectorAll<HTMLElement>(".actions button"),
      ].filter(isVisible);
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
      const dock = rectFor(".journey-dock");
      const dockStyle = getComputedStyle(
        document.querySelector<HTMLElement>(".journey-dock")!,
      );
      return {
        visualWidth,
        visualHeight,
        coverage: covered / (visualWidth * visualHeight),
        shellBottom: shell?.bottom ?? 0,
        worldBottom: world?.bottom ?? 0,
        canvasBottom: canvas?.bottom ?? 0,
        dockBottom: dock?.bottom ?? 0,
        dockHeight: dock?.height ?? Number.POSITIVE_INFINITY,
        dockWidth: dock?.width ?? 0,
        dockBackdrop: dockStyle.backdropFilter,
        dockPointerEvents: dockStyle.pointerEvents,
        bottomSurfaceCount: bottomSurfaces.length,
        topActionCount: topActions.length,
        tipInsideDock:
          document.querySelector(".touch-tip")?.parentElement?.classList.contains(
            "journey-dock",
          ) ?? false,
        tipVisible: document.querySelector<HTMLElement>(".touch-tip")
          ? isVisible(document.querySelector<HTMLElement>(".touch-tip")!)
          : false,
        centerHasHud: document
          .elementsFromPoint(visualWidth / 2, visualHeight / 2)
          .some((element) => element.classList.contains("hud")),
      };
    });

    expect(layout.shellBottom, viewport.name).toBeCloseTo(layout.visualHeight, 0);
    expect(layout.worldBottom, viewport.name).toBeCloseTo(layout.visualHeight, 0);
    expect(layout.canvasBottom, viewport.name).toBeCloseTo(layout.visualHeight, 0);
    expect(layout.dockBottom, viewport.name).toBeLessThanOrEqual(
      layout.visualHeight,
    );
    expect(layout.dockBottom, viewport.name).toBeGreaterThan(
      layout.visualHeight - 20,
    );
    expect(layout.dockWidth, viewport.name).toBeGreaterThanOrEqual(
      layout.visualWidth - 24,
    );
    expect(layout.dockHeight, viewport.name).toBeLessThanOrEqual(
      viewport.height <= 500 ? 64 : 90,
    );
    expect(layout.coverage, viewport.name).toBeLessThan(0.23);
    expect(layout.bottomSurfaceCount, viewport.name).toBe(1);
    expect(layout.topActionCount, viewport.name).toBe(1);
    expect(layout.dockBackdrop, viewport.name).toBe("none");
    expect(layout.dockPointerEvents, viewport.name).toBe("none");
    expect(layout.tipInsideDock, viewport.name).toBe(true);
    expect(layout.tipVisible, viewport.name).toBe(viewport.height > 500);
    expect(layout.centerHasHud, viewport.name).toBe(false);
  }

  await page.setViewportSize({ width: 420, height: 912 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-right", "0px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
    document.documentElement.style.setProperty("--safe-left", "0px");
  });
  const safeAreaLayout = await page.evaluate(() => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const dock = document.querySelector(".journey-dock")?.getBoundingClientRect();
    const brand = document.querySelector(".brand")?.getBoundingClientRect();
    const menu = document
      .querySelector("[aria-label='Open game menu']")
      ?.getBoundingClientRect();
    return {
      viewportHeight,
      dockBottom: dock?.bottom ?? 0,
      brandTop: brand?.top ?? 0,
      menuTop: menu?.top ?? 0,
    };
  });
  expect(safeAreaLayout.dockBottom).toBeCloseTo(
    safeAreaLayout.viewportHeight - 44,
    0,
  );
  expect(safeAreaLayout.brandTop).toBeGreaterThanOrEqual(59);
  expect(safeAreaLayout.menuTop).toBeGreaterThanOrEqual(59);
  await page.evaluate(() => {
    for (const property of [
      "--safe-top",
      "--safe-right",
      "--safe-bottom",
      "--safe-left",
    ]) {
      document.documentElement.style.removeProperty(property);
    }
  });

  await page.setViewportSize({ width: 420, height: 719 });
  const pickedNames = [
    await collectCurrentPickup(page),
    await collectCurrentPickup(page),
    await collectCurrentPickup(page),
  ];

  const fact = page.locator(".fact-card");
  await expect(fact).toBeVisible();
  await expect(fact.locator("h2")).toHaveText(pickedNames.at(-1)!);
  await expect(fact.locator("p")).not.toHaveText("");
  await expect(fact.getByText("+2 more")).toBeVisible();
  await expect(page.locator(".journey-dock")).toBeHidden();
  await expect(page.locator(".toast")).toHaveCount(0);
  const pickupAnnouncement = page.locator(".pickup-announcement");
  await expect(pickupAnnouncement).toHaveAttribute("role", "status");
  await expect(pickupAnnouncement).toHaveAttribute("aria-live", "polite");
  await expect(pickupAnnouncement).toHaveText(
    `Rolled up ${pickedNames[0]}.`,
  );
  expect(await fact.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
    "none",
  );
  expect(
    await fact.locator("a, button").evaluateAll((elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).length,
    ),
  ).toBe(0);

  for (const viewport of [
    { name: "standalone-sized portrait", width: 420, height: 912 },
    { name: "browser landscape", width: 794, height: 370 },
    { name: "standalone-sized Air landscape", width: 912, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    const factLayout = await page.evaluate(() => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const card = document.querySelector<HTMLElement>(".fact-card")!;
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const visibleBottomSurfaces = [
        ...document.querySelectorAll<HTMLElement>(
          ".journey-dock, .fact-card, .toast, .lab-banner",
        ),
      ].filter((element) => {
        const elementStyle = getComputedStyle(element);
        const elementRect = element.getBoundingClientRect();
        return (
          elementStyle.display !== "none" &&
          elementStyle.visibility !== "hidden" &&
          Number(elementStyle.opacity) > 0 &&
          elementRect.width > 0 &&
          elementRect.height > 0
        );
      });
      return {
        inside:
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= viewportWidth &&
          rect.bottom <= viewportHeight,
        height: rect.height,
        bottomSurfaceCount: visibleBottomSurfaces.length,
        backgroundColor: style.backgroundColor,
      };
    });
    expect(factLayout.inside, viewport.name).toBe(true);
    expect(factLayout.height, viewport.name).toBeLessThanOrEqual(
      viewport.height <= 500 ? 66 : 96,
    );
    expect(factLayout.bottomSurfaceCount, viewport.name).toBe(1);
    expect(factLayout.backgroundColor, viewport.name).toContain("0.88");
  }

  await page.waitForTimeout(3_600);
  const delayedPickup = await collectCurrentPickup(page);
  await expect(fact.locator("h2")).toHaveText(delayedPickup);
  await expect(fact.getByText("+3 more")).toBeVisible();
  await expect(pickupAnnouncement).toHaveText(
    `Rolled up ${pickedNames[0]}.`,
  );
  await expect(fact).toHaveCount(0, { timeout: 2_600 });
  await expect(page.locator(".journey-dock")).toBeVisible();
  const cooldownPickup = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __QUARKATAMARI_PERFORMANCE__?: {
            collectCurrentPickup: () => string | null;
          };
        }
      ).__QUARKATAMARI_PERFORMANCE__?.collectCurrentPickup() ?? null,
  );
  expect(cooldownPickup).not.toBeNull();
  await expect(fact).toHaveCount(0);
  await expect(page.locator(".journey-dock")).toBeVisible();
});

test("iPhone keeps player-paced growth compact and reachable", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "learning",
        eraId: "theory-playground",
        progress: 1,
        picked: 0,
        unitemizedPicked: 0,
        x: 0,
        z: 0,
        zooms: 0,
        cycles: 0,
        sound: false,
        mash: [],
        collection: [],
      }),
    );
  });
  await startLearningTour(page);

  const grow = page.getByTestId("grow-layer");
  await expect(grow).toBeVisible();
  for (const viewport of [
    { name: "browser portrait", width: 420, height: 719 },
    { name: "standalone portrait", width: 420, height: 912 },
    { name: "browser landscape", width: 794, height: 370 },
    { name: "standalone landscape", width: 912, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    const button = await closeGeometry(grow);
    const dock = await closeGeometry(page.locator(".journey-dock"));
    expect(button.width, viewport.name).toBeGreaterThanOrEqual(44);
    expect(button.height, viewport.name).toBeGreaterThanOrEqual(44);
    expect(button.inside, viewport.name).toBe(true);
    expect(dock.inside, viewport.name).toBe(true);
    expect(dock.height, viewport.name).toBeLessThanOrEqual(72);
  }

  await page.setViewportSize({ width: 420, height: 719 });
  const readyRadius = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __QUARKATAMARI_PERFORMANCE__?: {
            snapshot: () => { runtime: { radius: number } };
          };
        }
      ).__QUARKATAMARI_PERFORMANCE__?.snapshot().runtime.radius ?? 0,
  );
  await page.waitForTimeout(1_000);
  await collectCurrentPickup(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __QUARKATAMARI_PERFORMANCE__?: {
                snapshot: () => {
                  runtime: {
                    era: number;
                    progress: number;
                    readyToGrow: boolean;
                    radius: number;
                  };
                };
              };
            }
          ).__QUARKATAMARI_PERFORMANCE__?.snapshot().runtime ?? null,
      ),
    )
    .toMatchObject({ era: 0, progress: 1, readyToGrow: true });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __QUARKATAMARI_PERFORMANCE__?: {
                snapshot: () => { runtime: { radius: number } };
              };
            }
          ).__QUARKATAMARI_PERFORMANCE__?.snapshot().runtime.radius ?? 0,
      ),
    )
    .toBeCloseTo(readyRadius, 6);
  await expect(page.locator(".fact-card")).toHaveCount(0, {
    timeout: 7_000,
  });
  await grow.click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __QUARKATAMARI_PERFORMANCE__?: {
                  snapshot: () => { runtime: { era: number } };
                };
              }
            ).__QUARKATAMARI_PERFORMANCE__?.snapshot().runtime.era ?? -1,
        ),
      { timeout: 10_000 },
    )
    .toBe(1);
  await expect(grow).toHaveCount(0);
});

test("iPhone keeps a scale-crossing landmark fact and bundled achievements on screen", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "journey",
        eraId: "moon-scale",
        progress: 0.999999,
        picked: 0,
        unitemizedPicked: 0,
        x: 0,
        z: 0,
        zooms: 0,
        cycles: 0,
        sound: false,
        mash: [],
        collection: [],
      }),
    );
  });
  await page.setViewportSize({ width: 420, height: 719 });
  await startMode(page, "Play Long Game");

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __QUARKATAMARI_PERFORMANCE__?: {
                  collectSingletonPickup: () => string | null;
                };
              }
            ).__QUARKATAMARI_PERFORMANCE__?.collectSingletonPickup() ?? null,
        ),
      { timeout: 20_000 },
    )
    .not.toBeNull();

  const fact = page.locator(".fact-card");
  const milestone = fact.locator(".scale-ready-unlock");
  await expect(fact).toBeVisible();
  await expect(milestone).toContainText("Moon Scale is ready");
  await expect(fact.locator(".achievement-unlock")).toContainText(
    "First Find",
  );
  await expect(fact.locator(".achievement-unlock")).toContainText(
    "One of One",
  );
  const factGeometry = await closeGeometry(fact);
  const milestoneGeometry = await closeGeometry(milestone);
  expect(factGeometry).toMatchObject({ inside: true });
  expect(factGeometry.height).toBeLessThanOrEqual(140);
  expect(milestoneGeometry.inside).toBe(true);
  expect(milestoneGeometry.width).toBeGreaterThan(120);

  await expect(fact).toHaveCount(0, { timeout: 7_000 });
  await expect(page.getByTestId("grow-layer")).toBeVisible();
});

test("iPhone menu routes keep Field Guide and Scale Lab exits visible", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await startLearningTour(page);

  for (const viewport of [
    { name: "portrait", width: 420, height: 719 },
    { name: "standalone-sized Air landscape", width: 912, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Open game menu" }).click();
    const menu = page.getByRole("dialog", { name: "Game menu" });
    const menuClose = menu.getByRole("button", { name: "Resume game" });
    await expect(menu).toBeVisible();
    const menuCloseBox = await closeGeometry(menuClose);
    expect(menuCloseBox.width, viewport.name).toBeGreaterThanOrEqual(44);
    expect(menuCloseBox.height, viewport.name).toBeGreaterThanOrEqual(44);
    expect(menuCloseBox.inside, viewport.name).toBe(true);

    await menu.getByRole("button", { name: "Field guide" }).click();
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
      Number.parseFloat(
        await search.evaluate((input) => getComputedStyle(input).fontSize),
      ),
      viewport.name,
    ).toBeGreaterThanOrEqual(16);
    const guideCloseBox = await closeGeometry(guideClose);
    expect(guideCloseBox.width, viewport.name).toBeGreaterThanOrEqual(44);
    expect(guideCloseBox.height, viewport.name).toBeGreaterThanOrEqual(44);
    expect(guideCloseBox.inside, viewport.name).toBe(true);
    await search.focus();
    expect((await closeGeometry(guideClose)).inside, viewport.name).toBe(true);
    await guideClose.click();
    await expect(guide).toBeHidden();
    await expect(menu).toBeVisible();

    await menu.getByRole("button", { name: "Scale & science" }).click();
    const atlas = page.getByRole("dialog", { name: "Scale and science atlas" });
    const atlasClose = atlas.getByRole("button", { name: "Close atlas" });
    await expect(atlas).toBeVisible();
    const atlasCloseBox = await closeGeometry(atlasClose);
    expect(atlasCloseBox.width, viewport.name).toBeGreaterThanOrEqual(44);
    expect(atlasCloseBox.height, viewport.name).toBeGreaterThanOrEqual(44);
    expect(atlasCloseBox.inside, viewport.name).toBe(true);
    await atlasClose.click();
    await expect(atlas).toBeHidden();
    await expect(menu).toBeVisible();

    await menu.getByRole("button", { name: "Scale & science" }).click();
    await expect(atlas).toBeVisible();
    await atlas.getByRole("button", { name: "Preview in 3D" }).click();
    const labBanner = page.locator(".lab-banner");
    const returnButton = page.getByRole("button", {
      name: "Return to journey",
    });
    await expect(labBanner).toBeVisible();
    await expect(page.locator(".journey-dock")).toBeHidden();
    await expect(page.locator(".fact-card")).toBeHidden();
    const returnBox = await closeGeometry(returnButton);
    expect(returnBox.width, viewport.name).toBeGreaterThanOrEqual(44);
    expect(returnBox.height, viewport.name).toBeGreaterThanOrEqual(44);
    expect(returnBox.inside, viewport.name).toBe(true);
    const labBottomSurfaces = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll<HTMLElement>(
            ".journey-dock, .fact-card, .toast, .lab-banner",
          ),
        ].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        }).length,
    );
    expect(labBottomSurfaces, viewport.name).toBe(1);
    await returnButton.click();
    await expect(labBanner).toBeHidden();
    await expect(page.locator(".toast")).toBeVisible();
    await expect(page.locator(".journey-dock")).toBeHidden();
    await expect(page.locator(".toast")).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".journey-dock")).toBeVisible();
  }
});

test("iPhone update notice stays persistent without replacing the bottom dock", async ({
  page,
}) => {
  test.setTimeout(90_000);
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

  await page.route("**/_app/version.json", async (route) => {
    await route.fulfill({ json: { version: "future-iphone-build" } });
  });

  await page.evaluate(async () => {
    const updateWindow = window as typeof window & {
      __QUARKATAMARI_UPDATE_DEBUG__?: {
        considerWaitingWorker: (worker: ServiceWorker) => Promise<void>;
      };
    };
    await updateWindow.__QUARKATAMARI_UPDATE_DEBUG__?.considerWaitingWorker({
      state: "installed",
      scriptURL: `${location.origin}/service-worker.js?build=future-iphone-build`,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      postMessage: (
        message: { type?: string },
        transfer?: Transferable[],
      ) => {
        if (message.type !== "GET_BUILD_VERSION") return;
        window.setTimeout(() => {
          (transfer?.[0] as MessagePort | undefined)?.postMessage({
            type: "BUILD_VERSION",
            version: "future-iphone-build",
          });
        }, 150);
      },
    } as unknown as ServiceWorker);
  });

  const banner = page.getByRole("status", { name: "Update ready" });
  await expect(banner).toBeVisible();
  await expect(page.locator(".journey-dock")).toBeVisible();
  for (const viewport of [
    { name: "browser portrait", width: 420, height: 719 },
    { name: "standalone-sized portrait", width: 420, height: 912 },
    { name: "browser landscape", width: 794, height: 370 },
    { name: "standalone-sized Air landscape", width: 912, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await closeGeometry(banner);
    expect(geometry.inside, viewport.name).toBe(true);
    expect(geometry.width, viewport.name).toBeLessThanOrEqual(360);
    const updateButton = banner.getByRole("button", { name: "Update now" });
    const updateButtonBox = await closeGeometry(updateButton);
    expect(updateButtonBox.width, viewport.name).toBeGreaterThanOrEqual(44);
    expect(updateButtonBox.height, viewport.name).toBeGreaterThanOrEqual(44);
    expect(updateButtonBox.inside, viewport.name).toBe(true);
    const slots = await page.evaluate(() => {
      const notice = document
        .querySelector(".update-banner")
        ?.getBoundingClientRect();
      const dock = document.querySelector(".journey-dock")?.getBoundingClientRect();
      return {
        noticeBottom: notice?.bottom ?? Number.POSITIVE_INFINITY,
        dockTop: dock?.top ?? 0,
      };
    });
    expect(slots.noticeBottom, viewport.name).toBeLessThan(slots.dockTop);
  }

  await page.getByRole("button", { name: "Open game menu" }).click();
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu).toBeVisible();
  await expect(banner).toBeVisible();
  await menu.getByRole("button", { name: "Resume game" }).click();
  await expect(menu).toBeHidden();
  await page.waitForTimeout(5_700);
  await expect(banner).toBeVisible();
});

test("iPhone keeps the previous layer underfoot while backdrops recede", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startLearningTour(page);
  const selected = await page.evaluate(() => {
    const diagnostics = (
      window as typeof window & {
        __QUARKATAMARI_PERFORMANCE__?: {
          previewEra: (eraIndex: number) => number;
        };
      }
    ).__QUARKATAMARI_PERFORMANCE__;
    return diagnostics?.previewEra(2);
  });
  expect(selected).toBe(2);

  const readDepth = () =>
    page.evaluate(() => {
      const snapshot = (
        window as typeof window & {
          __QUARKATAMARI_PERFORMANCE__?: {
            snapshot: () => {
              runtime: {
                era: number;
                player: { x: number; z: number };
                pickups: {
                  queued: number;
                  current: number;
                  target: number;
                };
                drawCalls: number;
                triangles: number;
                budget: { maxDrawCalls: number; maxTriangles: number };
                backgroundDepth: {
                  nearRate: number;
                  nearPitch: number;
                  nearChildren: number;
                  midRate: number;
                  midPitch: number;
                  midChildren: number;
                  farRate: number;
                  farPitch: number;
                  farChildren: number;
                  foundationNearestRate: number;
                  foundationNearestPitch: number;
                  foundationNearestRoll: number;
                  foundationNearestGrounded: boolean;
                  foundationNearestPlacement: string;
                  foundationNearestLocalRadius: number;
                  foundationNearestMaxY: number;
                  foundationNearestSampleX: number;
                  foundationNearestSampleZ: number;
                  foundationNearestUnderfootInstances: number;
                  foundationNearestAnchorZ: number;
                  foundationCompressedRate: number;
                  foundationCompressedPitch: number;
                  foundationRugVisible: boolean;
                  foundationOverlayVisible: boolean;
                  foundationRugOffsetY: number;
                };
              };
            };
          };
        }
      ).__QUARKATAMARI_PERFORMANCE__?.snapshot();
      return snapshot
        ? {
            era: snapshot.runtime.era,
            x: snapshot.runtime.player.x,
            z: snapshot.runtime.player.z,
            queued: snapshot.runtime.pickups.queued,
            current: snapshot.runtime.pickups.current,
            target: snapshot.runtime.pickups.target,
            drawCalls: snapshot.runtime.drawCalls,
            triangles: snapshot.runtime.triangles,
            budget: snapshot.runtime.budget,
            ...snapshot.runtime.backgroundDepth,
          }
        : null;
    });

  await expect
    .poll(async () => {
      const depth = await readDepth();
      return depth
        ? {
            era: depth.era,
            queued: depth.queued,
            populated: depth.current === depth.target,
            nearChildren: depth.nearChildren,
            midChildren: depth.midChildren,
            farChildren: depth.farChildren,
          }
        : null;
    })
    .toEqual({
      era: 2,
      queued: 0,
      populated: true,
      nearChildren: expect.any(Number),
      midChildren: expect.any(Number),
      farChildren: expect.any(Number),
    });
  const before = await readDepth();
  expect(before?.nearChildren).toBeGreaterThan(0);
  expect(before?.midChildren).toBeGreaterThan(0);
  expect(before?.farChildren).toBeGreaterThan(0);
  expect(before?.nearRate).toBeGreaterThan(before?.midRate ?? Infinity);
  expect(before?.midRate).toBeGreaterThan(before?.farRate ?? Infinity);
  expect(before?.foundationNearestRate).toBe(0);
  expect(before?.foundationNearestGrounded).toBe(true);
  expect(before?.foundationNearestPlacement).toBe("surface");
  expect(before?.foundationNearestLocalRadius).toBeLessThanOrEqual(28);
  expect(before?.foundationNearestMaxY).toBeLessThan(1);
  expect(before?.foundationRugVisible).toBe(true);
  expect(before?.foundationCompressedRate).toBeGreaterThan(0);

  const startZ = before?.z ?? 0;
  await page.keyboard.down("ArrowUp");
  try {
    await expect
      .poll(async () => Math.abs(((await readDepth())?.z ?? startZ) - startZ))
      .toBeGreaterThan(3);
  } finally {
    await page.keyboard.up("ArrowUp");
  }
  const after = await readDepth();
  const angleDelta = (next = 0, previous = 0) =>
    Math.abs(Math.atan2(Math.sin(next - previous), Math.cos(next - previous)));
  const nearTravel = angleDelta(after?.nearPitch, before?.nearPitch);
  const midTravel = angleDelta(after?.midPitch, before?.midPitch);
  const farTravel = angleDelta(after?.farPitch, before?.farPitch);
  expect(nearTravel).toBeGreaterThan(midTravel);
  expect(midTravel).toBeGreaterThan(farTravel);
  expect(nearTravel).toBeGreaterThan(0.0035);
  expect(midTravel).toBeGreaterThan(0.0017);
  expect(farTravel).toBeGreaterThan(0.00075);
  expect(nearTravel).toBeLessThan(0.05);
  expect(
    angleDelta(
      after?.foundationNearestPitch,
      before?.foundationNearestPitch,
    ),
  ).toBe(0);
  expect(
    angleDelta(
      after?.foundationCompressedPitch,
      before?.foundationCompressedPitch,
    ),
  ).toBeGreaterThan(0);
  expect(after?.foundationNearestAnchorZ).toBe(
    before?.foundationNearestAnchorZ,
  );
  expect(after?.foundationRugOffsetY).not.toBe(
    before?.foundationRugOffsetY,
  );
  const phaseDelta =
    (after?.foundationRugOffsetY ?? 0) -
    (before?.foundationRugOffsetY ?? 0);
  const wrappedPhaseTravel = Math.abs(
    (((phaseDelta + 0.5) % 1) + 1) % 1 - 0.5,
  );
  const expectedPhaseTravel =
    Math.abs((after?.z ?? 0) - (before?.z ?? 0)) * (9 / 188);
  expect(wrappedPhaseTravel).toBeCloseTo(expectedPhaseTravel, 2);

  for (const [era, overlay] of [
    [25, false],
    [31, true],
  ] as const) {
    const previewed = await page.evaluate((eraIndex) => {
      const diagnostics = (
        window as typeof window & {
          __QUARKATAMARI_PERFORMANCE__?: {
            previewEra: (index: number) => number;
          };
        }
      ).__QUARKATAMARI_PERFORMANCE__;
      return diagnostics?.previewEra(eraIndex);
    }, era);
    expect(previewed).toBe(era);
    await expect
      .poll(async () => {
        const depth = await readDepth();
        return depth
          ? {
              era: depth.era,
              queued: depth.queued,
              populated: depth.current === depth.target,
            }
          : null;
      }, { timeout: 30_000 })
      .toEqual({ era, queued: 0, populated: true });
    if (era === 31) {
      await page.evaluate(() => {
        const diagnostics = (
          window as typeof window & {
            __QUARKATAMARI_PERFORMANCE__?: {
              setPlayerPosition: (
                x: number,
                z: number,
              ) => { x: number; z: number };
            };
          }
        ).__QUARKATAMARI_PERFORMANCE__;
        diagnostics?.setPlayerPosition(0, 0);
      });
      await expect
        .poll(async () => {
          const depth = await readDepth();
          return depth
            ? {
                z: depth.z,
                anchorZ: depth.foundationNearestAnchorZ,
              }
            : null;
        })
        .toEqual({ z: 0, anchorZ: 0 });
    }
    const scene = await readDepth();
    expect(scene?.foundationNearestGrounded).toBe(true);
    expect(scene?.foundationNearestLocalRadius).toBeLessThanOrEqual(
      era === 25 ? 52 : 28,
    );
    expect(scene?.foundationRugVisible).toBe(true);
    expect(scene?.foundationOverlayVisible).toBe(overlay);
    expect(scene?.drawCalls).toBeLessThanOrEqual(
      scene?.budget.maxDrawCalls ?? 0,
    );
    expect(scene?.triangles).toBeLessThanOrEqual(
      scene?.budget.maxTriangles ?? 0,
    );
    if (era === 25) {
      expect(
        scene?.foundationNearestUnderfootInstances ?? 0,
      ).toBeGreaterThanOrEqual(8);
      const shellStartZ = scene?.z ?? 0;
      await page.keyboard.down("ArrowUp");
      try {
        await expect
          .poll(
            async () =>
              Math.abs(((await readDepth())?.z ?? shellStartZ) - shellStartZ),
          )
          .toBeGreaterThan(3);
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      const movedShell = await readDepth();
      expect(
        Math.hypot(
          (movedShell?.foundationNearestSampleX ?? 0) -
            (scene?.foundationNearestSampleX ?? 0),
          (movedShell?.foundationNearestSampleZ ?? 0) -
            (scene?.foundationNearestSampleZ ?? 0),
        ),
      ).toBeGreaterThan(1);
      expect(movedShell?.foundationRugOffsetY).not.toBe(
        scene?.foundationRugOffsetY,
      );
      const sustainedZ = (movedShell?.z ?? 0) + 64;
      await page.evaluate(({ x, z }) => {
        const diagnostics = (
          window as typeof window & {
            __QUARKATAMARI_PERFORMANCE__?: {
              setPlayerPosition: (
                nextX: number,
                nextZ: number,
              ) => { x: number; z: number };
            };
          }
        ).__QUARKATAMARI_PERFORMANCE__;
        diagnostics?.setPlayerPosition(x, z);
      }, { x: movedShell?.x ?? 0, z: sustainedZ });
      await expect
        .poll(async () => {
          const depth = await readDepth();
          if (!depth || Math.abs(depth.z - sustainedZ) > 0.0001) return 0;
          return Math.hypot(
            depth.foundationNearestSampleX -
              (movedShell?.foundationNearestSampleX ?? 0),
            depth.foundationNearestSampleZ -
              (movedShell?.foundationNearestSampleZ ?? 0),
          );
        })
        .toBeGreaterThan(3);
      const sustainedShell = await readDepth();
      expect(
        sustainedShell?.foundationNearestUnderfootInstances ?? 0,
      ).toBeGreaterThanOrEqual(8);
      expect(
        Math.hypot(
          (sustainedShell?.foundationNearestSampleX ?? 0) -
            (movedShell?.foundationNearestSampleX ?? 0),
          (sustainedShell?.foundationNearestSampleZ ?? 0) -
            (movedShell?.foundationNearestSampleZ ?? 0),
        ),
      ).toBeGreaterThan(3);
      expect(
        Math.abs(sustainedShell?.foundationNearestSampleX ?? Infinity),
      ).toBeLessThanOrEqual(40);
      expect(
        Math.abs(sustainedShell?.foundationNearestSampleZ ?? Infinity),
      ).toBeLessThanOrEqual(40);
    } else {
      const distantStartZ = scene?.z ?? 0;
      await page.keyboard.down("ArrowUp");
      try {
        await expect
          .poll(
            async () =>
              Math.abs(((await readDepth())?.z ?? distantStartZ) - distantStartZ),
          )
          .toBeGreaterThan(3);
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      const movedDistant = await readDepth();
      expect(movedDistant?.foundationNearestAnchorZ).toBe(
        scene?.foundationNearestAnchorZ,
      );
      expect(movedDistant?.foundationRugOffsetY).not.toBe(
        scene?.foundationRugOffsetY,
      );
    }
  }
});
