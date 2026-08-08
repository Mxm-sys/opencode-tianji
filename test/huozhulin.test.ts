/**
 * huozhulin 火珠林钱卜断占测试(不 mock,直接调用 huozhulinExecute)。
 * 运行: bun test test/huozhulin.test.ts
 */
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { huozhulinExecute } from "../modules/huozhulin";
import { mirrorTest } from "./helpers/mirror";

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

test("1. 占事=求财 → 命中 占求财 门类,输出 首句/原文/白话/来源", async () => {
  const r = await huozhulinExecute({ 占事: "求财" }, ctx);
  expect(r).toContain("占事: 求财");
  expect(r).toContain("占求财");
  expect(r).toContain("财来扶世");
  expect(r).toContain("[白话]:");
  expect(r).toContain("[来源]: 书3《火珠林》·占求财·行418-430");
});

test("2. 占事=病 → 模糊匹配 占疾病/病忌官鬼/占医药", async () => {
  const r = await huozhulinExecute({ 占事: "病" }, ctx);
  expect(r).toContain("占疾病");
  expect(r).toContain("病忌官鬼");
  expect(r).toContain("占医药");
});

test("3. 无匹配关键词 → 返回全部门类名列表", async () => {
  const r = await huozhulinExecute({ 占事: "不存在的事" }, ctx);
  expect(r).toContain("未匹配到");
  expect(r).toContain("占身命");
  expect(r).toContain("占求财");
});

test("4. 可选卦名参数:给出卦名输出参考卦行,不影响门类命中", async () => {
  const r = await huozhulinExecute({ 占事: "婚姻", 卦名: "乾" }, ctx);
  expect(r).toContain("参考卦: 乾");
  expect(r).toContain("占婚姻");
});

mirrorTest("5. huozhulin.json 两处 byte 一致", "data/huozhulin.json", (mirror) => {
  const a = fs.readFileSync(path.resolve(import.meta.dir, "../data/huozhulin.json"));
  const b = fs.readFileSync(mirror);
  expect(a.equals(b)).toBe(true);
});

test("6. 输出含 [口径] 披露行与免责声明", async () => {
  const r = await huozhulinExecute({ 占事: "出行" }, ctx);
  expect(r).toContain("[口径]");
  expect(r).toContain("仅供参考,现实决策请结合实际情况");
});
