/** e2e/opencode.test.ts — versionAtLeast 边界单测(bun:test) */
import { describe, expect, test } from "bun:test";
import { versionAtLeast, parseVersion } from "./opencode.ts";

describe("versionAtLeast", () => {
  test("1.18.0 ≥ 1.18.0 → true", () => {
    expect(versionAtLeast("1.18.0", "1.18.0")).toBe(true);
  });

  test("1.18.15 ≥ 1.18.0 → true", () => {
    expect(versionAtLeast("1.18.15", "1.18.0")).toBe(true);
  });

  test("1.17.9 ≥ 1.18.0 → false", () => {
    expect(versionAtLeast("1.17.9", "1.18.0")).toBe(false);
  });

  test("2.0.0 ≥ 1.18.0 → true", () => {
    expect(versionAtLeast("2.0.0", "1.18.0")).toBe(true);
  });

  test("缺位补零:1.18 ≥ 1.18.0 → true", () => {
    expect(versionAtLeast("1.18", "1.18.0")).toBe(true);
  });

  test("缺位补零:1.18.0 ≥ 1.18 → true", () => {
    expect(versionAtLeast("1.18.0", "1.18")).toBe(true);
  });

  test("跨主版本:2.0.0 ≥ 1.99.9 → true", () => {
    expect(versionAtLeast("2.0.0", "1.99.9")).toBe(true);
  });
});

describe("parseVersion", () => {
  test("纯版本号", () => {
    expect(parseVersion("1.18.15")).toBe("1.18.15");
  });

  test("带前缀", () => {
    expect(parseVersion("v1.18.15")).toBe("1.18.15");
    expect(parseVersion("opencode 1.18.15")).toBe("1.18.15");
  });

  test("无版本号 → null", () => {
    expect(parseVersion("opencode")).toBeNull();
  });
});
