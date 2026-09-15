import { expect, test } from "@playwright/test";
import { apiJson, prisma, register, uniqueUser } from "./helpers";

test.describe.configure({ mode: "serial" });

const PNG = (() => { const b = Buffer.alloc(128); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(32, 16); b.writeUInt32BE(24, 20); return b; })();

test("create a server, ingest logs with the token, then search them", async ({ page, request }) => {
  const user = uniqueUser("hub");
  await register(page, user);

  const project = await apiJson<{ id: string; name: string }>(request, page, "post", "/api/v1/server-hub/projects", { name: "E2E Roleplay", description: "e2e", framework: "qbcore" });
  const token = await apiJson<{ token: string; prefix: string }>(request, page, "post", `/api/v1/server-hub/projects/${project.id}/tokens`, { name: "main" });
  expect(token.token.startsWith("msh_")).toBeTruthy();

  // The raw token is never stored.
  const stored = await prisma.serverHubToken.findFirstOrThrow({ where: { projectId: project.id } });
  expect(stored.tokenHash).not.toBe(token.token);
  expect(stored.tokenHash).not.toContain(token.token.slice(4));

  const ingest = await request.post("/hub-ingest/v1/logs", {
    headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", "x-request-id": `e2e-${Date.now()}` },
    data: JSON.stringify([
      { level: "info", message: "Item moved", resource: "inventory", dataset: "inventory", metadata: { item: "lockpick", count: 2 }, player: { source: 7, license: "license:e2e", name: "Tester" } },
      { level: "error", message: "Database write failed", resource: "core", dataset: "server", metadata: { ip: "10.0.0.1", code: "ETIMEDOUT" } },
    ]),
  });
  expect(ingest.status()).toBe(202);
  expect((await ingest.json()).data.accepted).toBe(2);

  // IP-like metadata is never stored.
  const errorLog = await prisma.serverHubLog.findFirstOrThrow({ where: { projectId: project.id, level: "ERROR" } });
  expect((errorLog.metadata as Record<string, unknown>).ip).toBeUndefined();
  expect((errorLog.metadata as Record<string, unknown>).code).toBe("ETIMEDOUT");

  // Search by free text across message and serialized metadata.
  const byText = await apiJson<{ logs: { message: string }[] }>(request, page, "get", `/api/v1/server-hub/logs?projectId=${project.id}&q=lockpick`);
  expect(byText.logs).toHaveLength(1);
  expect(byText.logs[0].message).toBe("Item moved");

  const byLevel = await apiJson<{ logs: unknown[] }>(request, page, "get", `/api/v1/server-hub/logs?projectId=${project.id}&level=error`);
  expect(byLevel.logs).toHaveLength(1);

  const byPlayer = await apiJson<{ logs: unknown[] }>(request, page, "get", `/api/v1/server-hub/logs?projectId=${project.id}&player=license:e2e`);
  expect(byPlayer.logs).toHaveLength(1);

  const byDataset = await apiJson<{ logs: unknown[] }>(request, page, "get", `/api/v1/server-hub/logs?projectId=${project.id}&dataset=inventory`);
  expect(byDataset.logs).toHaveLength(1);

  // Revoking the token stops ingestion immediately.
  await apiJson(request, page, "delete", `/api/v1/server-hub/projects/${project.id}/tokens/${stored.id}`);
  const afterRevoke = await request.post("/hub-ingest/v1/logs", { headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" }, data: JSON.stringify([{ level: "info", message: "should fail" }]) });
  expect(afterRevoke.status()).toBe(401);
});

test("ingestion rejects oversized batches and malformed events", async ({ page, request }) => {
  const user = uniqueUser("hublim");
  await register(page, user);
  const project = await apiJson<{ id: string }>(request, page, "post", "/api/v1/server-hub/projects", { name: "Limits", framework: "standalone" });
  const token = await apiJson<{ token: string }>(request, page, "post", `/api/v1/server-hub/projects/${project.id}/tokens`, { name: "t" });
  const headers = { authorization: `Bearer ${token.token}`, "content-type": "application/json" };

  const tooMany = await request.post("/hub-ingest/v1/logs", { headers, data: JSON.stringify(Array.from({ length: 101 }, () => ({ level: "info", message: "x" }))) });
  expect(tooMany.status()).toBe(400);

  const badDataset = await request.post("/hub-ingest/v1/logs", { headers, data: JSON.stringify([{ level: "info", message: "x", dataset: "not a valid dataset name!" }]) });
  expect(badDataset.status()).toBe(400);

  const badLevel = await request.post("/hub-ingest/v1/logs", { headers, data: JSON.stringify([{ level: "catastrophe", message: "x" }]) });
  expect(badLevel.status()).toBe(400);
});

test("phone media reservations are one-time, validated and privately served", async ({ page, request }) => {
  const user = uniqueUser("media");
  await register(page, user);
  const project = await apiJson<{ id: string }>(request, page, "post", "/api/v1/server-hub/projects", { name: "Media", framework: "standalone" });
  const token = await apiJson<{ token: string }>(request, page, "post", `/api/v1/server-hub/projects/${project.id}/tokens`, { name: "t" });
  const headers = { authorization: `Bearer ${token.token}`, "content-type": "application/json" };

  const reservation = await request.post("/hub-ingest/v1/media/reservations", { headers, data: JSON.stringify({ kind: "phone_photo", mime: "image/png", metadata: { player: { source: 3, name: "Snapper" }, reason: "camera" } }) });
  expect(reservation.status()).toBe(201);
  const { uploadUrl } = (await reservation.json()).data;

  // A non-image payload is refused.
  const bad = await request.fetch(uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, data: Buffer.from("this is not a png") });
  expect(bad.status()).toBe(415);

  const fresh = await request.post("/hub-ingest/v1/media/reservations", { headers, data: JSON.stringify({ kind: "phone_photo", mime: "image/png" }) });
  const url2 = (await fresh.json()).data.uploadUrl as string;
  const ok = await request.fetch(url2, { method: "PUT", headers: { "content-type": "image/png" }, data: PNG });
  expect(ok.status()).toBe(201);
  const { mediaId } = (await ok.json()).data;

  // The same reservation cannot be reused.
  const replay = await request.fetch(url2, { method: "PUT", headers: { "content-type": "image/png" }, data: PNG });
  expect(replay.status()).toBe(409);

  // The owner gets a short-lived private link; the raw object is not public.
  const media = await apiJson<{ url: string; expiresIn: number }>(request, page, "get", `/api/v1/server-hub/media/${mediaId}`);
  expect(media.expiresIn).toBeLessThanOrEqual(3600);
  const fetched = await request.get(media.url);
  expect(fetched.ok()).toBeTruthy();

  const row = await prisma.serverHubMedia.findUniqueOrThrow({ where: { id: mediaId } });
  expect(row.width).toBe(32);
  expect(row.height).toBe(24);
});
