// e2e/provider.ts — deepseek provider 安全注入模块
//
// 职责(数据只出不落盘):
// 1. 若设置了 TIANJI_E2E_PROVIDER_JSON,直接 JSON.parse 使用(CI / 他机覆盖);
// 2. 否则读 ~/.config/opencode/opencode.json 的 provider.deepseek 整段原样返回;
// 3. 读不到抛中文错误,提示复制全局配置的 provider.deepseek 到环境变量。
//
// 本模块不写文件、不 chmod;返回值作为数据交给 scaffold(T2) 经 opts 传入。
// apiKey 明文不得出现在日志/仓库/证据 —— 输出前必须经过 sanitizeProviderForLog。

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROVIDER_ENV = "TIANJI_E2E_PROVIDER_JSON";
const GLOBAL_CONFIG_REL = join(".config", "opencode", "opencode.json");

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 读取 deepseek provider 配置(含 apiKey 原始值,仅供内部传递,禁止直接输出)。 */
export function buildProviderConfig(): Record<string, any> {
  const fromEnv = process.env[PROVIDER_ENV];
  // 空字符串视为未设置,与「HOME=/nonexistent-home TIANJI_E2E_PROVIDER_JSON=」的
  // 确定性失败场景保持一致:落入全局配置读取路径并抛中文错误。
  if (fromEnv !== undefined && fromEnv !== "") {
    try {
      const parsed: unknown = JSON.parse(fromEnv);
      if (!isPlainObject(parsed)) {
        throw new Error(`环境变量 ${PROVIDER_ENV} 必须是 JSON 对象`);
      }
      return parsed;
    } catch (err) {
      throw new Error(
        `环境变量 ${PROVIDER_ENV} 不是合法的 JSON 对象:${err instanceof Error ? err.message : String(err)}。` +
          `请复制你全局 opencode 配置的 provider.deepseek 整段为合法 JSON 字符串后重试。`,
      );
    }
  }

  const configPath = join(homedir(), GLOBAL_CONFIG_REL);
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(
      `无法读取全局配置 ${configPath}(文件缺失或不可读)。` +
        `请将你全局 opencode.json 中的 provider.deepseek 整段复制到环境变量 ${PROVIDER_ENV}` +
        `(JSON 字符串)后重试,例如:${PROVIDER_ENV}='{"npm":"@ai-sdk/openai-compatible","models":{},"options":{"apiKey":"sk-...","baseURL":"https://api.deepseek.com/v1"}}'`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `全局配置 ${configPath} 不是合法 JSON:${err instanceof Error ? err.message : String(err)}。` +
        `请修正配置,或将 provider.deepseek 整段复制到环境变量 ${PROVIDER_ENV}。`,
    );
  }

  const deepseek = isPlainObject(parsed) && isPlainObject(parsed.provider) ? parsed.provider.deepseek : undefined;
  if (!isPlainObject(deepseek)) {
    throw new Error(
      `全局配置 ${configPath} 中不存在 provider.deepseek 段(或不是 JSON 对象)。` +
        `请复制你全局 opencode.json 的 provider.deepseek 到环境变量 ${PROVIDER_ENV} 后重试。`,
    );
  }
  return deepseek;
}

/** 深拷贝并脱敏:options.apiKey 替换为 "***";不修改输入对象。 */
export function sanitizeProviderForLog(provider: Record<string, unknown>): Record<string, any> {
  const copy: Record<string, unknown> = structuredClone(provider);
  if (isPlainObject(copy.options)) {
    copy.options = { ...copy.options, apiKey: "***" };
  }
  return copy;
}
