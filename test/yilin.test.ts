/**
 * yilin 焦氏易林占测试(直接调用 yilinExecute)。
 * 运行: bun test test/yilin.test.ts
 */
import { test, expect } from "bun:test";
import { yilinExecute } from "../modules/yilin";

const ctx = {
  sessionID: "test", messageID: "m1", agent: "test", directory: process.cwd(),
  worktree: process.cwd(), abort: new AbortController().signal,
  metadata: () => {}, ask: async () => {},
} as never;

test("1. 乾之坤 → 返回易林乾之坤条目(含诗与出处)", async () => {
  const r = await yilinExecute({ 本卦: "乾", 之卦: "坤" }, ctx);
  expect(r).toContain("乾之坤");
  expect(r).toContain("招殃");
  expect(r).toContain("焦氏易林·乾之");
  expect(r).toContain("第10行");
});

test("2. 之卦缺失且无动爻 → 按之本卦处理,不抛错", async () => {
  const r = await yilinExecute({ 本卦: "乾" }, ctx);
  expect(r).toContain("乾之乾");
  expect(r).toContain("道陟石阪");
});

test("3. 有动爻 → 按变卦推所之卦", async () => {
  // 乾初爻动 → 姤(乾初九变阴)
  const r = await yilinExecute({ 本卦: "乾", 动爻: [1] }, ctx);
  expect(r).toContain("乾之姤");
});

test("4. 随机所之卦(同 seed 可复现)", async () => {
  const a = await yilinExecute({ 本卦: "乾", 随机: true, seed: 9 }, ctx);
  const b = await yilinExecute({ 本卦: "乾", 随机: true, seed: 9 }, ctx);
  expect(a).toBe(b);
  expect(a).toContain("所之卦:");
});

test("5. 64 本卦逐一可跑不抛错", async () => {
  const names = ["乾", "坤", "屯", "蒙", "需", "讼", "师", "比", "小畜", "履", "泰", "否", "同人", "大有", "谦", "豫",
    "随", "蛊", "临", "观", "噬嗑", "贲", "剥", "复", "无妄", "大畜", "颐", "大过", "坎", "离", "咸", "恒",
    "遁", "大壮", "晋", "明夷", "家人", "睽", "蹇", "解", "损", "益", "夬", "姤", "萃", "升", "困", "井",
    "革", "鼎", "震", "艮", "渐", "归妹", "丰", "旅", "巽", "兑", "涣", "节", "中孚", "小过", "既济", "未济"];
  for (const n of names) {
    const r = await yilinExecute({ 本卦: n }, ctx);
    expect(r).toContain("易林诗");
  }
});
