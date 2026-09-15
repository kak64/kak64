import { expect, test } from "@playwright/test";
import { apiJson, csrfHeaders, prisma, register, uniqueUser, verifyUserByToken } from "./helpers";

test.describe.configure({ mode: "serial" });

// A placeholder key from .env.example would reach Stripe and be rejected; require a real test key.
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const stripeConfigured = stripeKey.startsWith("sk_test_") && stripeKey.length > 24 && !/x{3,}/i.test(stripeKey);

test("credit purchase via Stripe test mode reaches checkout", async ({ page }) => {
  const request = page.request;
  test.skip(!stripeConfigured, "set a Stripe test key (sk_test_…) to run the checkout test");
  const user = uniqueUser("buy");
  await register(page, user);
  const packs = await apiJson<{ packs: { id: string; slug: string; isCustom: boolean }[] }>(request, page, "get", "/api/v1/credits/packs");
  const pack = packs.packs.find((p) => !p.isCustom)!;
  const checkout = await apiJson<{ url: string; purchaseId: string }>(request, page, "post", "/api/v1/billing/checkout/pack", { packId: pack.id });
  expect(checkout.url).toContain("checkout.stripe.com");
  const purchase = await prisma.creditPurchase.findUniqueOrThrow({ where: { id: checkout.purchaseId } });
  expect(purchase.status).toBe("PENDING"); // credits only arrive via the verified webhook
});

test("a misconfigured payment provider fails loudly as a payment error, never as a 500", async ({ page }) => {
  test.skip(stripeConfigured, "runs only when Stripe is not configured with a working key");
  const user = uniqueUser("nobill");
  await register(page, user);
  await page.goto("/app/billing");
  await expect(page.getByRole("heading", { name: /billing/i }).first()).toBeVisible({ timeout: 20_000 });

  const packs = await page.request.get("/api/v1/credits/packs").then((r) => r.json());
  const pack = packs.data.packs.find((p: { isCustom: boolean }) => !p.isCustom);
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "ms_csrf")?.value ?? "";
  const res = await page.request.post("/api/v1/billing/checkout/pack", { headers: { "x-csrf-token": csrf, "content-type": "application/json" }, data: JSON.stringify({ packId: pack.id }) });
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(["PAYMENT_ERROR", "VALIDATION_ERROR"], `got ${res.status()} ${body.error?.code}`).toContain(body.error.code);
  expect(res.status(), "a provider problem must not surface as an internal error").not.toBe(500);
  // No credits were granted and the purchase is not left looking paid.
  const purchases = await page.request.get("/api/v1/billing").then((r) => r.json());
  expect(purchases.data.purchases.every((p: { status: string }) => p.status !== "PAID")).toBeTruthy();
});

test("reviews require a completed export and land in moderation", async ({ page }) => {
  const request = page.request;
  const user = uniqueUser("rev");
  await register(page, user);
  await verifyUserByToken(page, user.email);

  const gated = await request.post("/api/v1/reviews", { headers: await csrfHeaders(page), data: JSON.stringify({ rating: 5, text: "Great tool, shipped my first prop in minutes." }) });
  expect(gated.status()).toBe(403);

  // Give the account a completed export, then the review is accepted as PENDING.
  const u = await prisma.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() } });
  await prisma.processingJob.create({ data: { userId: u.id, toolSlug: "prop-creator", processor: "prop", status: "COMPLETED", input: {}, config: {} } });
  const review = await apiJson<{ id: string; status: string }>(request, page, "post", "/api/v1/reviews", { rating: 5, text: "Great tool, shipped my first prop in minutes." });
  expect(review.status).toBe("PENDING");

  // Pending reviews are not visible publicly.
  const publicList = await apiJson<{ reviews: { id: string }[] }>(request, page, "get", "/api/v1/reviews");
  expect(publicList.reviews.find((r) => r.id === review.id)).toBeUndefined();
});

test("showcase publishing is explicit and private creations stay private", async ({ page, browser }) => {
  const request = page.request;
  const user = uniqueUser("show");
  await register(page, user);
  await verifyUserByToken(page, user.email);
  const u = await prisma.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() } });

  // A unique title keeps the generated showcase slug unique across runs against the same database.
  const title = `Secret prop ${Date.now().toString(36)}`;
  const creation = await prisma.creation.create({ data: { userId: u.id, toolSlug: "prop-creator", name: title, status: "DRAFT" } });
  const tooEarly = await request.post(`/api/v1/creations/${creation.id}/publish`, { headers: await csrfHeaders(page), data: JSON.stringify({ title, category: "props" }) });
  expect(tooEarly.status()).toBe(409); // only completed creations can be published

  const job = await prisma.processingJob.create({ data: { userId: u.id, toolSlug: "prop-creator", processor: "prop", status: "COMPLETED", input: {}, config: {} } });
  const version = await prisma.creationVersion.create({ data: { creationId: creation.id, version: 1, jobId: job.id, resourceKey: `results/${u.id}/${job.id}/x.zip`, resourceName: "x.zip", sizeBytes: BigInt(10), creditCost: 40 } });
  await prisma.creation.update({ where: { id: creation.id }, data: { status: "READY", currentVersionId: version.id, exportVersion: 1 } });

  const publicBefore = await apiJson<{ items: { title: string }[] }>(request, page, "get", "/api/v1/showcase");
  expect(publicBefore.items.find((i) => i.title === title)).toBeUndefined();

  const published = await apiJson<{ slug: string }>(request, page, "post", `/api/v1/creations/${creation.id}/publish`, { title, description: "now public", category: "props", tags: ["e2e"], allowDownload: false, allowRemix: false });
  await page.goto(`/showcase/${published.slug}`);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });

  // The creator can always fetch their own resource...
  expect((await request.get(`/api/v1/showcase/${published.slug}/download`)).status()).toBe(200);

  // ...but another signed-in viewer cannot, because downloads were not enabled.
  const otherCtx = await browser.newContext();
  const otherPage = await otherCtx.newPage();
  await register(otherPage, uniqueUser("viewer"));
  const denied = await otherPage.request.get(`/api/v1/showcase/${published.slug}/download`);
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe("FORBIDDEN");
  await otherCtx.close();

  await apiJson(request, page, "post", `/api/v1/creations/${creation.id}/unpublish`);
  const gone = await request.get(`/api/v1/showcase/${published.slug}`);
  expect(gone.status()).toBe(404);
});

test("referral rewards only pay out after the referred user's first successful build", async ({ page, browser }) => {
  const request = page.request;
  const owner = uniqueUser("ref");
  await register(page, owner);
  const referral = await apiJson<{ code: string; url: string; signups: number; qualified: number }>(request, page, "get", "/api/v1/referrals");
  expect(referral.url).toContain(`ref=${referral.code}`);

  const ctx = await browser.newContext();
  const invitee = uniqueUser("inv");
  const page2 = await ctx.newPage();
  await register(page2, invitee, { ref: referral.code });

  const afterSignup = await apiJson<{ signups: number; qualified: number; creditsEarned: number }>(request, page, "get", "/api/v1/referrals");
  expect(afterSignup.signups).toBe(1);
  expect(afterSignup.qualified).toBe(0);
  expect(afterSignup.creditsEarned).toBe(0); // no reward yet

  const conversion = await prisma.referralConversion.findFirstOrThrow({ where: { referredUser: { emailNormalized: invitee.email.toLowerCase() } } });
  expect(conversion.status).toBe("SIGNED_UP");
  await ctx.close();
});
