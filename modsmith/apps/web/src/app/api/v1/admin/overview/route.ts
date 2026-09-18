import { prisma } from "@modsmith/db";
import { queueStats } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../_lib";

export const GET = apiRoute(ADMIN, async () => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const day = new Date(Date.now() - 86400_000);
  const [users, newUsers, jobs24h, failed24h, activeJobs, revenue30d, purchases30d, subs, creations, showcase, pendingReviews, openReports, hubLogs24h, creditsSpent30d, queues] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.processingJob.count({ where: { createdAt: { gte: day } } }),
    prisma.processingJob.count({ where: { createdAt: { gte: day }, status: { in: ["FAILED", "REFUNDED"] } } }),
    prisma.processingJob.count({ where: { status: { in: ["QUEUED", "PROCESSING", "PACKAGING"] } } }),
    prisma.creditPurchase.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { amountCents: true } }),
    prisma.creditPurchase.count({ where: { status: "PAID", paidAt: { gte: since } } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
    prisma.creation.count({ where: { deletedAt: null } }),
    prisma.showcaseItem.count({ where: { status: "PUBLISHED" } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.abuseReport.count({ where: { status: "open" } }),
    prisma.serverHubLog.count({ where: { receivedAt: { gte: day } } }),
    prisma.creditTransaction.aggregate({ where: { type: "EXPORT", createdAt: { gte: since } }, _sum: { amount: true } }),
    queueStats(),
  ]);
  const jobsByTool = await prisma.processingJob.groupBy({ by: ["toolSlug", "status"], _count: { _all: true }, where: { createdAt: { gte: since } } });
  return json({ users, newUsers30d: newUsers, jobs24h, failed24h, activeJobs, revenueCents30d: revenue30d._sum.amountCents ?? 0, purchases30d, activeSubscriptions: subs, creations, showcase, pendingReviews, openReports, hubLogs24h, creditsSpent30d: -(creditsSpent30d._sum.amount ?? 0), queues, jobsByTool });
});
