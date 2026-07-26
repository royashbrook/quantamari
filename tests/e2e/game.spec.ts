import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

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
    era: number;
    worldGeneration: number;
    transitionActive: boolean;
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
    drawBudget: {
      base: number;
      richBudget: number;
      richUsed: number;
      environmentSuppressed: boolean;
      substrateSuppressed: boolean;
    };
    bursts: {
      active: number;
      limit: number;
    };
  };
};

async function enablePerformanceDiagnostics(
  page: Page,
  forcedQuality?: "high" | "balanced" | "battery",
) {
  await page.addInitScript((quality) => {
    Object.assign(window, {
      __QUARKATAMARI_PERFORMANCE_REQUESTED__: true,
      ...(quality
        ? { __QUARKATAMARI_FORCED_QUALITY__: quality }
        : {}),
    });
  }, forcedQuality);
}

async function readPerformanceDiagnostics(page: Page) {
  return page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        snapshot: () => PerformanceSnapshot;
        removePickups: (count: number) => {
          removed: number;
          active: number;
          queued: number;
        };
        completeLayer: () => boolean;
        previewEra: (index: number) => number;
        emitPickupBursts: (count: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.snapshot() ?? null;
  });
}

async function inspectInstanceColors(page: Page) {
  return page.evaluate(() => {
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
  await expect
    .poll(
      async () => (await inspectInstanceColors(page)).checked,
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const instanceColorDiagnostics = await inspectInstanceColors(page);
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
  const battery = await readPerformanceDiagnostics(page);
  expect(battery?.runtime.quality).toBe("battery");
  expect(battery?.runtime.pickups.active).toBeLessThanOrEqual(
    battery?.runtime.pickups.target ?? 0,
  );
  expect(
    (battery?.runtime.drawBudget.base ?? 0) +
      (battery?.runtime.drawBudget.richUsed ?? 0) +
      ((battery?.runtime.pickups.active ?? 0) > 0 ? 1 : 0),
  ).toBeLessThanOrEqual(battery?.runtime.budget.maxDrawCalls ?? 0);
});

test("battery draw budgeting covers every authored era", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enablePerformanceDiagnostics(page, "battery");
  await begin(page);

  for (let era = 0; era < 34; era += 1) {
    const before = await readPerformanceDiagnostics(page);
    if (before?.runtime.era !== era) {
      const selected = await page.evaluate((index) => {
        const debugWindow = window as typeof window & {
          __QUARKATAMARI_PERFORMANCE__?: {
            previewEra: (eraIndex: number) => number;
          };
        };
        return debugWindow.__QUARKATAMARI_PERFORMANCE__?.previewEra(index);
      }, era);
      expect(selected).toBe(era);
    }

    await expect
      .poll(
        async () => {
          const snapshot = await readPerformanceDiagnostics(page);
          const worldReady =
            snapshot?.runtime.era === era &&
            (before?.runtime.era === era ||
              (snapshot?.runtime.worldGeneration ?? 0) >
                (before?.runtime.worldGeneration ?? 0));
          return Boolean(
            worldReady &&
              snapshot?.runtime.quality === "battery" &&
              snapshot.runtime.pickups.active ===
                snapshot.runtime.pickups.target &&
              snapshot.runtime.pickups.queued === 0 &&
              snapshot.runtime.drawCalls <=
                snapshot.runtime.budget.maxDrawCalls,
          );
        },
        { message: `era ${era} did not settle within its battery budget`, timeout: 30_000 },
      )
      .toBe(true);

    const snapshot = await readPerformanceDiagnostics(page);
    expect(snapshot?.runtime.drawCalls).toBeLessThanOrEqual(
      snapshot?.runtime.budget.maxDrawCalls ?? 0,
    );
    expect(
      snapshot?.runtime.drawBudget.environmentSuppressed,
      `era ${era} hid its active environment to meet the battery budget`,
    ).toBe(false);
    expect(
      snapshot?.runtime.drawBudget.substrateSuppressed,
      `era ${era} hid its retained substrate to meet the battery budget`,
    ).toBe(false);
    expect(
      (snapshot?.runtime.drawBudget.base ?? 0) +
        (snapshot?.runtime.drawBudget.richUsed ?? 0) +
        ((snapshot?.runtime.pickups.active ?? 0) > 0 ? 1 : 0),
      `era ${era} exceeded its weighted draw budget`,
    ).toBeLessThanOrEqual(snapshot?.runtime.budget.maxDrawCalls ?? 0);
  }
});

test("dense pickup bursts stay pooled inside the battery draw budget", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enablePerformanceDiagnostics(page, "battery");
  await begin(page);
  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.phases.frame?.count ?? 0,
    )
    .toBeGreaterThanOrEqual(10);
  const beforeBursts = await readPerformanceDiagnostics(page);

  const activeBursts = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        emitPickupBursts: (count: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.emitPickupBursts(100);
  });
  expect(activeBursts).toBe(12);

  await expect
    .poll(async () => {
      const snapshot = await readPerformanceDiagnostics(page);
      return Boolean(
        snapshot &&
          snapshot.phases.frame.count >
            (beforeBursts?.phases.frame.count ?? 0) &&
          snapshot.runtime.bursts.active === snapshot.runtime.bursts.limit &&
          snapshot.runtime.drawCalls <= snapshot.runtime.budget.maxDrawCalls,
      );
    })
    .toBe(true);
});

