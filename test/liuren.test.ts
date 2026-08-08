/**
 * liuren 小六壬占课测试(不 mock,直接调用 liurenTool.execute)。
 * 运行: bun test test/liuren.test.ts
 */
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { liurenTool } from "../modules/liuren";
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

const exec = (args: Record<string, unknown>): Promise<string> =>
  (liurenTool as never as { execute: (...a: any[]) => Promise<string> }).execute(args, ctx);

test("1. 正月(1)初一(1)子时 → 大安", async () => {
  // 月1→大安,日1→大安,时子=1→大安
  const r = await exec({ datetime: "2024-01-01 00:00" });
  expect(r).toContain("落宫: 大安");
  expect(r).toContain("【吉】");
});

test("2. 正月(1)初一(1)辰时 → 小吉", async () => {
  // 月1→大安,日1→大安,时辰=5:大安1→留连2→速喜3→赤口4→小吉5
  const r = await exec({ datetime: "2024-01-01 08:00" });
  expect(r).toContain("落宫: 小吉");
  expect(r).toContain("时(辰时)→ 小吉");
});

test("3. 二月(2)初三(3)午时 → 赤口", async () => {
  // 月2→留连,日3(自留连数3):留连1→速喜2→赤口3;时午=7(自赤口数7):赤口1→小吉2→空亡3→大安4→留连5→速喜6→赤口7
  const r = await exec({ datetime: "2024-02-03 12:00" });
  expect(r).toContain("落宫: 赤口");
  expect(r).toContain("时(午时)→ 赤口");
});

test("4. 用户报农历 month=6 day=6 @2024-02-10 12:00 → 小吉", async () => {
  // 月6→空亡,日6(自空亡数6):空亡1→大安2→留连3→速喜4→赤口5→小吉6;时午=7(自小吉数7):小吉1→空亡2→大安3→留连4→速喜5→赤口6→小吉7
  const r = await exec({ datetime: "2024-02-10 12:00", month: 6, day: 6 });
  expect(r).toContain("落宫: 小吉");
  expect(r).toContain("月(六月)→ 空亡");
  expect(r).toContain("日(初六)→ 小吉");
});

test("5. liuren.json 六宫字段完整", () => {
  const d = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "../data/liuren.json"), "utf8")) as {
    六宫: { 宫名: string; 五行: string; 吉凶: string; 断辞: string; 白话: string }[];
  };
  expect(d.六宫).toHaveLength(6);
  expect(d.六宫.map((g) => g.宫名)).toEqual(["大安", "留连", "速喜", "赤口", "小吉", "空亡"]);
  for (const g of d.六宫) {
    expect(g.宫名).toBeTruthy();
    expect(g.五行).toBeTruthy();
    expect(g.吉凶).toBeTruthy();
    expect(g.断辞).toBeTruthy();
    expect(g.白话).toBeTruthy();
  }
});

mirrorTest("6. 两处 liuren.json byte 级一致", "data/liuren.json", (mirror) => {
  const a = fs.readFileSync(path.join(import.meta.dir, "../data/liuren.json"));
  const b = fs.readFileSync(mirror);
  expect(a.equals(b)).toBe(true);
});

test("7. 输出含 [口径] 披露行", async () => {
  const r = await exec({ datetime: "2024-01-01 00:00" });
  expect(r).toContain("[口径]");
  expect(r).toContain("astronomy-engine 天文算法");
});
