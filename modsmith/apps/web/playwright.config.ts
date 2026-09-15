import { existsSync, readdirSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Some environments ship a preinstalled Chromium whose build number does not match this Playwright
 * release. Point at it explicitly when it exists so the suite runs without downloading a browser;
 * PLAYWRIGHT_CHROMIUM_PATH overrides, and otherwise Playwright resolves its own download as usual.
 */
function preinstalledChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const roots = ["/opt/pw-browsers", process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean) as string[];
  for (const root of roots) {
    for (const candidate of [`${root}/chromium/chrome-linux/chrome`, `${root}/chromium/chrome`]) {
      if (existsSync(candidate)) return candidate;
    }
    try {
      const dir = readdirSync(root).find((d) => d.startsWith("chromium-"));
      if (dir && existsSync(`${root}/${dir}/chrome-linux/chrome`)) return `${root}/${dir}/chrome-linux/chrome`;
    } catch { /* root missing */ }
  }
  return undefined;
}

const chromiumPath = preinstalledChromium();

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  webServer: process.env.E2E_NO_SERVER ? undefined : {
    command: "pnpm exec next dev -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
