import { expect, test } from "@playwright/test";
import { login, logout, prisma, register, uniqueUser, verifyUserByToken } from "./helpers";

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
  await page.getByLabel(/^password/i).fill(user.password);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /create (free )?account|get started|sign up/i }).click();
  await expect(page.getByText(/already registered|already exists|taken/i).first()).toBeVisible({ timeout: 15_000 });
});

test("invalid credentials are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email or username|email/i).first().fill("nobody-here");
  await page.getByLabel(/password/i).fill("wrongpassword");
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
