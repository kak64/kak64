import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["src/test/env.ts"],
    globalSetup: process.env.SKIP_DB_TESTS ? [] : ["src/test/global-setup.ts"],
    exclude: process.env.SKIP_DB_TESTS ? ["src/**/*.int.test.ts", "node_modules/**"] : ["node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
