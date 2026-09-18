import { PrismaClient } from "../generated/client";

export * from "../generated/client";

const globalForPrisma = globalThis as unknown as { __modsmithPrisma?: PrismaClient };

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/** Singleton Prisma client (safe across Next.js hot reloads). */
export const prisma: PrismaClient = globalForPrisma.__modsmithPrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__modsmithPrisma = prisma;
