/**
 * 公历转干支历(干支逻辑自研,仅借「节气时刻」这一天文事实)。
 *
 * 历法口径(P0 校准后):
 * 1. 年柱以立春为界:出生时刻 >= 该年立春时刻 → 该年年干支,否则属上年。
 *    立春时刻用 astronomy-engine 的 SearchSunLongitude(黄经 315°) 精确求得。
 * 2. 月柱以十二节(小寒/立春/惊蛰/清明/立夏/芒种/小暑/立秋/白露/寒露/立冬/大雪)为界,
 *    寅月起于立春;月干用五虎遁(年上起月)。
 * 3. 日柱保留公认锚点(2000-01-01 戊午 / 1900-01-01 甲戌)顺推,精确到日。
 * 4. 时辰:23:00 起子时;时干用五鼠遁(日上起时)。
 * 5. 晚子时:默认「23点换日」(23:00 后日柱取次日),可用 opts.晚子时 切换「不换日」。
 * 6. 真太阳时:默认按北京时间(东八区);显式传入 经度(且 !=120)时,时辰地支改用
 *    Meeus 均时差 + 经度修正后的真太阳时重推(见 getTrueSolarHours)。
 */
import { SearchSunLongitude, AstroTime } from "astronomy-engine";

export const TIAN_GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const DI_ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export interface GzOpts {
  /** 晚子时(23:00~24:00)日柱是否归次日。默认 "换日"。 */
  晚子时?: "换日" | "不换日";
  /** 出生地经度(东经正)。默认 120(东八区);传入且 !=120 时用真太阳时定时辰支。 */
  经度?: number;
}

/** 取正余数((n % m + m) % m),保证负数正确 */
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** 甲子年 = 1984(公元),60 甲子周期以此对齐 */
const BASE_YEAR = 1984;

const gzOfYear = (yearSeq: number): { gan: string; zhi: string } => {
  const seq = mod(yearSeq - BASE_YEAR, 60);
  return { gan: TIAN_GAN[mod(seq, 10)], zhi: DI_ZHI[mod(seq, 12)] };
};

/* ==================== 节气时刻(astronomy-engine) ==================== */

/**
 * 节气黄经表(按立春年顺序):节(月界)用「节」。
 * 小寒285 立春315 惊蛰345 清明15 立夏45 芒种75 小暑105 立秋135 白露165 寒露195 立冬225 大雪255
 * 每行 [黄经, 搜索起点月(0基), 起点日]:从起点起 SearchSunLongitude 在 45 天内找第一个达黄经时刻。
 */
const JIE_ANGLES: ReadonlyArray<readonly [number, number, number]> = [
  [285, 0, 1], [315, 0, 15], [345, 1, 15], [15, 2, 15], [45, 3, 15], [75, 4, 15],
  [105, 5, 15], [135, 6, 15], [165, 7, 15], [195, 8, 15], [225, 9, 15], [255, 10, 15],
];
const JIE_SEARCH = new Map<number, [number, number]>(JIE_ANGLES.map(([lon, mo, d]) => [lon, [mo, d]]));

/**
 * 求某公历年某节气的精确时刻(UTC→本地毫秒)。
 * 黄经:立春315、惊蛰345、清明15、立夏45、芒种75、小暑105、立秋135、白露165、
 * 寒露195、立冬225、大雪255、小寒285。
 */
export function 节气时刻(y: number, 节气黄经: number): Date {
  const [mo, d] = JIE_SEARCH.get(节气黄经) ?? [0, 15];
  const r = SearchSunLongitude(节气黄经, new AstroTime(new Date(Date.UTC(y, mo, d))), 45);
  if (!r) throw new Error(`节气计算失败: ${y}年黄经${节气黄经}`);
  return r.date;
}

/** 某「节气年」12 节时刻缓存:小寒(y)、立春(y)…大雪(y)。同一年只搜一次。 */
const jieCache = new Map<number, Date[]>();
function jieMoments(y: number): Date[] {
  let a = jieCache.get(y);
  if (!a) {
    a = JIE_ANGLES.map(([lon]) => 节气时刻(y, lon));
    jieCache.set(y, a);
  }
  return a;
}

/* ==================== 真太阳时(Meeus 均时差,公版算法) ==================== */

/**
 * 真太阳时(小时 0~24) = 北京时间(平太阳时) + 均时差 + (经度-120)×4分钟。
 * 均时差用 Meeus 公式;EoT 约 ±16 分钟。仅经度 !=120 时与北京时间差异显著。
 */
