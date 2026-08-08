import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "bun:test";

export const MIRROR_DIR = process.env.TIANJI_MIRROR ?? path.resolve(import.meta.dir, "..", "..", "知识库");

export function mirrorFile(rel: string): string | null {
  const p = path.join(MIRROR_DIR, rel);
  return existsSync(p) ? p : null;
}

export function mirrorTest(name: string, rel: string, fn: (mirror: string) => void) {
  const mirror = mirrorFile(rel);
  if (mirror) {
    test(name, () => fn(mirror));
  } else {
    test.skip(name, () => {});
  }
}
