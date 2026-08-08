/**
 * e2e/command.ts — 命令模板验证(Todo 6):/zhanbu 真实可执行
 *
 * 用隔离临时项目(见 scaffold.ts)真实启动 opencode 子进程执行
 * `opencode run --format json --auto --command zhanbu "<COMMAND_ARGS>"`,
 * 从 NDJSON 事件流断言:命令确实被执行(无 command-not-found / error 事件),
 * 且至少 1 次天机工具调用 status === "completed"(question 前置调用可接受)。
 *
 * COMMAND_ARGS 一次给齐 5 项必问信息(占卜事项/求测人性别/地理位置/是否本人/起卦时间),
 * 规避 templates/command/zhanbu.md 第 7~12 行「question 收集缺项」的陷阱。
 *
 * 环境变量:
 *   TIANJI_E2E_SKIP_LLM=1           跳过真实 LLM 对话,返回 { skipped: true }
 *   TIANJI_E2E_NO_COMMAND=1         强制模拟「command 模板缺失」失败路径(确定性 QA)
 *   TIANJI_E2E_MODEL                模型 id,默认 deepseek/deepseek-v4-flash
 *   TIANJI_E2E_NDJSON_FILE          非空时把本次 NDJSON 原文写入该文件(证据采集用)
 *
 * 直跑 CLI:`bun run e2e/command.ts` — 建临时环境 → 探测二进制 → 执行校验 →
 * 打印 JSON → finally 清理;ok/skipped 退出码 0,否则 1。
 *
 * NDJSON 解析说明:chat.ts 的 parseNdjsonTools 只保留 completed 工具与文本,
 * 会丢弃 error 事件信息(本模块需要它识别「command not found」),故此处保留
 * 本地增强版解析器(parseNdjsonEvents + findCommandError),天机工具清单复用
 * tools.ts 的 TIANJI_TOOLS。
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import * as path from "node:path";

import { TIANJI_TOOLS } from "./tools.ts";

/**
 * /zhanbu 命令参数:一次给齐 5 项必问信息(是否本人、求测人性别、地理位置、
 * 起卦时间、占卜事项),命令模板便不再用 question 工具收集缺项。前缀为计划
 * 规定原串;「短线快进快出、资金量级中等、请直接起卦」补足模板第 2 步针对
 * 求财的「周期/量级」追问,避免模型问完就停(实测:不加则模型停在追问)。
 */
export const COMMAND_ARGS =
  "本人占卜,男,北京,2024-02-10 12:00,占求财(投资),短线快进快出、资金量级中等,信息已齐无需追问,请直接起卦排盘断卦";

/** 单次运行的硬超时:180s 后 SIGTERM→SIGKILL 终止子进程。 */
export const COMMAND_TIMEOUT_MS = 180_000;

export interface CommandCheckResult {
  ok: boolean;
  output: string;
  toolCalls: string[];
  reason?: string;
  skipped?: boolean;
}

/** NDJSON 事件的最小结构(opencode run --format json 输出形状)。 */
export interface NdjsonEvent {
  type?: string;
  error?: string | { name?: string; data?: { message?: string } };
  part?: {
    tool?: string;
    text?: string;
    state?: { status?: string; input?: Record<string, unknown>; error?: string };
  };
}

/** 逐行解析 NDJSON(空行/非 JSON 行跳过,容忍 stderr 混杂)。 */
export function parseNdjsonEvents(raw: string): NdjsonEvent[] {
  const events: NdjsonEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t) as NdjsonEvent);
    } catch {
      // 非 JSON 行(偶发警告文本)不视为事件
    }
  }
  return events;
}

/** 从 error 事件中提取可读文本(错误可能是字符串或 {name, data:{message}} 对象)。 */
export function errorEventText(e: NdjsonEvent): string | null {
  const err = e.error;
  if (err == null) return null;
  if (typeof err === "string" && err) return err;
  if (typeof err === "object") {
    if (typeof err.data?.message === "string" && err.data.message) return err.data.message;
    if (typeof err.name === "string") return err.name;
  }
  return null;
}

/**
 * 显式错误检测:type === "error" 事件(命令未找到/模型失败等)或
 * 文本中出现 "Command not found" / 中文「找不到命令」。命中返回错误文本,否则 null。
 */
