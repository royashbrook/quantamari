import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

import { DESKTOP_SEMANTIC_PICKUP_TARGET } from "../../src/lib/game/spawn-policy";

const appPath = "/";
const appVersion = (
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;
const mashStressCatalog = (
  JSON.parse(
    readFileSync(
      new URL("../../src/lib/data/scale-catalog.json", import.meta.url),
      "utf8",
    ),
  ) as Array<{ id: string; curios: Array<{ id: string }> }>
).flatMap((era) =>
  era.curios.map((curio) => ({
    eraId: era.id,
    curioId: `${era.id}/${curio.id}`,
  })),
);
const MAX_VISIBLE_MASH_PIECES = 32;

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
    mode: "journey" | "learning";
    radius: number;
    playerScale: number;
    worldScale: number;
    performanceProfile: "standard" | "battery";
    adaptiveQuality: boolean;
    profileSettings: {
      qualityTier: "high" | "balanced" | "battery";
      targetFps: number;
      idleTargetFps: number;
      pixelRatioCap: number;
      antialias: boolean;
      shadows: boolean;
    };
    worldGeneration: number;
    transitionActive: boolean;
    pickups: {
      active: number;
      current: number;
      resident: number;
      retiring: number;
      queued: number;
      target: number;
      totalSpawned: number;
      spawnedLastFrame: number;
      maxSpawnedPerFrame: number;
      maxPerFrame: number;
      workBudgetMs: number;
    };
    representations: {
      richPickups: number;
      simplePickups: number;
      silhouetteDrawCalls: number;
      silhouetteBadgeInstances: number;
      genericPickups: number;
      attachments: number;
      proxyPieces: number;
      proxyFamilies: number;
      richMashDrawCalls: number;
      visibleAttachments: number;
      attachmentProxyActive: boolean;
      attachmentScale: number;
      attachmentDistance: number;
      effectiveRadius: number;
    };
    world: {
      kind: string;
      surface: string;
      semanticViewScale: number;
      foundationLayers: number[];
      groundVisible: boolean;
      dustVisible: boolean;
      environmentChildren: number;
      atmosphericCloudTop: boolean;
      substrateChildren: number;
      substrateAuthoredInstances: number;
      substrateGenericInstances: number;
    };
    player: {
      x: number;
      z: number;
      cameraDistance: number;
      projectedDiameter: number;
      horizontalFov: number;
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
      pipelineReserve: number;
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

async function seedPerformanceProfile(
  page: Page,
  profile: "standard" | "battery",
) {
  await page.addInitScript((selectedProfile) => {
    localStorage.setItem(
      "quantamari-performance-profile",
      selectedProfile,
    );
  }, profile);
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

async function seedAttachedFoam(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "learning",
        eraId: "theory-playground",
        progress: 0,
        picked: 1,
        unitemizedPicked: 0,
        x: 0,
        z: 0,
        zooms: 0,
        sound: false,
        mash: [
          {
            eraId: "theory-playground",
            curioId: "theory-playground/foam-bubble",
            position: [3, 0.2, 0.1],
            rotation: [0.1, 0.2, 0.3],
            scale: [1.5, 1.5, 1.5],
            mergedInside: false,
          },
        ],
        collection: [],
      }),
    );
  });
}

async function seedDenseDistinctMash(page: Page, count = 90) {
  const specimens = mashStressCatalog.slice(0, count);
  const eraId = specimens.at(-1)?.eraId ?? "theory-playground";
  await page.addInitScript(({ savedEraId, savedSpecimens }) => {
    const mash = savedSpecimens.map((specimen, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = 0.62 + (index % 3) * 0.06;
      return {
        eraId: specimen.eraId,
        curioId: specimen.curioId,
        position: [
          Math.cos(angle) * radius,
          ((index % 5) - 2) * 0.08,
          Math.sin(angle) * radius,
        ],
        rotation: [index * 0.13, index * 0.21, index * 0.08],
        scale: [0.18, 0.18, 0.18],
        mergedInside: true,
      };
    });
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "learning",
        eraId: savedEraId,
        progress: 0,
        picked: mash.length,
        unitemizedPicked: mash.length,
        x: 0,
        z: 0,
        zooms: 0,
        cycles: 0,
        sound: false,
        mash,
        collection: [],
      }),
    );
  }, { savedEraId: eraId, savedSpecimens: specimens });
}

async function seedMultiEraMash(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem("everything-roll-save-v4")) return;
    const mash = [
      ["theory-playground", "foam-bubble"],
      ["particle-probe-frontier", "field-ripple"],
      ["quarks-gluons", "up-quark-trace"],
      ["hadron-forge", "proton"],
    ].map(([eraId, curioId], index) => ({
      eraId,
      curioId: `${eraId}/${curioId}`,
      position: [0.58 + index * 0.12, 0.08 * index, 0.1 * index],
      rotation: [0.1 * index, 0.2, 0.3],
      scale: [0.2, 0.2, 0.2],
      mergedInside: false,
    }));
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "learning",
        eraId: "hadron-forge",
        progress: 0.15,
        picked: mash.length,
        unitemizedPicked: 0,
        x: 0,
        z: 0,
        zooms: 3,
        sound: false,
        mash,
        collection: [],
      }),
    );
  });
}

