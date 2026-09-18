import { execSync } from "node:child_process";
import path from "node:path";

/** Applies migrations to the test database before the integration suite runs. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://modsmith:modsmith@localhost:5432/modsmith_test?schema=public";
  process.env.DATABASE_URL = url;
  execSync("pnpm exec prisma migrate deploy", { cwd: path.resolve(__dirname, "../../../db"), env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