export function getTrueSolarHours(dateUtc: Date, longitude: number = 120): number {
  const jd = dateUtc.getTime() / 86_400_000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  const d = (x: number) => (x * Math.PI) / 180;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(d(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(d(2 * M)) * (0.019993 - 0.000101 * T)
    + Math.sin(d(3 * M)) * 0.000289;
  const trueLon = L0 + C;
  const eps0 = 23 + (26 + (21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const Omega = 125.04 - 1934.136 * T;
  const eps = eps0 + 0.00256 * Math.cos(d(Omega));
  const y = Math.tan(d(eps) / 2) ** 2;
  const eotRad = y * Math.sin(d(2 * L0)) - 2 * e * Math.sin(d(M)) + 4 * e * y * Math.sin(d(M)) * Math.cos(d(2 * L0))
    - 0.5 * y * y * Math.sin(d(4 * L0)) - 1.25 * e * e * Math.sin(d(2 * M));
  const eotMin = (eotRad * 180) / Math.PI * 4;
  const bj = mod(dateUtc.getUTCHours() + dateUtc.getUTCMinutes() / 60 + dateUtc.getUTCSeconds() / 3600 + 8, 24);
  return mod(bj + eotMin / 60 + ((longitude - 120) * 4) / 60, 24);
}

/* ==================== 干支推算(统一入口) ==================== */

export type Gz = { gan: string; zhi: string };
export type FullGz = { ygz: Gz; mgz: Gz; dgz: Gz; hgz: Gz };

/**
 * 一次算齐四柱(带时分)。
 * 年柱以立春为界、月柱以十二节为界(节气时刻用 astronomy-engine 精确求);
 * 晚子时按 opts.晚子时(默认 23 点换日);时辰支默认按时钟小时,传 经度(≠120)时用真太阳时。
 */
export function getFullGanZhi(y: number, m: number, d: number, hour: number, opts?: GzOpts): FullGz {
  const huanRi = opts?.晚子时 !== "不换日";
  // 输入为北京时间(东八区),转 UTC 毫秒再与节气时刻(UTC)比较
  const birthMs = Date.UTC(y, m - 1, d, hour, 0, 0) - 8 * 3_600_000;
  const birth = new Date(birthMs);

  // 月支:定位出生时刻所在的节区间(jieMoments = 小寒(y)…大雪(y))
  const mom = jieMoments(y);
  let yRef = y; // 五虎遁所用年干之公历年(节气年)
  let mzhi: string;
  if (birthMs < mom[0].getTime()) {
    mzhi = "子"; // 大雪(y-1) ~ 小寒(y) 为子月,仍属上年节气年
    yRef = y - 1;
  } else {
    let i = mom.length - 1;
    for (let k = 0; k < mom.length - 1; k++) {
      if (birthMs >= mom[k].getTime() && birthMs < mom[k + 1].getTime()) { i = k; break; }
    }
    mzhi = DI_ZHI[mod(DI_ZHI.indexOf("丑") + i, 12)]; // i=0 小寒~立春 → 丑, i=11 大雪~ → 子
    if (i === 0) yRef = y - 1; // 丑月(小寒~立春)仍属上年节气年
  }

  // 年柱:立春为界
  const yearSeq = birthMs >= mom[1].getTime() ? y : y - 1;
  const ygz = gzOfYear(yearSeq);

  // 月柱:五虎遁「甲己之年丙作首…」→ 寅月干 = 年干序×2+2,每月干序 +1
  const yGanIdx = TIAN_GAN.indexOf(gzOfYear(yRef).gan as (typeof TIAN_GAN)[number]);
  const offset = mod(DI_ZHI.indexOf(mzhi as (typeof DI_ZHI)[number]) - DI_ZHI.indexOf("寅"), 12);
  const mgz = { gan: TIAN_GAN[mod(yGanIdx * 2 + 2 + offset, 10)], zhi: mzhi };

  // 日柱:锚点精确;晚子时(23:00 后)默认归次日
  const dgz = huanRi && hour >= 23 ? getDayGanZhi(y, m, d + 1) : getDayGanZhi(y, m, d);

  // 时柱:五鼠遁「甲己还加甲…」→ 子时干 = 日干序×2;默认按时钟小时,传经度用真太阳时
  const effHour = opts?.经度 !== undefined && opts.经度 !== 120
    ? getTrueSolarHours(birth, opts.经度)
    : hour;
  const zhiIdx = Math.floor(((mod(effHour, 24) + 1) % 24) / 2);
  const hgz = { gan: TIAN_GAN[mod(TIAN_GAN.indexOf(dgz.gan as (typeof TIAN_GAN)[number]) * 2 + zhiIdx, 10)], zhi: DI_ZHI[zhiIdx] };

  return { ygz, mgz, dgz, hgz };
}

/* ==================== 各柱函数(带时分 Ex 版 + 原版向后兼容) ==================== */

/** 年干支(立春为界)。原版:小时默认 12(午时),缺省月/日取 6/15(必在立春后)。 */
export function getYearGanZhi(year: number, month?: number, day?: number, opts?: GzOpts): Gz {
  return getYearGanZhiEx(year, month ?? 6, day ?? 15, 12, opts);
}
/** 年干支(带时分,立春为界):出生时刻 >= 该年立春 → 该年干支,否则上年。 */
export function getYearGanZhiEx(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz {
  return getFullGanZhi(y, m, d, hour, opts).ygz;
}

/** 月干支(节气月)。原版:小时默认 12(午时);day 缺省取 15(必在当月节界之后)。 */
export function getMonthGanZhi(year: number, month: number, day: number = 15, opts?: GzOpts): Gz {
  return getMonthGanZhiEx(year, month, day, 12, opts);
}
/** 月干支(带时分,十二节为界):出生时刻所在的节区间定位月支,五虎遁定月干。 */
export function getMonthGanZhiEx(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz {
  return getFullGanZhi(y, m, d, hour, opts).mgz;
}

/**
 * 日干支(精确到日)。
 * 依据:公认锚点 2000-01-01 为「戊午」日(六十甲子序 54);另一公认锚点
 * 1900-01-01 为「甲戌」日(序 10),二者相差 36524 天 ≡ 44 (mod 60),互相印证。
 * 用 Date.UTC 计整天数差,不受时区/闰秒影响。
 */
const DAY_ANCHOR = { y: 2000, m: 1, d: 1, seq: 54 };
const DAY_MS = 86_400_000;

export function getDayGanZhi(y: number, m: number, d: number): Gz {
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(DAY_ANCHOR.y, DAY_ANCHOR.m - 1, DAY_ANCHOR.d)) / DAY_MS);
  const seq = mod(DAY_ANCHOR.seq + days, 60);
  return { gan: TIAN_GAN[mod(seq, 10)], zhi: DI_ZHI[mod(seq, 12)] };
}

/** 日干支(带时分):晚子时(23:00 后)且 晚子时="换日" 时取次日日柱。 */
export function getDayGanZhiEx(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz {
  if (opts?.晚子时 !== "不换日" && hour >= 23) d += 1;
  return getDayGanZhi(y, m, d);
}

/**
 * 时辰地支。依据:23-1 子、1-3 丑、3-5 寅、5-7 卯、7-9 辰、9-11 巳、
 * 11-13 午、13-15 未、15-17 申、17-19 酉、19-21 戌、21-23 亥;23:00 起算子时。
 */
const zhiIdxOf = (hour: number): number => Math.floor(((mod(hour, 24) + 1) % 24) / 2);

export function getHourZhi(hour: number): string {
  return DI_ZHI[zhiIdxOf(hour)];
}

/**
 * 时辰干支(五鼠遁)。晚子时(23:00 后)默认按换日后的日干配时。
 */
export function getHourGanZhi(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz {
  const dgz = opts?.晚子时 !== "不换日" && hour >= 23 ? getDayGanZhi(y, m, d + 1) : getDayGanZhi(y, m, d);
  const idx = zhiIdxOf(hour);
  return { gan: TIAN_GAN[mod(TIAN_GAN.indexOf(dgz.gan as (typeof TIAN_GAN)[number]) * 2 + idx, 10)], zhi: DI_ZHI[idx] };
}

/* ==================== 口径披露 ==================== */

export const 口径 = {
  历法: "astronomy-engine 天文算法",
  晚子时: "23点换日",
  真太阳时: "默认北京时间,可传经度",
} as const;

export const 口径披露 = (): string =>
  "[口径] 历法:astronomy-engine 天文算法;晚子时:23点换日;真太阳时:默认北京时间(可传 经度 参数)";

/* ==================== 自测 ==================== */

/**
 * 自测:对全部锚点断言,返回 { pass, report }。
 * 节气边界(实测 astronomy-engine):
 *  - 2024 立春 = 2024-02-04 16:26:49(北京时间),故 16 时癸卯、17 时甲辰。
 *  - 2024 惊蛰 = 2024-03-05 10:22:28,故 10 时丙寅、11 时丁卯。
 *  - 1984 立春 = 1984-02-04 23:18:42,故 2 月 4 日午时仍属癸亥年。
 * 日柱锚点:1900-01-01 甲戌、2000-01-01 戊午、1949-10-01 甲子、2024-02-10 甲辰。
 */
export function _selftest(): { pass: boolean; report: string } {
  const cases: Array<[string, () => boolean]> = [
    ["年柱 2024-02-04 16时 = 癸卯(立春前)", () => eq(getYearGanZhiEx(2024, 2, 4, 16), "癸", "卯")],
    ["年柱 2024-02-04 17时 = 甲辰(立春后)", () => eq(getYearGanZhiEx(2024, 2, 4, 17), "甲", "辰")],
    ["年柱 1984-02-04 12时 = 癸亥(1984立春在23:18)", () => eq(getYearGanZhiEx(1984, 2, 4, 12), "癸", "亥")],
    ["年柱 1984-02-02 12时 = 癸亥", () => eq(getYearGanZhiEx(1984, 2, 2, 12), "癸", "亥")],
    ["年柱 2024-02-10 12时 = 甲辰", () => eq(getYearGanZhiEx(2024, 2, 10, 12), "甲", "辰")],
    ["月柱 2024-03-05 10时 = 丙寅(惊蛰前)", () => eq(getMonthGanZhiEx(2024, 3, 5, 10), "丙", "寅")],
    ["月柱 2024-03-05 11时 = 丁卯(惊蛰后)", () => eq(getMonthGanZhiEx(2024, 3, 5, 11), "丁", "卯")],
    ["月柱 2024-02-04 16时 = 乙丑(立春前丑月)", () => eq(getMonthGanZhiEx(2024, 2, 4, 16), "乙", "丑")],
    ["月柱 2024-01-01 12时 = 甲子(癸卯年子月)", () => eq(getMonthGanZhiEx(2024, 1, 1, 12), "甲", "子")],
    ["月柱 2023-03-06 12时 = 乙卯(癸卯年卯月)", () => eq(getMonthGanZhiEx(2023, 3, 6, 12), "乙", "卯")],
    ["日柱 1900-01-01 = 甲戌(标准锚点)", () => eq(getDayGanZhi(1900, 1, 1), "甲", "戌")],
    ["日柱 1949-10-01 = 甲子(开国大典)", () => eq(getDayGanZhi(1949, 10, 1), "甲", "子")],
    ["日柱 2000-01-01 = 戊午(标准锚点)", () => eq(getDayGanZhi(2000, 1, 1), "戊", "午")],
    ["日柱 2024-02-10 = 甲辰", () => eq(getDayGanZhi(2024, 2, 10), "甲", "辰")],
    ["日柱 2024-01-01 = 甲子", () => eq(getDayGanZhi(2024, 1, 1), "甲", "子")],
    ["晚子时 2024-02-10 23时 换日 → 日柱乙巳(次日)", () => eq(getDayGanZhiEx(2024, 2, 10, 23, { 晚子时: "换日" }), "乙", "巳")],
    ["晚子时 2024-02-10 23时 不换日 → 日柱甲辰(当日)", () => eq(getDayGanZhiEx(2024, 2, 10, 23, { 晚子时: "不换日" }), "甲", "辰")],
    ["时辰支 0/23/24 = 子, 12 = 午", () =>
      getHourZhi(0) === "子" && getHourZhi(23) === "子" && getHourZhi(24) === "子" && getHourZhi(12) === "午"],
    ["时辰支 1 = 丑, 21 = 亥", () => getHourZhi(1) === "丑" && getHourZhi(21) === "亥"],
    ["时柱 2024-02-10 0时 = 甲子(甲日,甲己还加甲)", () => eq(getHourGanZhi(2024, 2, 10, 0), "甲", "子")],
    ["时柱 2024-02-10 23时 默认换日 = 丙子(乙巳日,乙庚丙作初)", () => eq(getHourGanZhi(2024, 2, 10, 23), "丙", "子")],
    ["时柱 2024-02-10 23时 不换日 = 甲子(按当日日干)", () => eq(getHourGanZhi(2024, 2, 10, 23, { 晚子时: "不换日" }), "甲", "子")],
    ["真太阳时 经度120 与 87 结果不同", () =>
      getTrueSolarHours(new Date("2024-06-15T04:00:00Z"), 120) !== getTrueSolarHours(new Date("2024-06-15T04:00:00Z"), 87)],
    ["四柱 2024-02-10 23:30 换日 → 甲辰年 丙寅月 乙巳日 丙子时", () => {
      const g = getFullGanZhi(2024, 2, 10, 23);
      return eq(g.ygz, "甲", "辰") && eq(g.mgz, "丙", "寅") && eq(g.dgz, "乙", "巳") && eq(g.hgz, "丙", "子");
    }],
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

const eq = (r: Gz, gan: string, zhi: string): boolean => r.gan === gan && r.zhi === zhi;