test("boots the static game at its production root", async ({ page }) => {
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
  const buildStamp = page.getByTestId("build-stamp");
  await expect(buildStamp).toContainText(`v${appVersion} · `);
  await expect(buildStamp).toBeVisible();
  await expect(page.getByRole("button", { name: "Long game" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const menuTrigger = page.getByRole("button", { name: "Open game menu" });
  await expect(menuTrigger).toBeVisible();
  await menuTrigger.click();
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("switch", { name: /Battery Optimized/ }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(menu.getByRole("link", { name: "Save rescue" })).toHaveAttribute(
    "href",
    "/rescue",
  );
  await expect(menu.getByRole("link", { name: "Save rescue" })).toHaveAttribute(
    "rel",
    "external",
  );
  await menu.getByRole("button", { name: "About Quantamari" }).click();
  await expect(
    menu.getByRole("heading", { name: "About Quantamari" }),
  ).toBeVisible();
  await expect(menu.getByTestId("about-build")).toHaveText(
    (await buildStamp.textContent())?.trim() ?? "",
  );
  await expect(menu.locator("footer").getByText(/^v\d/)).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "roy" })).toHaveAttribute(
    "href",
    "https://royashbrook.com",
  );
  await expect(menu.getByRole("link", { name: "ai" })).toHaveAttribute(
    "href",
    "https://royashbrook.com/agents",
  );
  await expect(menu.getByRole("link", { name: "sponsor me" })).toHaveAttribute(
    "href",
    "https://github.com/sponsors/royashbrook",
  );
  await page.keyboard.press("Escape");
  await expect(
    menu.getByRole("heading", { name: "About Quantamari" }),
  ).toBeHidden();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuTrigger).toBeFocused();
  const startButton = page.getByRole("button", { name: "Begin becoming" });
  await startButton.focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(startButton).toBeFocused();

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
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.reload();

  await expect(
    page.getByRole("button", { name: "Learning tour" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Turn on sound" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Begin becoming" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
});

test("performance profile changes only by explicit persisted choice", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enablePerformanceDiagnostics(page);
  await seedDenseDistinctMash(page);
  await begin(page);

  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.runtime.performanceProfile,
    )
    .toBe("standard");
  const standard = await readPerformanceDiagnostics(page);
  expect(standard?.runtime.quality).toBe("balanced");
  expect(standard?.runtime.adaptiveQuality).toBe(false);
  expect(standard?.runtime.profileSettings).toMatchObject({
    targetFps: 30,
    idleTargetFps: 24,
    pixelRatioCap: 1.25,
    shadows: false,
  });
  expect(standard?.runtime.representations.attachments).toBeLessThanOrEqual(6);
  expect(standard?.runtime.representations.richMashDrawCalls).toBeLessThanOrEqual(
    18,
  );
  expect(standard?.runtime.representations.proxyFamilies).toBeGreaterThan(20);
  expect(
    (standard?.runtime.representations.attachments ?? 0) +
      (standard?.runtime.representations.proxyPieces ?? 0),
  ).toBe(MAX_VISIBLE_MASH_PIECES);
  expect(standard?.runtime.representations.genericPickups).toBe(0);
  const semanticPopulation = standard?.runtime.pickups.target;
  const standardWorldGeneration = standard?.runtime.worldGeneration;
  await page.waitForTimeout(5_500);
  const afterStandardMeasurement = await readPerformanceDiagnostics(page);
  expect(afterStandardMeasurement?.runtime.performanceProfile).toBe(
    "standard",
  );
  expect(afterStandardMeasurement?.runtime.quality).toBe("balanced");
  expect(afterStandardMeasurement?.runtime.worldGeneration).toBe(
    standardWorldGeneration,
  );
  expect(afterStandardMeasurement?.runtime.drawCalls).toBeLessThanOrEqual(
    afterStandardMeasurement?.runtime.budget.maxDrawCalls ?? 0,
  );
  await page.keyboard.down("ArrowUp");
  try {
    await page.waitForTimeout(500);
    for (let sample = 0; sample < 6; sample += 1) {
      const moving = await readPerformanceDiagnostics(page);
      expect(
        moving?.runtime.drawCalls,
        `moving compact Standard sample ${sample} exceeded its draw-call budget`,
      ).toBeLessThanOrEqual(moving?.runtime.budget.maxDrawCalls ?? 0);
      await page.waitForTimeout(250);
    }
  } finally {
    await page.keyboard.up("ArrowUp");
  }
  const afterStandardMovement = await readPerformanceDiagnostics(page);
  expect(
    (afterStandardMovement?.runtime.representations.attachments ?? 0) +
      (afterStandardMovement?.runtime.representations.proxyPieces ?? 0),
  ).toBe(MAX_VISIBLE_MASH_PIECES);

  await page.getByRole("button", { name: "Open game menu" }).click();
  const profileSwitch = page.getByRole("switch", {
    name: /Battery Optimized/,
  });
  await profileSwitch.click();
  await expect(profileSwitch).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.runtime.performanceProfile,
      { timeout: 30_000 },
    )
    .toBe("battery");
  const battery = await readPerformanceDiagnostics(page);
  expect(battery?.runtime.quality).toBe("battery");
  expect(battery?.runtime.adaptiveQuality).toBe(false);
  expect(battery?.runtime.profileSettings).toMatchObject({
    targetFps: 30,
    idleTargetFps: 15,
    pixelRatioCap: 1,
    shadows: false,
  });
  expect(battery?.runtime.representations.attachments).toBeLessThanOrEqual(4);
  expect(battery?.runtime.representations.richMashDrawCalls).toBeLessThanOrEqual(
    12,
  );
  expect(
    (battery?.runtime.representations.attachments ?? 0) +
      (battery?.runtime.representations.proxyPieces ?? 0),
  ).toBe(MAX_VISIBLE_MASH_PIECES);
  expect(battery?.runtime.representations.proxyFamilies).toBeGreaterThan(20);
  expect(battery?.runtime.representations.proxyFamilies).toBeLessThanOrEqual(
    battery?.runtime.representations.proxyPieces ?? 0,
  );
  expect(battery?.runtime.pickups.target).toBe(semanticPopulation);

  await page.getByRole("button", { name: "Resume rolling" }).click();
  const stableWorldGeneration = battery?.runtime.worldGeneration;
  await page.waitForTimeout(5_500);
  const afterMeasurementWindow = await readPerformanceDiagnostics(page);
  expect(afterMeasurementWindow?.runtime.performanceProfile).toBe("battery");
  expect(afterMeasurementWindow?.runtime.quality).toBe("battery");
  expect(afterMeasurementWindow?.runtime.worldGeneration).toBe(
    stableWorldGeneration,
  );

  const stored = await page.evaluate(() => ({
    profile: localStorage.getItem("quantamari-performance-profile"),
    save: JSON.parse(
      localStorage.getItem("everything-roll-save-v4") ?? "{}",
    ) as Record<string, unknown>,
  }));
  expect(stored.profile).toBe("battery");
  expect(stored.save.performanceProfile).toBeUndefined();

  await page.reload();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("switch", { name: /Battery Optimized/ }),
  ).toHaveAttribute("aria-checked", "true");
});