test("performance diagnostics capture a repeatable complex-scene baseline", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await enablePerformanceDiagnostics(page, "battery");
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
    .toBeGreaterThanOrEqual(60);

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
  const baseline = {
    schemaVersion: 1,
    commit: process.env.GITHUB_SHA ?? null,
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    snapshot: diagnostics,
  };
  console.info(
    "QUARKATAMARI_PERFORMANCE_BASELINE",
    JSON.stringify(baseline),
  );
  const baselinePath = testInfo.outputPath("performance-baseline.json");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
  await testInfo.attach("performance-baseline.json", {
    path: baselinePath,
    contentType: "application/json",
  });

  const depletion = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        removePickups: (count: number) => {
          removed: number;
          active: number;
          queued: number;
        };
      };
    };
    return (
      debugWindow.__QUARKATAMARI_PERFORMANCE__?.removePickups(12) ?? {
        removed: 0,
        active: 0,
        queued: 0,
      }
    );
  });
  expect(depletion.removed).toBe(12);
  expect(depletion.active).toBe(
    (diagnostics?.runtime.pickups.target ?? 0) - depletion.removed,
  );
  expect(depletion.queued).toBe(depletion.removed);

  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              active: snapshot.runtime.pickups.active,
              queued: snapshot.runtime.pickups.queued,
            }
          : null;
      },
      { timeout: 30_000 },
    )
    .toEqual({
      active: diagnostics?.runtime.pickups.target,
      queued: 0,
    });
  const replenished = await readPerformanceDiagnostics(page);
  expect(replenished?.runtime.pickups.totalSpawned).toBeGreaterThanOrEqual(
    (diagnostics?.runtime.pickups.totalSpawned ?? 0) + depletion.removed,
  );
});

test("a scale shift rebuilds once and repopulates through the work queue", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enablePerformanceDiagnostics(page, "balanced");
  await begin(page);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return Boolean(
          snapshot &&
            snapshot.runtime.pickups.active ===
              snapshot.runtime.pickups.target &&
            snapshot.runtime.pickups.queued === 0,
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const before = await readPerformanceDiagnostics(page);
  expect(before?.runtime.pickups.active).toBe(
    before?.runtime.pickups.target,
  );

  const triggered = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        completeLayer: () => boolean;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.completeLayer() ?? false;
  });
  expect(triggered).toBe(true);
  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.runtime.transitionActive,
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              era: snapshot.runtime.era,
              generation: snapshot.runtime.worldGeneration,
              transition: snapshot.runtime.transitionActive,
              settled:
                snapshot.runtime.pickups.active ===
                  snapshot.runtime.pickups.target &&
                snapshot.runtime.pickups.queued === 0,
            }
          : null;
      },
      { timeout: 30_000 },
    )
    .toEqual({
      era: (before?.runtime.era ?? 0) + 1,
      generation: expect.any(Number),
      transition: false,
      settled: true,
    });
  const after = await readPerformanceDiagnostics(page);
  expect(after?.runtime.worldGeneration).toBe(
    (before?.runtime.worldGeneration ?? 0) + 1,
  );
  expect(after?.runtime.pickups.active).toBe(after?.runtime.pickups.target);
  expect(after?.runtime.pickups.maxSpawnedPerFrame).toBeLessThanOrEqual(
    after?.runtime.pickups.maxPerFrame ?? 0,
  );
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
