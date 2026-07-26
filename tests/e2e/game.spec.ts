import { expect, test, type Page } from "@playwright/test";

const appPath = "/quarkatamari/";

type PerformanceSnapshot = {
  phases: Record<
    string,
    {
      count: number;
      latest: number;
      p50: number;
      p95: number;
      max: number;
    }
  >;
  runtime: {
    pickups: {
      active: number;
      queued: number;
      target: number;
      totalSpawned: number;
      spawnedLastFrame: number;
      maxSpawnedPerFrame: number;
      maxPerFrame: number;
      workBudgetMs: number;
    };
    quality: "high" | "balanced" | "battery";
    drawCalls: number;
    triangles: number;
    budget: {
      maxDrawCalls: number;
      maxTriangles: number;
    };
  };
};

async function enablePerformanceDiagnostics(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, {
      __QUARKATAMARI_PERFORMANCE_REQUESTED__: true,
    });
  });
}

async function readPerformanceDiagnostics(page: Page) {
  return page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        snapshot: () => PerformanceSnapshot;
        removePickups: (count: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.snapshot() ?? null;
  });
}

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
  await page.addInitScript(() => {
    const scenes: unknown[] = [];
    const devtools = new EventTarget();
    devtools.addEventListener("observe", (event) => {
      const observed = (event as CustomEvent).detail as { isScene?: boolean };
      if (observed?.isScene) scenes.push(observed);
    });
    Object.assign(window, {
      __THREE_DEVTOOLS__: devtools,
      __QUARKATAMARI_SCENES__: scenes,
    });
  });

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
  for (const selector of [".scale-card", ".stats", ".fact-card"]) {
    await expect(page.locator(selector)).toHaveCSS("transform", "none");
  }

  const wrongPathResources = await page.evaluate((basePath) =>
    performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name))
      .filter((url) => url.origin === location.origin)
      .filter((url) => !url.pathname.startsWith(basePath))
      .map((url) => url.pathname), appPath);
  expect(wrongPathResources).toEqual([]);
  const instanceColorDiagnostics = await page.evaluate(() => {
    const scenes = (
      window as typeof window & {
        __QUARKATAMARI_SCENES__?: Array<{
          traverse: (visit: (object: Record<string, any>) => void) => void;
        }>;
      }
    ).__QUARKATAMARI_SCENES__ ?? [];
    let checked = 0;
    const offenders: string[] = [];
    for (const scene of scenes) {
      scene.traverse((object) => {
        if (
          !object.isInstancedMesh ||
          !object.instanceColor ||
          object.count === 0 ||
          object.geometry.getAttribute("color")
        ) {
          return;
        }
        checked += 1;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        if (materials.some((material) => material.vertexColors === true)) {
          offenders.push(object.name || object.uuid);
        }
      });
    }
    return { checked, offenders };
  });
  expect(instanceColorDiagnostics.checked).toBeGreaterThan(0);
  expect(instanceColorDiagnostics.offenders).toEqual([]);
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
  await enablePerformanceDiagnostics(page);
  await begin(page);
  await page.getByRole("button", { name: "Open scale and science atlas" }).click();
  await page.getByLabel("Choose a scale layer").fill("20");
  await page.getByRole("dialog", { name: "Scale and science atlas" })
    .getByRole("button", { name: "Preview in 3D" })
    .click();

  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot?.runtime.quality === "battery" &&
          snapshot.runtime.drawCalls <= snapshot.runtime.budget.maxDrawCalls;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test("performance diagnostics capture a repeatable complex-scene baseline", async ({
  page,
}, testInfo) => {
  await enablePerformanceDiagnostics(page);
  await begin(page);
  await page.getByRole("button", { name: "Open scale and science atlas" }).click();
  await page.getByLabel("Choose a scale layer").fill("20");
  await page.getByRole("dialog", { name: "Scale and science atlas" })
    .getByRole("button", { name: "Preview in 3D" })
    .click();

  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.phases.frame?.count ?? 0,
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(120);

  await expect
    .poll(
      () => readPerformanceDiagnostics(page),
      { timeout: 30_000 },
    )
    .toMatchObject({
      runtime: {
        pickups: {
          active: expect.any(Number),
          queued: expect.any(Number),
          target: expect.any(Number),
        },
      },
      phases: {
        frame: { count: expect.any(Number) },
        "frame-interval": { count: expect.any(Number) },
        simulation: { count: expect.any(Number) },
        spawning: { count: expect.any(Number) },
        "pickup-lod": { count: expect.any(Number) },
        "world-rebuild": { count: expect.any(Number) },
        "substrate-rebuild": { count: expect.any(Number) },
        "ground-texture": { count: expect.any(Number) },
        "render-submit": { count: expect.any(Number) },
      },
    });

  const diagnostics = await readPerformanceDiagnostics(page);
  expect(diagnostics).toBeDefined();
  expect(diagnostics?.runtime.pickups.active).toBe(
    diagnostics?.runtime.pickups.target,
  );
  expect(diagnostics?.runtime.pickups.queued).toBe(0);
  expect(diagnostics?.runtime.pickups.maxSpawnedPerFrame).toBeLessThanOrEqual(
    diagnostics?.runtime.pickups.maxPerFrame ?? 0,
  );
  for (const summary of Object.values(diagnostics?.phases ?? {})) {
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.latest).toBeGreaterThanOrEqual(0);
    expect(summary.p50).toBeLessThanOrEqual(summary.p95);
    expect(summary.p95).toBeLessThanOrEqual(summary.max);
  }

  const removed = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        removePickups: (count: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.removePickups(12) ?? 0;
  });
  expect(removed).toBe(12);
  const depleted = await readPerformanceDiagnostics(page);
  expect(depleted?.runtime.pickups.active).toBe(
    (diagnostics?.runtime.pickups.target ?? 0) - removed,
  );
  expect(depleted?.runtime.pickups.queued).toBe(removed);

  await expect
    .poll(async () => {
      const snapshot = await readPerformanceDiagnostics(page);
      return snapshot
        ? {
            active: snapshot.runtime.pickups.active,
            queued: snapshot.runtime.pickups.queued,
          }
        : null;
    })
    .toEqual({
      active: diagnostics?.runtime.pickups.target,
      queued: 0,
    });
  const replenished = await readPerformanceDiagnostics(page);
  expect(replenished?.runtime.pickups.totalSpawned).toBeGreaterThanOrEqual(
    (diagnostics?.runtime.pickups.totalSpawned ?? 0) + removed,
  );
  await testInfo.attach("performance-baseline.json", {
    body: Buffer.from(JSON.stringify(replenished, null, 2)),
    contentType: "application/json",
  });
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
