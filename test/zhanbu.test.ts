/**
 * zhanbu 插件测试(不 mock,直接调用各工具 execute)。
 * 运行: cd /home/mxm/桌面/fun/占卜 && bun test test/zhanbu.test.ts
 */
import { test, expect, beforeAll } from "bun:test";
import zhanbuPlugin from "../plugins/zhanbu";

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

let tools: Record<string, { execute: (...a: any[]) => Promise<string> }>;

beforeAll(async () => {
  const hooks = await zhanbuPlugin({} as never, {});
  tools = hooks.tool;
});

test("1. 插件默认导出返回 {tool} 且含 7 个工具", async () => {
  expect(Object.keys(tools)).toEqual(["qigua", "paipan", "duangua", "cha", "meihua", "bazi", "liuren"]);
});

test("1. qigua manual 乾 无动爻 → 卦名/卦符/世应/卦辞", async () => {
  const r = await tools.qigua.execute({ method: "manual", 卦名: "乾" }, ctx);
  expect(r).toContain("乾");
  expect(r).toContain("䷀");
  expect(r).toContain("世在六爻");
  expect(r).toContain("应在三爻");
  expect(r).toContain("元亨");
  expect(r).toContain("利貞");
});

test("2. qigua manual 乾 动爻[1,3] → 变卦为 讼(天水讼)", async () => {
  // 乾初九、九三阳变阴:下卦 ☰→☵(坎),上卦仍 ☰ → 乾上坎下 = 天水讼
  const r = await tools.qigua.execute({ method: "manual", 卦名: "乾", 动爻: [1, 3] }, ctx);
  expect(r).toMatch(/变卦: 讼/);
  expect(r).toContain("乾上坎下"); // 讼 = 乾上坎下
  expect(r).toContain("动爻位: 初爻、三爻");
});

test("3. paipan 乾 动爻[1] @2024-02-10 12:00 → 六神/纳甲/旬空", async () => {
  const r = await tools.paipan.execute(
    { 卦名: "乾", 动爻: [1], datetime: "2024-02-10 12:00" },
    ctx,
  );
  expect(r).toContain("世在六爻");
  expect(r).toContain("应在三爻");
  expect(r).toContain("初爻"); // 甲日起青龙,初爻青龙
  expect(r).toContain("青龙");
  expect(r).toContain("甲子"); // 初爻纳甲甲子
  expect(r).toContain("甲辰日"); // 2024-02-10 = 甲辰日
  expect(r).toMatch(/甲辰旬/);
  expect(r).toContain("空[寅、卯]"); // 甲辰旬空寅卯
  expect(r).toContain("卦身");
});

test("4. paipan 坤 → 初爻乙未 六亲兄弟", async () => {
  const r = await tools.paipan.execute({ 卦名: "坤" }, ctx);
  expect(r).toContain("乙未");
  expect(r).toContain("兄弟");
});

test("5. duangua 乾 求财 → 妻财取用说明", async () => {
  const r = await tools.duangua.execute({ 卦名: "乾", 占事: "求财" }, ctx);
  expect(r).toContain("妻财为用神");
  expect(r).toContain("妻财");
  expect(r).toContain("docs/07");
});

test("6. cha 乾 动爻[1..6] → 卦辞/爻辞/用九/易林乾之坤", async () => {
  // 六爻齐动 → 变卦坤 → 易林「乾之坤」
  const r = await tools.cha.execute({ 卦名: "乾", 动爻: [1, 2, 3, 4, 5, 6] }, ctx);
  expect(r).toContain("元亨");
  expect(r).toContain("利貞");
  expect(r).toContain("潛龍");
  expect(r).toContain("用九");
  expect(r).toMatch(/乾之坤/);
  expect(r).toContain("招殃來螫"); // 乾之坤 诗首句
});

test("7. cha 大有 → 含大有爻辞且不抛错", async () => {
  const r = await tools.cha.execute({ 卦名: "大有" }, ctx);
  expect(r).toContain("大有");
  expect(r).toContain("爻辞");
});

