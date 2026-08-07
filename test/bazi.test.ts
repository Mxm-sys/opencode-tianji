/**
 * bazi 插件测试(直接调用 baziExecute / shiShen)。
 * 运行: cd /home/mxm/桌面/fun/占卜/opencode-tianji && bun test test/bazi.test.ts
 */
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { baziExecute, shiShen } from "../plugins/bazi";
import { getYearGanZhi, getMonthGanZhi, getDayGanZhi, getHourGanZhi } from "../lib/ganzhi";

const run = (datetime?: string, 性别?: string) =>
  baziExecute({ datetime, 性别 });

test("1. 1990-05-15 12:00 四柱确定性验证(与 lib/ganzhi.ts 算法一致)", async () => {
  const ygz = getYearGanZhi(1990, 5, 15);
  const mgz = getMonthGanZhi(1990, 5, 15);
  const dgz = getDayGanZhi(1990, 5, 15);
  const hgz = getHourGanZhi(1990, 5, 15, 12);
  const r = await run("1990-05-15 12:00", "男");
  expect(r).toContain(`年柱 ${ygz.gan}${ygz.zhi}`);
  expect(r).toContain(`月柱 ${mgz.gan}${mgz.zhi}`);
  expect(r).toContain(`日柱 ${dgz.gan}${dgz.zhi}(日主)`);
  expect(r).toContain(`时柱 ${hgz.gan}${hgz.zhi}`);
  expect(r).toContain("庚午"); // 庚午年
  expect(r).toContain("辛巳"); // 辛巳月
  expect(r).toContain("庚辰"); // 庚辰日
  expect(r).toContain("壬午"); // 壬午时
});

test("2. 十神判定(以日干甲为我,多个断言)", () => {
  expect(shiShen("甲", "壬")).toBe("偏印"); // 水生甲木,壬阳甲阳,同阴阳=偏印
  expect(shiShen("甲", "己")).toBe("正财"); // 甲克己,己阴甲阳,异阴阳=正财
  expect(shiShen("甲", "癸")).toBe("正印"); // 水生甲木,癸阴甲阳,异阴阳=正印
  expect(shiShen("甲", "戊")).toBe("偏财"); // 甲克戊,戊阳甲阳,同阴阳=偏财
  expect(shiShen("甲", "庚")).toBe("七杀"); // 庚金克甲木,庚阳甲阳,同阴阳=七杀
  expect(shiShen("甲", "辛")).toBe("正官"); // 辛金克甲木,辛阴甲阳,异阴阳=正官
  expect(shiShen("甲", "丙")).toBe("食神"); // 甲木生丙火,丙阳甲阳,同阴阳=食神
  expect(shiShen("甲", "丁")).toBe("伤官"); // 甲木生丁火,丁阴甲阳,异阴阳=伤官
  expect(shiShen("甲", "甲")).toBe("比肩"); // 同我,同阴阳=比肩
  expect(shiShen("甲", "乙")).toBe("劫财"); // 同我,异阴阳=劫财
});

test("3. 地支藏干:子藏癸,午藏丁己", async () => {
  const r1 = await run("2024-01-01 12:00", "男"); // 甲子日
  expect(r1).toContain("子藏癸");
  const r2 = await run("2000-01-01 12:00", "男"); // 戊午日
  expect(r2).toContain("午藏丁己");
});

test("4. 纳音:年柱庚午 → 路傍土,日柱庚辰 → 白蜡金", async () => {
  const r = await run("1990-05-15 12:00", "男");
  expect(r).toContain("路傍土");
  expect(r).toContain("白蜡金");
});

test("5. 大运顺逆:2024 甲辰年(甲阳)男命顺行、女命逆行,首步与 ganzhi 序列推算一致", async () => {
  const mgz = getMonthGanZhi(2024, 2, 10); // 丙寅
  const male = await run("2024-02-10 12:00", "男");
  const female = await run("2024-02-10 12:00", "女");
  // 男命顺行:丙寅+1 = 丁卯
  const exp = (m: string, f: number) => {
    const TG = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
    const DI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
    const mod = (n: number, k: number) => ((n % k) + k) % k;
    return TG[mod(TG.indexOf(mgz.gan) + f, 10)] + DI[mod(DI.indexOf(mgz.zhi) + f, 12)];
  };
  expect(male).toContain("顺行");
  expect(male).toContain(exp("", 1)); // 首步大运 = 月柱+1 = 丁卯
  expect(female).toContain("逆行");
  expect(female).toContain(exp("", -1)); // 首步大运 = 月柱-1 = 乙丑
});

test("6. 性别影响:同一天datetime,男/女大运首步不同", async () => {
  const male = await run("2024-02-10 12:00", "男");
  const female = await run("2024-02-10 12:00", "女");
  const first = (r: string) => r.split("后行: ")[1].split(" ")[0];
  expect(first(male)).toBe("丁卯");
  expect(first(female)).toBe("乙丑");
  expect(first(male)).not.toBe(first(female));
});

test("7. bazi.json 两处 byte 级一致", () => {
  const a = fs.readFileSync(path.join(import.meta.dir, "..", "data", "bazi.json"), "utf8");
  const b = fs.readFileSync("/home/mxm/桌面/fun/占卜/知识库/data/bazi.json", "utf8");
  expect(a).toBe(b);
});
