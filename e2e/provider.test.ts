// e2e/provider.test.ts — provider 注入模块单元测试(bun:test)
import { describe, expect, test } from "bun:test";
import { buildProviderConfig, sanitizeProviderForLog } from "./provider.ts";

const PROVIDER_ENV = "TIANJI_E2E_PROVIDER_JSON";

describe("sanitizeProviderForLog", () => {
  test("将 options.apiKey 替换为 ***", () => {
    const input = {
      models: { "deepseek-v4-flash": { name: "DeepSeek V4 Flash" } },
      npm: "@ai-sdk/openai-compatible",
      options: {
        apiKey: "testkey-1234567890",
        baseURL: "https://api.deepseek.com/v1",
        setCacheKey: true,
      },
    };
    const out = sanitizeProviderForLog(input);
    expect(out.options.apiKey).toBe("***");
    expect(out.options.baseURL).toBe("https://api.deepseek.com/v1");
    expect(out.options.setCacheKey).toBe(true);
    expect(out.models).toEqual(input.models);
  });

  test("不修改输入对象(不可变)", () => {
    const input = {
      models: { m: { name: "x" } },
      options: { apiKey: "origkey-abc", baseURL: "https://x" },
    };
    const frozen = structuredClone(input);
    sanitizeProviderForLog(input);
    expect(input).toEqual(frozen);
  });

  test("返回的是深拷贝,修改返回值不影响输入", () => {
    const input = { models: { m: { name: "x" } }, options: { apiKey: "deepkey-abc", baseURL: "https://x" } };
    const out = sanitizeProviderForLog(input);
    out.options.apiKey = "mutkey-xyz";
    expect(input.options.apiKey).toBe("deepkey-abc");
    expect(input.models).toEqual({ m: { name: "x" } });
  });
});

describe("buildProviderConfig env 注入路径", () => {
  test("设置 TIANJI_E2E_PROVIDER_JSON 后返回该 JSON", () => {
    const payload = {
      models: { "deepseek-v4-flash": { name: "DeepSeek V4 Flash" } },
      npm: "@ai-sdk/openai-compatible",
      options: { apiKey: "envkey-injected-abc", baseURL: "https://api.deepseek.com/v1" },
    };
    process.env[PROVIDER_ENV] = JSON.stringify(payload);
    try {
      const p = buildProviderConfig();
      expect(p).toEqual(payload);
      // 注入路径不应触碰真实全局配置
      expect(p.models["deepseek-v4-flash"].name).toBe("DeepSeek V4 Flash");
    } finally {
      delete process.env[PROVIDER_ENV];
    }
  });

  test("环境变量为非法 JSON 时抛中文错误且环境变量在 finally 中清理", () => {
    process.env[PROVIDER_ENV] = "{bad json";
    try {
      expect(() => buildProviderConfig()).toThrow(/不是合法/);
    } finally {
      delete process.env[PROVIDER_ENV];
    }
    expect(process.env[PROVIDER_ENV]).toBeUndefined();
  });
});
