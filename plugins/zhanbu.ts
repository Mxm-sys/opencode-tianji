/**
 * 占卜自定义工具插件:qigua(起卦)/paipan(排盘)/duangua(断卦辅助)/cha(查卦)
 *
 * 数据来源:全部取自 知识库/data/*.json(经 ../lib/db 惰性加载),
 * 卦辞/爻辞/纳甲/六亲/六神/旬空/月破/旺相休囚等一律查数据,不硬编码。
 * 计算内核复用 ../lib/ganzhi 的公历→干支换算。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as gz from "../lib/ganzhi";
import { meihuaTool } from "./meihua";
import { baziTool } from "./bazi";
import { liurenTool } from "./liuren";

/* ==================== 常量与数据表 ==================== */

const DI = gz.DI_ZHI as readonly string[];
const TG = gz.TIAN_GAN as readonly string[];
const WEI = ["初爻", "二爻", "三爻", "四爻", "五爻", "六爻"];
/** 阳支:阳世从子月起;阴世从午月生(火珠林·六亲根源;卜筮正宗·安月卦身诀) */
const YANG_ZHI = new Set(["子", "寅", "辰", "午", "申", "戌"]);
/** 先天数:乾1兑2离3震4巽5坎6艮7坤8(梅花易数·周易卦数)。余数 1~8 反推卦,余 0 取 8 = 坤 */
const NUM_TO_GUA: Record<number, string> = { 1: "乾", 2: "兑", 3: "离", 4: "震", 5: "巽", 6: "坎", 7: "艮", 8: "坤" };

/** 常用汉字笔画表(字占用)。未收录的字按 Unicode 码点 mod 8 兜底,与梅花字占"以笔画起卦"的简化近似 */
const STROKE_POS: Map<string, number> = new Map([
  ["一", 1], ["二", 2], ["三", 3], ["四", 5], ["五", 4], ["六", 4], ["七", 2], ["八", 2], ["九", 2], ["十", 2],
  ["人", 2], ["口", 3], ["日", 4], ["月", 4], ["山", 3], ["水", 4], ["火", 4], ["木", 4], ["金", 8], ["土", 3],
  ["天", 4], ["地", 6], ["大", 3], ["小", 3], ["上", 3], ["下", 3], ["中", 4], ["心", 4], ["王", 4], ["玉", 5],
  ["生", 5], ["死", 6], ["好", 6], ["坏", 7], ["男", 7], ["女", 3], ["财", 7], ["官", 8], ["我", 7], ["你", 7],
  ["他", 5], ["她", 6], ["来", 7], ["去", 5], ["是", 9], ["非", 8], ["有", 6], ["无", 4], ["成", 6], ["败", 8],
]);

/**
 * 先天八卦爻画(自下而上,1=阳 0=阴)。
 * 数据文件(liushi_si_gua.json)只存卦符与上下卦名,不存每爻阴阳;
 * 此处按通行《周易》八卦卦画硬编码(乾三连/兑上缺/离中虚/震仰盂/巽下断/坎中满/艮覆碗/坤六断),
 * 仅用于由动爻翻转上下卦求变卦名,不产生任何数据文件之外的内容。
 */
const TRIGRAM_LINES: Record<string, number[]> = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
const LINES_TO_TRIGRAM: Record<string, string> = Object.fromEntries(
  Object.entries(TRIGRAM_LINES).map(([n, l]) => [l.join(""), n]),
);

type Gua = {
  卦名: string; 卦符: string; 上下卦: string; 八宫: string; 宫五行: string;
  世爻: number; 应爻: number; 纳甲: [string, string][]; 六亲: [string, string][]; 卦辞: string;
  [k: string]: unknown;
};

const guaList = (): Gua[] => db.loadGua64() as unknown as Gua[];
const guaOf = (name: string): Gua | undefined => guaList().find((g) => g.卦名 === name);
const guaOfTrigrams = (up: string, down: string): Gua | undefined =>
  guaList().find((g) => g.上下卦 === `${up}上${down}下`);
/** "乾上乾下" → ["乾","乾"]。八卦名皆为单字,固定第0、第2位 */
const splitUpDown = (s: string): [string, string] => [s[0], s[2]];

/** 五行生克表(据 ganzhi.json 五行·相生/相克)。sheng[A]=B 即 A生B,ke[A]=B 即 A克B */
const WX_CYCLE = db.loadGanzhi().五行 as { 相生: string; 相克: string; 旺相休囚: object[] };
const SHENG = new Map<string, string>();
const KE = new Map<string, string>();
for (const [a, b] of WX_CYCLE.相生.split("，").map((x) => [x[0], x[2]] as const)) SHENG.set(a, b);
for (const [a, b] of WX_CYCLE.相克.split("，").map((x) => [x[0], x[2]] as const)) KE.set(a, b);

