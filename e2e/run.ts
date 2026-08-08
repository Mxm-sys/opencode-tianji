/**
 * e2e/run.ts — E2E 套件主入口编排(Todo 7)
 *
 * 严格按运行序列编排全部阶段(顺序即依赖,不可颠倒):
 *   1. detect   — detectOpencode() 探测 opencode 二进制(≥1.18);
 *   2. provider — buildProviderConfig() 读取 deepseek provider(含 apiKey,只内部传递);
 *   3. scaffold — createScaffold({ provider: { deepseek: provider } }) 建隔离临时项目。
 *                 注意:opencode 的 provider 配置是「providerID → 配置」映射,
 *                 buildProviderConfig() 返回的是 provider.deepseek 整段,
 *                 必须嵌套到 deepseek 键下(chat.ts main / tools.ts ensureProviderWrapped
 *                 实测验证过的形态,否则 ConfigInvalidError);
 *   4. tools    — verifyToolsRegistered({ dir, opencodeBin }) 验证 13 工具注册;
 *   5. chat     — runRealChat({ dir, opencodeBin }) 真实 LLM 对话(消费少量 API);
 *   6. command  — runCommandCheck({ dir, opencodeBin }) 真实执行 /zhanbu 命令。
 *
 * 汇总 JSON 报告写 .omo/evidence/tianji-opencode-e2e/report.json 并打印 stdout;
 * 任一阶段失败 → 中文错误 + 非零退出码;finally 总是执行 scaffold.cleanup()。
 *
 * Flags:
 *   --skip-llm  等价 TIANJI_E2E_SKIP_LLM=1(chat/command 阶段返回 skipped,零费用);
 *   --keep      失败时保留临时目录供排查并打印路径(否则 finally 一律清理)。
 *
 * 密钥安全:provider 记录必须经 sanitizeProviderForLog 脱敏后才进报告/日志,
 * apiKey 明文不得出现在报告、stdout、证据中。
 *
 * 退出码用 process.exitCode 而非 process.exit:同步退出会跳过 finally,
 * 导致 cleanup 不执行、临时目录泄漏(此前实测踩过的坑)。
 */
import * as path from "node:path";
import { chmod, mkdir, writeFile } from "node:fs/promises";

import { detectOpencode } from "./opencode.ts";
import { buildProviderConfig, sanitizeProviderForLog } from "./provider.ts";
import { createScaffold, repoRoot } from "./scaffold.ts";
import { verifyToolsRegistered } from "./tools.ts";
import { runRealChat } from "./chat.ts";
import { runCommandCheck } from "./command.ts";

/** 报告路径:证据根目录下固定文件名(验收点)。 */
const REPORT_PATH = path.join(
  repoRoot,
  ".omo",
  "evidence",
  "tianji-opencode-e2e",
  "report.json",
);
/** 本任务证据目录(命令记录、NDJSON 原文、输出)。 */
const TASK7_EVIDENCE_DIR = path.join(
  repoRoot,
  ".omo",
  "evidence",
  "tianji-opencode-e2e",
  "task-7",
);

/** 默认模型 id(与 chat.ts / command.ts 保持一致)。 */
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/** 统一把异常转成可读文本(报告/日志用,不含 apiKey)。 */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 报告形状:各阶段 ok/失败明细 + 汇总(ok/skipped/耗时/model)。 */
interface Report {
  stages: {
    detect: { ok: boolean; bin?: string; version?: string; error?: string };
    provider: { ok: boolean; redacted?: Record<string, unknown>; error?: string };
    scaffold: { dir: string; error?: string };
    tools: {
      ok?: boolean;
      ids?: string[];
      missing?: string[];
      port?: number;
      error?: string;
    };
    chat: {
      ok?: boolean;
      toolCalls?: string[];
      output?: string;
      skipped?: boolean;
      error?: string;
    };
    command: {
      ok?: boolean;
      toolCalls?: string[];
      skipped?: boolean;
      reason?: string;
      error?: string;
    };
  };
  ok: boolean;
  elapsedMs: number;
  model: string;
  skipped: boolean;
}

