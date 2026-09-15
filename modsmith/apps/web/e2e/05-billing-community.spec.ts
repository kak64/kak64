import { expect, test } from "@playwright/test";
import { apiJson, csrfHeaders, prisma, register, uniqueUser, verifyUserByToken } from "./helpers";

test.describe.configure({ mode: "serial" });

const stripeConfigured = !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

test("credit purchase via Stripe test mode reaches checkout", async ({ page, request }) => {
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

test("billing page reports an unconfigured payment provider instead of failing silently", async ({ page }) => {
  test.skip(stripeConfigured, "runs only when Stripe is not configured");
  const user = uniqueUser("nobill");
  await register(page, user);
  await page.goto("/app/billing");
  await expect(page.getByText(/payments? (are|is) not configured|not configured/i).first()).toBeVisible({ timeout: 20_000 });
});

test("reviews require a completed export and land in moderation", async ({ page, request }) => {
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

test("showcase publishing is explicit and private creations stay private", async ({ page, request }) => {
  const user = uniqueUser("show");
  await register(page, user);
  await verifyUserByToken(page, user.email);
  const u = await prisma.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() } });

  const creation = await prisma.creation.create({ data: { userId: u.id, toolSlug: "prop-creator", name: "Secret prop", status: "DRAFT" } });
  const tooEarly = await request.post(`/api/v1/creations/${creation.id}/publish`, { headers: await csrfHeaders(page), data: JSON.stringify({ title: "Secret prop", category: "props" }) });
  expect(tooEarly.status()).toBe(409); // only completed creations can be published

  const job = await prisma.processingJob.create({ data: { userId: u.id, toolSlug: "prop-creator", processor: "prop", status: "COMPLETED", input: {}, config: {} } });
  const version = await prisma.creationVersion.create({ data: { creationId: creation.id, version: 1, jobId: job.id, resourceKey: `results/${u.id}/${job.id}/x.zip`, resourceName: "x.zip", sizeBytes: BigInt(10), creditCost: 40 } });
  await prisma.creation.update({ where: { id: creation.id }, data: { status: "READY", currentVersionId: version.id, exportVersion: 1 } });

  const publicBefore = await apiJson<{ items: { title: string }[] }>(request, page, "get", "/api/v1/showcase");
  expect(publicBefore.items.find((i) => i.title === "Secret prop")).toBeUndefined();

  const published = await apiJson<{ slug: string }>(request, page, "post", `/api/v1/creations/${creation.id}/publish`, { title: "Secret prop", description: "now public", category: "props", tags: ["e2e"], allowDownload: false, allowRemix: false });
  await page.goto(`/showcase/${published.slug}`);
  await expect(page.getByText("Secret prop").first()).toBeVisible({ timeout: 20_000 });

  // Download stays blocked because the creator did not enable it.
  const dl = await request.get(`/api/v1/showcase/${published.slug}/download`);
  expect(dl.status()).toBe(403);

  await apiJson(request, page, "post", `/api/v1/creations/${creation.id}/unpublish`);
  const gone = await request.get(`/api/v1/showcase/${published.slug}`);
  expect(gone.status()).toBe(404);
});

test("referral rewards only pay out after the referred user's first successful build", async ({ page, request, browser }) => {
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
