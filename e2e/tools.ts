/**
 * e2e/tools.ts — 确定性工具注册验证模块(Todo 4)
 *
 * 真实启动 `opencode serve --port 0`(detached + stdio pipe,XDG 三变量隔离到
 * `<dir>/.xdg/{config,cache,data}`,并禁用自动更新与模型拉取),然后:
 *   1. 从 serve stdout 解析实际监听端口 —— 1.18.15 语义:`--port 0` 优先绑定 4096,
 *      被占用才随机,因此**绝不假设 4096**,始终解析输出行
 *      `opencode server listening on http://127.0.0.1:<PORT>`(≤15s 轮询);
 *   2. 轮询 `GET /global/health` 直到 200(≤30s);
 *   3. preflight:serve 日志出现插件/配置文件路径特征视为配置加载线索(软检查,
 *      serve 默认不打印插件路径,不据此判失败);**硬检查**:若
 *      `GET /experimental/tool/ids` 返回的工具里一个天机工具都没有,抛中文错误
 *      「项目配置未加载/插件未生效」,防止「配置没加载测试假通过」;
 *   4. `GET /experimental/tool/ids`(带 `x-opencode-directory: <dir>` 头),做子集
 *      检查:missing = TIANJI_TOOLS − ids(响应同时含 question/bash 等 core 工具,
 *      属正常);
 *   5. finally 只回收自 spawn 的子进程:SIGTERM → 2s 未退 → SIGKILL(含进程组兜底)。
 *
 * CLI 入口:`bun run e2e/tools.ts [--dir <已有脚手架目录>]`
 *   - 默认经 createScaffold 自建隔离脚手架(provider 由 buildProviderConfig 产出);
 *   - 输出 JSON `{ids, missing, port}`,missing 为空退出 0,否则退出 1;
 *   - `TIANJI_E2E_BAD_PLUGIN=1` 时先把脚手架 opencode.json 覆写为指向不存在插件
 *     的配置(确定性失败注入,验证 preflight 拦截),仍退出 1。
 *
 * 天机 13 工具清单:README.md:59 — qigua/paipan/duangua/cha/meihua/bazi/
 * liuren/almanac/dayan/yilin/jingshi/huozhulin/chazhu。
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { createScaffold } from "./scaffold.ts";
import { buildProviderConfig } from "./provider.ts";
import { detectOpencode } from "./opencode.ts";

/** 天机 13 工具(与 README 工具表、plugins/zhanbu.ts 聚合器保持一致)。 */
export const TIANJI_TOOLS: string[] = [
  "qigua",
  "paipan",
  "duangua",
  "cha",
  "meihua",
  "bazi",
  "liuren",
  "almanac",
  "dayan",
  "yilin",
  "jingshi",
  "huozhulin",
  "chazhu",
];

/** serve 监听行:`opencode server listening on http://127.0.0.1:<PORT>` */
const LISTEN_RE = /opencode server listening on http:\/\/127\.0\.0\.1:(\d+)/;

/** 端口解析轮询上限(毫秒)。 */
const PORT_PARSE_TIMEOUT_MS = 15_000;
/** 健康检查轮询上限(毫秒)。 */
const HEALTH_TIMEOUT_MS = 30_000;
/** 轮询间隔(毫秒)。 */
const POLL_INTERVAL_MS = 250;

/**
 * 从 serve 输出中提取实际监听端口(纯函数)。
 *
 * 仅匹配 opencode serve 的标准监听行。端口 0 表示服务未分配实际端口
 * (连接 0 端口无意义,说明监听行里没有真实端口),与越界(>65535)一样
 * 视为解析失败返回 null。
 */
