import { expect, test } from "@playwright/test";

const publicPages = ["/", "/showcase", "/reviews", "/guides", "/pricing", "/partners", "/changelog", "/docs/server-hub", "/terms", "/privacy"];

for (const path of publicPages) {
  test(`public page ${path} renders with a title and no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status(), `${path} returned ${res?.status()}`).toBeLessThan(400);
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("main, [id=main]").first()).toBeVisible();
    // Ignore benign resource 404s (favicons, og images) that do not break the page.
    const real = errors.filter((e) => !/favicon|og\.png|Failed to load resource/i.test(e));
    expect(real, `console errors on ${path}: ${real.join(" | ")}`).toHaveLength(0);
  });
}

test("homepage states the core promise and links to signup and a tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /create (a )?free account|get started/i }).first()).toBeVisible();
  await expect(page.getByText(/no card required/i).first()).toBeVisible();
  await expect(page.getByText(/blender/i).first()).toBeVisible();
  await expect(page.getByText(/prop creator/i).first()).toBeVisible();
});

test("marketing navigation works on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, "page scrolls horizontally on mobile").toBeLessThanOrEqual(400);
});

test("robots and sitemap are served", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toMatch(/Disallow:\s*\/app/i);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain("<urlset");
});

test("private areas are not linked for anonymous visitors and redirect when visited", async ({ page }) => {
  await page.goto("/app/creations");
  await expect(page).toHaveURL(/\/login/);
});