test("game menu freezes the world and Escape resumes it", async ({ page }) => {
  await enablePerformanceDiagnostics(page);
  await begin(page);

  const startingPlayer = (await readPerformanceDiagnostics(page))?.runtime.player;
  expect(startingPlayer).toBeDefined();
  await page.keyboard.down("d");
  await expect
    .poll(
      async () => {
        const player = (await readPerformanceDiagnostics(page))?.runtime.player;
        return player
          ? Math.hypot(
              player.x - (startingPlayer?.x ?? 0),
              player.z - (startingPlayer?.z ?? 0),
            )
          : 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0.01);

  await page.getByRole("button", { name: "Open game menu" }).click();
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu).toBeVisible();
  await page.keyboard.up("d");
  const pausedPlayer = (await readPerformanceDiagnostics(page))?.runtime.player;
  await page.waitForTimeout(750);
  expect((await readPerformanceDiagnostics(page))?.runtime.player).toMatchObject({
    x: pausedPlayer?.x,
    z: pausedPlayer?.z,
  });

  await menu.getByRole("button", { name: "Resume rolling" }).click();
  await page.keyboard.down("d");
  try {
    await expect
      .poll(
        async () => {
          const player = (await readPerformanceDiagnostics(page))?.runtime.player;
          return player
            ? Math.hypot(
                player.x - (pausedPlayer?.x ?? 0),
                player.z - (pausedPlayer?.z ?? 0),
              )
            : 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0.01);
  } finally {
    await page.keyboard.up("d");
  }

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  const escapedPlayer = (await readPerformanceDiagnostics(page))?.runtime.player;
  await page.keyboard.down("d");
  try {
    await expect
      .poll(
        async () => {
          const player = (await readPerformanceDiagnostics(page))?.runtime.player;
          return player
            ? Math.hypot(
                player.x - (escapedPlayer?.x ?? 0),
                player.z - (escapedPlayer?.z ?? 0),
              )
            : 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0.01);
  } finally {
    await page.keyboard.up("d");
  }

  await page
    .getByRole("button", { name: "Open scale and science atlas" })
    .click();
  const atlas = page.getByRole("dialog", { name: "Scale and science atlas" });
  await expect(atlas).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(atlas).toBeHidden();
  await expect(menu).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();

  await menu.getByRole("button", { name: "Field guide" }).click();
  const guide = page.getByRole("dialog", {
    name: "Your rolled-up field guide",
  });
  await expect(guide).toBeVisible();
  await expect(menu).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await expect(menu).toBeVisible();

  await menu.getByRole("button", { name: "Scale & science" }).click();
  await expect(atlas).toBeVisible();
  await expect(menu).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(atlas).toBeHidden();
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Resume rolling" }).click();
  await expect(menu).toBeHidden();
});

test("reset clears Quantamari progress in every open tab", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("quarkatamari-reset-test-seeded")) return;
    sessionStorage.setItem("quarkatamari-reset-test-seeded", "true");
    localStorage.setItem(
      "everything-roll-save-v4",
      JSON.stringify({
        version: 4,
        mode: "learning",
        eraId: "theory-playground",
        progress: 0.75,
        picked: 9,
        unitemizedPicked: 0,
        x: 2,
        z: 3,
        zooms: 0,
        sound: false,
        mash: [],
        collection: [],
      }),
    );
    localStorage.setItem("everything-roll-save-v3", "legacy-v3");
    localStorage.setItem("everything-roll-save-v2", "legacy-v2");
    localStorage.setItem("quantamari-performance-profile", "battery");
    localStorage.setItem("unrelated-origin-data", "keep-me");
  });
  await page.goto(appPath);
  const otherPage = await context.newPage();
  await otherPage.goto(appPath);
  await otherPage.getByRole("button", { name: "Begin becoming" }).click();
  await expect(otherPage.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Open game menu" }).click();
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await menu.getByRole("button", { name: "Reset all progress" }).click();
  await expect(
    menu.getByRole("heading", { name: "Reset all progress?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      v4: localStorage.getItem("everything-roll-save-v4"),
      v3: localStorage.getItem("everything-roll-save-v3"),
      v2: localStorage.getItem("everything-roll-save-v2"),
      profile: localStorage.getItem("quantamari-performance-profile"),
      unrelated: localStorage.getItem("unrelated-origin-data"),
    })),
  ).toMatchObject({
    v4: expect.any(String),
    v3: "legacy-v3",
    v2: "legacy-v2",
    profile: "battery",
    unrelated: "keep-me",
  });

  await menu.getByRole("button", { name: "Cancel" }).click();
  await menu.getByRole("button", { name: "Reset all progress" }).click();
  const reloads = Promise.all([
    page.waitForEvent("framenavigated"),
    otherPage.waitForEvent("framenavigated"),
  ]);
  await menu.getByRole("button", { name: "Reset everything" }).click();
  await reloads;
  await expect(
    page.getByRole("heading", { name: /You are not a ball/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    otherPage.getByRole("heading", { name: /You are not a ball/ }),
  ).toBeVisible({ timeout: 30_000 });
  expect(
    await page.evaluate(() => ({
      v4: localStorage.getItem("everything-roll-save-v4"),
      v3: localStorage.getItem("everything-roll-save-v3"),
      v2: localStorage.getItem("everything-roll-save-v2"),
      profile: localStorage.getItem("quantamari-performance-profile"),
      unrelated: localStorage.getItem("unrelated-origin-data"),
    })),
  ).toEqual({
    v4: null,
    v3: null,
    v2: null,
    profile: "battery",
    unrelated: "keep-me",
  });
  expect(
    await otherPage.evaluate(() => ({
      v4: localStorage.getItem("everything-roll-save-v4"),
      v3: localStorage.getItem("everything-roll-save-v3"),
      v2: localStorage.getItem("everything-roll-save-v2"),
      profile: localStorage.getItem("quantamari-performance-profile"),
      unrelated: localStorage.getItem("unrelated-origin-data"),
    })),
  ).toEqual({
    v4: null,
    v3: null,
    v2: null,
    profile: "battery",
    unrelated: "keep-me",
  });
  await otherPage.close();
});

