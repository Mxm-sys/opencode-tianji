/**
 * liuyao 增强测试:cha 的【朱熹注】/【序卦·杂卦】段 + duangua 的【相似卦例】段。
 * 运行: bun test test/liuyao_enhance.test.ts
 */
import { test, expect, describe, beforeAll } from "bun:test";
import liuyaoPlugin from "../modules/liuyao";

const ctx = {
  sessionID: "test", messageID: "m1", agent: "test",
  directory: process.cwd(), worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {}, ask: async () => {},
} as never;

let tools: Record<string, { execute: (...a: any[]) => Promise<string> }>;

beforeAll(async () => {
  const hooks = await liuyaoPlugin({} as never, {});
  tools = hooks.tool;
});

describe("cha 增强:朱熹注 + 序卦·杂卦", () => {
  test("cha 乾 → 含【朱熹注】段(卦辞注/爻注)与【序卦·杂卦】段", async () => {
    const r = await tools.cha.execute({ 卦名: "乾" }, ctx);
    expect(r).toContain("【朱熹注】");
    expect(r).toContain("卦辞注");
    expect(r).toContain("初九");
    expect(r).toContain("books/08_周易本义.json");   // 标注出处
    expect(r).toContain("【序卦·杂卦】");
    expect(r).toContain("序卦第1位");
    expect(r).toContain("杂卦");
    expect(r).toContain("文言传首段");                // 乾附文言
  });

  test("cha 乾 动爻[1] → 朱熹注爻注初九高亮", async () => {
    const r = await tools.cha.execute({ 卦名: "乾", 动爻: [1] }, ctx);
    expect(r).toMatch(/初九.*★动★/);
  });

  test("cha 需 → 序卦第5位,朱熹注含卷一·上经出处", async () => {
    const r = await tools.cha.execute({ 卦名: "需" }, ctx);
    expect(r).toContain("序卦第5位");
    expect(r).toContain("卷一·上经");
  });

  test("cha 既济 → 朱熹注含卷二·下经出处(卷二分卷验证)", async () => {
    const r = await tools.cha.execute({ 卦名: "既济" }, ctx);
    expect(r).toContain("【朱熹注】");
    expect(r).toContain("卷二·下经");
  });

  test("cha 输出仍保留原有卦辞/爻辞/易林段", async () => {
    const r = await tools.cha.execute({ 卦名: "乾", 动爻: [1, 2, 3, 4, 5, 6] }, ctx);
    expect(r).toContain("【卦辞】");
    expect(r).toContain("【爻辞】");
    expect(r).toContain("【焦氏易林】");
    expect(r).toContain("乾之坤");
    expect(r).toContain("[口径]");
  });
});

describe("duangua 增强:相似卦例", () => {
  test("duangua 乾 求财 → 含【相似卦例】段且来源标注书4/书6+行号", async () => {
    const r = await tools.duangua.execute({ 卦名: "乾", 占事: "求财" }, ctx);
    expect(r).toContain("【相似卦例】");
    expect(r).toContain("guaili.json");
    expect(r).toMatch(/书(4|6)/);
    expect(r).toContain("行");
    expect(r).toContain("白话解读");       // 古人怎么断
    expect(r).toContain("解卦任务书");     // 位置在其后
    expect(r.indexOf("解卦任务书")).toBeLessThan(r.indexOf("【相似卦例】"));
  });

  test("duangua 乾 求财 → 卦例库 381 则口径披露", async () => {
    const r = await tools.duangua.execute({ 卦名: "乾", 占事: "求财" }, ctx);
    expect(r).toMatch(/卦例库 \d+ 则/);
    expect(r).toContain("[口径]");
  });

  test("duangua 乾 功名 → 相似卦例匹配功名类", async () => {
    const r = await tools.duangua.execute({ 卦名: "乾", 占事: "功名" }, ctx);
    expect(r).toContain("【相似卦例】");
    expect(r).toContain("功名");
  });
});
