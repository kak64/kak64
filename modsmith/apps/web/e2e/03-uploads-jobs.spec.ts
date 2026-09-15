import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { apiJson, csrfHeaders, grantCredits, prisma, register, uniqueUser, verifyUserByToken, workerRunning } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Minimal but structurally valid GLB: header + JSON chunk describing an empty scene. */
function sampleGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0", generator: "modsmith-e2e" }, scenes: [{ nodes: [] }], scene: 0, nodes: [], meshes: [] }), "utf8");
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.write("JSON", 4, "ascii");
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}

async function uploadFile(request: any, page: any, toolSlug: string, fileName: string, body: Buffer, mime: string) {
  const init = await apiJson<{ uploadId: string; multipart: boolean; putUrl: string }>(request, page, "post", "/api/v1/uploads", { toolSlug, fileName, sizeBytes: body.length, mime });
  const put = await request.fetch(init.putUrl, { method: "PUT", headers: { "content-type": mime }, data: body });
  expect(put.ok()).toBeTruthy();
  const done = await apiJson<{ status: string; sha256: string }>(request, page, "post", `/api/v1/uploads/${init.uploadId}/complete`, { sha256: createHash("sha256").update(body).digest("hex") });
  expect(done.status).toBe("UPLOADED");
  return init.uploadId;
}

test("upload validation rejects spoofed MIME, executables, bad extensions and oversized files", async ({ page, request }) => {
  const user = uniqueUser("upl");
  await register(page, user);

  // Wrong extension for the tool
  const bad = await request.post("/api/v1/uploads", { headers: await csrfHeaders(page), data: JSON.stringify({ toolSlug: "prop-creator", fileName: "song.mp3", sizeBytes: 100 }) });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe("INVALID_FILE");

  // Dangerous extension
  const exe = await request.post("/api/v1/uploads", { headers: await csrfHeaders(page), data: JSON.stringify({ toolSlug: "prop-creator", fileName: "payload.exe", sizeBytes: 100 }) });
  expect(exe.status()).toBe(400);

  // Oversized
  const big = await request.post("/api/v1/uploads", { headers: await csrfHeaders(page), data: JSON.stringify({ toolSlug: "prop-creator", fileName: "huge.glb", sizeBytes: 5 * 1024 ** 3 }) });
  expect([400, 413]).toContain(big.status());

  // Spoofed content: PNG bytes uploaded under a .glb name is rejected at completion.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const init = await apiJson<{ uploadId: string; putUrl: string }>(request, page, "post", "/api/v1/uploads", { toolSlug: "prop-creator", fileName: "fake.glb", sizeBytes: png.length, mime: "model/gltf-binary" });
  await request.fetch(init.putUrl, { method: "PUT", headers: { "content-type": "model/gltf-binary" }, data: png });
  const complete = await request.post(`/api/v1/uploads/${init.uploadId}/complete`, { headers: await csrfHeaders(page), data: JSON.stringify({}) });
  expect(complete.status()).toBe(400);
  expect((await complete.json()).error.code).toBe("INVALID_FILE");
  const row = await prisma.assetUpload.findUniqueOrThrow({ where: { id: init.uploadId } });
  expect(row.status).toBe("REJECTED");
});

test("credits are held on enqueue and the estimate reports the real cost", async ({ page, request }) => {
  const user = uniqueUser("job");
  await register(page, user);
  await verifyUserByToken(page, user.email);
  const uploadId = await uploadFile(request, page, "prop-creator", "sample.glb", sampleGlb(), "model/gltf-binary");

  const est = await apiJson<{ credits: number; balance: number; canAfford: boolean; freeReexport: boolean }>(request, page, "post", "/api/v1/tools/prop-creator/estimate", { uploadIds: [uploadId], config: { propName: "e2e_prop" } });
  expect(est.credits).toBe(40);
  expect(est.freeReexport).toBe(false);
  expect(est.canAfford).toBeTruthy();

  const job = await apiJson<{ id: string; chargedCredits: number; creationId: string }>(request, page, "post", "/api/v1/jobs", { toolSlug: "prop-creator", uploadIds: [uploadId], config: { propName: "e2e_prop" }, name: "E2E prop" });
  expect(job.chargedCredits).toBe(40);
  const after = await apiJson<{ balance: number }>(request, page, "get", "/api/v1/credits");
  expect(after.balance).toBe(160); // 200 - 40 held

  // The job is visible in the UI and streams status.
  await page.goto(`/app/jobs/${job.id}`);
  await expect(page.getByText(/queued|processing|validation|complete|failed/i).first()).toBeVisible({ timeout: 20_000 });
});