test("multi-era rich and proxy mash pieces survive a save reload", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enablePerformanceDiagnostics(page, "balanced");
  await seedMultiEraMash(page);
  await begin(page);

  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? snapshot.runtime.representations.attachments +
              snapshot.runtime.representations.proxyPieces
          : 0;
      },
      { timeout: 30_000 },
    )
    .toBe(4);
  const beforeReload = await readPerformanceDiagnostics(page);
  const expectedRepresentations = {
    era: beforeReload?.runtime.era,
    attachments: beforeReload?.runtime.representations.attachments,
    proxyPieces: beforeReload?.runtime.representations.proxyPieces,
  };
  expect(expectedRepresentations.era).toBe(3);
  expect(expectedRepresentations.attachments).toBeGreaterThan(0);
  expect(expectedRepresentations.proxyPieces).toBeGreaterThan(0);

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(
    await page.evaluate(() => {
      const save = JSON.parse(
        localStorage.getItem("everything-roll-save-v4") ?? "{}",
      );
      return Array.isArray(save.mash) ? save.mash.length : 0;
    }),
  ).toBe(4);

  await begin(page);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              era: snapshot.runtime.era,
              attachments: snapshot.runtime.representations.attachments,
              proxyPieces: snapshot.runtime.representations.proxyPieces,
            }
          : null;
      },
      { timeout: 30_000 },
    )
    .toEqual(expectedRepresentations);
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
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enablePerformanceDiagnostics(page);
  await begin(page);
  await expect(
    page.getByText("◎ drag anywhere to roll · pinch to zoom"),
  ).toBeVisible();
  await expect(page.locator(".fact-card")).toBeVisible();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(page.getByRole("dialog", { name: "Game menu" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Resume rolling" }).click();

  const startPosition = (await readPerformanceDiagnostics(page))?.runtime
    .player ?? { x: 0, z: 0 };
  await page.mouse.move(195, 500);
  await page.mouse.down();
  try {
    await page.mouse.move(285, 500, { steps: 4 });
    await expect
      .poll(
        async () => {
          const player = (await readPerformanceDiagnostics(page))?.runtime.player;
          return player
            ? Math.hypot(player.x - startPosition.x, player.z - startPosition.z)
            : 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0.01);
  } finally {
    await page.mouse.up();
  }
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const savedPosition = await page.evaluate(() => {
    const save = JSON.parse(
      localStorage.getItem("everything-roll-save-v4") ?? "{}",
    );
    return { x: Number(save.x ?? 0), z: Number(save.z ?? 0) };
  });
  expect(Math.hypot(savedPosition.x, savedPosition.z)).toBeGreaterThan(0);
});

test.describe("real touch input", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("touch drag steers with a visible joystick, pinch drives the lens, surge button shows", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await enablePerformanceDiagnostics(page);
    await begin(page);
    const surge = page.locator(".surge-button");
    await expect(surge).toBeVisible();
    // The button carries the hud class; a regression to the .hud
    // pointer-events:none rule would leave it visible but dead.
    expect(
      await surge.evaluate((el) => getComputedStyle(el).pointerEvents),
    ).toBe("auto");

    const cdp = await page.context().newCDPSession(page);
    // Pressing surge must not fall through to the canvas and start steering.
    const surgeBox = await surge.boundingBox();
    expect(surgeBox).not.toBeNull();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: surgeBox!.x + surgeBox!.width / 2,
          y: surgeBox!.y + surgeBox!.height / 2,
        },
      ],
    });
    await expect(page.locator(".joy-thumb")).toBeHidden();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const startPosition = (await readPerformanceDiagnostics(page))?.runtime
      .player ?? { x: 0, z: 0 };

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y: 500 }],
    });
    try {
      for (let step = 1; step <= 5; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 195 + step * 18, y: 500 }],
        });
      }
      await expect(page.locator(".joy-thumb")).toBeVisible();
      await expect
        .poll(
          async () => {
            const player = (await readPerformanceDiagnostics(page))?.runtime
              .player;
            return player
              ? Math.hypot(
                  player.x - startPosition.x,
                  player.z - startPosition.z,
                )
              : 0;
          },
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0.01);
    } finally {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    await expect(page.locator(".joy-thumb")).toBeHidden();

    // Two-finger pinch-out zooms the lens in (value drops below 1.00).
    const initialLens = await page
      .locator(".lens-control span")
      .textContent();
    expect(initialLens).toContain("1.00×");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 170, y: 470, id: 0 },
        { x: 220, y: 530, id: 1 },
      ],
    });
    try {
      for (let step = 1; step <= 6; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: 170 - step * 12, y: 470 - step * 12, id: 0 },
            { x: 220 + step * 12, y: 530 + step * 12, id: 1 },
          ],
        });
      }
    } finally {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    await expect
      .poll(async () =>
        Number(
          (await page.locator(".lens-control span").textContent())?.match(
            /([\d.]+)×/,
          )?.[1] ?? "1",
        ),
      )
      .toBeLessThan(1);
  });
});

