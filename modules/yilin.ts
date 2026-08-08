/**
 * 焦氏易林占工具:yilin
 *
 * 焦延寿《焦氏易林》以六十四卦各系六十四变诗,共 4096 首:每卦"本卦"依所变
 * 之"之卦"得一首四言诗,占断以本卦之变卦(即所往)取诗观辞。
 * 本卦64 × 之卦64 全表据 yilin.json;卦辞据 爻辞.json;卦名/卦符 经 ../lib/hex 查找。
 * 之卦未指定时:有动爻按变卦推,否则视为"之本卦"(如乾之乾)。
 * 随机取之卦支持 seed 复现(确定性优先)。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as hex from "../lib/hex";

const { guaOf, shortGuaName, bianGuaName, normDongs, simpGuaName, 口径披露 } = hex;

/** mulberry32 种子 PRNG(同 liuyao,支持 seed 复现) */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toSeed(s: string | number): number {
  if (typeof s === "number") return Math.floor(Math.abs(s)) || 1;
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193); }
  return h || 1;
}

/** 卦辞(据 爻辞.json,缺省退回 liushi_si_gua.json 卦辞) */
function guaCi(name: string): string {
  const y = (db.loadYaoci() as { 六十四卦: { 卦名: string; 卦辞: string }[] }).六十四卦.find((x) => x.卦名 === name);
  return y?.卦辞 ?? guaOf(name)?.卦辞 ?? "—";
}

/** 易林索引:简体键「本卦之之卦」→ 条目(yilin.json 本卦部分为繁体,统一转简体后索引) */
let yilinIdx: Map<string, db.YilinItem> | null = null;
function yilinIndex(): Map<string, db.YilinItem> {
  if (!yilinIdx) {
    const idx = new Map<string, db.YilinItem>();
    for (const e of db.loadYilin()) idx.set(`${simpGuaName(e.本卦)}之${simpGuaName(e.之卦)}`, e);
    yilinIdx = idx;
  }
  return yilinIdx;
}

/** 易林诗意象的白话解读(按吉凶字眼粗略判意向,非逐句训诂) */
function plainPoem(poem: string): string {
  const AUX = ["吉", "利", "喜", "成", "安", "和", "顺", "得", "通", "明", "亨", "泰", "昌", "康", "宁", "福", "乐", "宜", "获", "嘉", "祥"];
  const BAD = ["凶", "灾", "病", "忧", "危", "害", "伤", "亡", "破", "败", "困", "难", "悲", "哀", "盗", "讼", "祸", "殃", "悔", "吝", "险", "失", "阻", "塞", "咎"];
  const g = [...poem].filter((c) => AUX.includes(c)).length;
  const b = [...poem].filter((c) => BAD.includes(c)).length;
  if (b > g) return "此诗意象偏忧困:多带凶险、阻滞、损耗之象(如灾病忧危困败等字),事情宜谨慎缓行,先求稳再图进。";
  if (g > b) return "此诗意象偏通达:多有利、喜、成、顺等吉辞,事情有可行之机,把握时机、顺势而为。";
  return "此诗意象中平:吉凶之象均不重,成败多在人为,按部就班、见机行事为宜。";
}

