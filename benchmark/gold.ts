/**
 * 六爻解卦评测基准·金标准生成器。
 * 从 data/guaili.json 提取可评测卦例:解析干支 → 月支/日干支,
 * 卦名全称 → 单字,按占事推断用神,产出一份结构化 gold(JSON)。
 *
 * 运行: bun run benchmark/gold.ts   (输出 benchmark/guaili_gold.json)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const XIANG: Record<string, string> = { 天: "乾", 地: "坤", 雷: "震", 风: "巽", 水: "坎", 火: "离", 山: "艮", 泽: "兑" };
const GUA8 = new Set(["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"]);

type GuaCase = {
  书号: number; 卷: string; 章节: string; 占事: string; 卦名: string; 变卦: string;
  干支: string; 卦象与断语: string; 应期原理: string; 白话: string;
  来源: { 行: string }[];
};

export type GoldItem = {
  id: string;
  书号: number;
  占事: string;
  卦名: string;
  变卦: string | null;
  月支: string | null;
  日干: string | null;
  日支: string | null;
  用神: string[];
};

/** 全称卦名 → 单字卦名 */
function shortGuaName(name: string): string | null {
  const n = name.trim();
  const core = n.split("(")[0].trim();
  // 载入六十四卦表
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "liushi_si_gua.json"), "utf8"));
  const updown = new Map((d.六十四卦 as { 卦名: string; 上下卦: string }[]).map((x) => [x.上下卦, x.卦名]));
  if (updown.has(`?上?下`)) return null;
  if (core[1] === "为") {
    const a = GUA8.has(core[0]) ? core[0] : XIANG[core[0]];
    const b = GUA8.has(core[2]) ? core[2] : XIANG[core[2]];
    return updown.get(`${a}上${b}下`) ?? null;
  }
  if (core.length >= 2) {
    const a = XIANG[core[0]], b = XIANG[core[1]];
    if (a && b) return updown.get(`${a}上${b}下`) ?? null;
  }
  // 单字卦名
  for (const x of d.六十四卦) if (x.卦名 === core) return core;
  return null;
}

/** 解析干支字段 → {月支, 日干, 日支} */
function parseGanzhi(s: string): { 月支: string | null; 日干: string | null; 日支: string | null } {
  const gan = /[甲乙丙丁戊己庚辛壬癸]/;
  const zhi = /[子丑寅卯辰巳午未申酉戌亥]/;
  let 月支: string | null = null, 日干: string | null = null, 日支: string | null = null;
  // 月支:"X月"
  const mz = /([子丑寅卯辰巳午未申酉戌亥])月/.exec(s);
  if (mz) 月支 = mz[1];
  // 日干支:"甲子日" 或 "己丑日"
  const dgz = new RegExp(`(${gan.source})(${zhi.source})日`).exec(s);
  if (dgz) { 日干 = dgz[1]; 日支 = dgz[2]; }
  return { 月支, 日干, 日支 };
}

/** 按占事推断用神(与插件分类取用总表对齐) */
function yongShen(占事: string): string[] {
  if (占事.includes("财") || 占事.includes("货") || 占事.includes("钱") || 占事.includes("会")) return ["妻财"];
  if (占事.includes("官") || 占事.includes("功名") || 占事.includes("缺") || 占事.includes("选") || 占事.includes("差") || 占事.includes("升")) return ["官鬼"];
  if (占事.includes("婚")) return ["妻财", "官鬼"];
  if (占事.includes("病") || 占事.includes("药") || 占事.includes("医")) return ["官鬼", "子孙"];
  if (占事.includes("产") || 占事.includes("胎") || 占事.includes("子") || 占事.includes("孙") || 占事.includes("嗣")) return ["子孙"];
  if (占事.includes("父") || 占事.includes("文书") || 占事.includes("宅") || 占事.includes("房") || 占事.includes("雨")) return ["父母"];
  if (占事.includes("出行") || 占事.includes("行")) return ["世", "应"];
  if (占事.includes("兄") || 占事.includes("弟")) return ["兄弟"];
  if (占事.includes("讼") || 占事.includes("词") || 占事.includes("罪") || 占事.includes("刑")) return ["官鬼"];
  if (占事.includes("失") || 占事.includes("逃") || 占事.includes("盗")) return ["妻财", "官鬼"];
  if (占事.includes("晴") || 占事.includes("雪")) return ["子孙"];
  return ["世"];
}

function main(): void {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "guaili.json"), "utf8"));
  const cases = d.卦例 as GuaCase[];
  const gold: GoldItem[] = [];
  const skipped: Array<[string, string]> = [];

  for (const e of cases) {
    const 卦 = shortGuaName(e.卦名);
    if (!卦) { skipped.push([e.占事, `卦名不可解析:${e.卦名}`]); continue; }
    const 变 = e.变卦.includes("未题") || e.变卦 === "(静卦无变)"
      ? null : shortGuaName(e.变卦);
    const { 月支, 日干, 日支 } = parseGanzhi(e.干支);
    if (!月支 && !日支) { skipped.push([e.占事, `干支不可解析:${e.干支}`]); continue; }
    gold.push({
      id: `${e.书号}-${e.来源[0].行}`,
      书号: e.书号,
      占事: e.占事,
      卦名: 卦,
      变卦: 变,
      月支,
      日干,
      日支,
      用神: yongShen(e.占事),
    });
  }

  const outPath = path.join(ROOT, "benchmark", "guaili_gold.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ 生成时间: new Date().toISOString().slice(0, 10), 说明: "六爻解卦评测金标准:排盘可判(干支/卦名/旬空/月破)+断语可溯(用神)。", 条目: gold }, null, 2));
  console.log(`gold 生成: ${gold.length} 条(跳过 ${skipped.length})`);
  for (const [s, why] of skipped.slice(0, 20)) console.log(`  跳过 ${s}: ${why}`);
}

main();
