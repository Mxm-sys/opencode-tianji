/** 干支算法与知识库加载的单元测试(仅用 Node 内置 node:test / node:assert) */
import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getYearGanZhi,
  getMonthGanZhi,
  getDayGanZhi,
  getHourZhi,
  getHourGanZhi,
  _selftest,
} from "./ganzhi.ts";
import {
  DATA_DIR,
  loadBaguas,
  loadGua64,
  loadGanzhi,
  loadNayin,
  loadYaoci,
  loadYilin,
  guaByName,
  guaIndex,
} from "./db.ts";

test("干支 _selftest 全部锚点通过", () => {
  const r = _selftest();
  assert.ok(r.pass, r.report);
});

test("年干支锚点", () => {
  assert.deepStrictEqual(getYearGanZhi(1984, 2, 4), { gan: "甲", zhi: "子" });
  assert.deepStrictEqual(getYearGanZhi(1984, 2, 2), { gan: "癸", zhi: "亥" });
  assert.deepStrictEqual(getYearGanZhi(2024, 2, 10), { gan: "甲", zhi: "辰" });
});

test("月干支锚点", () => {
  assert.deepStrictEqual(getMonthGanZhi(2024, 2, 4), { gan: "丙", zhi: "寅" });
  assert.deepStrictEqual(getMonthGanZhi(2024, 1, 1), { gan: "甲", zhi: "子" });
  assert.deepStrictEqual(getMonthGanZhi(2023, 3, 6), { gan: "乙", zhi: "卯" });
});

test("日干支锚点", () => {
  assert.deepStrictEqual(getDayGanZhi(1900, 1, 1), { gan: "甲", zhi: "戌" });
  assert.deepStrictEqual(getDayGanZhi(1949, 10, 1), { gan: "甲", zhi: "子" });
  assert.deepStrictEqual(getDayGanZhi(2000, 1, 1), { gan: "戊", zhi: "午" });
  assert.deepStrictEqual(getDayGanZhi(2024, 2, 10), { gan: "甲", zhi: "辰" });
  assert.deepStrictEqual(getDayGanZhi(2024, 1, 1), { gan: "甲", zhi: "子" });
});

test("时辰地支", () => {
  assert.strictEqual(getHourZhi(0), "子");
  assert.strictEqual(getHourZhi(23), "子");
  assert.strictEqual(getHourZhi(24), "子");
  assert.strictEqual(getHourZhi(1), "丑");
  assert.strictEqual(getHourZhi(12), "午");
  assert.strictEqual(getHourZhi(21), "亥");
});

test("时辰干支", () => {
  assert.deepStrictEqual(getHourGanZhi(2024, 2, 10, 0), { gan: "甲", zhi: "子" });
  assert.deepStrictEqual(getHourGanZhi(2024, 2, 10, 23), { gan: "甲", zhi: "子" });
});

test("db: 六十四卦加载与查询", () => {
  const guas = loadGua64();
  assert.strictEqual(guas.length, 64);
  assert.strictEqual(guaByName("乾")?.卦序, 1);
  assert.strictEqual(guaIndex("乾"), 1);
  assert.strictEqual(guaIndex("未济"), 64);
  assert.strictEqual(guaByName("不存在之卦"), undefined);
});

test("db: 八卦加载", () => {
  assert.strictEqual(loadBaguas().length, 8);
});

test("db: ganzhi / nayin 对象加载", () => {
  assert.ok(loadGanzhi().天干);
  assert.ok(loadNayin().纳甲歌);
});

test("db: yilin 有 64 小节", () => {
  const yilin = loadYilin().易林;
  assert.strictEqual(Object.keys(yilin).length, 64);
});

test("db: 爻辞.json 存在且 384 爻", (t) => {
  const p = path.join(DATA_DIR, "爻辞.json");
  if (!fs.existsSync(p)) {
    t.skip("爻辞.json 尚未由数据层代理生成;文件就位后此用例自动校验 384 爻");
    return;
  }
  assert.strictEqual(countYaoLines(loadYaoci()), 384);
});

/** 递归统计形如「初九/九二/…/上六」的爻辞条目(共 64 卦 × 6 爻 = 384) */
function countYaoLines(v: unknown): number {
  if (typeof v === "string") {
    return /^(初九|初六|九二|六二|九三|六三|九四|六四|九五|六五|上九|上六)[：:]?/.test(v) ? 1 : 0;
  }
  if (Array.isArray(v)) {
    let n = 0;
    for (const x of v) n += countYaoLines(x);
    return n;
  }
  if (v && typeof v === "object") {
    let n = 0;
    for (const x of Object.values(v)) n += countYaoLines(x);
    return n;
  }
  return 0;
}
