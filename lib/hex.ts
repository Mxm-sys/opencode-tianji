/**
 * 六爻/梅花共享计算核心:五行生克、天干地支、纳音、六神、六冲六合三合、旬空、
 * 旺相休囚、先天八卦爻画、卦查找、变卦推导、旬空月破、六亲、卦身与排盘核心(buildPan)。
 *
 * 数据一律查 知识库/data(经 ../lib/db),不硬编码;仅供 plugins/zhanbu.ts、
 * plugins/meihua.ts、plugins/bazi.ts 共用,各术专属逻辑留在各自模块。
 */
import * as db from "./db";
import * as gz from "./ganzhi";

export const DI = gz.DI_ZHI as readonly string[];
export const TG = gz.TIAN_GAN as readonly string[];
export const WEI = ["初爻", "二爻", "三爻", "四爻", "五爻", "六爻"];
/** 阳支:阳世从子月起;阴世从午月生(火珠林·六亲根源) */
const YANG_ZHI = new Set(["子", "寅", "辰", "午", "申", "戌"]);
/** 先天数:乾1兑2离3震4巽5坎6艮7坤8(梅花易数·周易卦数)。余数 1~8 反推卦,余 0 取 8 = 坤 */
export const NUM_TO_GUA: Record<number, string> = { 1: "乾", 2: "兑", 3: "离", 4: "震", 5: "巽", 6: "坎", 7: "艮", 8: "坤" };

/* ==================== 五行生克 ==================== */

const _shengKe = db.wuxingShengKe();
/** sheng[A]=B 即 A生B(据 ganzhi.json 五行·相生/相克) */
export const SHENG = new Map<string, string>();
export const KE = new Map<string, string>();
for (const [a, b] of _shengKe.sheng.split("，").map((x) => [x[0], x[2]] as const)) SHENG.set(a, b);
for (const [a, b] of _shengKe.ke.split("，").map((x) => [x[0], x[2]] as const)) KE.set(a, b);

/** 旺相休囚:季节(春/夏/秋/冬) → {旺,相,休,囚,死}(据 ganzhi.json 五行·旺相休囚) */
export const WANGXIANG = db.wangXiangXiuQiu();

/* ==================== 天干地支与纳音 ==================== */

const _ganzhi = db.loadGanzhi();
/** 天干五行/阴阳(据 ganzhi.json·天干) */
export const GAN_WX = new Map<string, string>();
export const GAN_YY = new Map<string, string>();
for (const g of _ganzhi.天干 as { 干: string; 五行: string; 阴阳: string }[]) {
  GAN_WX.set(g.干, g.五行);
  GAN_YY.set(g.干, g.阴阳);
}

/** 地支五行(据 ganzhi.json·地支) */
export const zhiWX = (): Map<string, string> =>
  new Map((_ganzhi.地支 as { 支: string; 五行: string }[]).map((z) => [z.支, z.五行]));

/** 纳音:干支 → 纳音(据 ganzhi.json·六甲) */
export const NAYIN = new Map<string, string>(
  (_ganzhi.六甲 as { 干支: string; 纳音: string }[]).map((s) => [s.干支, s.纳音]),
);

/* ==================== 六神 ==================== */

/** 六神起例:日干→首神(据 nayin.json·六神起例) */
export function liuShenStart(gan: string): string {
  const q = db.loadNayin().六神起例 as Record<string, string>;
  for (const [k, v] of Object.entries(q)) {
    if (k === "原文" || k === "出处" || k === "来源") continue;
    if (k.includes(gan)) return v;
  }
  return "青龙";
}

/** 六神顺序:自初爻起排(据 nayin.json·六神顺序,新 schema 为 {神}[] ) */
export const liuShenOrder = (): string[] =>
  (db.loadNayin().六神顺序 as { 神: string }[]).map((x) => x.神);

/* ==================== 六冲/六合/三合/旬空 ==================== */

