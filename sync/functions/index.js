/**
 * Sync — self-destruct Cloud Functions.
 *
 * Two complementary mechanisms enforce the 30-minute rule:
 *
 *  1. onSyncCreate — schedules a deferred wipe by stamping `expiresAt`
 *     (the client already does this; this guarantees it server-side).
 *
 *  2. sweepExpiredSyncs — a scheduled function that runs every minute,
 *     finds any sync whose `expiresAt` has passed, recursively deletes
 *     its `messages` subcollection, then deletes the sync document.
 *     This wipes BOTH the chat data and the map marker.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } =
  require("firebase-admin/firestore");
const { logger } = require("firebase-functions");

initializeApp();
const db = getFirestore();

const TTL_MINUTES = 30;
const MESSAGE_PAGE = 200;

exports.onSyncCreate = onDocumentCreated("syncs/{syncId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};

  // Server-authoritative expiry — clients cannot extend the lifetime.
  const createdAt = data.createdAt instanceof Timestamp
    ? data.createdAt
    : Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    createdAt.toMillis() + TTL_MINUTES * 60 * 1000
  );

  await snap.ref.update({
    createdAt,
    expiresAt,
    active: true,
    serverStampedAt: FieldValue.serverTimestamp(),
  });
});

exports.sweepExpiredSyncs = onSchedule("every 1 minutes", async () => {
  const now = Timestamp.now();
  const expired = await db
    .collection("syncs")
    .where("expiresAt", "<=", now)
    .limit(50)
    .get();

  if (expired.empty) return;

  logger.info(`Sweeping ${expired.size} expired syncs`);
  await Promise.all(expired.docs.map((doc) => destroySync(doc.ref)));
});

/**
 * Recursively deletes the messages subcollection then the sync doc itself.
 * Page through messages in case a popular sync accumulated many.
 */
async function destroySync(syncRef) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await syncRef
      .collection("messages")
      .limit(MESSAGE_PAGE)
      .get();
    if (page.empty) break;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < MESSAGE_PAGE) break;
  }
  await syncRef.delete();
}
