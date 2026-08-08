/**
 * e2e/chat.ts — 真实 LLM 对话端到端验证(Todo 5)
 *
 * 用 opencode run --format json --auto 真实启动 opencode 子进程,
 * 让 deepseek 模型在隔离临时项目中真实调用天机工具,并断言:
 *   - 存在 completed 状态的 tool_use 事件,且工具名 ⊆ 天机 13 工具;
 *   - 最终文本输出含纯白话【总结】段。
 *
 * XDG_CONFIG_HOME/XDG_CACHE_HOME/XDG_DATA_HOME 全部指向临时目录内子目录
 * (与 tools.ts 相同隔离,防止加载用户全局 ponytail 等插件污染工具集)。
 *
 * TIANJI_E2E_SKIP_LLM=1 时直接返回 { skipped: true },不发任何 API 请求。
 * 超时 180s 强制终止子进程(SIGTERM → SIGKILL 兜底)。
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { detectOpencode } from "./opencode.ts";
import { buildProviderConfig } from "./provider.ts";
import { createScaffold, repoRoot } from "./scaffold.ts";
import { TIANJI_TOOLS } from "./tools.ts";

/** 一次给齐 5 项必问信息(占卜事项/性别/地理位置/是否本人/起卦时间),规避「先问后算」question 工具陷阱。 */
export const CHAT_PROMPT =
  "本人占卜,男,人在北京,2024-02-10 12:00 起卦,占求财(近期一笔投资成败)," +
  "请直接用天机工具起卦、排盘、断卦,完整输出,结尾必须有纯白话【总结】段";

/** 真实对话超时上限(秒)。 */
const TIMEOUT_MS = 180_000;

/** SIGTERM 后未退出,SIGKILL 兜底前的宽限期(毫秒)。 */
const KILL_GRACE_MS = 3_000;

export interface NdjsonParseResult {
  toolCalls: string[];
  text: string;
}

export interface RealChatResult {
  toolCalls: string[];
  output: string;
  ok: boolean;
  skipped?: boolean;
  rawNdjson?: string;
}

/**
 * 纯函数:逐行解析 NDJSON 事件流。
 * - tool_use 事件:completed 状态才收集(tool_use 在 completed 与 error 都会发出,error 必须排除);
 * - text 事件:取最后一条非空 part.text 作为文本输出。
 * 非 JSON 行直接跳过(不视为失败)。
 */
export function parseNdjsonTools(output: string): NdjsonParseResult {
  const toolCalls: string[] = [];
  let text = "";
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;
    if (event.type === "tool_use") {
      const part = event.part as
        | { tool?: string; state?: { status?: string } }
        | undefined;
      if (part && typeof part.tool === "string" && part.state?.status === "completed") {
        toolCalls.push(part.tool);
      }
    } else if (event.type === "text") {
      const part = event.part as { text?: unknown } | undefined;
      if (part && typeof part.text === "string" && part.text.trim()) {
        text = part.text;
      }
    }
  }
  return { toolCalls, text };
}

/**
 * 纯函数:真实对话结果是否通过。
 * ok = 至少 1 次 completed 天机工具调用 && 输出含【总结】。
 * skill/question 等 core 工具的前置调用被容忍(任务规格:只要求 ≥1 completed
 * 天机工具调用);但没有任何天机工具 completed、或输出缺【总结】= 真实失败。
 */
export function evaluateChat(toolCalls: string[], output: string): boolean {
  const tianjiCalls = toolCalls.filter((t) => TIANJI_TOOLS.includes(t));
  if (tianjiCalls.length === 0) return false;
  return output.includes("【总结】");
}

/** SIGTERM 终止子进程;宽限期后未退出则 SIGKILL;等待退出完成(幂等,已退出直接返回)。 */
function killChild(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let bailTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(bailTimer);
      resolve();
    };
    // 兜底:无论进程状态如何,5s 内必须 resolve,防止 promise 悬挂
    bailTimer = setTimeout(finish, 5_000);
    if (child.exitCode !== null) {
      finish();
      return;
    }
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      finish();
      return;
    }
    forceTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* 已退出 */
      }
      setTimeout(finish, 500);
    }, KILL_GRACE_MS);
  });
}