export const CHONG = new Map<string, string>();
for (const c of _ganzhi.六冲 as { 冲: string }[]) { const s = c.冲; CHONG.set(s[0], s[1]); CHONG.set(s[1], s[0]); }
export const HE = new Map<string, string>();
for (const c of _ganzhi.六合 as { 合: string }[]) { const s = c.合; HE.set(s[0], s[1]); HE.set(s[1], s[0]); }
export const SANHE: { 局: string; 三支: string[] }[] = (_ganzhi.三合 as { 局: string; 三支: string[] }[]);
export const XUNKONG: Record<string, string[]> = Object.fromEntries(
  (_ganzhi.旬空 as { 旬: string; 空: string[] }[]).map((x) => [x.旬, x.空]),
);

/* ==================== 八卦爻画 ==================== */

/**
 * 先天八卦爻画(自下而上,1=阳 0=阴)。
 * 数据文件只存卦符与上下卦名,不存每爻阴阳;此处按通行《周易》八卦卦画硬编码
 * (乾三连/兑上缺/离中虚/震仰盂/巽下断/坎中满/艮覆碗/坤六断),
 * 仅用于由动爻翻转上下卦求变卦名,不产生数据文件之外的内容。
 */
export const TRIGRAM_LINES: Record<string, number[]> = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
export const LINES_TO_TRIGRAM: Record<string, string> = Object.fromEntries(
  Object.entries(TRIGRAM_LINES).map(([n, l]) => [l.join(""), n]),
);

/** 八卦五行/卦符(据 bagua.json) */
const _bagua = db.loadBaguas() as { 卦名: string; 卦符: string; 五行: string }[];
export const BAGUA_WX = new Map(_bagua.map((b) => [b.卦名, b.五行]));
export const BAGUA_SYM = new Map(_bagua.map((b) => [b.卦名, b.卦符]));

/* ==================== 卦查找 ==================== */

export type Gua = {
  卦名: string; 卦符: string; 上下卦: string; 八宫: string; 宫五行: string;
  世爻: number; 应爻: number; 纳甲: [string, string][]; 六亲: [string, string][]; 卦辞: string;
  [k: string]: unknown;
};

export const guaList = (): Gua[] => db.loadGua64() as unknown as Gua[];
export const guaOf = (name: string): Gua | undefined => guaList().find((g) => g.卦名 === name);
export const guaOfTrigrams = (up: string, down: string): Gua | undefined =>
  guaList().find((g) => g.上下卦 === `${up}上${down}下`);
/** "乾上乾下" → ["乾","乾"]。八卦名皆为单字,固定第0、第2位 */
export const splitUpDown = (s: string): [string, string] => [s[0], s[2]];

/** 由本卦+动爻求变卦卦名(动爻阳变阴、阴变阳后重组上下卦查表) */
export function bianGuaName(gua: Gua, dongs: number[]): string {
  if (dongs.length === 0) return gua.卦名;
  const [up, down] = splitUpDown(gua.上下卦);
  const u = [...TRIGRAM_LINES[up]], d = [...TRIGRAM_LINES[down]];
  for (const p of dongs) {
    if (p <= 3) d[p - 1] = 1 - d[p - 1];
    else u[p - 4] = 1 - u[p - 4];
  }
  return guaOfTrigrams(LINES_TO_TRIGRAM[u.join("")], LINES_TO_TRIGRAM[d.join("")])?.卦名 ?? "?";
}

/* ==================== 时间解析 ==================== */

/** 解析 datetime(ISO 或 "YYYY-MM-DD HH:mm"),不传默认"现在"。时分缺省取午时(12) */
export function parseDT(s?: string): { y: number; m: number; d: number; h: number } {
  if (!s) {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours() };
  }
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}))?/.exec(s.trim());
  if (m) return { y: +m[1], m: +m[2], d: +m[3], h: m[4] ? +m[4] : 12 };
  const n = new Date(s);
  if (!Number.isNaN(n.getTime())) return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours() };
  throw new Error(`无法解析时间: ${s}`);
}

