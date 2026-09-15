import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { buildZip } from "@/lib/zip";

/** Packages packages/hub-resource/msmhub into a ZIP for download. */
export async function buildHubResourceZip() {
  const root = await findResourceRoot();
  const files: { name: string; data: Buffer }[] = [];
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await readdir(dir)) {
      const full = path.join(dir, entry);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full, `${prefix}${entry}/`);
      else files.push({ name: `msmhub/${prefix}${entry}`, data: await readFile(full) });
    }
  };
  await walk(root, "");
  return buildZip(files);
}

async function findResourceRoot() {
  const candidates = [
    path.resolve(process.cwd(), "../../packages/hub-resource/msmhub"),
    path.resolve(process.cwd(), "packages/hub-resource/msmhub"),
    path.resolve(process.cwd(), "hub-resource/msmhub"),
  ];
  for (const c of candidates) { try { if ((await stat(c)).isDirectory()) return c; } catch { /* next */ } }
  throw new Error("hub resource directory not found");
}
