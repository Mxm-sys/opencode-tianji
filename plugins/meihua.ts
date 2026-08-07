/**
 * 梅花易数体用断卦工具:meihua
 *
 * 依《梅花易数》体用生克篇:无动爻之卦为体、有动爻之卦为用,
 * 体为主、用为事、互卦为事之中应、变卦为事之末应;按五行生克断吉凶、
 * 按季节看体卦卦气旺衰,并按十八类占断辞出白话断语。
 * 数据:体用判定/互卦起例/卦气旺衰/体用生克总诀/十八类占断辞据 meihua.json;
 * 五行生克据 ganzhi.json·五行;八卦五行据 bagua.json。均经 ../lib/db 加载。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as gz from "../lib/ganzhi";
import * as fs from "node:fs";
import * as path from "node:path";

const DI = gz.DI_ZHI as readonly string[];
const WEI = ["初爻", "二爻", "三爻", "四爻", "五爻", "六爻"];

/** 先天八卦爻画(自下而上,1=阳 0=阴),与 zhanbu.ts 一致 */
const TRIGRAM_LINES: Record<string, number[]> = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
const LINES_TO_TRIGRAM: Record<string, string> = Object.fromEntries(
  Object.entries(TRIGRAM_LINES).map(([n, l]) => [l.join(""), n]),
);

type Gua = { 卦名: string; 卦符: string; 上下卦: string; [k: string]: unknown };

const guaList = (): Gua[] => db.loadGua64() as unknown as Gua[];
const guaOf = (name: string): Gua | undefined => guaList().find((g) => g.卦名 === name);
const guaOfTrigrams = (up: string, down: string): Gua | undefined =>
  guaList().find((g) => g.上下卦 === `${up}上${down}下`);
const splitUpDown = (s: string): [string, string] => [s[0], s[2]];

/** 五行生克表(据 ganzhi.json 五行·相生/相克) */
const WX_CYCLE = db.loadGanzhi().五行 as { 相生: string; 相克: string };
const SHENG = new Map<string, string>();
const KE = new Map<string, string>();
for (const [a, b] of WX_CYCLE.相生.split("，").map((x) => [x[0], x[2]] as const)) SHENG.set(a, b);
for (const [a, b] of WX_CYCLE.相克.split("，").map((x) => [x[0], x[2]] as const)) KE.set(a, b);

/** 八卦五行与卦符(据 bagua.json) */
const BAGUA = db.loadBaguas() as { 卦名: string; 卦符: string; 五行: string }[];
const BAGUA_WX = new Map(BAGUA.map((b) => [b.卦名, b.五行]));
const BAGUA_SYM = new Map(BAGUA.map((b) => [b.卦名, b.卦符]));

/** meihua.json(包内 data,与 db.ts 同路径)。db.ts 未提供专用 loader,此处直读 */
type MeihuaJson = {
  体用判定: { 原文: string; 出处: string };
  互卦起例: { 原文: string; 出处: string };
  卦气旺衰: { 盛: Record<string, string[]>; 衰: Record<string, string[]>; 原文旺: string; 原文衰: string; 出处: string };
  体用生克总诀: { 原文: string; 出处: string };
  十八类占断辞: Record<string, { 原文: string; 白话: string; 出处: string }>;
};
let meihuaCache: MeihuaJson | null = null;
function loadMeihua(): MeihuaJson {
  if (!meihuaCache) {
    const p = path.join(db.DATA_DIR, "meihua.json");
    meihuaCache = JSON.parse(fs.readFileSync(p, "utf8")) as MeihuaJson;
  }
  return meihuaCache;
}

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

/** 动爻位规范化:1~6 的整数、去重、升序 */
function normDongs(dongs?: number[]): number[] {
  if (!dongs) return [];
  return [...new Set(dongs.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= 6))].sort((a, b) => a - b);
}

