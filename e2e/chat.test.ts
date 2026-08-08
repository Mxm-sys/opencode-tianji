/**
 * e2e/chat.test.ts — parseNdjsonTools / evaluateChat 单元测试(bun:test)
 *
 * 样本 NDJSON 模拟 opencode run --format json 的真实事件流:
 * 含 completed 状态的 tool_use(应收集)、error 状态的 tool_use(必须排除)、
 * 以及多条 text 事件(应取最后一条非空文本)。
 */

import { describe, expect, test } from "bun:test";

import { evaluateChat, parseNdjsonTools } from "./chat.ts";

function toolUseEvent(tool: string, status: string): string {
  return JSON.stringify({
    type: "tool_use",
    sessionID: "s1",
    messageID: "m1",
    part: {
      id: "p1",
      sessionID: "s1",
      messageID: "m1",
      type: "tool",
      callID: "c1",
      tool,
      state: { status },
    },
  });
}

function textEvent(text: string): string {
  return JSON.stringify({
    type: "text",
    sessionID: "s1",
    messageID: "m1",
    part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text },
  });
}

const NDJSON_SAMPLE = [
  textEvent("开始占卜……"),
  toolUseEvent("qigua", "completed"),
  toolUseEvent("qigua", "error"), // 失败重试或并发:error 状态必须被排除
  toolUseEvent("paipan", "completed"),
  textEvent("排盘结果……"),
  textEvent("【总结】此卦总体平稳,投资宜缓。"),
].join("\n");

describe("parseNdjsonTools", () => {
  test("收集 completed 的 tool_use,排除 error 状态", () => {
    const { toolCalls } = parseNdjsonTools(NDJSON_SAMPLE);
    expect(toolCalls).toEqual(["qigua", "paipan"]);
  });

  test("text 取最后一条非空文本事件", () => {
    const { text } = parseNdjsonTools(NDJSON_SAMPLE);
    expect(text).toBe("【总结】此卦总体平稳,投资宜缓。");
  });

  test("非 JSON 行与空行被忽略,不抛错", () => {
    const { toolCalls, text } = parseNdjsonTools(
      ["", "not-json", NDJSON_SAMPLE, "{broken"].join("\n"),
    );
    expect(toolCalls).toEqual(["qigua", "paipan"]);
    expect(text).toContain("【总结】");
  });

  test("完全无 tool_use / 无文本 → 空结果", () => {
    const { toolCalls, text } = parseNdjsonTools(
      [textEvent("hello"), toolUseEvent("bash", "completed")].join("\n"),
    );
    expect(toolCalls).toEqual(["bash"]);
    expect(text).toBe("hello");
  });
});

describe("evaluateChat", () => {
  test("空 toolCalls → false", () => {
    expect(evaluateChat([], "【总结】x")).toBe(false);
  });

  test("无任何天机工具(如只有 bash/question)→ false", () => {
    expect(evaluateChat(["bash"], "【总结】x")).toBe(false);
    expect(evaluateChat(["question"], "【总结】x")).toBe(false);
  });

  test("skill/question 等 core 工具前置调用被容忍(有 ≥1 天机工具即可)", () => {
    expect(evaluateChat(["skill", "qigua", "paipan"], "【总结】x")).toBe(true);
  });

  test("输出缺【总结】→ false", () => {
    expect(evaluateChat(["qigua"], "没有总结段")).toBe(false);
  });

  test("completed 天机工具 + 含【总结】→ true", () => {
    expect(evaluateChat(["qigua", "paipan", "duangua"], "…【总结】纯白话段…")).toBe(true);
  });
});
