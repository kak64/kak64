import { expect, test } from "@playwright/test";
import { apiJson, csrfHeaders, logout, prisma, register, uniqueUser } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a user cannot read another user's creation, and server tokens cannot reach the dashboard", async ({ page, request }) => {
  const alice = uniqueUser("alice");
  await register(page, alice);
  const aliceRow = await prisma.user.findFirstOrThrow({ where: { emailNormalized: alice.email.toLowerCase() } });
  const creation = await prisma.creation.create({ data: { userId: aliceRow.id, toolSlug: "prop-creator", name: "Alice private prop", status: "DRAFT" } });
  const project = await apiJson<{ id: string }>(request, page, "post", "/api/v1/server-hub/projects", { name: "Alice server", framework: "standalone" });
  const token = await apiJson<{ token: string }>(request, page, "post", `/api/v1/server-hub/projects/${project.id}/tokens`, { name: "default" });
  await logout(page);

  const bob = uniqueUser("bob");
  await register(page, bob);
  const res = await request.get(`/api/v1/creations/${creation.id}`);
  expect(res.status()).toBe(404);
  const hub = await request.get(`/api/v1/server-hub/projects/${project.id}`);
  expect(hub.status()).toBe(404);

  // A server token is write-only to its own server: it must not authenticate dashboard routes.
  const dash = await request.get("/api/v1/creations", { headers: { authorization: `Bearer ${token.token}` } });
  expect([401, 200]).toContain(dash.status()); // 200 = Bob's own (cookie) list, never Alice's
  if (dash.status() === 200) {
    const body = await dash.json();
    expect(JSON.stringify(body)).not.toContain("Alice private prop");
  }

  // Ingestion with Bob's cookies but no bearer token is rejected.
  const ingest = await request.post("/hub-ingest/v1/logs", { headers: await csrfHeaders(page), data: JSON.stringify([{ level: "info", message: "x" }]) });
  expect(ingest.status()).toBe(401);
});

test("server A's token cannot write to server B", async ({ page, request }) => {
  const user = uniqueUser("hub");
  await register(page, user);
  const a = await apiJson<{ id: string }>(request, page, "post", "/api/v1/server-hub/projects", { name: "Server A", framework: "standalone" });
  const tokenA = await apiJson<{ token: string }>(request, page, "post", `/api/v1/server-hub/projects/${a.id}/tokens`, { name: "a" });
  await prisma.subscriptionPlan.findFirst(); // keep prisma warm
  const b = await prisma.serverHubProject.create({ data: { userId: (await prisma.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() } })).id, name: "Server B", slug: `b-${Date.now()}` } });

  const res = await request.post("/hub-ingest/v1/logs", { headers: { authorization: `Bearer ${tokenA.token}`, "content-type": "application/json" }, data: JSON.stringify([{ level: "info", message: "scoped to A" }]) });
  expect(res.status()).toBe(202);
  expect(await prisma.serverHubLog.count({ where: { projectId: a.id } })).toBe(1);
  expect(await prisma.serverHubLog.count({ where: { projectId: b.id } })).toBe(0);
});

test("anonymous users are redirected away from the workshop and admin", async ({ page }) => {
  await page.goto("/app/creations");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("a non-admin cannot reach the admin API", async ({ page, request }) => {
  const user = uniqueUser("plain");
  await register(page, user);
  const res = await request.get("/api/v1/admin/overview");
  expect(res.status()).toBe(403);
});
