/**
 * e2e/command.test.ts — command.ts 纯逻辑单元测试(bun:test)
 *
 * 只测 NDJSON 解析/错误检测/缺失判定等纯函数,不发起真实 LLM 对话
 * (真实路径由 QA 场景覆盖,见 .omo/evidence/tianji-opencode-e2e/task-6/)。
 */

import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "bun:test";

import {
  checkCommandPresence,
  collectTianjiToolCalls,
  evaluateCommandEvents,
  findCommandError,
  lastTextOutput,
  parseNdjsonEvents,
} from "./command.ts";
import { TIANJI_TOOLS } from "./tools.ts";

/** 构造一行 NDJSON(按 opencode run --format json 的事件形状)。 */
function ev(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

const sampleNdjson = [
  ev({ type: "step_start", part: { id: "s1" } }),
  ev({ type: "tool_use", part: { tool: "question", state: { status: "completed" } } }),
  ev({ type: "tool_use", part: { tool: "qigua", state: { status: "completed" } } }),
  ev({ type: "tool_use", part: { tool: "paipan", state: { status: "error", error: "boom" } } }),
  ev({ type: "tool_use", part: { tool: "cha", state: { status: "completed" } } }),
  ev({ type: "text", part: { text: "卦象已排,【总结】…" } }),
].join("\n");

describe("parseNdjsonEvents", () => {
  test("逐行解析 NDJSON,空行与非 JSON 行跳过", () => {
    const events = parseNdjsonEvents(sampleNdjson + "\n\nnot-json\n");
    expect(events.length).toBe(6);
    expect(events[0].type).toBe("step_start");
    expect(events[1].part?.tool).toBe("question");
  });
});

describe("collectTianjiToolCalls", () => {
  test("只统计 ∈ 天机 13 工具的调用,question 不计;completed/errored 分列", () => {
    const events = parseNdjsonEvents(sampleNdjson);
    const { completed, errored } = collectTianjiToolCalls(events, TIANJI_TOOLS);
    expect(completed).toEqual(["qigua", "cha"]);
    expect(errored).toEqual(["paipan"]);
  });
});

describe("findCommandError", () => {
  test("error 事件(如 Command not found)被检出", () => {
    const events = parseNdjsonEvents(
      ev({ type: "error", error: 'Command not found: "zhanbu". Available commands: …' }),
    );
    expect(findCommandError(events)).toContain("Command not found");
  });

  test("error 为对象形态({name, data:{message}})也被检出(实测 opencode 输出形状)", () => {
    const events = parseNdjsonEvents(
      ev({
        type: "error",
        error: {
          name: "UnknownError",
          data: { message: 'Command not found: "zhanbu". Available commands: …' },
        },
      }),
    );
    expect(findCommandError(events)).toContain("Command not found");
  });

  test("文本中出现 command not found / 中文找不到命令也被检出", () => {
    expect(
      findCommandError(parseNdjsonEvents(ev({ type: "text", part: { text: "Error: command not found" } }))),
    ).toContain("command not found");
    expect(
      findCommandError(parseNdjsonEvents(ev({ type: "text", part: { text: "找不到命令 zhanbu" } }))),
    ).toContain("找不到");
  });

  test("正常对话无 error 事件时返回 null", () => {
    expect(findCommandError(parseNdjsonEvents(sampleNdjson))).toBeNull();
  });
});

describe("evaluateCommandEvents", () => {
  test("completed 天机工具 ≥1(含 question 前置调用)→ ok=true,记实际调用", () => {
    const verdict = evaluateCommandEvents(parseNdjsonEvents(sampleNdjson));
    expect(verdict.ok).toBe(true);
    expect(verdict.toolCalls).toEqual(["qigua", "cha"]);
  });

  test("只有 question 调用、无天机工具 → 失败且 reason 为中文", () => {
    const onlyQuestion = [
      ev({ type: "tool_use", part: { tool: "question", state: { status: "completed" } } }),
    ].join("\n");
    const verdict = evaluateCommandEvents(parseNdjsonEvents(onlyQuestion));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("未检测到任何天机工具成功调用");
  });

  test("天机工具全部 error(无 completed)→ 失败且 reason 提及失败次数", () => {
    const allError = [
      ev({ type: "tool_use", part: { tool: "qigua", state: { status: "error" } } }),
    ].join("\n");
    const verdict = evaluateCommandEvents(parseNdjsonEvents(allError));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("1 次失败");
  });

  test("error 事件(命令未找到)优先于工具调用判定 → 失败", () => {
    const withError = sampleNdjson + "\n" + ev({ type: "error", error: 'Command not found: "zhanbu"' });
    const verdict = evaluateCommandEvents(parseNdjsonEvents(withError));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("Command not found");
  });
});

describe("lastTextOutput", () => {
  test("返回最后一条非空 text 事件内容", () => {
    const events = parseNdjsonEvents(
      [ev({ type: "text", part: { text: "第一段" } }), ev({ type: "text", part: { text: "【总结】终稿" } })].join("\n"),
    );
    expect(lastTextOutput(events)).toBe("【总结】终稿");
  });
});

describe("checkCommandPresence", () => {
  test("TIANJI_E2E_NO_COMMAND=1 强制缺失(即使目录存在)", () => {
    const reason = checkCommandPresence(os.tmpdir(), { TIANJI_E2E_NO_COMMAND: "1" });
    expect(reason).toContain("缺失");
  });

  test("目录无 .opencode/command/ → 缺失", () => {
    const emptyDir = path.join(os.tmpdir(), `tianji-e2e-nocmd-${Date.now()}`);
    const reason = checkCommandPresence(emptyDir, {});
    expect(reason).toContain("缺失");
    expect(reason).toContain(".opencode/command");
  });

  test("存在 .opencode/command/ 且 env 未强制 → 返回 null", async () => {
    const { createScaffold } = await import("./scaffold.ts");
    const s = await createScaffold({});
    try {
      expect(checkCommandPresence(s.dir, {})).toBeNull();
    } finally {
      await s.cleanup();
    }
  });
});