async function main(): Promise<void> {
  const startMs = Date.now();
  const args = process.argv.slice(2);
  const skipLlm = args.includes("--skip-llm");
  const keep = args.includes("--keep");

  // --skip-llm 等价 TIANJI_E2E_SKIP_LLM=1:chat/command 阶段据此返回 skipped
  if (skipLlm) process.env.TIANJI_E2E_SKIP_LLM = "1";

  const model = process.env.TIANJI_E2E_MODEL ?? DEFAULT_MODEL;
  console.error(`[run] 开始 E2E 全流程(模型:${model}${skipLlm ? ",skip-llm 模式" : ""})`);

  const report: Report = {
    stages: {
      detect: { ok: false },
      provider: { ok: false },
      scaffold: { dir: "" },
      tools: {},
      chat: {},
      command: {},
    },
    ok: false,
    elapsedMs: 0,
    model,
    skipped: false,
  };

  let scaffold: { dir: string; cleanup(): Promise<void> } | null = null;
  let anyStageFailed = false;

  // 阶段序列抽成闭包:内部 return 只中止后续阶段,
  // 主流程在 finally 清理后仍继续写报告、设退出码(绝不在 try 里 return 跳出 main)。
  // 闭包末尾 return scaffold:让主流程的 `scaffold = await runStages()` 赋值对
  // 控制流分析可见,finally 里 `scaffold.dir` 才能正确收窄(直接捕获赋值会窄成 never)。
  const runStages = async (): Promise<{ dir: string; cleanup(): Promise<void> } | null> => {
    // ── 阶段 1:detect(探测 opencode 二进制,失败抛中文错误)──
    try {
      const info = detectOpencode();
      report.stages.detect = { ok: true, bin: info.bin, version: info.version };
      console.error(`[detect] 通过:opencode ${info.version}(${info.bin})`);
    } catch (err) {
      report.stages.detect = { ok: false, error: errMsg(err) };
      anyStageFailed = true;
      console.error(`[detect] 失败:${errMsg(err)}`);
      return scaffold;
    }

    // ── 阶段 2:provider(读取 deepseek 配置;apiKey 仅内部传递)──
    let provider: Record<string, unknown>;
    try {
      provider = buildProviderConfig();
      // 脱敏后才允许进报告:apiKey → "***"
      report.stages.provider = { ok: true, redacted: sanitizeProviderForLog(provider) };
      console.error("[provider] 通过(apiKey 已脱敏)");
    } catch (err) {
      report.stages.provider = { ok: false, error: errMsg(err) };
      anyStageFailed = true;
      console.error(`[provider] 失败:${errMsg(err)}`);
      return scaffold;
    }

    // ── 阶段 3:scaffold(建隔离临时项目;provider 必须嵌套到 deepseek 键下)──
    try {
      // createScaffold 内部失败会自清理并抛中文错误
      scaffold = await createScaffold({ provider: { deepseek: provider } });
      report.stages.scaffold = { dir: scaffold.dir };
      console.error(`[scaffold] 通过:临时项目 ${scaffold.dir}`);
    } catch (err) {
      report.stages.scaffold = { dir: "", error: errMsg(err) };
      anyStageFailed = true;
      console.error(`[scaffold] 失败:${errMsg(err)}`);
      return scaffold;
    }

    // ── 阶段 4:tools(真实 serve + /experimental/tool/ids 验证 13 工具注册)──
    try {
      const res = await verifyToolsRegistered({ dir: scaffold.dir, opencodeBin: report.stages.detect.bin! });
      report.stages.tools = {
        ok: res.missing.length === 0,
        ids: res.ids,
        missing: res.missing,
        port: res.port,
      };
      console.error(
        `[tools] ${report.stages.tools.ok ? "通过" : "失败"}:端口 ${res.port},` +
          `注册 ${res.ids.length} 个工具,缺 ${res.missing.length} 个`,
      );
    } catch (err) {
      report.stages.tools = { ok: false, error: errMsg(err) };
      anyStageFailed = true;
      console.error(`[tools] 失败:${errMsg(err)}`);
      return scaffold;
    }

    // ── 阶段 5:chat(真实 LLM 对话;--skip-llm 时返回 skipped)──
    try {
      const res = await runRealChat({ dir: scaffold.dir, opencodeBin: report.stages.detect.bin! });
      report.stages.chat = {
        ok: res.ok,
        toolCalls: res.toolCalls,
        output: res.output,
        skipped: res.skipped,
      };
      // NDJSON 原文留证(仅非跳过时存在)
      if (!res.skipped && res.rawNdjson) {
        await saveNdjson("ndjson-chat.jsonl", res.rawNdjson);
      }
      console.error(
        `[chat] ${res.skipped ? "跳过" : res.ok ? "通过" : "失败"}:` +
          `工具调用 ${res.toolCalls.length} 次`,
      );
    } catch (err) {
      report.stages.chat = { ok: false, error: errMsg(err) };
      anyStageFailed = true;
      console.error(`[chat] 失败:${errMsg(err)}`);
      return scaffold;
    }

    // ── 阶段 6:command(真实执行 /zhanbu 命令;--skip-llm 时返回 skipped)──
    try {
      // command.ts 支持 TIANJI_E2E_NDJSON_FILE:非空时把 NDJSON 原文写入该文件留证
      const ndjsonCommandPath = path.join(TASK7_EVIDENCE_DIR, "ndjson-command.jsonl");
      const prevNdjsonFile = process.env.TIANJI_E2E_NDJSON_FILE;
      process.env.TIANJI_E2E_NDJSON_FILE = ndjsonCommandPath;
      try {
        const res = await runCommandCheck({ dir: scaffold.dir, opencodeBin: report.stages.detect.bin! });
        report.stages.command = {
          ok: res.ok,
          toolCalls: res.toolCalls,
          skipped: res.skipped,
          reason: res.reason,
        };
        console.error(
          `[command] ${res.skipped ? "跳过" : res.ok ? "通过" : "失败"}:` +
            `工具调用 ${res.toolCalls.length} 次`,
        );
      } finally {
        // 还原调用方环境,不留副作用
        if (prevNdjsonFile === undefined) delete process.env.TIANJI_E2E_NDJSON_FILE;
        else process.env.TIANJI_E2E_NDJSON_FILE = prevNdjsonFile;
      }
    } catch (err) {
      report.stages.command = { ok: false, error: errMsg(err) };
      anyStageFailed = true;
      console.error(`[command] 失败:${errMsg(err)}`);
      return scaffold;
    }

    // ── 汇总 ──
    // ok = 无阶段抛错 && tools 无缺失 && chat.ok && command.ok(跳过视为通过)
    const toolsOk = report.stages.tools.ok === true;
    const chatOk = report.stages.chat.ok === true;
    const commandOk = report.stages.command.ok === true;
    report.ok = !anyStageFailed && toolsOk && chatOk && commandOk;
    report.skipped =
      report.stages.chat.skipped === true || report.stages.command.skipped === true;
    console.error(
      `[run] 阶段全部完成:${report.ok ? "通过" : "失败"}(耗时 ${Date.now() - startMs}ms)`,
    );
    return scaffold;
  };

  try {
    scaffold = await runStages();
  } finally {
    // 清理:默认总是执行;--keep 且失败时保留目录供排查并打印路径。
    // 失败判定用 report.ok(阶段返回 ok:false 也算失败,不能只看抛错)
    report.elapsedMs = Date.now() - startMs;
    if (keep && !report.ok && scaffold) {
      console.error(`[keep] 运行失败,保留临时目录供排查:${scaffold.dir}`);
      console.error(`[keep] 排查后可手动删除:rm -rf '${scaffold.dir}'`);
    } else {
      await scaffold?.cleanup();
      console.error("[cleanup] 临时目录已清理");
    }
  }

  // ── 写报告(所有路径都会执行;provider 段已脱敏)──
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  await chmod(REPORT_PATH, 0o600);
  console.log(JSON.stringify(report, null, 2));

  // 退出码:ok 为 0,否则 1(用 exitCode,不用 process.exit,保证 finally 清理已执行)
  if (!report.ok) process.exitCode = 1;
}

/** 保存 NDJSON 证据原文到 task-7 目录(仅非跳过时调用)。 */
async function saveNdjson(fileName: string, content: string): Promise<void> {
  await mkdir(TASK7_EVIDENCE_DIR, { recursive: true });
  const p = path.join(TASK7_EVIDENCE_DIR, fileName);
  await writeFile(p, content, { mode: 0o600 });
  await chmod(p, 0o600);
  console.error(`[evidence] NDJSON 原文已保存:${p}`);
}

// CLI 入口守卫:被 import 时不执行(本模块不导出任何函数)
if (import.meta.main) {
  main().catch((err) => {
    console.error(`e2e/run.ts 失败:${errMsg(err)}`);
    // 同样用 exitCode:main() 的 finally 清理必然执行,临时目录不泄漏
    process.exitCode = 1;
  });
}
