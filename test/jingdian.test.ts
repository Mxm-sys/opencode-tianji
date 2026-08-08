/**
 * jingdian(经传查注)插件测试。
 * 运行: cd /home/mxm/桌面/fun/占卜/opencode-tianji && bun test test/jingdian.test.ts
 */
import { test, expect, beforeAll } from "bun:test";
import jingdianPlugin from "../plugins/jingdian";

const ctx = {
  sessionID: "test", messageID: "m1", agent: "test",
  directory: process.cwd(), worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {}, ask: async () => {},
} as never;

let tools: Record<string, { execute: (...a: any[]) => Promise<string> }>;

beforeAll(async () => {
  const hooks = await jingdianPlugin({} as never, {});
  tools = hooks.tool;
});

test("1. 插件默认导出含 chazhu 工具", () => {
  expect(Object.keys(tools)).toEqual(["chazhu"]);
});

test("2. chazhu 乾(默认全部) → 含 卦辞注/序卦/彖传/大象/总结", async () => {
  const r = await tools.chazhu.execute({ 卦名: "乾" }, ctx);
  expect(r).toContain("乾");
  expect(r).toContain("卦辞注");          // 朱熹注
  expect(r).toContain("文言曰注");        // 乾有文言曰注
  expect(r).toContain("序卦");            // 十翼
  expect(r).toContain("杂卦");
  expect(r).toContain("彖传");            // 彖传大象
  expect(r).toContain("大象");
  expect(r).toContain("天行健");
  expect(r).toContain("【总结】");        // 白话总结
  expect(r).toContain("仅供参考");        // 免责
  expect(r).toContain("[口径]");          // 口径披露
  expect(r).toContain("books/08_周易本义.json");
});

test("3. chazhu 乾 范围=朱熹卦爻注 → 含卦辞注/爻注,不含 序卦/彖传", async () => {
  const r = await tools.chazhu.execute({ 卦名: "乾", 范围: "朱熹卦爻注" }, ctx);
  expect(r).toContain("卦辞注");
  expect(r).toContain("初九");
  expect(r).not.toContain("序卦位次");
  expect(r).not.toContain("彖传");
});

test("4. chazhu 乾 范围=十翼 → 序卦找到乾(第1位)且含文言传", async () => {
  const r = await tools.chazhu.execute({ 卦名: "乾", 范围: "十翼" }, ctx);
  expect(r).toContain("序卦第1位");
  expect(r).toContain("杂卦");
  expect(r).toContain("文言传首段");      // 乾附文言
  expect(r).not.toContain("卦辞注");
});

test("5. chazhu 乾 范围=彖传大象 → 含彖传/大象,不含朱熹注", async () => {
  const r = await tools.chazhu.execute({ 卦名: "乾", 范围: "彖传大象" }, ctx);
  expect(r).toContain("彖传");
  expect(r).toContain("大象");
  expect(r).not.toContain("卦辞注");
});

test("6. chazhu 需 范围=全部 → 朱熹注在卷一·上经,序卦第5位,含杂卦", async () => {
  const r = await tools.chazhu.execute({ 卦名: "需" }, ctx);
  expect(r).toContain("卷一·上经");
  expect(r).toContain("序卦第5位");
  expect(r).toContain("杂卦");
});

test("7. chazhu 乾 动爻[1] → 爻注初九高亮 ★动★", async () => {
  const r = await tools.chazhu.execute({ 卦名: "乾", 范围: "朱熹卦爻注", 动爻: [1] }, ctx);
  expect(r).toContain("初九");
  expect(r).toContain("★动★");
});

test("8. chazhu 未存在卦 → 抛错", async () => {
  await expect(tools.chazhu.execute({ 卦名: "不存在卦" }, ctx)).rejects.toThrow("未找到卦");
});

test("9. chazhu 坤 范围=十翼 → 坤附文言传首段", async () => {
  const r = await tools.chazhu.execute({ 卦名: "坤", 范围: "十翼" }, ctx);
  expect(r).toContain("文言传首段");
  expect(r).toContain("杂卦");
});
