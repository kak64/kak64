import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma configuration (replaces the deprecated `package.json#prisma` block).
 * `DATABASE_URL` is read from the environment; tests point it at TEST_DATABASE_URL.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