export function parseServerPort(stdout: string): number | null {
  const m = LISTEN_RE.exec(stdout);
  if (!m) return null;
  const port = Number(m[1]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
}

export interface ToolRegistrationResult {
  /** /experimental/tool/ids 返回的全部工具 id(含 question/bash 等 core 工具)。 */
  ids: string[];
  /** TIANJI_TOOLS 中未注册的工具。 */
  missing: string[];
  /** 从 serve 输出解析到的实际端口(绝不假设 4096)。 */
  port: number;
}

/**
 * 启动真实 `opencode serve --port 0` 并验证 13 个天机工具全部注册。
 *
 * @param opts.dir          T2 脚手架目录(opencode.json 已含 plugin + provider)。
 * @param opts.opencodeBin  opencode 二进制绝对路径(detectOpencode() 产出)。
 * @throws 中文错误:serve 提前退出 / 端口解析超时 / 健康检查超时 /
 *         ids 接口异常 / preflight 硬检查失败(「项目配置未加载/插件未生效」)。
 */
export async function verifyToolsRegistered(opts: {
  dir: string;
  opencodeBin: string;
}): Promise<ToolRegistrationResult> {
  const { dir, opencodeBin } = opts;

  // (1) XDG 三目录隔离:防止加载用户全局插件(ponytail 等),保证可复现
  const xdgConfigHome = path.join(dir, ".xdg", "config");
  const xdgCacheHome = path.join(dir, ".xdg", "cache");
  const xdgDataHome = path.join(dir, ".xdg", "data");
  await mkdir(xdgConfigHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    // 剔除宿主会话注入的 OPENCODE_*(如 OPENCODE_PID/OPENCODE=1),避免污染子进程
    if (v === undefined || k.startsWith("OPENCODE_")) continue;
    env[k] = v;
  }
  env.XDG_CONFIG_HOME = xdgConfigHome;
  env.XDG_CACHE_HOME = xdgCacheHome;
  env.XDG_DATA_HOME = xdgDataHome;
  env.OPENCODE_DISABLE_AUTOUPDATE = "1";
  env.OPENCODE_DISABLE_MODELS_FETCH = "1";

  // detached:子进程自成进程组,便于整组回收;stdio pipe 供输出解析
  const child = spawn(opencodeBin, ["serve", "--port", "0"], {
    env,
    cwd: dir,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuf += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderrBuf += chunk;
  });

  try {
    // (2) 从 serve 输出解析实际端口(≤15s;解析 stdout,stderr 兜底)
    const port = await waitForPort(child, () => stdoutBuf, () => stderrBuf, PORT_PARSE_TIMEOUT_MS);

    // (3) 轮询 /global/health 直到 200(≤30s)
    await waitForHealth(child, port, HEALTH_TIMEOUT_MS);

    // (4) preflight(软):serve 日志出现插件路径 / 配置文件路径特征 → 加载线索
    const serveLog = stdoutBuf + stderrBuf;
    const configLoadedHint =
      serveLog.includes("zhanbu.ts") || serveLog.includes(path.join(dir, "opencode.json"));

    // (5) GET /experimental/tool/ids(带 x-opencode-directory 头)
    const ids = await fetchToolIds(port, dir);

    // (6) 子集检查:响应含 core 工具(question/bash 等)属正常,只算 missing
    const missing = TIANJI_TOOLS.filter((t) => !ids.includes(t));

    // (4') preflight(硬):13 个工具一个都没注册 → 配置未加载/插件未生效
    if (missing.length === TIANJI_TOOLS.length) {
      throw new Error(
        `项目配置未加载/插件未生效:${dir} 的 /experimental/tool/ids 未包含任何天机工具` +
          (configLoadedHint ? "" : "(serve 日志亦未见插件路径特征)") +
          `,共返回 ${ids.length} 个工具:${ids.slice(0, 12).join(",")}${ids.length > 12 ? ",…" : ""}` +
          `。请检查 opencode.json 的 plugin 配置。serve 输出:\n${logExcerpt(serveLog)}`,
      );
    }

    return { ids, missing, port };
  } finally {
    // (7) 清理:只回收自 spawn 的子进程(SIGTERM → 2s → SIGKILL,进程组兜底)
    await killChild(child);
  }
}

/** 轮询 serve 输出直到解析出端口;超时或子进程提前退出抛中文错误。 */
async function waitForPort(
  child: ChildProcess,
  getStdout: () => string,
  getStderr: () => string,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `opencode serve 提前退出(exit=${child.exitCode}):\n${logExcerpt(getStdout() + getStderr())}`,
      );
    }
    const port = parseServerPort(getStdout()) ?? parseServerPort(getStderr());
    if (port !== null) return port;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `无法从 serve 输出解析监听端口(≤${Math.round(timeoutMs / 1000)}s):\n` +
      logExcerpt(getStdout() + getStderr()),
  );
}

/** 轮询 /global/health 直到 200;超时或 serve 提前退出抛中文错误。 */
async function waitForHealth(child: ChildProcess, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`健康检查前 serve 已退出(exit=${child.exitCode})`);
    }
    if (await healthOk(port)) return;
    await sleep(500);
  }
  throw new Error(
    `服务健康检查超时(≤${Math.round(timeoutMs / 1000)}s):` +
      `http://127.0.0.1:${port}/global/health 未返回 200`,
  );
}

