import { expect, test, type Locator } from "@playwright/test";

const appPath = "/";

async function playLearningTour(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Play Learning Tour" }).click();
  await expect(page.locator("canvas.three-canvas")).toBeVisible({
    timeout: 30_000,
  });
}

async function waitForInstallLifecycle(page: import("@playwright/test").Page) {
  await expect(page.locator("html")).toHaveAttribute(
    "data-quantamari-install-ready",
    "true",
  );
}

async function expectCoachFitsViewport(coach: Locator) {
  const geometry = await coach.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const buttons = [...element.querySelectorAll("button")].map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return { width: buttonRect.width, height: buttonRect.height };
    });
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: viewport?.width ?? window.innerWidth,
      viewportHeight: viewport?.height ?? window.innerHeight,
      buttons,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  for (const button of geometry.buttons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
}

test("iPhone gives first-time install steps without crowding the launcher", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-air");
  await page.setViewportSize({ width: 420, height: 719 });
  await page.goto(appPath);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
  });

  await expect(page.getByTestId("install-coach")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play Long Game" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play Learning Tour" }),
  ).toBeVisible();

  await playLearningTour(page);
  const coach = page.getByTestId("install-coach");
  await expect(coach).toBeVisible({ timeout: 4_000 });
  await expect(coach).toContainText("Install Quantamari");
  await expect(coach).toContainText("Add to Home Screen");
  await expect(coach).toContainText("Open as Web App");
  await expect(page.locator(".journey-dock")).toBeHidden();
  await expect(page.getByTestId("install-announcement")).toContainText(
    "Install Quantamari",
  );

  await expectCoachFitsViewport(coach);

  await page.setViewportSize({ width: 794, height: 370 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "0px");
    document.documentElement.style.setProperty("--safe-right", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "21px");
    document.documentElement.style.setProperty("--safe-left", "59px");
  });
  await expectCoachFitsViewport(coach);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-right", "0px");
    document.documentElement.style.setProperty("--safe-bottom", "0px");
    document.documentElement.style.setProperty("--safe-left", "0px");
  });
  await expectCoachFitsViewport(coach);

  await page.setViewportSize({ width: 420, height: 719 });

  await coach
    .getByRole("button", {
      name: "Got it, dismiss installation instructions",
    })
    .click();
  await expect(coach).toHaveCount(0);
  await page.reload();
  await playLearningTour(page);
  await page.waitForTimeout(1_200);
  await expect(coach).toHaveCount(0);

  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Install Quantamari" }).click();
  await expect(coach).toBeVisible();
});

test("iPhone launcher menu opens install steps before play", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-air");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(appPath);
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Install Quantamari" }).click();

  const coach = page.getByTestId("install-coach");
  await expect(coach).toBeVisible();
  await expect(coach).toContainText("Add to Home Screen");
  await expect
    .poll(() =>
      coach.evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe("none");
  await expect(
    page.getByRole("button", { name: "Play Long Game" }),
  ).toBeVisible();
});

test("installed iPhone PWA suppresses the coach and its menu action", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-air");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
  });
  await page.goto(appPath);
  await playLearningTour(page);
  await page.waitForTimeout(1_200);
  await expect(page.getByTestId("install-coach")).toHaveCount(0);

  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Install Quantamari" }),
  ).toHaveCount(0);
});

test("desktop-UA iPad receives the Apple Home Screen instructions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 1_024, height: 768 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
  });
  await page.goto(appPath);
  await playLearningTour(page);

  const coach = page.getByTestId("install-coach");
  await expect(coach).toBeVisible({ timeout: 4_000 });
  await expect(coach).toContainText("Add to Home Screen");
  await expect(
    coach.getByRole("button", {
      name: "Got it, dismiss installation instructions",
    }),
  ).toBeVisible();
  await expect(page.locator(".controls")).toBeHidden();
  const bounds = await coach.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1_024);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);

  await page.setViewportSize({ width: 1_366, height: 1_024 });
  await expectCoachFitsViewport(coach);
  await page.setViewportSize({ width: 640, height: 768 });
  await expectCoachFitsViewport(coach);
});

test("Android without a native prompt receives browser-menu instructions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 420, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
    });
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Linux armv8l",
    });
  });
  await page.goto(appPath);
  await playLearningTour(page);

  const coach = page.getByTestId("install-coach");
  await expect(coach).toBeVisible({ timeout: 4_000 });
  await expect(coach).toContainText(
    "Browser menu → Install app or Add to Home Screen.",
  );
  await expect(
    coach.getByRole("button", {
      name: "Got it, dismiss installation instructions",
    }),
  ).toBeVisible();
});

