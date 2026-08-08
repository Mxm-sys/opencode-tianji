/**
 * dayan 大衍筮法测试(直接调用 dayanExecute)。
 * 运行: bun test test/dayan.test.ts
 */
import { test, expect } from "bun:test";
import { dayanExecute } from "../modules/dayan";

const ctx = {
  sessionID: "test", messageID: "m1", agent: "test", directory: process.cwd(),
  worktree: process.cwd(), abort: new AbortController().signal,
  metadata: () => {}, ask: async () => {},
} as never;

test("1. 同 seed 可复现同一卦(输出逐字节一致)", async () => {
  const a = await dayanExecute({ seed: "demo-2024" }, ctx);
  const b = await dayanExecute({ seed: "demo-2024" }, ctx);
  expect(a).toBe(b);
});

test("2. 输出含 本卦/变卦/动爻 关键行", async () => {
  const r = await dayanExecute({ seed: 42 }, ctx);
  expect(r).toContain("本卦:");
  expect(r).toContain("动爻位:");
  expect(r).toContain("变卦:");
  expect(r).toContain("卦辞:");
  expect(r).toContain("[总结]:");
  expect(r).toContain("仅供参考");
});

test("3. 六爻十八变生成不抛错(多 seed 循环)", async () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = await dayanExecute({ seed }, ctx);
    expect(r).toContain("初爻");
    expect(r).toContain("六爻");
  }
});

test("4. 数字 seed 与字符串 seed 均支持", async () => {
  const a = await dayanExecute({ seed: 7 }, ctx);
  expect(a).toContain("本卦:");
  const b = await dayanExecute({ seed: "乾为天" }, ctx);
  expect(b).toContain("本卦:");
});