export function findCommandError(events: NdjsonEvent[]): string | null {
  for (const e of events) {
    if (e.type === "error") {
      const text = errorEventText(e);
      if (text) return text;
    }
    if (e.type === "text" && typeof e.part?.text === "string") {
      const t = e.part.text;
      if (/command not found/i.test(t) || /找不到.{0,6}命令/i.test(t)) {
        return t;
      }
    }
  }
  return null;
}

/** 汇总天机工具调用:completed / errored 分列(question 等非天机工具不统计)。 */
export function collectTianjiToolCalls(
  events: NdjsonEvent[],
  tools: readonly string[],
): { completed: string[]; errored: string[] } {
  const completed: string[] = [];
  const errored: string[] = [];
  for (const e of events) {
    if (e.type !== "tool_use" || !e.part) continue;
    const tool = e.part.tool;
    if (!tool || !tools.includes(tool)) continue;
    if (e.part.state?.status === "completed") completed.push(tool);
    else if (e.part.state?.status === "error") errored.push(tool);
  }
  return { completed, errored };
}

/** 取最后一条非空 text 事件作为模型最终输出。 */
export function lastTextOutput(events: NdjsonEvent[]): string {
  let last = "";
  for (const e of events) {
    if (e.type === "text" && typeof e.part?.text === "string" && e.part.text.trim()) {
      last = e.part.text;
    }
  }
  return last.trim();
}

/**
 * 纯逻辑判定(单测友好):
 * - 显式 error/command-not-found 事件 → 失败;
 * - 否则要求至少 1 次天机工具 completed 调用(question 前置可接受)。
 */
export function evaluateCommandEvents(
  events: NdjsonEvent[],
  tools: readonly string[] = TIANJI_TOOLS,
): { ok: boolean; toolCalls: string[]; reason?: string } {
  const err = findCommandError(events);
  if (err) {
    return { ok: false, toolCalls: [], reason: `命令执行失败(command 未找到或运行错误):${err}` };
  }
  const { completed, errored } = collectTianjiToolCalls(events, tools);
  if (completed.length === 0) {
    const extra = errored.length > 0 ? `(存在 ${errored.length} 次失败的天机工具调用:${[...new Set(errored)].join(", ")})` : "";
    return { ok: false, toolCalls: [], reason: `未检测到任何天机工具成功调用(需至少 1 次 completed)${extra}` };
  }
  return { ok: true, toolCalls: completed };
}

/**
 * command 模板存在性检查(纯逻辑):返回缺失原因或 null。
 * 不依赖脚手架 —— 模块自行检查 <dir>/.opencode/command/ 是否存在。
 */
export function checkCommandPresence(
  dir: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.TIANJI_E2E_NO_COMMAND === "1") {
    return "command 模板缺失(由 TIANJI_E2E_NO_COMMAND=1 强制)";
  }
  if (!existsSync(path.join(dir, ".opencode", "command"))) {
    return `command 模板缺失:${path.join(dir, ".opencode", "command")} 不存在`;
  }
  return null;
}