test("desktop framing stays bounded and the nearest rug keeps authored identities", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enablePerformanceDiagnostics(page, "high");
  await begin(page);
  const selected = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        previewEra: (eraIndex: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.previewEra(20);
  });
  expect(selected).toBe(20);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              era: snapshot.runtime.era,
              target: snapshot.runtime.pickups.target,
              current: snapshot.runtime.pickups.current,
              queued: snapshot.runtime.pickups.queued,
              authored:
                snapshot.runtime.world.substrateAuthoredInstances,
              generic:
                snapshot.runtime.world.substrateGenericInstances,
            }
          : null;
      },
      { timeout: 30_000 },
    )
    .toEqual({
      era: 20,
      target: DESKTOP_SEMANTIC_PICKUP_TARGET,
      current: DESKTOP_SEMANTIC_PICKUP_TARGET,
      queued: 0,
      authored: 28,
      generic: 0,
    });
  const desktop = await readPerformanceDiagnostics(page);
  expect(desktop?.runtime.player.horizontalFov).toBeLessThanOrEqual(58.001);
  expect(desktop?.runtime.drawCalls).toBeLessThanOrEqual(
    desktop?.runtime.budget.maxDrawCalls ?? 0,
  );
  expect(desktop?.runtime.drawBudget.richUsed).toBeLessThanOrEqual(
    desktop?.runtime.drawBudget.richBudget ?? 0,
  );
  await page.keyboard.down("ArrowUp");
  try {
    await page.waitForTimeout(500);
    for (let sample = 0; sample < 10; sample += 1) {
      const moving = await readPerformanceDiagnostics(page);
      expect(
        moving?.runtime.drawCalls,
        `moving Standard sample ${sample} exceeded its draw-call budget`,
      ).toBeLessThanOrEqual(moving?.runtime.budget.maxDrawCalls ?? 0);
      await page.waitForTimeout(250);
    }
  } finally {
    await page.keyboard.up("ArrowUp");
  }

  await page.setViewportSize({ width: 2560, height: 720 });
  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.runtime.player.horizontalFov,
    )
    .toBeLessThanOrEqual(58.001);
  const ultrawide = await readPerformanceDiagnostics(page);
  expect(ultrawide?.runtime.pickups.target).toBe(
    DESKTOP_SEMANTIC_PICKUP_TARGET,
  );
  expect(ultrawide?.runtime.world.substrateGenericInstances).toBe(0);
});