async function healthOk(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/global/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** GET /experimental/tool/ids;非 JSON 字符串数组(如 ConfigInvalidError 对象)抛中文错误。 */
async function fetchToolIds(port: number, dir: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/experimental/tool/ids`, {
      headers: { "x-opencode-directory": dir },
    });
  } catch (err) {
    throw new Error(
      `请求 /experimental/tool/ids 失败:${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error(
      `/experimental/tool/ids 返回异常(HTTP ${res.status},应为 JSON 字符串数组):` +
        text.slice(0, 300) + (text.length > 300 ? "…" : ""),
    );
  }
  return parsed as string[];
}

/** 只回收自 spawn 的子进程:SIGTERM → 2s 未退 → SIGKILL(单进程 + 进程组兜底)。 */
async function killChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return; // 已退出,无需清理
  const exited = exitSignal(child);
  try {
    child.kill("SIGTERM");
  } catch {}
  if (await Promise.race([exited, sleep(2000)])) return;
  try {
    child.kill("SIGKILL");
  } catch {}
  // detached 的 serve 自带进程组;SIGKILL 整组兜底,防孙进程残留
  try {
    if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
  } catch {}
  await Promise.race([exited, sleep(2000)]);
}

function exitSignal(child: ChildProcess): Promise<boolean> {
  return new Promise((resolve) => {
    child.once("exit", () => resolve(true));
    child.once("error", () => resolve(true));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logExcerpt(log: string): string {
  return log.split("\n").filter((l) => l.trim() !== "").slice(-20).join("\n") || "(无输出)";
}

/**
 * scaffold(T2) 把 provider.deepseek 整段直接写入 provider 字段,而 opencode 要求
 * `provider` 是「provider 名 → 配置」映射(缺 deepseek 包裹会报 ConfigInvalidError)。
 * 此处补齐包裹;已是映射形态(如 TIANJI_E2E_PROVIDER_JSON 传完整映射)则跳过。
 */
async function ensureProviderWrapped(dir: string): Promise<void> {
  const cfgPath = path.join(dir, "opencode.json");
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(await readFile(cfgPath, "utf8"));
  } catch (err) {
    throw new Error(
      `读取脚手架配置失败(${cfgPath}):${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const provider = cfg.provider;
  if (provider === undefined) return; // 无 provider,无需包裹
  const alreadyMap =
    typeof provider === "object" &&
    provider !== null &&
    !Array.isArray(provider) &&
    typeof (provider as Record<string, unknown>).deepseek === "object";
  if (!alreadyMap) {
    cfg.provider = { deepseek: provider };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dirFlag = args.indexOf("--dir");
  const givenDir = dirFlag !== -1 && args[dirFlag + 1] ? args[dirFlag + 1] : undefined;

  let scaffold: { dir: string; cleanup(): Promise<void> } | null = null;
  let dir: string;
  if (givenDir) {
    dir = givenDir;
  } else {
    // 默认自建隔离脚手架:provider 由 provider 模块产出,经 opts 注入
    scaffold = await createScaffold({ provider: buildProviderConfig() });
    dir = scaffold.dir;
  }

  let exitCode = 0;
  try {
    if (process.env.TIANJI_E2E_BAD_PLUGIN === "1") {
      // 确定性失败注入:插件指向不存在的文件,验证 preflight 硬检查拦截
      const badConfig = JSON.stringify({ plugin: ["/nonexistent/plugin.ts"], provider: {} }, null, 2) + "\n";
      await writeFile(path.join(dir, "opencode.json"), badConfig, { mode: 0o600 });
    } else {
      await ensureProviderWrapped(dir);
    }

    const res = await verifyToolsRegistered({ dir, opencodeBin: detectOpencode().bin });
    console.log(JSON.stringify({ ids: res.ids, missing: res.missing, port: res.port }));
    exitCode = res.missing.length === 0 ? 0 : 1;
  } catch (err) {
    console.error(`e2e/tools.ts 失败:${err instanceof Error ? err.message : String(err)}`);
    exitCode = 1;
  } finally {
    // 自建的脚手架才清理;--dir 传入的目录归调用方管理
    if (scaffold) await scaffold.cleanup();
  }
  process.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
