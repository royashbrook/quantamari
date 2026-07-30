import { expect, test } from "@playwright/test";

const appPath = "/";

test("welcome keeps both mode actions inside compact iPhone Air viewports", async ({
  page,
}) => {
  const viewports = [
    {
      name: "Air portrait",
      width: 420,
      height: 719,
      safeTop: 59,
      safeRight: 0,
      safeBottom: 34,
      safeLeft: 0,
    },
    {
      name: "strict portrait",
      width: 420,
      height: 640,
      safeTop: 59,
      safeRight: 0,
      safeBottom: 34,
      safeLeft: 0,
    },
    {
      name: "Air landscape",
      width: 794,
      height: 370,
      safeTop: 0,
      safeRight: 59,
      safeBottom: 21,
      safeLeft: 59,
    },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(appPath);
    await page.evaluate((safeArea) => {
      const root = document.documentElement;
      root.style.setProperty("--safe-top", `${safeArea.safeTop}px`);
      root.style.setProperty("--safe-right", `${safeArea.safeRight}px`);
      root.style.setProperty("--safe-bottom", `${safeArea.safeBottom}px`);
      root.style.setProperty("--safe-left", `${safeArea.safeLeft}px`);
    }, viewport);

    const longGame = page.getByRole("button", { name: "Play Long Game" });
    const learningTour = page.getByRole("button", {
      name: "Play Learning Tour",
    });
    await expect(longGame, viewport.name).toBeVisible();
    await expect(learningTour, viewport.name).toBeVisible();

    const layout = await page.locator(".welcome").evaluate((welcome) => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const welcomeRect = welcome.getBoundingClientRect();
      const buttons = [
        ...welcome.querySelectorAll<HTMLButtonElement>(".mode-play"),
      ].map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      return {
        viewportWidth: window.visualViewport?.width ?? window.innerWidth,
        viewportHeight,
        safeRight: Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--safe-right",
          ),
        ),
        safeLeft: Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--safe-left",
          ),
        ),
        welcomeLeft: welcomeRect.left,
        welcomeRight: welcomeRect.right,
        welcomeTop: welcomeRect.top,
        welcomeBottom: welcomeRect.bottom,
        scrollTop: welcome.scrollTop,
        scrollHeight: welcome.scrollHeight,
        clientHeight: welcome.clientHeight,
        buttons,
      };
    });

    expect(layout.scrollTop, viewport.name).toBe(0);
    expect(layout.scrollHeight, viewport.name).toBeLessThanOrEqual(
      layout.clientHeight + 1,
    );
    expect(layout.welcomeTop, viewport.name).toBeGreaterThanOrEqual(4);
    expect(layout.welcomeBottom, viewport.name).toBeLessThanOrEqual(
      layout.viewportHeight - 4,
    );
    expect(layout.welcomeLeft, viewport.name).toBeGreaterThanOrEqual(
      layout.safeLeft + 4,
    );
    expect(layout.welcomeRight, viewport.name).toBeLessThanOrEqual(
      layout.viewportWidth - layout.safeRight - 4,
    );
    for (const button of layout.buttons) {
      expect(button.top, viewport.name).toBeGreaterThanOrEqual(4);
      expect(button.bottom, viewport.name).toBeLessThanOrEqual(
        layout.viewportHeight - 8,
      );
    }
  }
});