test("mobile battery mode enforces its measured draw-call budget", async ({
  page,
}) => {
  test.setTimeout(110_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enablePerformanceDiagnostics(page);
  await seedPerformanceProfile(page, "battery");
  await seedAttachedFoam(page);
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
          snapshot.runtime.pickups.active ===
            snapshot.runtime.pickups.target &&
          snapshot.runtime.pickups.retiring === 0 &&
          snapshot.runtime.drawCalls <= snapshot.runtime.budget.maxDrawCalls;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const battery = await readPerformanceDiagnostics(page);
  expect(battery?.runtime.quality).toBe("battery");
  expect(battery?.runtime.pickups.active).toBe(
    battery?.runtime.pickups.target,
  );
  expect(battery?.runtime.performanceProfile).toBe("battery");
  expect(battery?.runtime.adaptiveQuality).toBe(false);
  expect(battery?.runtime.representations.attachmentProxyActive).toBe(false);
  expect(
    battery?.runtime.representations.proxyPieces,
  ).toBeGreaterThan(0);
  expect(
    (battery?.runtime.drawBudget.base ?? 0) +
      (battery?.runtime.drawBudget.pipelineReserve ?? 0) +
      (battery?.runtime.drawBudget.richUsed ?? 0) +
      (battery?.runtime.representations.silhouetteDrawCalls ?? 0) +
      ((battery?.runtime.pickups.active ?? 0) > 0 ? 1 : 0),
  ).toBeLessThanOrEqual(battery?.runtime.budget.maxDrawCalls ?? 0);

  const pacingStart =
    (await readPerformanceDiagnostics(page))?.phases.frame?.count ?? 0;
  await page.waitForTimeout(1_500);
  const pacingEnd =
    (await readPerformanceDiagnostics(page))?.phases.frame?.count ?? 0;
  expect(pacingEnd - pacingStart).toBeGreaterThan(0);
  expect(pacingEnd - pacingStart).toBeLessThanOrEqual(50);

  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const afterResize = await readPerformanceDiagnostics(page);
  expect(afterResize?.runtime.quality).toBe("battery");
  expect(afterResize?.runtime.adaptiveQuality).toBe(false);

  const selected = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        previewEra: (eraIndex: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.previewEra(21);
  });
  expect(selected).toBe(21);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return Boolean(
          snapshot &&
            snapshot.runtime.era === 21 &&
            snapshot.runtime.quality === "battery" &&
            snapshot.runtime.adaptiveQuality === false &&
            snapshot.runtime.pickups.current ===
              snapshot.runtime.pickups.target &&
            snapshot.runtime.pickups.queued === 0 &&
            snapshot.runtime.pickups.retiring === 0,
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const settled = await readPerformanceDiagnostics(page);
  const stableRepresentations = {
    richPickups: settled?.runtime.representations.richPickups,
    simplePickups: settled?.runtime.representations.simplePickups,
    silhouetteDrawCalls:
      settled?.runtime.representations.silhouetteDrawCalls,
    silhouetteBadgeInstances:
      settled?.runtime.representations.silhouetteBadgeInstances,
    genericPickups: settled?.runtime.representations.genericPickups,
    attachments: settled?.runtime.representations.attachments,
    visibleAttachments:
      settled?.runtime.representations.visibleAttachments,
    attachmentProxyActive:
      settled?.runtime.representations.attachmentProxyActive,
  };
  expect(stableRepresentations.silhouetteDrawCalls).toBeGreaterThan(0);
  expect(stableRepresentations.silhouetteBadgeInstances).toBeGreaterThan(0);
  expect(stableRepresentations.genericPickups).toBe(0);
  const stableWorldGeneration = settled?.runtime.worldGeneration;
  await page.waitForTimeout(5_500);
  const afterAnotherQualityWindow = await readPerformanceDiagnostics(page);
  expect(afterAnotherQualityWindow?.runtime.quality).toBe("battery");
  expect(afterAnotherQualityWindow?.runtime.adaptiveQuality).toBe(false);
  expect(afterAnotherQualityWindow?.runtime.worldGeneration).toBe(
    stableWorldGeneration,
  );
  expect({
    richPickups:
      afterAnotherQualityWindow?.runtime.representations.richPickups,
    simplePickups:
      afterAnotherQualityWindow?.runtime.representations.simplePickups,
    silhouetteDrawCalls:
      afterAnotherQualityWindow?.runtime.representations.silhouetteDrawCalls,
    silhouetteBadgeInstances:
      afterAnotherQualityWindow?.runtime.representations
        .silhouetteBadgeInstances,
    genericPickups:
      afterAnotherQualityWindow?.runtime.representations.genericPickups,
    attachments: afterAnotherQualityWindow?.runtime.representations.attachments,
    visibleAttachments:
      afterAnotherQualityWindow?.runtime.representations.visibleAttachments,
    attachmentProxyActive:
      afterAnotherQualityWindow?.runtime.representations
        .attachmentProxyActive,
  }).toEqual(stableRepresentations);
});

test("battery draw budgeting covers every authored era", async ({ page }) => {
  test.setTimeout(300_000);
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
              snapshot.runtime.pickups.current ===
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
      snapshot?.runtime.drawBudget.richUsed,
      `era ${era} exceeded its allocated rich-detail budget`,
    ).toBeLessThanOrEqual(
      snapshot?.runtime.drawBudget.richBudget ?? 0,
    );
  }
});

test("dense pickup bursts stay pooled inside the battery draw budget", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enablePerformanceDiagnostics(page, "battery");
  await begin(page);
  await expect
    .poll(
      async () =>
        (await readPerformanceDiagnostics(page))?.phases.frame?.count ?? 0,
      { timeout: 15_000 },
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
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return Boolean(
          snapshot &&
            snapshot.phases.frame.count >
              (beforeBursts?.phases.frame.count ?? 0) &&
            snapshot.runtime.bursts.active === snapshot.runtime.bursts.limit &&
            snapshot.runtime.drawCalls <= snapshot.runtime.budget.maxDrawCalls,
        );
      },
      { timeout: 15_000 },
    )
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
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot &&
          snapshot.runtime.pickups.active ===
            snapshot.runtime.pickups.target &&
          snapshot.runtime.pickups.queued === 0
          ? snapshot
          : null;
      },
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