export function fullGanZhi(t: { y: number; m: number; d: number; h: number }) {
  return {
    ygz: gz.getYearGanZhi(t.y, t.m, t.d),
    mgz: gz.getMonthGanZhi(t.y, t.m, t.d),
    dgz: gz.getDayGanZhi(t.y, t.m, t.d),
    hgz: gz.getHourGanZhi(t.y, t.m, t.d, t.h),
  };
}

/** 动爻位规范化:1~6 的整数、去重、升序 */
export function normDongs(dongs?: number[]): number[] {
  if (!dongs) return [];
  return [...new Set(dongs.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= 6))].sort((a, b) => a - b);
}

/* ==================== 旬空/月破/旺衰 ==================== */

/** 旬空:由日干支推六甲旬(甲子/甲戌/甲申/甲午/甲辰/甲寅),空亡据 ganzhi.json·旬空 */
export function xunKong(dgz: { gan: string; zhi: string }): { xun: string; kong: string[] } {
  const g = TG.indexOf(dgz.gan);
  const z = DI.indexOf(dgz.zhi);
  let seq = z;
  for (let k = 0; k < 10; k++) {
    if ((z + 12 * k) % 10 === g) { seq = z + 12 * k; break; }
  }
  const xunZhi = ["子", "戌", "申", "午", "辰", "寅"][Math.floor(seq / 10)];
  const xun = "甲" + xunZhi;
  return { xun, kong: XUNKONG[xun] ?? [] };
}

/** 月破:月建地支所冲之支(六冲据 ganzhi.json) */
export const yuePo = (mgz: { zhi: string }): string => CHONG.get(mgz.zhi) ?? "";

/** 季节:据节气月支(寅卯辰春/巳午未夏/申酉戌秋/亥子丑冬) */
export function seasonOf(zhi: string): string {
  const i = DI.indexOf(zhi);
  if (i >= 2 && i <= 4) return "春";
  if (i >= 5 && i <= 7) return "夏";
  if (i >= 8 && i <= 10) return "秋";
  return "冬";
}

/** 爻地支五行在此季节的旺/相/休/囚/死(据 ganzhi.json 五行·旺相休囚) */
export function wangState(monthZhi: string, wx: string): string {
  const table = WANGXIANG[seasonOf(monthZhi)];
  if (!table) return "?";
  if (table.旺 === wx) return "旺";
  if (table.相 === wx) return "相";
  if (table.休 === wx) return "休";
  if (table.囚 === wx) return "囚";
  if (table.死 === wx) return "死";
  return "?";
}

/* ==================== 六亲/五行关系 ==================== */

/** 六亲规则:生我者父母,我生者子孙,克我者官鬼,我克者妻财,比和者兄弟(据 nayin.json·六亲规则) */
export function qinByWX(gongWX: string, wx: string): string {
  if (wx === gongWX) return "兄弟";
  if (SHENG.get(gongWX) === wx) return "子孙";
  if (SHENG.get(wx) === gongWX) return "父母";
  if (KE.get(gongWX) === wx) return "妻财";
  if (KE.get(wx) === gongWX) return "官鬼";
  return "?";
}

/** 五行关系:生/克/比和 */
export function relation(a: string, b: string): string {
  if (a === b) return "比和";
  if (SHENG.get(a) === b) return `${a}生${b}`;
  if (KE.get(a) === b) return `${a}克${b}`;
  if (SHENG.get(b) === a) return `${b}生${a}`;
  if (KE.get(b) === a) return `${b}克${a}`;
  return "?";
}

/* ==================== 卦身与排盘 ==================== */