const zhiWX = (): Map<string, string> => new Map((db.loadGanzhi().地支 as { 支: string; 五行: string }[]).map((z) => [z.支, z.五行]));
/** 六神起例:日干→首神(据 nayin.json·六神起例) */
const liuShenStart = (gan: string): string => {
  const q = db.loadNayin().六神起例 as Record<string, string>;
  for (const [k, v] of Object.entries(q)) {
    if (k === "原文" || k === "出处") continue;
    if (k.includes(gan)) return v;
  }
  return "青龙";
};
const liuShenOrder = (): string[] => db.loadNayin().六神顺序 as unknown as string[];

const CHONG = new Map<string, string>();
for (const c of db.loadGanzhi().六冲 as { 冲: string }[]) { const s = c.冲; CHONG.set(s[0], s[1]); CHONG.set(s[1], s[0]); }
const HE = new Map<string, string>();
for (const c of db.loadGanzhi().六合 as { 合: string }[]) { const s = c.合; HE.set(s[0], s[1]); HE.set(s[1], s[0]); }
const SANHE: { 局: string; 三支: string[] }[] = (db.loadGanzhi().三合 as { 局: string; 三支: string[] }[]);
const XUNKONG: Record<string, string[]> = Object.fromEntries(
  (db.loadGanzhi().旬空 as { 旬: string; 空: string[] }[]).map((x) => [x.旬, x.空]),
);
const WANGXIANG: Record<string, { 旺: string; 相: string; 休: string; 囚: string; 死: string }> = {};
for (const x of WX_CYCLE.旺相休囚 as { 季节: string; 旺: string; 相: string; 休: string; 囚: string; 死: string }[]) {
  WANGXIANG[x.季节] = x;
}

/** 六亲规则:生我者父母,我生者子孙,克我者官鬼,我克者妻财,比和者兄弟(据 nayin.json·六亲规则) */
function qinByWX(gongWX: string, wx: string): string {
  if (wx === gongWX) return "兄弟";
  if (SHENG.get(gongWX) === wx) return "子孙";
  if (SHENG.get(wx) === gongWX) return "父母";
  if (KE.get(gongWX) === wx) return "妻财";
  if (KE.get(wx) === gongWX) return "官鬼";
  return "?";
}

/* ==================== 时间解析 ==================== */

/** 解析 datetime(ISO 或 "YYYY-MM-DD HH:mm"),不传默认"现在"。时分缺省取午时(12) */
function parseDT(s?: string): { y: number; m: number; d: number; h: number } {
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

function fullGanZhi(t: { y: number; m: number; d: number; h: number }) {
  return {
    ygz: gz.getYearGanZhi(t.y, t.m, t.d),
    mgz: gz.getMonthGanZhi(t.y, t.m, t.d),
    dgz: gz.getDayGanZhi(t.y, t.m, t.d),
    hgz: gz.getHourGanZhi(t.y, t.m, t.d, t.h),
  };
}

/** 动爻位规范化:1~6 的整数、去重、升序 */
function normDongs(dongs?: number[]): number[] {
  if (!dongs) return [];
  return [...new Set(dongs.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= 6))].sort((a, b) => a - b);
}

/** 由本卦+动爻求变卦卦名(动爻阳变阴、阴变阳后重组上下卦查表) */
function bianGuaName(gua: Gua, dongs: number[]): string {
  if (dongs.length === 0) return gua.卦名;
  const [up, down] = splitUpDown(gua.上下卦);
  const u = [...TRIGRAM_LINES[up]], d = [...TRIGRAM_LINES[down]];
  for (const p of dongs) {
    if (p <= 3) d[p - 1] = 1 - d[p - 1];
    else u[p - 4] = 1 - u[p - 4];
  }
  return guaOfTrigrams(LINES_TO_TRIGRAM[u.join("")], LINES_TO_TRIGRAM[d.join("")])?.卦名 ?? "?";
}

/* ==================== 排盘计算 ==================== */