test("long game crosses a layer without a skip animation or size pop", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await enablePerformanceDiagnostics(page, "balanced");
  await seedAttachedFoam(page);
  await begin(page, "Long game");
  await expect
    .poll(
      async () => (await readPerformanceDiagnostics(page))?.runtime.era,
      { timeout: 15_000 },
    )
    .toBe(0);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? snapshot.runtime.player.cameraDistance / snapshot.runtime.radius
          : 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(12);
  const debugLens = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        setLens: (value: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.setLens(32) ?? 0;
  });
  expect(debugLens).toBe(32);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              playerIsDistant:
                snapshot.runtime.player.projectedDiameter < 9,
              mashStillReadsLarge:
                snapshot.runtime.representations.effectiveRadius >
                snapshot.runtime.radius * 1.6,
              attachmentsStayAuthored:
                !snapshot.runtime.representations.attachmentProxyActive,
            }
          : null;
      },
      { timeout: 15_000 },
    )
    .toEqual({
      playerIsDistant: true,
      mashStillReadsLarge: true,
      attachmentsStayAuthored: true,
    });
  const expectedCameraRatio = debugLens * Math.hypot(6.05, 10.6);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        if (!snapshot || snapshot.runtime.radius <= 0) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(
          snapshot.runtime.player.cameraDistance / snapshot.runtime.radius -
            expectedCameraRatio,
        ) / expectedCameraRatio;
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(0.005);

  const before = await readPerformanceDiagnostics(page);
  const initialProjectedDiameter =
    before?.runtime.player.projectedDiameter ?? 0;
  expect(initialProjectedDiameter).toBeGreaterThan(0);
  const initialAttachmentScale =
    before?.runtime.representations.attachmentScale ?? 0;
  const initialAttachmentDistance =
    before?.runtime.representations.attachmentDistance ?? 0;
  expect(initialAttachmentScale).toBeGreaterThan(0);
  expect(initialAttachmentDistance).toBeGreaterThan(0);

  const boundary = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        completeLayer: () => boolean;
        snapshot: () => PerformanceSnapshot;
      };
    };
    const diagnostics = debugWindow.__QUARKATAMARI_PERFORMANCE__;
    return {
      triggered: diagnostics?.completeLayer() ?? false,
      snapshot: diagnostics?.snapshot() ?? null,
    };
  });
  expect(boundary.triggered).toBe(true);
  expect(boundary.snapshot?.runtime.mode).toBe("journey");
  expect(boundary.snapshot?.runtime.transitionActive).toBe(false);
  const boundaryRadius = boundary.snapshot?.runtime.radius ?? 0;

  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              era: snapshot.runtime.era,
              transition: snapshot.runtime.transitionActive,
              playerScale: snapshot.runtime.playerScale,
              worldScale: snapshot.runtime.worldScale,
            }
          : null;
      },
      { timeout: 10_000 },
    )
    .toEqual({
      era: 1,
      transition: false,
      playerScale: 1,
      worldScale: 1,
    });
  const crossed = await readPerformanceDiagnostics(page);
  expect(crossed?.runtime.radius).toBeLessThan(boundaryRadius);
  expect(crossed?.runtime.worldGeneration).toBe(
    (boundary.snapshot?.runtime.worldGeneration ?? 0) + 1,
  );
  const expectedRebase = (crossed?.runtime.radius ?? 0) / boundaryRadius;
  expect(
    (crossed?.runtime.representations.attachmentScale ?? 0) /
      initialAttachmentScale,
  ).toBeCloseTo(expectedRebase, 5);
  expect(
    (crossed?.runtime.representations.attachmentDistance ?? 0) /
      initialAttachmentDistance,
  ).toBeCloseTo(expectedRebase, 5);
  expect(crossed?.runtime.representations.attachments).toBe(1);
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? {
              extended:
                snapshot.runtime.representations.effectiveRadius >
                snapshot.runtime.radius * 1.5,
              proxy:
                snapshot.runtime.representations.attachmentProxyActive,
            }
          : null;
      },
      { timeout: 15_000 },
    )
    .toEqual({ extended: true, proxy: false });
  await expect
    .poll(
      async () => {
        const snapshot = await readPerformanceDiagnostics(page);
        return snapshot
          ? Math.abs(
              snapshot.runtime.player.projectedDiameter -
                initialProjectedDiameter,
            ) / initialProjectedDiameter
          : Number.POSITIVE_INFINITY;
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(0.03);
});

test("the optical lens resolves only reached layers and leaves the origin empty", async ({
  page,
}) => {
  await enablePerformanceDiagnostics(page, "balanced");
  await begin(page);

  const setLens = (value: number) =>
    page.evaluate((nextLens) => {
      const debugWindow = window as typeof window & {
        __QUARKATAMARI_PERFORMANCE__?: {
          setLens: (lens: number) => number;
        };
      };
      return debugWindow.__QUARKATAMARI_PERFORMANCE__?.setLens(nextLens);
    }, value);

  expect(await setLens(8)).toBe(8);
  await expect
    .poll(async () => {
      const snapshot = await readPerformanceDiagnostics(page);
      return snapshot
        ? {
            era: snapshot.runtime.era,
            viewScale: snapshot.runtime.world.semanticViewScale,
            foundations: snapshot.runtime.world.foundationLayers,
            groundVisible: snapshot.runtime.world.groundVisible,
            substrateChildren: snapshot.runtime.world.substrateChildren,
            authored: snapshot.runtime.world.substrateAuthoredInstances,
            generic: snapshot.runtime.world.substrateGenericInstances,
          }
        : null;
    })
    .toEqual({
      era: 0,
      viewScale: 0,
      foundations: [],
      groundVisible: false,
      substrateChildren: 0,
      authored: 0,
      generic: 0,
    });
  await expect(page.locator(".lens-control span")).toContainText(
    "no prior fabric",
  );

  const previewed = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        previewEra: (index: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.previewEra(10);
  });
  expect(previewed).toBe(10);
  await expect
    .poll(
      async () => (await readPerformanceDiagnostics(page))?.runtime.era,
    )
    .toBe(10);
  expect(await setLens(8)).toBe(8);
  await expect
    .poll(async () => {
      const world = (await readPerformanceDiagnostics(page))?.runtime.world;
      return world
        ? {
            viewScale: world.semanticViewScale,
            foundations: world.foundationLayers,
          }
        : null;
    })
    .toEqual({
      viewScale: 10,
      foundations: [9, 8],
    });

  expect(await setLens(1 / 256)).toBe(1 / 256);
  await expect
    .poll(async () => {
      const world = (await readPerformanceDiagnostics(page))?.runtime.world;
      return world
        ? {
            viewScale: world.semanticViewScale,
            foundations: world.foundationLayers,
          }
        : null;
    })
    .toEqual({
      viewScale: 2,
      foundations: [1, 0],
    });
});