/** 卦身:阳世从子月起、阴世从午月生,自初爻数至世爻位得卦身地支(据 nayin.json·卦身) */
export function guaBody(gua: Gua, gongWX: string): { zhi: string; wx: string; qin: string; line: number | null } {
  const shi = gua.世爻;
  const shiZhi = gua.纳甲[shi - 1][0].slice(1);
  const start = YANG_ZHI.has(shiZhi) ? DI.indexOf("子") : DI.indexOf("午");
  const zhi = DI[(start + shi - 1) % 12];
  const wx = zhiWX().get(zhi) ?? "";
  const idx = gua.纳甲.findIndex((n) => n[0].slice(1) === zhi);
  return { zhi, wx, qin: idx >= 0 ? gua.六亲[idx][0] : qinByWX(gongWX, wx), line: idx >= 0 ? idx + 1 : null };
}

export interface LineInfo {
  wei: string; pos: number; shen: string; qin: string; gzName: string; zhi: string; wx: string;
  isShi: boolean; isYing: boolean; isDong: boolean; isKong: boolean; isPo: boolean; state: string;
}

export interface Pan {
  gua: Gua; dongs: number[]; t: { y: number; m: number; d: number; h: number };
  gzFull: ReturnType<typeof fullGanZhi>;
  lines: LineInfo[]; body: ReturnType<typeof guaBody>;
  xk: { xun: string; kong: string[] }; poZhi: string;
  chong: string[]; he: string[]; sanhe: string[];
  shiLine: LineInfo; yingLine: LineInfo; rel: string;
  yongQin?: string[]; fushen: Record<string, { gzName: string; wx: string; fei: LineInfo; shengKe: string }>;
}

/** 排盘核心:由卦名+动爻+时间构建完整六爻盘(六神/六亲/纳甲/世应动空破/旬空/月破/六冲六合三合/旺相休囚/卦身) */
export function buildPan(name: string, dongsArg: number[], dt?: string): Pan {
  const gua = guaOf(name);
  if (!gua) throw new Error(`未找到卦:「${name}」(可查知识库/data/liushi_si_gua.json 六十四卦卦名)`);
  const dongs = normDongs(dongsArg);
  const t = parseDT(dt);
  const gzFull = fullGanZhi(t);
  const order = liuShenOrder();
  const s0 = order.indexOf(liuShenStart(gzFull.dgz.gan));
  const xk = xunKong(gzFull.dgz);
  const po = yuePo(gzFull.mgz);
  const lines: LineInfo[] = gua.纳甲.map((n, i) => {
    const pos = i + 1;
    const zhi = n[0].slice(1);
    return {
      wei: WEI[i], pos, shen: order[(s0 + i) % 6],
      qin: gua.六亲[i][0], gzName: n[0], zhi, wx: n[1],
      isShi: gua.世爻 === pos, isYing: gua.应爻 === pos, isDong: dongs.includes(pos),
      isKong: xk.kong.includes(zhi), isPo: zhi === po,
      state: wangState(gzFull.mgz.zhi, n[1]),
    };
  });
  const body = guaBody(gua, gua.宫五行);
  const zhis = lines.map((l) => l.zhi);
  const chong: string[] = [];
  const he: string[] = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      if (CHONG.get(zhis[i]) === zhis[j]) chong.push(`${WEI[i]}(${zhis[i]}) 冲 ${WEI[j]}(${zhis[j]})`);
      if (HE.get(zhis[i]) === zhis[j]) he.push(`${WEI[i]}(${zhis[i]}) 合 ${WEI[j]}(${zhis[j]})`);
    }
  }
  const sanhe: string[] = [];
  for (const s of SANHE) {
    const hit = zhis.map((z, i) => (s.三支.includes(z) ? i : -1)).filter((i) => i >= 0);
    if (hit.length >= 3) sanhe.push(`三合${s.局}局: ${hit.map((i) => `${WEI[i]}(${zhis[i]})`).join("、")}`);
  }
  const shiLine = lines[gua.世爻 - 1];
  const yingLine = lines[gua.应爻 - 1];
  const rel = relation(shiLine.wx, yingLine.wx);
  return { gua, dongs, t, gzFull, lines, body, xk, poZhi: po, chong, he, sanhe, shiLine, yingLine, rel, fushen: {} };
}