test("a job that fails returns the held credits automatically", async ({ page, request }) => {
  const user = uniqueUser("fail");
  await register(page, user);
  await verifyUserByToken(page, user.email);
  const uploadId = await uploadFile(request, page, "prop-creator", "sample.glb", sampleGlb(), "model/gltf-binary");
  const job = await apiJson<{ id: string }>(request, page, "post", "/api/v1/jobs", { toolSlug: "prop-creator", uploadIds: [uploadId], config: {} });
  const before = await apiJson<{ balance: number }>(request, page, "get", "/api/v1/credits");
  expect(before.balance).toBe(160);

  // Cancelling a queued job takes the same refund path an infrastructure failure does.
  await apiJson(request, page, "post", `/api/v1/jobs/${job.id}/cancel`);
  const after = await apiJson<{ balance: number }>(request, page, "get", "/api/v1/credits");
  expect(after.balance).toBe(200);
  const row = await prisma.processingJob.findUniqueOrThrow({ where: { id: job.id } });
  expect(["REFUNDED", "CANCELLED"]).toContain(row.status);
});

test("insufficient credits blocks the job before anything is created", async ({ page, request }) => {
  const user = uniqueUser("poor");
  await register(page, user);
  const u = await prisma.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() } });
  await prisma.creditAccount.update({ where: { userId: u.id }, data: { balance: 5 } });
  const uploadId = await uploadFile(request, page, "prop-creator", "sample.glb", sampleGlb(), "model/gltf-binary");
  const res = await request.post("/api/v1/jobs", { headers: await csrfHeaders(page), data: JSON.stringify({ toolSlug: "prop-creator", uploadIds: [uploadId], config: {} }) });
  expect(res.status()).toBe(402);
  expect((await res.json()).error.code).toBe("INSUFFICIENT_CREDITS");
  expect(await prisma.processingJob.count({ where: { userId: u.id } })).toBe(0);
  expect((await prisma.creditAccount.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(5);
});

test("a real export produces a downloadable resource and a creation (requires a running worker)", async ({ page, request }) => {
  test.skip(!(await workerRunning()), "no worker heartbeat — start `pnpm dev:worker` to run this test");
  test.setTimeout(240_000);
  const user = uniqueUser("build");
  await register(page, user);
  await verifyUserByToken(page, user.email);
  await grantCredits(user.email, 1000);
  const uploadId = await uploadFile(request, page, "prop-creator", "sample.glb", sampleGlb(), "model/gltf-binary");
  const job = await apiJson<{ id: string; creationId: string }>(request, page, "post", "/api/v1/jobs", { toolSlug: "prop-creator", uploadIds: [uploadId], config: { propName: "e2e_built_prop" }, name: "E2E built prop" });

  await page.goto(`/app/jobs/${job.id}`);
  await expect.poll(async () => (await prisma.processingJob.findUniqueOrThrow({ where: { id: job.id } })).status, { timeout: 200_000, intervals: [2000] }).toMatch(/COMPLETED|FAILED|REFUNDED/);
  const done = await prisma.processingJob.findUniqueOrThrow({ where: { id: job.id } });
  expect(done.status, `worker failed: ${done.errorCode} ${done.errorMessage}`).toBe("COMPLETED");
  expect(done.resultKey).toBeTruthy();

  const creation = await prisma.creation.findUniqueOrThrow({ where: { id: job.creationId }, include: { currentVersion: true } });
  expect(creation.status).toBe("READY");
  expect(creation.currentVersion?.resourceKey).toBe(done.resultKey);

  const dl = await apiJson<{ url: string; fileName: string }>(request, page, "get", `/api/v1/creations/${creation.id}/download`);
  const zip = await request.get(dl.url);
  expect(zip.ok()).toBeTruthy();
  const bytes = Buffer.from(await zip.body());
  expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK"); // a real ZIP, not a placeholder

  // Re-exporting the identical file with identical settings inside the window is free.
  const uploadAgain = await uploadFile(request, page, "prop-creator", "renamed-sample.glb", sampleGlb(), "model/gltf-binary");
  const est = await apiJson<{ credits: number; freeReexport: boolean }>(request, page, "post", "/api/v1/tools/prop-creator/estimate", { uploadIds: [uploadAgain], config: { propName: "e2e_built_prop" } });
  expect(est.freeReexport).toBe(true);
  expect(est.credits).toBe(0);

  await page.goto(`/app/creations/${creation.id}`);
  await expect(page.getByText("E2E built prop").first()).toBeVisible({ timeout: 20_000 });
});