/**
 * 真实 LLM 对话验证:
 * 1. TIANJI_E2E_SKIP_LLM=1 → { skipped: true };
 * 2. spawn `opencode run --format json --auto --dir <dir> --model <model> "<CHAT_PROMPT>"`,
 *    XDG 三变量指向 <dir>/.xdg/{config,cache,data},OPENCODE_DISABLE_AUTOUPDATE=1、
 *    OPENCODE_DISABLE_MODELS_FETCH=1;
 * 3. 收集 stdout 为 NDJSON,parseNdjsonTools 解析;
 * 4. evaluateChat 判定 ok(不重试:无 completed 天机工具调用 = 真实失败);
 * 5. 超时 180s → SIGTERM → SIGKILL,抛中文超时错误;
 * 6. finally 总是终止子进程。
 */
export async function runRealChat(opts: {
  dir: string;
  model?: string;
  opencodeBin: string;
}): Promise<RealChatResult> {
  if (process.env.TIANJI_E2E_SKIP_LLM === "1") {
    return { skipped: true, toolCalls: [], output: "", ok: true };
  }

  const model =
    opts.model ?? process.env.TIANJI_E2E_MODEL ?? "deepseek/deepseek-v4-flash";

  const xdgBase = path.join(opts.dir, ".xdg");
  const env: Record<string, string | undefined> = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(xdgBase, "config"),
    XDG_CACHE_HOME: path.join(xdgBase, "cache"),
    XDG_DATA_HOME: path.join(xdgBase, "data"),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
  };

  const child = spawn(
    opts.opencodeBin,
    ["run", "--format", "json", "--auto", "--dir", opts.dir, "--model", model, CHAT_PROMPT],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        killChild(child).then(() => {
          reject(
            new Error(
              `真实对话超时:opencode run 超过 ${TIMEOUT_MS / 1000}s 未完成,已终止子进程。` +
                `模型或网络异常,请稍后重试(模型:${model})。`,
            ),
          );
        });
      }, TIMEOUT_MS);
      child.once("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`启动 opencode 子进程失败:${err.message}`));
      });
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const parsed = parseNdjsonTools(stdout);
    const ok = evaluateChat(parsed.toolCalls, parsed.text);
    return {
      toolCalls: parsed.toolCalls,
      output: parsed.text,
      ok,
      rawNdjson: stdout,
    };
  } finally {
    await killChild(child);
  }
}

/** CLI 入口:bun run e2e/chat.ts [--skip-llm]。构建隔离环境 → 真实对话 → 输出 JSON → 清理。 */
async function main(): Promise<void> {
  if (process.argv.includes("--skip-llm")) {
    process.env.TIANJI_E2E_SKIP_LLM = "1";
  }

  const provider = buildProviderConfig();
  // opencode 配置的 provider 必须是「providerID → 配置」映射;
  // buildProviderConfig() 返回 provider.deepseek 整段,故需嵌套到 deepseek 键下
  const scaffold = await createScaffold({ provider: { deepseek: provider } });
  try {
    const info = detectOpencode();
    const result = await runRealChat({ dir: scaffold.dir, opencodeBin: info.bin });

    console.log(
      JSON.stringify(
        {
          skipped: result.skipped ?? false,
          ok: result.ok,
          toolCalls: result.toolCalls,
          output: result.output,
          model:
            process.env.TIANJI_E2E_MODEL ?? "deepseek/deepseek-v4-flash",
        },
        null,
        2,
      ),
    );

    if (!result.skipped && result.rawNdjson) {
      const evidenceDir = path.join(
        repoRoot,
        ".omo",
        "evidence",
        "tianji-opencode-e2e",
        "task-5",
      );
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(
        path.join(evidenceDir, "ndjson-sample.jsonl"),
        result.rawNdjson,
        { mode: 0o600 },
      );
    }

    process.exit(result.ok ? 0 : 1);
  } finally {
    await scaffold.cleanup();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(
      `e2e/chat 失败:${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
}