/** 终止子进程:SIGTERM,3 秒后仍存活则 SIGKILL 兜底。 */
function terminateChild(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  // 定时器句柄类型随运行环境而异(bun 有 unref,lib.dom 下为 number),
  // 按 unknown 处理再做运行时判别,避免依赖全局 setTimeout 返回类型。
  const timer = setTimeout(() => {
    try {
      if (child.exitCode === null && child.pid !== undefined) child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }, 3000) as unknown as { unref?(): void } | null;
  if (timer && typeof timer === "object") timer.unref?.();
}

/**
 * 真实执行 /zhanbu 命令并校验。
 *
 * 步骤:skip 开关 → 模板存在性检查 → 子进程 `opencode run --format json --auto
 * --dir <dir> --model <model> --command zhanbu "<COMMAND_ARGS>"`(XDG 三变量隔离
 * 到 <dir>/.xdg/{config,cache,data} + 关闭自动更新/模型拉取)→ NDJSON 判定。
 *
 * 超时 180s → 终止子进程并返回中文超时原因;进程异常退出(非 0 退出码且无显式
 * error 事件)同样返回失败,绝不吞错误。
 */
export async function runCommandCheck(opts: {
  dir: string;
  model?: string;
  opencodeBin: string;
}): Promise<CommandCheckResult> {
  // (1) skip 开关:跳过真实 LLM 对话(确定性部分仍可跑,零费用)
  if (process.env.TIANJI_E2E_SKIP_LLM === "1") {
    return { ok: true, output: "", toolCalls: [], skipped: true };
  }

  // (2) 缺失-command 检查:环境变量强制 或 临时项目内无 .opencode/command/
  const missing = checkCommandPresence(opts.dir);
  if (missing) {
    return { ok: false, output: "", toolCalls: [], reason: missing };
  }

  // (3) 模型:opts.model → TIANJI_E2E_MODEL → 默认 deepseek/deepseek-v4-flash
  const model = opts.model ?? process.env.TIANJI_E2E_MODEL ?? "deepseek/deepseek-v4-flash";

  // (4) XDG 三变量隔离 + 关闭自动更新/模型拉取(与 T4/T5 一致,防加载全局插件污染)
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(opts.dir, ".xdg", "config"),
    XDG_CACHE_HOME: path.join(opts.dir, ".xdg", "cache"),
    XDG_DATA_HOME: path.join(opts.dir, ".xdg", "data"),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
  } as Record<string, string>;

  const child = spawn(
    opts.opencodeBin,
    [
      "run",
      "--format",
      "json",
      "--auto",
      "--dir",
      opts.dir,
      "--model",
      model,
      "--command",
      "zhanbu",
      COMMAND_ARGS,
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  let spawnError: Error | undefined;
  child.stdout.on("data", (d: Buffer | string) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer | string) => (stderr += d.toString()));

  const exited = new Promise<number | null>((resolve) => {
    child.on("error", (e: Error) => {
      spawnError = e;
      resolve(null);
    });
    child.on("close", (code: number | null) => resolve(code));
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    terminateChild(child);
  }, COMMAND_TIMEOUT_MS);

  try {
    const code = await exited;
    clearTimeout(timer);

    if (timedOut) {
      return {
        ok: false,
        output: lastTextOutput(parseNdjsonEvents(stdout)),
        toolCalls: [],
        reason: `运行超时(>${COMMAND_TIMEOUT_MS / 1000}s),已终止 opencode 子进程(SIGTERM→SIGKILL)`,
      };
    }

    // spawn 失败(二进制不存在/无权限)是基础设施错误,直接抛中文错误,不吞
    if (spawnError) {
      throw new Error(`启动 opencode 子进程失败(${opts.opencodeBin}):${spawnError.message}`);
    }

    // 证据采集:TIANJI_E2E_NDJSON_FILE 非空 → 把 NDJSON 原文写入该文件
    const ndjsonFile = process.env.TIANJI_E2E_NDJSON_FILE;
    if (ndjsonFile) {
      await writeFile(ndjsonFile, stdout).catch(() => {});
    }

    const events = parseNdjsonEvents(stdout);
    const output = lastTextOutput(events);
    const verdict = evaluateCommandEvents(events);

    if (!verdict.ok) {
      return { ok: false, output, toolCalls: [], reason: verdict.reason };
    }

    // 进程非 0 退出码且无显式 error 事件:同样视为失败
    if (code !== 0) {
      const tail = stderr.trim().slice(-500);
      return {
        ok: false,
        output,
        toolCalls: verdict.toolCalls,
        reason: `opencode 进程退出码 ${code}(虽有天机工具调用):${tail || "无 stderr 输出"}`,
      };
    }

    return { ok: true, output, toolCalls: verdict.toolCalls };
  } finally {
    // 无论如何都终止自 spawn 的子进程(幂等:已退出则跳过)
    terminateChild(child);
  }
}

/** CLI 入口:`bun run e2e/command.ts`(import 时不执行)。 */
if (import.meta.main) {
  const { detectOpencode } = await import("./opencode.ts");
  const { createScaffold } = await import("./scaffold.ts");
  const { buildProviderConfig } = await import("./provider.ts");

  let scaffold: { dir: string; cleanup(): Promise<void> } | undefined;
  try {
    const opencodeBin = detectOpencode().bin;
    // opencode 配置的 provider 必须是「providerID → 配置」映射(scaffold 测试同款
    // 结构);buildProviderConfig() 返回 provider.deepseek 整段,故需嵌套到 deepseek 键下
    scaffold = await createScaffold({ provider: { deepseek: buildProviderConfig() } });
    const result = await runCommandCheck({ dir: scaffold.dir, opencodeBin });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (err) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          output: "",
          toolCalls: [],
          reason: err instanceof Error ? err.message : String(err),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await scaffold?.cleanup();
    console.error("[cleanup] 临时目录已清理");
  }
}