/** 季节:据节气月支(寅卯辰春/巳午未夏/申酉戌秋/亥子丑冬) */
function seasonOf(zhi: string): string {
  const i = DI.indexOf(zhi);
  if (i >= 2 && i <= 4) return "春";
  if (i >= 5 && i <= 7) return "夏";
  if (i >= 8 && i <= 10) return "秋";
  return "冬";
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

/** 互卦:去初爻(第1爻)与上爻(第6爻),中四爻分两卦;下互=2、3、4爻,上互=3、4、5爻 */
function huGua(gua: Gua): { down: string; up: string } {
  const [up, down] = splitUpDown(gua.上下卦);
  const lines = [...TRIGRAM_LINES[down], ...TRIGRAM_LINES[up]]; // 自下而上 6 爻
  const d = LINES_TO_TRIGRAM[[lines[1], lines[2], lines[3]].join("")];
  const u = LINES_TO_TRIGRAM[[lines[2], lines[3], lines[4]].join("")];
  return { down: d, up: u };
}

/** 体用:用卦为动爻所在之卦且动则变,取变卦中该卦;体卦为本卦静卦。
 * 动爻在下卦(1-3)则 用=变卦下卦、体=本卦上卦;动爻在上卦(4-6)则 用=变卦上卦、体=本卦下卦。 */
function tiYong(gua: Gua, dongs: number[], bian?: Gua): { ti: string; yong: string; note: string } {
  const [up, down] = splitUpDown(gua.上下卦);
  const [bUp, bDown] = bian ? splitUpDown(bian.上下卦) : [up, down];
  const n = dongs.length;
  if (n === 0 || n === 6) {
    return {
      ti: down, yong: up,
      note: n === 0
        ? "无动爻(静卦):两卦皆无动爻,按梅花常规取上卦为用、下卦为体"
        : "六爻全动:两卦皆有动爻,按梅花常规取上卦为用、下卦为体",
    };
  }
  const lower = dongs.filter((x) => x <= 3);
  const upper = dongs.filter((x) => x >= 4);
  if (lower.length && upper.length) {
    const main = Math.min(...dongs);
    return main <= 3
      ? { ti: bUp, yong: bDown, note: `上下卦皆有动爻,以主爻(最下动爻${WEI[main - 1]})定用为变卦下卦` }
      : { ti: bDown, yong: bUp, note: `上下卦皆有动爻,以主爻(最下动爻${WEI[main - 1]})定用为变卦上卦` };
  }
  if (lower.length) return { ti: bUp, yong: bDown, note: "动爻在下卦(初~三爻),用为变卦下卦、体为本卦上卦" };
  return { ti: bDown, yong: bUp, note: "动爻在上卦(四~六爻),用为变卦上卦、体为本卦下卦" };
}

/** 体用生克断吉凶:体克用=吉、用克体=凶、体生用=泄气(不利)、用生体=吉(得生)、比和=吉(据 meihua.json·体用生克总诀) */
function shengKe(tiWX: string, yongWX: string): { label: string; verdict: string; plain: string } {
  if (tiWX === yongWX) return { label: "比和", verdict: "吉", plain: "体卦与用卦五行相同,彼此相合不生不克,主吉顺遂" };
  if (KE.get(tiWX) === yongWX) return { label: "体克用", verdict: "吉", plain: "体卦(代表你自己/主体)五行克制用卦(所问之事),主动权在自己手里,主吉" };
  if (KE.get(yongWX) === tiWX) return { label: "用克体", verdict: "凶", plain: "用卦(所问之事)五行反克体卦(代表你自己/主体),外事压身,主凶,宜谨慎" };
  if (SHENG.get(tiWX) === yongWX) return { label: "体生用", verdict: "不利", plain: "体卦(代表你自己/主体)五行生用卦(所问之事),自身之气泄走,泄气不利,恐费力难成" };
  if (SHENG.get(yongWX) === tiWX) return { label: "用生体", verdict: "吉", plain: "用卦(所问之事)五行生体卦(代表你自己/主体),外事生助自身,得生主吉" };
  return { label: "?", verdict: "?", plain: "五行关系无法判断" };
}

/** 卦气旺衰:按季节与体卦判 盛(当令)/衰(失令)/平(据 meihua.json·卦气旺衰) */
function guaQiState(season: string, ti: string): { state: string; line: string } {
  const q = loadMeihua().卦气旺衰;
  const sheng = q.盛[season] ?? [];
  const shuai = q.衰[season] ?? [];
  if (sheng.includes(ti)) return { state: "旺", line: `现值${season}季,${ti}五行当令,体卦旺(白话:体卦得时令之气,气势强盛,做事有底气)` };
  if (shuai.includes(ti)) return { state: "衰", line: `现值${season}季,${ti}五行失令,体卦衰(白话:体卦不得时令,气势偏弱,行事宜稳妥,缓中求进)` };
  return { state: "平", line: `现值${season}季,${ti}五行不旺不衰(白话:体卦平顺,按常规推进即可)` };
}

/** 总体走向与建议(纯白话) */
function verdictAdvice(verdict: string, qiState: string): string {
  const main =
    verdict === "吉" ? "总体偏吉,顺势而为、把握时机即可" :
    verdict === "凶" ? "总体偏凶,宜谨慎行事、放慢节奏,规避风险,必要时寻求帮助" :
    verdict === "不利" ? "总体不太顺,易损耗自身精力财物,建议减少无谓消耗、务实应对" :
    "总体平平,按部就班即可";
  return qiState === "衰" ? `${main};再则体卦当前失令、气势偏弱,更要稳字当头,不宜冒进` : main;
}

async function meihuaExecute(args: {
  卦名: string; 动爻?: number[]; datetime?: string; 占事?: string;
}): Promise<string> {
  const gua = guaOf(args.卦名);
  if (!gua) throw new Error(`未找到卦:「${args.卦名}」`);
  const dongs = normDongs(args.动爻);
  const t = parseDT(args.datetime);
  const mgz = gz.getMonthGanZhi(t.y, t.m, t.d);
  const season = seasonOf(mgz.zhi);
  const meihua = loadMeihua();

  const [up, down] = splitUpDown(gua.上下卦);
  const bian = bianGuaName(gua, dongs);
  const bianGua = dongs.length ? guaOf(bian) : undefined;
  const hu = huGua(gua);
  const ty = tiYong(gua, dongs, bianGua);
  const tiWX = BAGUA_WX.get(ty.ti) ?? "?";
  const yongWX = BAGUA_WX.get(ty.yong) ?? "?";
  const sk = shengKe(tiWX, yongWX);
  const qi = guaQiState(season, ty.ti);
  const item = args.占事 ? meihua.十八类占断辞[args.占事] : undefined;

  const out: string[] = [];
  out.push(
    "【梅花易数·体用断卦】",
    `本卦: ${gua.卦名}(${gua.上下卦})${gua.卦符}  动爻: ${dongs.length ? dongs.map((x) => WEI[x - 1]).join("、") : "无(静卦)"}`,
    `变卦: ${dongs.length ? `${bian}(${bianGua?.上下卦})${bianGua?.卦符 ?? ""}` : "无(静卦)"}`,
    `互卦: 下互${BAGUA_SYM.get(hu.down) ?? ""}${hu.down}(二三四爻) / 上互${BAGUA_SYM.get(hu.up) ?? ""}${hu.up}(三四五爻)`,
    `体用: 体=${ty.ti}(${tiWX}) 用=${ty.yong}(${yongWX})  [体为主、用为事]`,
    ty.note ? `  (注:${ty.note})` : "",
    `生克: ${sk.label} → ${sk.verdict}(白话:${sk.plain})`,
    `卦气: ${qi.line}`,
  );
  if (item) {
    out.push(
      `── 断辞(占事:${args.占事}) ──`,
      `[原文]: ${item.原文}`,
      `[白话]: ${item.白话}`,
      `[出处]: ${item.出处}`,
    );
  }
  const who = args.占事 ? "代表你自己的一方" : "下卦(代表你自己这一方)";
  const what = args.占事 ? "代表所问之事的一方" : "上卦(代表所问之事一方)";
  const relPlain =
    sk.label === "体克用" ? "你这一方克得住所问之事,主动权在自己手里" :
    sk.label === "用克体" ? "所问之事反过来克制你这一方,对你有所压制" :
    sk.label === "体生用" ? "你这一方的力量泄给了所问之事,容易费力不讨好" :
    sk.label === "用生体" ? "所问之事反而来生助你这一方,是好事" :
    sk.label === "比和" ? "两方五行相同、彼此呼应,相安相合" : "两方关系暂不明朗";
  const qiPlain =
    qi.state === "旺" ? "当前时令下,你这一方气势正旺,做事有底气" :
    qi.state === "衰" ? "当前时令下,你这一方气势偏弱,宜稳妥行事" :
    "当前时令下,你这一方不旺不衰,平顺推进即可";
  const summary =
    `${args.占事 ? `这次问的是「${args.占事}」。` : "这次未指定占事,按一般体用断之。"}` +
    `${who}五行属${tiWX},${what}五行属${yongWX},` +
    `${relPlain}。${qiPlain}。` +
    `${item ? `对照《梅花易数》对「${args.占事}」的断法:${item.白话}` : ""}` +
    `${verdictAdvice(sk.verdict, qi.state)}。`;
  out.push(`[总结]: ${summary}`);
  out.push("", "数据出处: meihua.json / ganzhi.json / bagua.json", "仅供参考,现实决策请结合实际情况。");
  return out.join("\n");
}

const meihuaTool = tool({
  description: "梅花易数体用断卦:由卦名+动爻分体用、求变卦互卦,按五行生克断吉凶,看体卦卦气旺衰,并按十八类占断辞出白话断语。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名,如:乾"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6,自下而上)"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在),用于卦气旺衰与梅花起卦"),
    占事: tool.schema.enum(["天时", "人事", "家宅", "屋舍", "婚姻", "生产", "饮食", "求谋", "求名", "求财", "交易", "出行", "行人", "谒见", "失物", "疾病", "官讼", "坟墓"]).optional().describe("占问门类(梅花易数十八类占)"),
  },
  execute: meihuaExecute,
});

export { meihuaTool, meihuaExecute };

const plugin: Plugin = async () => ({ tool: { meihua: meihuaTool } });
export default plugin;
