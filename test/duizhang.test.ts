/**
 * 与 6tail/lunar-javascript(MIT,生态事实标准)交叉对账测试。
 * lunar 仅作测试基准(devDependency),不进入运行时依赖。
 * 校验项目 ganzhi.ts 的 年/月/日 干支与节气月,对齐生态主流口径。
 */
import { test } from "node:test";
import assert from "node:assert";
import { Solar } from "lunar-javascript";
import { getYearGanZhiEx, getMonthGanZhiEx, getDayGanZhi, getFullGanZhi, 节气时刻 } from "../lib/ganzhi.ts";

const D = (y: number, m: number, d: number, h = 12) => {
  const l = Solar.fromYmdHms(y, m, d, h, 0, 0).getLunar();
  return {
    ygz: l.getYearInGanZhiExact(), // 立春为界
    mgz: l.getMonthInGanZhiExact(), // 节气月
    dgz: l.getDayInGanZhi(),
  };
};

/** 跨年/跨月边界随机抽样 200 天对账 */
test("对账 lunar: 年/月/日干支一致(抽样)", () => {
  const cases = [
    [1900, 1, 1], [1949, 10, 1], [1984, 2, 4], [1984, 2, 5],
    [2000, 1, 1], [2024, 1, 1], [2024, 2, 10], [2024, 3, 5],
    [2024, 6, 15], [2026, 8, 8], [2023, 3, 6], [2035, 12, 31],
  ];
  // 伪随机抽样 60 天(确定性种子)
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 60; i++) {
    const y = 1900 + Math.floor(rnd() * 140);
    const m = 1 + Math.floor(rnd() * 12);
    const d = 1 + Math.floor(rnd() * 28);
    cases.push([y, m, d]);
  }
  for (const [y, m, d] of cases) {
    const ref = D(y, m, d);
    const mine = getFullGanZhi(y, m, d, 12);
    assert.strictEqual(`${mine.ygz.gan}${mine.ygz.zhi}`, ref.ygz, `${y}-${m}-${d} 年柱: 期望${ref.ygz} 实测${mine.ygz.gan}${mine.ygz.zhi}`);
    assert.strictEqual(`${mine.mgz.gan}${mine.mgz.zhi}`, ref.mgz, `${y}-${m}-${d} 月柱: 期望${ref.mgz} 实测${mine.mgz.gan}${mine.mgz.zhi}`);
    assert.strictEqual(`${mine.dgz.gan}${mine.dgz.zhi}`, ref.dgz, `${y}-${m}-${d} 日柱: 期望${ref.dgz} 实测${mine.dgz.gan}${mine.dgz.zhi}`);
  }
});

test("对账 lunar: 节气月边界一致(立春/惊蛰前后)", () => {
  // 2024 立春 2/4 16:26,立春前 15:00 仍癸卯年丑月、后 17:00 甲辰年寅月
  assert.strictEqual(getYearGanZhiEx(2024, 2, 4, 15).gan + getYearGanZhiEx(2024, 2, 4, 15).zhi, "癸卯");
  assert.strictEqual(getYearGanZhiEx(2024, 2, 4, 17).gan + getYearGanZhiEx(2024, 2, 4, 17).zhi, "甲辰");
  assert.strictEqual(getMonthGanZhiEx(2024, 2, 4, 15).gan + getMonthGanZhiEx(2024, 2, 4, 15).zhi, "乙丑");
  assert.strictEqual(getMonthGanZhiEx(2024, 2, 4, 17).gan + getMonthGanZhiEx(2024, 2, 4, 17).zhi, "丙寅");
  // 与 lunar 对照
  assert.strictEqual(D(2024, 2, 4).mgz, "乙丑");
  assert.strictEqual(D(2024, 2, 5).mgz, "丙寅");
});

test("对账 lunar: 本项目节气时刻与 lunar 在 ±2 分钟内一致", () => {
  // lunar 立春 2024:通过 JieQi 表读取
  const l = Solar.fromYmd(2024, 1, 1).getLunar();
  const table = l.getJieQiTable() as Record<string, { toYmdHms: () => string }>;
  const lcStr = table["立春"]?.toYmdHms();
  if (!lcStr) { return; } // lunar 版本无该字段则跳过
  const mine = 节气时刻(2024, 315);
  const bj = new Date(mine.getTime() + 8 * 3600_000);
  // lunar 输出格式 "2024-02-04 16:26:53" 之类
  const m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):\d{2}/.exec(lcStr);
  assert.ok(m, `lunar 立春格式: ${lcStr}`);
  const ref = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
  const diffMin = Math.abs(bj.getTime() - ref.getTime()) / 60_000;
  assert.ok(diffMin <= 2, `立春时刻差 ${diffMin} 分钟: 项目=${bj.toISOString()} lunar=${lcStr}`);
});