test("update-ready notice takes priority over first-visit coaching", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-air");
  await page.addInitScript(() => {
    (
      window as typeof window & {
        __QUARKATAMARI_PERFORMANCE_REQUESTED__?: boolean;
      }
    ).__QUARKATAMARI_PERFORMANCE_REQUESTED__ = true;
  });
  await page.goto(appPath);
  await playLearningTour(page);
  await expect(page.getByTestId("install-coach")).toBeVisible({
    timeout: 4_000,
  });
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

  await expect(page.getByRole("status", { name: "Update ready" })).toBeVisible();
  await expect(page.getByTestId("install-coach")).toHaveCount(0);
});

test("Android uses the retained native install prompt exactly once", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 420, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
    });
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Linux armv8l",
    });
  });
  await page.goto(appPath);
  await waitForInstallLifecycle(page);
  await page.evaluate(() => {
    Object.assign(window, { __QUANTAMARI_INSTALL_PROMPTS__: 0 });
    const installEvent = new Event("beforeinstallprompt", {
      cancelable: true,
    });
    Object.defineProperties(installEvent, {
      prompt: {
        value: () => {
          const installWindow = window as typeof window & {
            __QUANTAMARI_INSTALL_PROMPTS__?: number;
          };
          installWindow.__QUANTAMARI_INSTALL_PROMPTS__ =
            (installWindow.__QUANTAMARI_INSTALL_PROMPTS__ ?? 0) + 1;
          return Promise.resolve();
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" }),
      },
    });
    window.dispatchEvent(installEvent);
  });

  await playLearningTour(page);
  const coach = page.getByTestId("install-coach");
  await expect(coach).toBeVisible({ timeout: 4_000 });
  await expect(coach).toContainText("Full-screen, offline");
  await coach.getByRole("button", { name: "Install Quantamari" }).click();
  await expect(coach).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & {
            __QUANTAMARI_INSTALL_PROMPTS__?: number;
          }).__QUANTAMARI_INSTALL_PROMPTS__ ?? 0,
      ),
    )
    .toBe(1);
});

test("appinstalled immediately retires an available native coach", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 420, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    });
  });
  await page.goto(appPath);
  await waitForInstallLifecycle(page);
  await page.evaluate(() => {
    const installEvent = new Event("beforeinstallprompt", {
      cancelable: true,
    });
    Object.defineProperties(installEvent, {
      prompt: { value: () => Promise.resolve() },
      userChoice: {
        value: new Promise(() => {}),
      },
    });
    window.dispatchEvent(installEvent);
  });
  await playLearningTour(page);
  await expect(page.getByTestId("install-coach")).toBeVisible({
    timeout: 4_000,
  });

  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByTestId("install-coach")).toHaveCount(0);
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Install Quantamari" }),
  ).toHaveCount(0);
});

test("a dismissed native prompt retires its one-shot menu action", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 420, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
    });
  });
  await page.goto(appPath);
  await waitForInstallLifecycle(page);
  await page.evaluate(() => {
    const installEvent = new Event("beforeinstallprompt", {
      cancelable: true,
    });
    Object.defineProperties(installEvent, {
      prompt: { value: () => Promise.resolve() },
      userChoice: {
        value: Promise.resolve({ outcome: "dismissed", platform: "web" }),
      },
    });
    window.dispatchEvent(installEvent);
  });
  await playLearningTour(page);
  await page
    .getByTestId("install-coach")
    .getByRole("button", { name: "Install Quantamari" })
    .click();

  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Install Quantamari" }),
  ).toHaveCount(0);
});

test("a failed native prompt points to the browser menu and removes dead retry", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 420, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
    });
  });
  await page.goto(appPath);
  await waitForInstallLifecycle(page);
  await page.evaluate(() => {
    const installEvent = new Event("beforeinstallprompt", {
      cancelable: true,
    });
    Object.defineProperties(installEvent, {
      prompt: { value: () => Promise.reject(new Error("prompt unavailable")) },
      userChoice: {
        value: Promise.resolve({ outcome: "dismissed", platform: "web" }),
      },
    });
    window.dispatchEvent(installEvent);
  });
  await playLearningTour(page);
  await page
    .getByTestId("install-coach")
    .getByRole("button", { name: "Install Quantamari" })
    .click();

  await expect(page.locator(".toast")).toContainText("browser menu instead");
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Install Quantamari" }),
  ).toHaveCount(0);
});
