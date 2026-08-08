/**
 * e2e/scaffold.test.ts — createScaffold / pluginAbsPath 单元测试(bun:test)
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "bun:test";

import { createScaffold, pluginAbsPath, readScaffoldConfig } from "./scaffold.ts";

/** 列出 os.tmpdir() 下当前进程的 tianji-e2e 残留目录。 */
function leftoverDirs(): string[] {
  return readdirSync(os.tmpdir()).filter(
    (name) => name.startsWith(`tianji-e2e-${process.pid}-`),
  );
}

describe("pluginAbsPath", () => {
  test("返回 projectRoot/plugins/zhanbu.ts 且文件真实存在", () => {
    const p = pluginAbsPath(process.cwd());
    expect(path.basename(p)).toBe("zhanbu.ts");
    expect(path.dirname(p).endsWith(path.join("plugins"))).toBe(true);
    expect(existsSync(p)).toBe(true);
  });

  test("projectRoot 不含插件时抛中文错误", () => {
    const empty = path.join(os.tmpdir(), `tianji-e2e-missing-${Date.now()}`);
    expect(() => pluginAbsPath(empty)).toThrow(/插件文件不存在/);
  });
});

describe("createScaffold", () => {
  test("happy path:目录存在、配置正确、模板复制、权限 600、cleanup 后消失", async () => {
    const s = await createScaffold({
      provider: { deepseek: { apiKey: "sk-test-placeholder" } },
    });
    try {
      // (1) 目录存在
      expect(existsSync(s.dir)).toBe(true);
      expect(path.dirname(s.dir)).toBe(os.tmpdir());

      // (2) opencode.json:plugin 数组含 pluginAbsPath(process.cwd()) 结果
      const config = await readScaffoldConfig(s.dir);
      expect(Array.isArray(config.plugin)).toBe(true);
      expect(config.plugin).toContain(pluginAbsPath(process.cwd()));

      // (3) provider 字段存在且为注入值
      expect(config.provider).toBeDefined();
      const provider = config.provider as Record<string, unknown>;
      expect(provider.deepseek).toBeDefined();

      // (4) 技能与命令模板复制成功
      expect(
        existsSync(path.join(s.dir, ".opencode", "skills", "zhanbu", "SKILL.md")),
      ).toBe(true);
      expect(existsSync(path.join(s.dir, ".opencode", "command", "zhanbu.md"))).toBe(
        true,
      );
      for (const skill of ["meihua", "bazi", "liuren"]) {
        expect(
          existsSync(path.join(s.dir, ".opencode", "skills", skill, "SKILL.md")),
        ).toBe(true);
      }

      // (5) opencode.json 权限为 600
      const mode = statSync(path.join(s.dir, "opencode.json")).mode & 0o777;
      expect(mode).toBe(0o600);

      // (6) cleanup 后目录消失
      await s.cleanup();
      expect(existsSync(s.dir)).toBe(false);

      // (7) cleanup 幂等:再次调用不报错
      await s.cleanup();
    } finally {
      await s.cleanup();
    }
  });

  test("provider 传非对象(42)抛中文错误且无残留目录", async () => {
    const before = leftoverDirs();
    let threw: unknown = null;
    try {
      await createScaffold({
        provider: 42 as unknown as Record<string, unknown>,
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeDefined();
    expect(String((threw as Error).message)).toContain("provider 必须是对象");
    // 无新残留目录(provider 校验在创建目录之前,且失败路径会清理)
    expect(leftoverDirs()).toEqual(before);
  });

  test("provider 缺省时 opencode.json 不含 provider 字段", async () => {
    const s = await createScaffold({});
    try {
      const config = await readScaffoldConfig(s.dir);
      expect(config.provider).toBeUndefined();
    } finally {
      await s.cleanup();
    }
  });
});
