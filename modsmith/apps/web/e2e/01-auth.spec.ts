import { expect, test } from "@playwright/test";
import { login, logout, prisma, register, resetRateLimits, uniqueUser, verifyUserByToken } from "./helpers";

test.describe.configure({ mode: "serial" });

test("register → verify → logout → login → dashboard", async ({ page }) => {
  const user = uniqueUser();
  await register(page, user);
  await expect(page).toHaveURL(/\/app/);

  // Signup bonus is on the ledger, not a client-side number.
  const row = await prisma.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() }, include: { creditAccount: true } });
  expect(row.creditAccount?.balance).toBe(150);

  await verifyUserByToken(page, user.email);
  const verified = await prisma.user.findFirstOrThrow({ where: { id: row.id }, include: { creditAccount: true } });
  expect(verified.emailVerifiedAt).not.toBeNull();
  expect(verified.creditAccount!.balance).toBe(200); // + verification bonus

  await logout(page);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);

  await login(page, user.username, user.password); // login by username
  await expect(page).toHaveURL(/\/app/);
  await logout(page);
  await login(page, user.email, user.password); // and by email
  await expect(page).toHaveURL(/\/app/);
});

test("duplicate email and username are rejected with field errors", async ({ page }) => {
  const user = uniqueUser();
  await register(page, user);
  await logout(page);
  await page.goto("/register");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/username/i).fill(`${user.username}x`);
  await page.getByRole("textbox", { name: /password/i }).fill(user.password);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /create (free )?account|get started|sign up/i }).click();
  await expect(page.getByText(/already registered|already exists|taken/i).first()).toBeVisible({ timeout: 15_000 });
});

test("invalid credentials are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email or username|email/i).first().fill("nobody-here");
  await page.getByRole("textbox", { name: /password/i }).fill("wrongpassword");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page.getByText(/invalid/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login/);
});

test("forgot password never reveals whether an account exists", async ({ page }) => {
  await page.goto("/forgot");
  await page.getByLabel(/email/i).fill("definitely-not-a-user@modsmith.test");
  await page.getByRole("button", { name: /send|reset/i }).click();
  await expect(page.getByText(/if an account exists/i).first()).toBeVisible({ timeout: 15_000 });
  expect(await prisma.passwordResetToken.count({ where: { user: { emailNormalized: "definitely-not-a-user@modsmith.test" } } })).toBe(0);
});

test("repeated registrations from one address are rate limited", async ({ page }) => {
  // Driven through the API so the assertion is about the limiter, not about form timing.
  await page.goto("/register");
  await resetRateLimits(["register", "api"]);
  const codes: number[] = [];
  for (let i = 0; i < 8; i++) {
    // A successful signup rotates the CSRF cookie, so the header is re-read every attempt —
    // otherwise the double-submit check rejects the call before the limiter ever sees it.
    const csrf = (await page.context().cookies()).find((c) => c.name === "ms_csrf")?.value ?? "";
    const headers = { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) };
    const u = uniqueUser("rl");
    const res = await page.request.post("/api/v1/auth/register", { headers, data: JSON.stringify({ email: u.email, username: u.username, password: u.password, acceptTerms: true }) });
    expect(res.status(), `attempt ${i + 1} was rejected before reaching the limiter`).not.toBe(403);
    codes.push(res.status());
    if (res.status() === 429) {
      const body = await res.json();
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.details?.retryAfterMs, "the client is told how long to wait").toBeGreaterThan(0);
      break;
    }
  }
  expect(codes, `expected a 429 within 8 attempts, got ${codes.join(", ")}`).toContain(429);
  await resetRateLimits(["register", "api"]);
});
