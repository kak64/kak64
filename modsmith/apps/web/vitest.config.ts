import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    setupFiles: ["src/test/env.ts"],
    globalSetup: process.env.SKIP_DB_TESTS ? [] : ["../../packages/services/src/test/global-setup.ts"],
    exclude: process.env.SKIP_DB_TESTS ? ["src/**/*.int.test.ts", "node_modules/**", "e2e/**"] : ["node_modules/**", "e2e/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
