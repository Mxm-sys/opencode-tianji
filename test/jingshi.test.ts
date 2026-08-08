/**
 * jingshi 京氏易传占测试(直接调用 jingshiExecute)。
 * 运行: cd /home/mxm/桌面/fun/占卜/opencode-tianji && bun test test/jingshi.test.ts
 */
import { test, expect } from "bun:test";
import * as db from "../lib/db";
import { jingshiExecute } from "../modules/jingshi";

const ctx = {
  sessionID: "test", messageID: "m1", agent: "test", directory: process.cwd(),
  worktree: process.cwd(), abort: new AbortController().signal,
  metadata: () => {}, ask: async () => {},
} as never;

test("1. 乾卦 → 输出含 宫/世应/伏神", async () => {
  const r = await jingshiExecute({ 卦名: "乾" }, ctx);
  expect(r).toContain("乾宫");
  expect(r).toContain("宫五行: 金");
  expect(r).toContain("世在六爻");
  expect(r).toContain("应在三爻");
  expect(r).toContain("伏卦 坤");
  expect(r).toContain("伏神 癸酉金(兄弟)");
});

test("2. 乾 + 求财 → 用神妻财显于卦中", async () => {
  const r = await jingshiExecute({ 卦名: "乾", 占事: "求财" }, ctx);
  expect(r).toContain("占事:求财");
  expect(r).toContain("妻财在卦中显见");
});

test("3. 姤 + 求财 → 妻财不上卦,看伏神(子孙非妻财)", async () => {
  const r = await jingshiExecute({ 卦名: "姤", 占事: "求财" }, ctx);
  expect(r).toContain("妻财不上卦");
  expect(r).toContain("子孙");
});

test("4. 64卦逐一可跑不抛错(循环)", async () => {
  const ff = db.loadJingshiFufu();
  expect(ff.length).toBe(64);
  for (const e of ff) {
    const r = await jingshiExecute({ 卦名: e.卦名 }, ctx);
    expect(r).toContain("京氏易传占");
    expect(r).toContain("飞伏神");
  }
});

test("5. 输出含 口径披露 与 免责声明", async () => {
  const r = await jingshiExecute({ 卦名: "乾" }, ctx);
  expect(r).toContain("[口径]");
  expect(r).toContain("仅供参考");
});
