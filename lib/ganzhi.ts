/**
 * 公历转干支历(纯函数,无外部依赖)
 *
 * 依据与简化说明:
 * 1. 年干支以立春为界。真正的立春时刻逐年不同(约公历 2 月 3~5 日)。
 *    本模块按简化处理:以「公历 2 月 4 日 0 时」为固定分界,2 月 4 日 0 时起算
 *    新干支年,之前(含 2 月 3 日)仍属上年。此简化在大多数年份与真实立春相差
 *    不足 1 天,对近现代(1900~2100)误差仅在个别年份 ±1 天边界。
 * 2. 月干支用节气月(十二节):寅月起于立春。简化月界(节)按公历近似:
 *    2/4 寅、3/6 卯、4/5 辰、5/6 巳、6/6 午、7/7 未、8/8 申、9/8 酉、
 *    10/8 戌、11/7 亥、12/7 子、1/6 丑。近似节界同样存在 ±1 天误差。
 * 3. 日干支按公历日期精确推算(见 getDayGanZhi 锚点说明),不存在近似。
 * 4. 时辰地支以 23:00 为子时起点;本模块按「当日日干」配时辰干
 *    (日上起时/五鼠遁),不做「晚子时换日」,与项目锚点口径一致。
 */
export const TIAN_GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const DI_ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

/** 取正余数((n % m + m) % m),保证负数正确 */
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** 甲子年 = 1984(公元),60 甲子周期以此对齐 */
const BASE_YEAR = 1984;

/** 是否处于该公历年的立春(简化界 2/4 0:00)之前,即仍属上一年干支 */
const isBeforeLiChun = (month: number, day: number): boolean => month < 2 || (month === 2 && day < 4);

/**
 * 年干支。
 * 依据:1984 年为甲子年;60 甲子序列 = (year - 1984) mod 60。
 * 立春简化界 2/4:传入 (month, day) 时,立春前仍属上年;不传则取该年干支年本体。
 */
export function getYearGanZhi(year: number, month?: number, day?: number): { gan: string; zhi: string } {
  let y = year;
  if (month !== undefined && day !== undefined && isBeforeLiChun(month, day)) y -= 1;
  const seq = mod(y - BASE_YEAR, 60);
  return { gan: TIAN_GAN[mod(seq, 10)], zhi: DI_ZHI[mod(seq, 12)] };
}

/** 简化月界:十二节近似公历日期(节名从寅月起)。依据:各节气平均公历日期。 */
const MONTH_ZHI: ReadonlyArray<readonly [number, number, string]> = [
  [2, 4, "寅"], [3, 6, "卯"], [4, 5, "辰"], [5, 6, "巳"],
  [6, 6, "午"], [7, 7, "未"], [8, 8, "申"], [9, 8, "酉"],
  [10, 8, "戌"], [11, 7, "亥"], [12, 7, "子"], [1, 6, "丑"],
];

/** 由公历日期推月支(节气月),按上表近似节界判断;节前属上一月支 */
function monthZhi(month: number, day: number): string {
  if (month === 1) return day >= 6 ? "丑" : "子";
  for (let i = 0; i < MONTH_ZHI.length; i++) {
    if (MONTH_ZHI[i][0] === month) {
      if (day >= MONTH_ZHI[i][1]) return MONTH_ZHI[i][2];
      return i === 0 ? MONTH_ZHI[MONTH_ZHI.length - 1][2] : MONTH_ZHI[i - 1][2];
    }
  }
  return "子";
}

/**
 * 月干支(节气月,正月=寅月)。
 * 依据:年上起月歌(五虎遁)「甲己之年丙作首,乙庚之岁戊为头,丙辛必定寻庚起,
 * 丁壬壬位顺行流,戊癸何处起,甲寅之上好追求」。
 * 即寅月干 = (年干序号×2+2) mod 10,之后每月干序 +1;年干取该日所在干支年。
 * day 缺省取 15(必在当月节界之后),使 getMonthGanZhi(y, m) 返回该节月干支。
 */
export function getMonthGanZhi(year: number, month: number, day: number = 15): { gan: string; zhi: string } {
  const zhi = monthZhi(month, day);
  const yearGan = getYearGanZhi(year, month, day).gan;
  const yearGanIdx = TIAN_GAN.indexOf(yearGan as (typeof TIAN_GAN)[number]);
  const offset = mod(DI_ZHI.indexOf(zhi as (typeof DI_ZHI)[number]) - DI_ZHI.indexOf("寅"), 12);
  const ganIdx = mod(yearGanIdx * 2 + 2 + offset, 10);
  return { gan: TIAN_GAN[ganIdx], zhi };
}

/**
 * 日干支(精确到日)。
 * 依据:公认锚点 2000-01-01 为「戊午」日(六十甲子序 54);另一公认锚点
 * 1900-01-01 为「甲戌」日(序 10),二者相差 36524 天 ≡ 44 (mod 60),互相印证。
 * 算法:days = 与锚点相差天数,seq = (锚点序 + days) mod 60(负余数取正)。
 * 用 Date.UTC 计整天数差,不受时区/闰秒影响。
 */
const DAY_ANCHOR = { y: 2000, m: 1, d: 1, seq: 54 };
const DAY_MS = 86_400_000;

export function getDayGanZhi(y: number, m: number, d: number): { gan: string; zhi: string } {
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(DAY_ANCHOR.y, DAY_ANCHOR.m - 1, DAY_ANCHOR.d)) / DAY_MS);
  const seq = mod(DAY_ANCHOR.seq + days, 60);
  return { gan: TIAN_GAN[mod(seq, 10)], zhi: DI_ZHI[mod(seq, 12)] };
}