test("8. qigua time @2024-02-10 12:00 → 地山谦(确定值)", async () => {
  // 年支辰=5 + 寅月=1 + 日10 = 16;上卦16%8=坤;+午时7=23;下卦23%8=艮;动爻23%6=5
  const r = await tools.qigua.execute({ method: "time", datetime: "2024-02-10 12:00" }, ctx);
  expect(r).toContain("卦");
  expect(r).toContain("谦"); // 坤上艮下 = 地山谦
  expect(r).toContain("坤上艮下");
  expect(r).toContain("动爻位: 五爻");
});

test("9. qigua coins → 不抛错且含动爻信息", async () => {
  const r = await tools.qigua.execute({ method: "coins" }, ctx);
  expect(r).toContain("动爻");
  expect(r).toMatch(/老阳|老阴|少阳|少阴/);
  expect(r).toContain("本卦");
});

test("10. 插件默认导出含 7 个工具", async () => {
  expect(Object.keys(tools)).toEqual(["qigua", "paipan", "duangua", "cha", "meihua", "bazi", "liuren"]);
});

test("11. qigua shu 报数 [7,3,15] → 确定卦", async () => {
  // 上卦=7%8=艮,下卦=3%8=离(先天数3=离),动爻=15%6=3 → 山火贲,三爻动
  const r = await tools.qigua.execute({ method: "shu", 数: [7, 3, 15] }, ctx);
  expect(r).toContain("艮");
  expect(r).toContain("离");
  expect(r).toContain("贲"); // 艮上离下 = 山火贲
  expect(r).toContain("三爻");
});

test("12. qigua shu 缺数 → 抛错提示", async () => {
  await expect(tools.qigua.execute({ method: "shu" }, ctx)).rejects.toThrow("数");
});

test("13. qigua zi 字「中」→ 不抛错含本卦", async () => {
  const r = await tools.qigua.execute({ method: "zi", 字: "中" }, ctx);
  expect(r).toContain("本卦");
  expect(r).toContain("中");
});

test("14. qigua zi 多字「好运」→ 前半后半笔画", async () => {
  const r = await tools.qigua.execute({ method: "zi", 字: "好运" }, ctx);
  expect(r).toContain("好");
  expect(r).toContain("运");
  expect(r).toContain("笔画");
});

test("15. qigua coins 同 seed 两次动爻/输出完全一致(可复现)", async () => {
  const args = { method: "coins", seed: 12345, datetime: "2024-02-10 12:00" };
  const r1 = await tools.qigua.execute(args, ctx);
  const r2 = await tools.qigua.execute(args, ctx);
  expect(r1).toContain("seed=0x");
  expect(r1).toBe(r2);
});

test("16. coins 无 seed 自动生成并输出 seed=0x…", async () => {
  const r = await tools.qigua.execute({ method: "coins", datetime: "2024-02-10 12:00" }, ctx);
  expect(r).toMatch(/seed=0x[0-9a-f]+/);
});

test("17. qigua/paipan/duangua/cha 输出含 [口径] 披露行", async () => {
  const q = await tools.qigua.execute({ method: "time", datetime: "2024-02-10 12:00" }, ctx);
  const p = await tools.paipan.execute({ 卦名: "乾", datetime: "2024-02-10 12:00" }, ctx);
  const d = await tools.duangua.execute({ 卦名: "乾", 占事: "求财", datetime: "2024-02-10 12:00" }, ctx);
  const c = await tools.cha.execute({ 卦名: "乾" }, ctx);
  for (const r of [q, p, d, c]) {
    expect(r).toContain("[口径]");
    expect(r).toContain("astronomy-engine 天文算法");
  }
});

test("18. 晚子时:qigua datetime=2024-02-10 23:30 默认换日 → 日柱乙巳、时柱丙子", async () => {
  const r = await tools.qigua.execute({ method: "manual", 卦名: "乾", datetime: "2024-02-10 23:30" }, ctx);
  expect(r).toContain("乙巳日");
  expect(r).toContain("丙子时");
});

test("19. 晚子时:不换日 时 datetime=2024-02-10 23:30 → 日柱甲辰(当日)", async () => {
  const r = await tools.qigua.execute({ method: "manual", 卦名: "乾", datetime: "2024-02-10 23:30", 晚子时: "不换日" }, ctx);
  expect(r).toContain("甲辰日");
  expect(r).toContain("甲子时");
});