test("Giant Worlds uses an atmospheric orbit instead of a solid surface", async ({
  page,
}) => {
  await enablePerformanceDiagnostics(page, "balanced");
  await begin(page);
  const previewed = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        previewEra: (index: number) => number;
      };
    };
    return debugWindow.__QUARKATAMARI_PERFORMANCE__?.previewEra(26);
  });
  expect(previewed).toBe(26);
  await expect
    .poll(async () => {
      const snapshot = await readPerformanceDiagnostics(page);
      return snapshot?.runtime.era === 26
        ? snapshot.runtime.world
        : null;
    })
    .toMatchObject({
      kind: "giant-atmosphere",
      surface: "atmosphere",
      groundVisible: false,
      atmosphericCloudTop: true,
    });
});

test("a learning scale shift rebuilds once and repopulates through the work queue", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enablePerformanceDiagnostics(page, "balanced");
  await seedAttachedFoam(page);
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
  expect(before?.runtime.mode).toBe("learning");
  const initialAttachmentScale =
    before?.runtime.representations.attachmentScale ?? 0;
  expect(initialAttachmentScale).toBeGreaterThan(0);
  expect(before?.runtime.world).toEqual({
    kind: "void",
    surface: "none",
    semanticViewScale: 0,
    foundationLayers: [],
    groundVisible: false,
    dustVisible: false,
    environmentChildren: 0,
    atmosphericCloudTop: false,
    substrateChildren: 0,
    substrateAuthoredInstances: 0,
    substrateGenericInstances: 0,
  });
  const startPosition = before?.runtime.player ?? { x: 0, z: 0 };
  await page.keyboard.down("w");
  try {
    await expect
      .poll(
        async () => {
          const player = (await readPerformanceDiagnostics(page))?.runtime.player;
          return player
            ? Math.hypot(player.x - startPosition.x, player.z - startPosition.z)
            : 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0.01);
  } finally {
    await page.keyboard.up("w");
  }
  const transitionStart = await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __QUARKATAMARI_PERFORMANCE__?: {
        completeLayer: () => boolean;
        snapshot: () => PerformanceSnapshot;
      };
    };
    const diagnostics = debugWindow.__QUARKATAMARI_PERFORMANCE__;
    return {
      triggered: diagnostics?.completeLayer() ?? false,
      radius: diagnostics?.snapshot().runtime.radius ?? 0,
    };
  });
  expect(transitionStart.triggered).toBe(true);
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
                snapshot.runtime.pickups.current ===
                  snapshot.runtime.pickups.target &&
                snapshot.runtime.pickups.queued === 0 &&
                snapshot.runtime.pickups.retiring === 0,
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
  expect(after?.runtime.pickups.current).toBe(after?.runtime.pickups.target);
  expect(after?.runtime.pickups.resident).toBeGreaterThan(0);
  expect(after?.runtime.pickups.active).toBeGreaterThan(
    after?.runtime.pickups.target ?? 0,
  );
  expect(after?.runtime.pickups.maxSpawnedPerFrame).toBeLessThanOrEqual(
    after?.runtime.pickups.maxPerFrame ?? 0,
  );
  expect(after?.runtime.world.environmentChildren).toBeGreaterThan(0);
  expect(after?.runtime.world.substrateChildren).toBeGreaterThan(0);
  expect(after?.runtime.world.dustVisible).toBe(true);
  expect(after?.runtime.playerScale).toBeCloseTo(1, 5);
  expect(after?.runtime.worldScale).toBeCloseTo(1, 5);
  expect(
    (after?.runtime.representations.attachmentScale ?? 0) /
      initialAttachmentScale,
  ).toBeCloseTo(
    (after?.runtime.radius ?? 0) / transitionStart.radius,
    5,
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

test("a waiting update stays visible outside the menu until activated", async ({
  page,
}) => {
  await enablePerformanceDiagnostics(page);
  await page.goto(appPath);
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
      __QUARKATAMARI_UPDATE_MESSAGES__?: unknown[];
    };
    const fakeWorker = {
      state: "installed",
      addEventListener: () => undefined,
      postMessage: (message: unknown) => {
        updateWindow.__QUARKATAMARI_UPDATE_MESSAGES__ ??= [];
        updateWindow.__QUARKATAMARI_UPDATE_MESSAGES__.push(message);
      },
    } as unknown as ServiceWorker;
    updateWindow.__QUARKATAMARI_UPDATE_DEBUG__?.showUpdateReady(fakeWorker);
  });

  const banner = page.getByRole("status", { name: "Update ready" });
  const updateButton = banner.getByRole("button", { name: "Update now" });
  await expect(banner).toBeVisible();
  await expect(updateButton).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Game menu" })).toBeHidden();
  await page.waitForTimeout(750);
  await expect(banner).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await banner.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);

  await updateButton.click();
  await expect(banner).toContainText("Updating Quantamari");
  await expect(banner.getByRole("button", { name: "Loading…" })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __QUARKATAMARI_UPDATE_MESSAGES__?: unknown[];
            }
          ).__QUARKATAMARI_UPDATE_MESSAGES__,
      ),
    )
    .toEqual([{ type: "ACTIVATE_UPDATE" }]);
});