async function yilinExecute(args: {
  本卦: string; 之卦?: string; 动爻?: number[]; 随机?: boolean; seed?: string | number;
}): Promise<string> {
  const gua = guaOf(shortGuaName(args.本卦));
  if (!gua) throw new Error(`未找到本卦:「${args.本卦}」`);
  const entries = db.loadYilin();

  let zhi: string;
  let how: string;
  if (args.之卦) {
    const z = guaOf(shortGuaName(args.之卦));
    if (!z) throw new Error(`未找到之卦:「${args.之卦}」`);
    zhi = z.卦名;
    how = "占者指定之卦";
  } else if (args.随机) {
    const pool = entries.filter((e) => simpGuaName(e.本卦) === gua.卦名);
    const seedNum = args.seed === undefined ? (Date.now() >>> 0) || 1 : toSeed(args.seed);
    const pick = pool[Math.floor(mulberry32(seedNum)() * pool.length)];
    zhi = simpGuaName(pick.之卦);
    how = `随机所之(seed=0x${seedNum.toString(16)})`;
  } else {
    const dongs = normDongs(args.动爻);
    if (dongs.length) {
      zhi = bianGuaName(gua, dongs);
      how = `据动爻${dongs.join("、")}推变卦`;
    } else {
      zhi = gua.卦名;
      how = "未指定之卦且无动爻,按「之本卦」";
    }
  }

  const entry = yilinIndex().get(`${gua.卦名}之${simpGuaName(zhi)}`);
  if (!entry) throw new Error(`易林中无「${gua.卦名}之${zhi}」条目`);
  const src = entry.来源?.[0];
  const zhiGua = guaOf(zhi);

  const out: string[] = [
    "【焦氏易林占】",
    `本卦: ${gua.卦名}(${gua.上下卦}) ${gua.卦符}`,
    `本卦卦辞: ${guaCi(gua.卦名)}  (据 爻辞.json)`,
    `所之卦: ${zhi}(${zhiGua?.上下卦 ?? ""})${zhiGua?.卦符 ?? ""}   [${how}]`,
    "──────────────────────────────",
    "易林诗(原文):",
    `  ${entry.诗}`,
    "白话解读:",
    `  ${plainPoem(entry.诗)}`,
    `出处: ${src ? `焦氏易林·${src.章}(书7)·第${src.行}行` : "yilin.json"}`,
    "",
    "── 白话说明 ──",
    `焦氏易林以「本卦之之卦」(白话:本卦所变往的那个卦)取诗,故本次取「${gua.卦名}之${zhi}」:${how}。` +
      "四言诗为古意象比喻(白话:用古代比喻和画面来暗示吉凶),上引白话解读为按吉凶字眼的粗判,诗意未尽处宜结合所问之事细味。",
    "",
    "[总结]: " +
      `${args.之卦 || args.随机 ? `此次所之卦为「${zhi}」` : (args.动爻?.length ? `按动爻推得所之卦为「${zhi}」` : "未指定之卦,按「之本卦」即「" + zhi + "」取易林")}。` +
      `易林诗云:「${entry.诗}」,大意是${plainPoem(entry.诗).replace(/此诗意象[偏]?/, "")}` +
      `;另参考本卦卦辞「${guaCi(gua.卦名)}」。总体以易林诗意象为主、本卦卦辞为辅,${args.之卦 || args.随机 ? "所之卦" : "变卦"}为最终所往之象。`,
    "",
    "数据出处: yilin.json(4096变诗)/ 爻辞.json / liushi_si_gua.json",
    口径披露(),
    "仅供参考,现实决策请结合实际情况。",
  ];
  return out.join("\n");
}

const yilinTool = tool({
  description: "焦氏易林占:本卦+之卦取 4096 首易林变诗,输出本卦卦辞、所之卦、易林诗原文与白话解读、出处溯源。之卦可指定,或按动爻推变卦,缺省视为之本卦,亦可随机所之(seed 复现)。",
  args: {
    本卦: tool.schema.string().describe("64卦卦名(本卦),如:乾"),
    之卦: tool.schema.string().optional().describe("所之卦名(64卦,如:坤);不填则按动爻推变卦,无动爻视为之本卦"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6,自下而上),用于推所之卦(变卦)"),
    随机: tool.schema.boolean().optional().describe("随机取所之卦(默认确定性)。传 true 时忽略 动爻,从本卦的64个所之卦中随机取一"),
    seed: tool.schema.string().or(tool.schema.number()).optional().describe("随机所之卦的种子,同 seed 可复现"),
  },
  execute: yilinExecute,
});

/** 模块自声明:元信息 / 工具 / 数据(供 zhanbu 聚合器合并) */
export const 元信息 = { 名: "焦氏易林", 书号: [7], 法式: ["易林占(4096变诗)"] };
export const 工具 = { yilin: yilinTool };
export const 数据 = ["yilin.json", "爻辞.json"];

export { yilinTool, yilinExecute };

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
