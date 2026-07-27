import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:4174/quarkatamari/";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/results/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: appUrl,
    serviceWorkers: "allow",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174",
    url: appUrl,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      testMatch: ["**/game.spec.ts", "**/recovery.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader"],
        },
      },
    },
    {
      name: "webkit",
      testMatch: "**/recovery.spec.ts",
      use: devices["Desktop Safari"],
    },
    {
      name: "iphone",
      testMatch: "**/recovery.spec.ts",
      use: devices["iPhone 13"],
    },
  ],
});
