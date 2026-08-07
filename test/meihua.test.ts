/**
 * meihua 梅花易数体用断卦测试(不 mock,直接调用 meihuaExecute)。
 * 运行: cd /home/mxm/桌面/fun/占卜/opencode-tianji && bun test test/meihua.test.ts
 */
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { meihuaExecute } from "../plugins/meihua";

const ctx = {
  sessionID: "test",
  messageID: "m1",
  agent: "test",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
} as never;

test("1. 乾 动爻[1] → 体=乾(上卦)、用=巽(下卦变),乾金克巽木 → 体克用 → 吉", async () => {
  const r = await meihuaExecute({ 卦名: "乾", 动爻: [1] }, ctx);
  expect(r).toContain("体=乾");
  expect(r).toContain("用=巽");
  expect(r).toContain("体克用");
  expect(r).toContain("吉");
});

test("2. 坤 动爻[4] → 体=坤(下卦)、用=震(上卦变),震木克坤土 → 用克体 → 凶", async () => {
  const r = await meihuaExecute({ 卦名: "坤", 动爻: [4] }, ctx);
  expect(r).toContain("体=坤");
  expect(r).toContain("用=震");
  expect(r).toContain("用克体");
  expect(r).toContain("凶");
});

test("3. 艮 动爻[1] → 下卦艮初爻(阴)动变阳 → 离火,体=艮(土),离火生艮土 → 用生体 → 吉", async () => {
  const r = await meihuaExecute({ 卦名: "艮", 动爻: [1] }, ctx);
  expect(r).toContain("体=艮");
  expect(r).toContain("用=离");
  expect(r).toContain("用生体");
  expect(r).toContain("吉");
});

test("4. 无动爻 → 按常规处理且注明,不抛错,含 本卦", async () => {
  const r = await meihuaExecute({ 卦名: "乾" }, ctx);
  expect(r).toContain("本卦");
  expect(r).toContain("无动爻");
  expect(r).toContain("上卦为用、下卦为体");
});

test("5. 卦气旺衰:2024-07-10(夏·未月)体卦乾金 → 夏乾兑衰 → 输出含 衰", async () => {
  const r = await meihuaExecute({ 卦名: "乾", 动爻: [1], datetime: "2024-07-10" }, ctx);
  expect(r).toContain("夏");
  expect(r).toContain("体卦衰");
  expect(r).toContain("失令");
});

test("6. 十八类断辞:占事=婚姻 → 输出婚姻断辞原文/白话", async () => {
  const r = await meihuaExecute({ 卦名: "乾", 动爻: [1], 占事: "婚姻" }, ctx);
  expect(r).toContain("占事:婚姻");
  expect(r).toContain("婚易成");
  expect(r).toContain("[原文]:");
  expect(r).toContain("[白话]:");
});

test("7. meihua.json 两处 byte 一致", () => {
  const a = fs.readFileSync(path.resolve(import.meta.dir, "../data/meihua.json"));
  const b = fs.readFileSync(path.resolve(import.meta.dir, "../../知识库/data/meihua.json"));
  expect(a.equals(b)).toBe(true);
});

test("8. 输出含 [口径] 披露行", async () => {
  const r = await meihuaExecute({ 卦名: "乾", 动爻: [1] }, ctx);
  expect(r).toContain("[口径]");
  expect(r).toContain("astronomy-engine 天文算法");
});