/** 旬空:由日干支推六甲旬(甲子/甲戌/甲申/甲午/甲辰/甲寅),空亡据 ganzhi.json·旬空 */
function xunKong(dgz: { gan: string; zhi: string }): { xun: string; kong: string[] } {
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
const yuePo = (mgz: { zhi: string }): string => CHONG.get(mgz.zhi) ?? "";

/** 季节:据节气月支(寅卯辰春/巳午未夏/申酉戌秋/亥子丑冬) */
function seasonOf(zhi: string): string {
  const i = DI.indexOf(zhi);
  if (i >= 2 && i <= 4) return "春";
  if (i >= 5 && i <= 7) return "夏";
  if (i >= 8 && i <= 10) return "秋";
  return "冬";
}

/** 爻地支五行在此季节的旺/相/休/囚/死(据 ganzhi.json·五行·旺相休囚) */
function wangState(monthZhi: string, wx: string): string {
  const table = WANGXIANG[seasonOf(monthZhi)];
  if (!table) return "?";
  if (table.旺 === wx) return "旺";
  if (table.相 === wx) return "相";
  if (table.休 === wx) return "休";
  if (table.囚 === wx) return "囚";
  if (table.死 === wx) return "死";
  return "?";
}

/** 卦身:阳世从子月起、阴世从午月生,自初爻数至世爻位得卦身地支(据 nayin.json·卦身/06安月卦身诀) */
function guaBody(gua: Gua, gongWX: string): { zhi: string; wx: string; qin: string; line: number | null } {
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

/** 占事→用神六亲(据 docs/07_分类占断.md 附:分类取用总表)。'世'/'应' 为特殊用神 */
function yongShenFor(shi: string): { use: string[]; note: string } {
  const S: Record<string, { use: string[]; note: string }> = {
    求财: { use: ["妻财"], note: "妻财为用神,子孙为原神" },
    功名: { use: ["官鬼"], note: "官鬼为用神,父母为文书" },
    婚姻: { use: ["妻财", "官鬼"], note: "男占以妻财为用,女占以官鬼为用(此盘双看)" },
    疾病: { use: ["官鬼", "子孙"], note: "官鬼为病、子孙为药;自占以世为用" },
    出行: { use: ["世", "应"], note: "世为己、应为地头" },
    行人: { use: ["应"], note: "行人以应爻为用(亲者用六亲)" },
    词讼: { use: ["官鬼"], note: "下状告人看官鬼旺相" },
    失物: { use: ["妻财"], note: "失物专看财爻,贼看官鬼、捕看子孙" },
    家宅: { use: ["父母"], note: "盖造买宅看世与父爻" },
    天时: { use: ["父母", "子孙"], note: "父母为雨、子孙为晴" },
    胎孕: { use: ["子孙"], note: "亲占代占皆以子孙为用" },
    终身: { use: ["世"], note: "终身财福看世财福,寿元独重世爻" },
    其他: { use: ["世"], note: "未定类别,以世爻为用神参考" },
  };
  const cat = Object.keys(S).find((k) => k !== "其他" && shi.includes(k));
  return S[cat ?? "其他"];
}

function buildPan(name: string, dongsArg: number[], dt?: string): Pan {
  const gua = guaOf(name);
  if (!gua) throw new Error(`未找到卦:「${name}」(可查知识库/data/liushi_si_gua.json 六十四卦卦名)`);
  const dongs = normDongs(dongsArg);
  const t = parseDT(dt);
  const gzFull = fullGanZhi(t);
  const wxMap = zhiWX();
  const s0 = liuShenOrder().indexOf(liuShenStart(gzFull.dgz.gan));
  const xk = xunKong(gzFull.dgz);
  const po = yuePo(gzFull.mgz);
  const lines: LineInfo[] = gua.纳甲.map((n, i) => {
    const pos = i + 1;
    const zhi = n[0].slice(1);
    return {
      wei: WEI[i], pos, shen: liuShenOrder()[(s0 + i) % 6],
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

/** 五行关系:生/克/比和 */
function relation(a: string, b: string): string {
  if (a === b) return "比和";
  if (SHENG.get(a) === b) return `${a}生${b}`;
  if (KE.get(a) === b) return `${a}克${b}`;
  if (SHENG.get(b) === a) return `${b}生${a}`;
  if (KE.get(b) === a) return `${b}克${a}`;
  return "?";
}

/** 飞伏神:用神六亲在卦中缺失时,自本宫首卦(八纯卦)同位取伏神,伏于本卦该爻(飞神)之下(据 docs/05_六爻排盘.md 飞伏神) */
function fillFuShen(pan: Pan, yongQin: string): void {
  const qins = pan.lines.map((l) => l.qin);
  if (qins.includes(yongQin)) return;
  const pureName = pan.gua.八宫[0];
  const pure = guaOf(pureName);
  if (!pure) return;
  const idx = pure.六亲.findIndex((q) => q[0] === yongQin);
  if (idx < 0) return;
  const fei = pan.lines[idx];
  const fvWX = pure.纳甲[idx][1];
  const rel = relation(fei.wx, fvWX);
  pan.fushen[yongQin] = {
    gzName: pure.纳甲[idx][0], wx: pure.纳甲[idx][1], fei,
    shengKe: rel.includes("生") ? (rel.startsWith(fei.wx) ? "飞来生伏,伏神得生扶" : "伏去生飞,泄气") :
             rel.includes("克") ? (rel.startsWith(fei.wx) ? "飞来克伏" : "伏克飞") : "飞伏比和",
  };
}

/* ==================== 输出辅助 ==================== */

function lineFlags(l: LineInfo): string {
  const f: string[] = [];
  if (l.isShi) f.push("世");
  if (l.isYing) f.push("应");
  if (l.isDong) f.push("动");
  if (l.isKong) f.push("空");
  if (l.isPo) f.push("破");
  return f.length ? `  [${f.join("·")}]` : "";
}

function fmtDT(t: { y: number; m: number; d: number; h: number }): string {
  return `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")} ${String(t.h).padStart(2, "0")}:00`;
}

function guzhiStr(g: ReturnType<typeof fullGanZhi>): string {
  return `${g.ygz.gan}${g.ygz.zhi}年 ${g.mgz.gan}${g.mgz.zhi}月 ${g.dgz.gan}${g.dgz.zhi}日 ${g.hgz.gan}${g.hgz.zhi}时`;
}

/* ==================== 工具 1:起卦 ==================== */

async function qigua(args: {
  method?: string; datetime?: string; 卦名?: string; 动爻?: number[]; 数?: number[]; 字?: string;
}): Promise<string> {
  const method = args.method ?? "time";
  const t = parseDT(args.datetime);
  const gzFull = fullGanZhi(t);
  const mName = method === "time" ? "梅花易数时间起卦" : method === "coins" ? "三枚铜钱六掷" :
    method === "shu" ? "报数起卦" : method === "zi" ? "字占起卦" : "手动指定卦名";
  const out: string[] = [`【起卦·${mName}】`, ""];
  out.push(`起卦时间: ${fmtDT(t)}   ${guzhiStr(gzFull)}`, "");

  let gua: Gua;
  let dongs: number[] = [];
  let throwLines: string[] = [];

  if (method === "shu") {
    // 报数起卦(梅花易数·物数占):取一至三个数;上卦=第一数÷8余(0取8),
    // 下卦=第二数÷8余(缺省取 第一数+时辰 或 第三数),动爻=(两数之和或第三数)÷6(0取6)。
    const nums = (args.数 ?? []).map((n) => Math.round(Math.abs(n))).filter((n) => n > 0);
    if (!nums.length) throw new Error("shu 方式需提供 数(报出的数字,1~3 个)");
    const hz = DI.indexOf(gzFull.hgz.zhi) + 1;
    const up = NUM_TO_GUA[nums[0] % 8 === 0 ? 8 : nums[0] % 8];
    const second = nums[1] ?? nums[0] + hz;
    const dn = NUM_TO_GUA[second % 8 === 0 ? 8 : second % 8];
    const total = nums[2] ?? nums[0] + second;
    const dong = total % 6 === 0 ? 6 : total % 6;
    gua = guaOfTrigrams(up, dn)!;
    dongs = [dong];
    out.push(
      `所报数: ${nums.join("、")}${nums.length < 3 ? `(补第${nums.length + 1}数 = 第1数+时辰${gzFull.hgz.zhi}=${hz} → ${second};补第3数 = ${total})` : ""}`,
      `上卦 = ${nums[0]}÷8 余${nums[0] % 8 || "0(取8)"} = ${up}   下卦 = ${second}÷8 余${second % 8 || "0(取8)"} = ${dn}`,
      `动爻 = ${total}÷6 余${total % 6 || "0(取6)"} = 第${dong}爻`,
      "",
    );
  } else if (method === "zi") {
    // 字占(梅花易数·字占/声音占):以字笔画总数(或字数)起卦。
    // 一字:以该字笔画数为上卦,上卦+时辰为下卦,总数÷6取动爻;
    // 多字:平分字数,上卦=前半总笔画÷8余,下卦=后半总笔画÷8余,动爻=(前后笔画和)÷6余。
    if (!args.字) throw new Error("zi 方式需提供 字(所报之字)");
    const chars = [...args.字.trim()];
    const hz = DI.indexOf(gzFull.hgz.zhi) + 1;
    const strokes = (ch: string) => {
      const p = STROKE_POS.get(ch);
      if (p !== undefined) return p;
      if (ch >= "一" && ch <= "十") return "一二三四五六七八九十".indexOf(ch) + 1;
      return ch.codePointAt(0)! % 8 || 8;
    };
    if (chars.length === 1) {
      const n = strokes(chars[0]);
      const up = NUM_TO_GUA[n % 8 === 0 ? 8 : n % 8];
      const dn = NUM_TO_GUA[(n + hz) % 8 === 0 ? 8 : (n + hz) % 8];
      const dong = (n + hz) % 6 === 0 ? 6 : (n + hz) % 6;
      gua = guaOfTrigrams(up, dn)!;
      dongs = [dong];
      out.push(`单字「${args.字}」笔画≈${n}(据笔画表/余8),上卦=${up},下卦=${n}+时${gzFull.hgz.zhi}=${n + hz}→${dn},动爻=${dong}`, "");
    } else {
      const half = Math.ceil(chars.length / 2);
      const head = chars.slice(0, half), tail = chars.slice(half);
      const hs = head.reduce((a, c) => a + strokes(c), 0);
      const ts = tail.reduce((a, c) => a + strokes(c), 0);
      const up = NUM_TO_GUA[hs % 8 === 0 ? 8 : hs % 8];
      const dn = NUM_TO_GUA[ts % 8 === 0 ? 8 : ts % 8];
      const dong = (hs + ts) % 6 === 0 ? 6 : (hs + ts) % 6;
      gua = guaOfTrigrams(up, dn)!;
      dongs = [dong];
      out.push(
        `「${args.字}」${chars.length}字,前半「${head.join("")}」笔画${hs},后半「${tail.join("")}」笔画${ts}`,
        `上卦 = ${hs}÷8 余${hs % 8 || "0(取8)"} = ${up}   下卦 = ${ts}÷8 余${ts % 8 || "0(取8)"} = ${dn}`,
        `动爻 = ${hs + ts}÷6 余${(hs + ts) % 6 || "0(取6)"} = 第${dong}爻`,
        "",
      );
    }
  } else if (method === "time") {
    // 年支序号(子1..亥12),按当年立春后之年支;月数取节气月序号(寅月=1..丑月=12,近农历月);
    // 日数取公历日;时辰序号(子1..亥12)。上卦=(年支+月数+日数)÷8 余(0取8),
    // 下卦=(再+时辰)÷8,动爻=(总数)÷6(0取6)。先天数:乾1兑2离3震4巽5坎6艮7坤8。
    const yz = DI.indexOf(gzFull.ygz.zhi) + 1;
    const mz = (DI.indexOf(gzFull.mgz.zhi) - DI.indexOf("寅") + 12) % 12 + 1;
    const dz = t.d;
    const hz = DI.indexOf(gzFull.hgz.zhi) + 1;
    const base = yz + mz + dz;
    const up = NUM_TO_GUA[base % 8 === 0 ? 8 : base % 8];
    const dn = NUM_TO_GUA[(base + hz) % 8 === 0 ? 8 : (base + hz) % 8];
    const dong = (base + hz) % 6 === 0 ? 6 : (base + hz) % 6;
    gua = guaOfTrigrams(up, dn)!;
    dongs = [dong];
    out.push(
      `时间数: 年支${gzFull.ygz.zhi}=${yz} + 月${gzFull.mgz.zhi}=${mz} + 日=${dz} = ${base}`,
      `上卦 = ${base}÷8 余${base % 8 || "0(取8)"} = ${up}   下卦 = ${base}+时辰${gzFull.hgz.zhi}=${hz} → ${base + hz}÷8 余${(base + hz) % 8 || "0(取8)"} = ${dn}`,
      `动爻 = ${base + hz}÷6 余${(base + hz) % 6 || "0(取6)"} = 第${dong}爻`,
      "",
    );
  } else if (method === "coins") {
    // 模拟三枚铜钱六掷:三背=老阳(9,动)、三字=老阴(6,动)、二背一字=少阳(7)、一背二字=少阴(8)
    const lineStrs: string[] = [];
    for (let i = 0; i < 6; i++) {
      const backs = [0, 1, 2].map(() => (Math.random() < 0.5 ? 1 : 0)).reduce((a, b) => a + b, 0);
      const kind = backs === 3 ? "老阳(9·动)" : backs === 0 ? "老阴(6·动)" : backs === 2 ? "少阳(7)" : "少阴(8)";
      const yang = backs >= 2;
      lineStrs.push(`${WEI[i]}: ${backs}背 → ${kind}${yang ? "⚊" : "⚋"}`);
      if (backs === 3 || backs === 0) dongs.push(i + 1);
    }
    out.push("掷卦(由下而上):", ...lineStrs.map((s) => `  ${s}`), "");
    const b = new Array<string>(6).fill("0");
    for (const [i, s] of lineStrs.entries()) b[i] = s.includes("⚊") ? "1" : "0";
    // 由六爻串反推上下卦
    const down = LINES_TO_TRIGRAM[b.slice(0, 3).join("")];
    const up = LINES_TO_TRIGRAM[b.slice(3, 6).join("")];
    gua = guaOfTrigrams(up, down)!;
  } else {
    if (!args.卦名) throw new Error("manual 方式需提供 卦名");
    gua = guaOf(args.卦名) ?? (() => { throw new Error(`未找到卦:「${args.卦名}」`); })();
    dongs = normDongs(args.动爻);
  }

  const bian = bianGuaName(gua, dongs);
  const bianGua = dongs.length ? guaOf(bian) : undefined;
  out.push(
    `──────────────────────────────`,
    `本卦: ${gua.卦名}(${gua.上下卦}) ${gua.卦符}`,
    `八宫: ${gua.八宫}  宫五行: ${gua.宫五行}   世在${WEI[gua.世爻 - 1]} 应在${WEI[gua.应爻 - 1]}`,
    `动爻位: ${dongs.length ? dongs.map((d) => WEI[d - 1]).join("、") : "无(静卦)"}`,
    `变卦: ${dongs.length ? `${bian}(${bianGua?.上下卦}) ${bianGua?.卦符 ?? ""}` : "无(静卦)"}`,
    "",
    `本卦卦辞: ${gua.卦辞}  (据 liushi_si_gua.json)`,
  );
  if (bianGua) out.push(`变卦卦辞: ${bianGua.卦辞}  (据 liushi_si_gua.json)`);
  out.push("", "数据出处: 起卦算法据梅花易数·时间起卦/增删卜易·铜钱卦;卦名/卦辞/世应据 liushi_si_gua.json");
  return out.join("\n");
}

/* ==================== 工具 2:排盘 ==================== */

async function paipan(args: { 卦名: string; 动爻?: number[]; datetime?: string; 占事?: string }): Promise<string> {
  const pan = buildPan(args.卦名, args.动爻, args.datetime);
  const { gua, dongs, gzFull, lines, body, xk, poZhi, shiLine, yingLine } = pan;
  const out: string[] = [
    `【排盘】${gua.卦名} ${gua.卦符} (${gua.上下卦})`,
    `八宫: ${gua.八宫}  宫五行: ${gua.宫五行}   世在${WEI[gua.世爻 - 1]} 应在${WEI[gua.应爻 - 1]}   ` +
      `起卦: ${fmtDT(pan.t)} ${guzhiStr(gzFull)}`,
    `动爻位: ${dongs.length ? dongs.map((d) => WEI[d - 1]).join("、") : "无(静卦)"}`,
    `──────────────────────────────`,
  ];
  for (const l of [...lines].reverse()) {
    out.push(`  ${l.wei}  ${l.shen}  ${l.qin}  ${l.gzName}${l.wx}${lineFlags(l)}`);
  }
  out.push(
    `──────────────────────────────`,
    `六神: 据 nayin.json·六神起例(${gzFull.dgz.gan}日起${liuShenStart(gzFull.dgz.gan)}),自初爻起按六神顺序排`,
    `卦身: ${body.zhi}${body.wx}(${body.qin})${body.line ? `,于${WEI[body.line - 1]}` : ",不上卦"}  (阳世从子月起/阴世从午月生,自初爻数至世爻,据 nayin.json·卦身)`,
    `旬空: ${xk.xun}旬 空[${xk.kong.join("、")}]   空亡爻: ${lines.filter((l) => l.isKong).map((l) => l.wei).join("、") || "无"}  (据 ganzhi.json·旬空)`,
    `月破: ${gzFull.mgz.zhi}月冲${poZhi}   破爻: ${lines.filter((l) => l.isPo).map((l) => l.wei).join("、") || "无"}  (据 ganzhi.json·六冲)`,
    `六冲: ${pan.chong.length ? pan.chong.join("；") : "无"}   六合: ${pan.he.length ? pan.he.join("；") : "无"}   三合: ${pan.sanhe.length ? pan.sanhe.join("；") : "无"}`,
    `旺相休囚(${gzFull.mgz.zhi}月·${seasonOf(gzFull.mgz.zhi)}季,据 ganzhi.json·五行·旺相休囚): ${lines.map((l) => `${l.wei}${l.zhi}${l.wx}${l.state}`).join("、")}`,
    `世应关系: 世(${shiLine.gzName}${shiLine.wx}) 与 应(${yingLine.gzName}${yingLine.wx}) → ${pan.rel}`,
  );
  if (args.占事) {
    const ys = yongShenFor(args.占事);
    for (const q of ys.use) fillFuShen(pan, q);
    out.push(`─ 用神(${args.占事}) ─`, `  取用: ${ys.note} (据 docs/07_分类占断.md 附:分类取用总表)`);
    for (const q of ys.use) {
      const hit = lines.filter((l) => l.qin === q);
      if (hit.length) {
        for (const l of hit) {
          out.push(`  ${q}现于${l.wei}(${l.gzName}${l.wx}),${l.state}${l.isDong ? ",发动" : ""}${l.isKong ? ",旬空" : ""}${l.isPo ? ",月破" : ""}${l.isShi ? ",持世" : ""}`);
        }
      } else if (pan.fushen[q]) {
        const f = pan.fushen[q];
        out.push(`  ${q}不上卦,伏神${q}${f.gzName}${f.wx}伏于${f.fei.wei}${f.fei.qin}(${f.fei.gzName}${f.fei.wx})之下 → ${f.shengKe}`);
      } else {
        out.push(`  卦中无${q}爻`);
      }
    }
  }
  out.push("", "数据出处: 纳甲/六亲/世应/八宫据 liushi_si_gua.json;六神/卦身据 nayin.json;旬空/月破/旺相休囚/六冲六合三合据 ganzhi.json");
  return out.join("\n");
}

/* ==================== 工具 3:断卦辅助 ==================== */

async function duangua(args: {
  卦名: string; 动爻?: number[]; datetime?: string; 占事: string;
}): Promise<string> {
  const pan = buildPan(args.卦名, args.动爻, args.datetime);
  const ys = yongShenFor(args.占事);
  const { gua, gzFull, shiLine, yingLine, xk } = pan;
  const out: string[] = [
    `【断卦辅助】占事:${args.占事}   卦:${gua.卦名} ${gua.卦符} (${gua.上下卦})`,
    `起卦: ${fmtDT(pan.t)} ${guzhiStr(gzFull)}   动爻位: ${pan.dongs.length ? pan.dongs.join("、") : "无(静卦)"}`,
    `──────────────────────────────`,
    `── 用神 ──`,
    `取用: ${ys.note} (据 docs/07_分类占断.md 附:分类取用总表)`,
  ];
  const verdicts: string[] = [];
  for (const q of ys.use) {
    fillFuShen(pan, q);
    const hit = pan.lines.filter((l) => l.qin === q);
    if (hit.length) {
      for (const l of hit) {
        out.push(`  ${q}现于${l.wei}(${l.gzName}${l.wx}),处${l.state}${l.isDong ? ",发动" : ",安静"}${l.isKong ? ",旬空" : ""}${l.isPo ? ",月破" : ""}${l.isShi ? ",持世" : ""}`);
      }
      const good = hit.some((l) => (l.state === "旺" || l.state === "相") && !l.isKong && !l.isPo);
      const bad = hit.some((l) => l.isKong || l.isPo || l.state === "死" || l.state === "囚");
      verdicts.push(`${q}: ${good ? "旺相有气,主吉" : bad ? "失陷(空/破/衰死),主不利" : "平(有气但未旺)"}`);
    } else if (pan.fushen[q]) {
      const f = pan.fushen[q];
      out.push(`  ${q}不上卦,伏神${f.gzName}${f.wx}伏于${f.fei.wei}${f.fei.qin}(${f.fei.gzName}${f.fei.wx})之下 → ${f.shengKe}`);
      verdicts.push(`${q}: 伏神${f.shengKe.includes("生扶") ? "得生扶,可用" : "未得生扶,谨慎"}`);
    } else {
      out.push(`  卦中无${q}爻`);
      verdicts.push(`${q}: 卦中不现`);
    }
  }
  out.push(
    `── 世应 ──`,
    `世在${shiLine.wei}(${shiLine.gzName}${shiLine.wx}),应在${yingLine.wei}(${yingLine.gzName}${yingLine.wx}),世应关系:${pan.rel}`,
    `  世应相生相合为宾主相投,相克相冲为两情不睦(据增删卜易·世应论用神)`,
    `── 吉凶倾向 ──`,
    ...verdicts.map((v) => `  ${v}`),
    `── 注意事项 ──`,
    `  ${yuNote(args.占事)}`,
  );
  out.push("", "以上为规则性辅助,最终解读由解读方结合卦辞爻辞综合判断。");
  return out.join("\n");
}

/** 各占事忌神/要点(据 docs/07_分类占断.md 各节) */
function yuNote(shi: string): string {
  const notes: Record<string, string> = {
    求财: "兄弟为忌神(劫财),兄爻持世或发动则求之难;父动克子伤财源,缘木求鱼",
    功名: "子孙剥官,子孙持世或发动则功名不成;官父同旺为吉",
    婚姻: "男忌兄弟、女忌子孙持世;财官旺相、卦逢六合为吉,六冲为凶",
    疾病: "自占以世为用,代占以六亲为用;用神空破墓绝受克则凶,子孙旺相为药到病除",
    出行: "世旺宜行、世空宜止;应空破墓绝不宜往;子孙持世百祸潜消",
    行人: "用神克世即归、世克用未动;用神墓绝空破归信杳然",
    词讼: "官鬼旺相出现必赢,子孙持世必不成非;财动折理不可兴讼",
    失物: "财爻旺相不空不动可见;玄武带鬼为盗象,鬼空寻不见",
    家宅: "盖造买宅看世与父爻,旺相不犯冲克即宜成;六合吉六冲不久",
    天时: "父母旺动则雨,子孙旺动则晴;财动克父生孙主晴",
    胎孕: "子孙旺相逢生扶为成孕,空破衰绝为虚;问产妇安否以妻财为用",
    终身: "终身财福看世、财、福三爻无失陷;寿元独重世爻",
  };
  const cat = Object.keys(notes).find((k) => shi.includes(k)) ?? "其他";
  return notes[cat] ?? "综合看世应生克与六亲旺衰,忌用神空破墓绝";
}

/* ==================== 工具 4:查卦 ==================== */

async function cha(args: { 卦名: string; 动爻?: number[] }): Promise<string> {
  const gua = guaOf(args.卦名);
  if (!gua) throw new Error(`未找到卦:「${args.卦名}」`);
  const dongs = normDongs(args.动爻);
  const out: string[] = [
    `【查卦】${gua.卦名} ${gua.卦符} (${gua.上下卦})`,
    `──────────────────────────────`,
    `【卦辞】${gua.卦辞}  (据 liushi_si_gua.json)`,
  ];
  const yaoci = (db.loadYaoci() as { 六十四卦: { 卦名: string; 卦辞: string; 爻辞: { 爻名: string; 爻辞: string }[]; 用?: string }[] }).六十四卦.find((x) => x.卦名 === args.卦名);
  if (yaoci) {
    out.push(`【爻辞】${dongs.length ? `(动爻位:${dongs.join("、")}已标 ★)` : "(静卦)"}  (据 爻辞.json)`);
    yaoci.爻辞.forEach((y, i) => {
      const dong = dongs.includes(i + 1);
      out.push(`  ${y.爻名}${dong ? " ★动★" : ""} ${y.爻辞}`);
    });
    if (yaoci.用) out.push(`【用】${yaoci.用}  (据 爻辞.json)`);
  }
  const bian = bianGuaName(gua, dongs);
  const bianGua = dongs.length ? guaOf(bian) : undefined;
  out.push(
    `【变卦】${dongs.length ? `${bian} ${bianGua?.卦符 ?? ""} (${bianGua?.上下卦 ?? ""})` : "无(静卦)"}` +
      `${bianGua ? `  卦辞:${bianGua.卦辞} (据 liushi_si_gua.json)` : ""}`,
  );
  const yilin = (db.loadYilin() as { 易林: Record<string, Record<string, string>> }).易林;
  const section = yilin[`${gua.卦名}之`];
  const poem = section?.[bian];
  out.push(`【焦氏易林】${gua.卦名}之${bian}: ${poem ?? "(易林中无此条)"}  (据 yilin.json)`);
  const baguas = db.loadBaguas() as { 卦名: string; 卦象: string; 卦德: string; 五行: string; 后天方位: string; 取象: string }[];
  const [up, down] = splitUpDown(gua.上下卦);
  for (const [pos, b] of ([[up, "上卦"], [down, "下卦"]] as const)) {
    const info = baguas.find((x) => x.卦名 === b);
    if (info) out.push(`【${pos}·${info.卦名}象意】卦象${info.卦象},德${info.卦德},五行${info.五行},方位${info.后天方位};取象:${info.取象}  (据 bagua.json)`);
  }
  out.push("", "数据出处: 卦辞/变卦据 liushi_si_gua.json;爻辞/用九用六据 爻辞.json;易林据 yilin.json;八卦象意据 bagua.json");
  return out.join("\n");
}

/* ==================== 工具定义与插件导出 ==================== */

const qiguaTool = tool({
  description: "起卦:支持梅花易数时间起卦、三枚铜钱六掷、报数起卦、字占起卦、手动指定卦名。输出本卦/变卦/卦辞/世应/起卦干支。",
  args: {
    method: tool.schema.enum(["time", "coins", "shu", "zi", "manual"]).describe("time=梅花易数时间起卦,coins=三枚铜钱六掷,shu=报数起卦(用 数),zi=字占起卦(用 字),manual=手动指定卦名").default("time"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    卦名: tool.schema.string().optional().describe("manual 方式必填,64卦卦名如:乾"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6,自下而上)"),
    数: tool.schema.array(tool.schema.number()).optional().describe("shu 方式报出的数字(1-3个,如 [7,3,15])"),
    字: tool.schema.string().optional().describe("zi 方式所报之字(笔画起卦,支持单字/多字)"),
  },
  execute: qigua,
});

const paipanTool = tool({
  description: "排盘:输出六爻排盘(六神/六亲/纳甲/五行、世应动空破)、卦身、旬空、月破、六冲六合三合、旺相休囚、飞伏神。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6)"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    占事: tool.schema.string().optional().describe("占问之事,如:求财"),
  },
  execute: paipan,
});

const duanguaTool = tool({
  description: "断卦辅助:按占事取用神,结合旺衰动空破与世应关系给出规则性吉凶倾向。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6)"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    占事: tool.schema.enum(["求财", "功名", "婚姻", "疾病", "出行", "行人", "词讼", "失物", "家宅", "天时", "胎孕", "终身", "其他"]).describe("占问门类"),
  },
  execute: duangua,
});

const chaTool = tool({
  description: "查卦:卦辞、爻辞(动爻高亮)、乾坤用九用六、变卦卦辞、焦氏易林变诗、上下卦八卦象意。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6)"),
  },
  execute: cha,
});

const zhanbuTools = { qigua: qiguaTool, paipan: paipanTool, duangua: duanguaTool, cha: chaTool, meihua: meihuaTool, bazi: baziTool, liuren: liurenTool };

const plugin: Plugin = async () => ({ tool: zhanbuTools });
export default plugin;