/**
 * 时辰地支。依据:23-1 子、1-3 丑、3-5 寅、5-7 卯、7-9 辰、9-11 巳、
 * 11-13 午、13-15 未、15-17 申、17-19 酉、19-21 戌、21-23 亥;23:00 起算子时。
 * 公式:zhiIdx = ((hour+1) mod 24) / 2 取整。
 */
export function getHourZhi(hour: number): string {
  return DI_ZHI[Math.floor(((mod(hour, 24) + 1) % 24) / 2)];
}

/**
 * 时辰干支。
 * 依据:日上起时歌(五鼠遁)「甲己还加甲,乙庚丙作初,丙辛从戊起,丁壬庚子居,
 * 戊癸何方发,壬子是真途」。即子时干 = (日干序×2) mod 10,每过一时辰干序 +1。
 * 注:按项目口径,23:00 仍按当日日干配时(不做晚子时换日)。
 */
export function getHourGanZhi(y: number, m: number, d: number, hour: number): { gan: string; zhi: string } {
  const zhiIdx = Math.floor(((mod(hour, 24) + 1) % 24) / 2);
  const dayGanIdx = TIAN_GAN.indexOf(getDayGanZhi(y, m, d).gan as (typeof TIAN_GAN)[number]);
  const ganIdx = mod(dayGanIdx * 2 + zhiIdx, 10);
  return { gan: TIAN_GAN[ganIdx], zhi: DI_ZHI[zhiIdx] };
}

/**
 * 自测:对全部锚点断言,返回 { pass, report }。
 * 锚点来源:
 *  - 1900-01-01 甲戌日、2000-01-01 戊午日:通行万年历/干支查算表的两个标准锚点,
 *    且二者互差 44 (mod 60) 相互印证(已用天数差核算)。
 *  - 1949-10-01 甲子日:由 1900-01-01 锚点顺推,与公认「开国大典逢甲子日」一致。
 *  - 2024-02-10 甲辰日:由 2000-01-01 锚点顺推(差 8806 天 ≡ 46 (mod 60)),甲辰年正月初一。
 *  - 1984 甲子年、2024 甲辰年、甲辰年丙寅月/甲子月/乙卯月等:60 甲子纪年纪月常识。
 *  - 1984-02-02 属 1983 年干支(癸亥):1984 立春在 2 月 4 日,该日仍在上年;
 *    农历正月初一(1984-02-02)与干支年分界(立春)并非同日,本模块以立春为界。
 */
export function _selftest(): { pass: boolean; report: string } {
  const cases: Array<[string, () => boolean]> = [
    ["年干支 1984-02-04 = 甲子(立春日)", () => eq(getYearGanZhi(1984, 2, 4), "甲", "子")],
    ["年干支 1984-02-02 = 癸亥(立春前仍属上年)", () => eq(getYearGanZhi(1984, 2, 2), "癸", "亥")],
    ["年干支 2024-02-10 = 甲辰(甲辰年正月初一,已过立春)", () => eq(getYearGanZhi(2024, 2, 10), "甲", "辰")],
    ["月干支 2024-02-04 = 丙寅(甲辰年寅月,五虎遁)", () => eq(getMonthGanZhi(2024, 2, 4), "丙", "寅")],
    ["月干支 2024-01-01 = 甲子(癸卯年子月)", () => eq(getMonthGanZhi(2024, 1, 1), "甲", "子")],
    ["月干支 2023-03-06 = 乙卯(癸卯年卯月)", () => eq(getMonthGanZhi(2023, 3, 6), "乙", "卯")],
    ["日干支 1900-01-01 = 甲戌(标准锚点)", () => eq(getDayGanZhi(1900, 1, 1), "甲", "戌")],
    ["日干支 1949-10-01 = 甲子(开国大典)", () => eq(getDayGanZhi(1949, 10, 1), "甲", "子")],
    ["日干支 2000-01-01 = 戊午(标准锚点)", () => eq(getDayGanZhi(2000, 1, 1), "戊", "午")],
    ["日干支 2024-02-10 = 甲辰", () => eq(getDayGanZhi(2024, 2, 10), "甲", "辰")],
    ["日干支 2024-01-01 = 甲子", () => eq(getDayGanZhi(2024, 1, 1), "甲", "子")],
    ["时辰支 0/23/24 = 子, 12 = 午", () =>
      getHourZhi(0) === "子" && getHourZhi(23) === "子" && getHourZhi(24) === "子" && getHourZhi(12) === "午"],
    ["时辰支 1 = 丑, 21 = 亥", () => getHourZhi(1) === "丑" && getHourZhi(21) === "亥"],
    ["时干支 2024-02-10 0 时 = 甲子(甲日,甲己还加甲)", () => eq(getHourGanZhi(2024, 2, 10, 0), "甲", "子")],
    ["时干支 2024-02-10 23 时 = 甲子(晚子时按当日日干)", () => eq(getHourGanZhi(2024, 2, 10, 23), "甲", "子")],
  ];

  const lines: string[] = [];
  let pass = true;
  for (const [name, fn] of cases) {
    const ok = fn();
    if (!ok) pass = false;
    lines.push(`${ok ? "[PASS]" : "[FAIL]"} ${name}`);
  }
  return { pass, report: lines.join("\n") };
}

const eq = (r: { gan: string; zhi: string }, gan: string, zhi: string): boolean => r.gan === gan && r.zhi === zhi;
