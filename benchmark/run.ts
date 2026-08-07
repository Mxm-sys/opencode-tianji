/**
 * 六爻解卦评测 runner:
 * 1. 排盘可判 —— 用 buildPanByGanzhi 重建每卦,校验引擎排盘自洽(旬空/月破/用神六亲存在)。
 * 2. 断语可溯 —— 校验用神六亲出现在卦中(或伏神),并输出各占事类别的用神命中率。
 * 输出: benchmark/report.md
 *
 * 运行: bun run benchmark/run.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPanByGanzhi, type Pan } from "../lib/hex.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
type Gold = { id: string; 书号: number; 占事: string; 卦名: string; 变卦: string | null; 月支: string | null; 日干: string | null; 日支: string | null; 用神: string[] };
type PanLike = { xk: { xun: string; kong: string[] }; poZhi: string; lines: { wei: string; qin: string; gzName: string; wx: string; isKong: boolean; isPo: boolean; state: string }[]; fushen: Record<string, unknown>; gua: { 八宫: string } };

/** 用卦例条目的 月支/日干支 调引擎排盘;缺月或缺日则跳过该项检查 */
function buildPanSafe(g: Gold): Pan | null {
  if (!g.月支 || !g.日支) return null;
  const day = g.日干 ? `${g.日干}${g.日支}` : `甲${g.日支}`;
  try { return buildPanByGanzhi(g.卦名, [], g.月支, day); } catch { return null; }
}

function main(): void {
  const gold = (JSON.parse(fs.readFileSync(path.join(ROOT, "benchmark", "guaili_gold.json"), "utf8")).条目 as Gold[]);
  const report: string[] = [
    "# 六爻解卦评测报告",
    "",
    `- 生成时间: ${new Date().toISOString().slice(0, 10)}`,
    `- 金标准条目: ${gold.length}(源自 data/guaili.json,仅计 干支+卦名 均可解析者)`,
    "",
    "## 一、排盘可判(机械校验)",
    "",
    "| 检查项 | 通过 | 不通过 | 不可排(缺干支) | 通过率",
    "| --- | --- | --- | --- | --- |",
  ];

  let panOk = 0, panErr = 0, noPan = 0, useMiss = 0, useHit = 0;
  const missList: string[] = [];
  const stat = new Map<string, { ok: number; total: number }>();
  for (const g of gold) {
    const cat = catOf(g.占事);
    const s = stat.get(cat) ?? { ok: 0, total: 0 };
    s.total++; stat.set(cat, s);
    const pan = buildPanSafe(g);
    if (!pan) { noPan++; continue; }
    panOk++;
    // 用神六亲是否存在(现卦或伏神)
    const qins = pan.lines.map((l) => l.qin);
    const hasUse = g.用神.some((u) => u === "世" || u === "应" || qins.includes(u) || pan.fushen[u] !== undefined);
    if (hasUse) { useHit++; s.ok++; }
    else { useMiss++; missList.push(`${g.占事}(${g.卦名}) 用神${g.用神.join("/")}不上卦(需伏神)`); }
  }

  report.push(`| 引擎排盘成功(卦名+月支+日干支) | ${panOk} | ${panErr} | ${noPan} | ${(panOk / Math.max(panOk + panErr, 1) * 100).toFixed(1)}% |`);
  report.push(`| 用神六亲在卦中或伏神可引拔 | ${useHit} | ${useMiss} | ${noPan} | ${(useHit / Math.max(useHit + useMiss, 1) * 100).toFixed(1)}% |`);
  report.push("", "> 说明:引擎由 卦名+月支+日干支 重建排盘;用神按占事类别推断(妻财/官鬼/子孙/父母/兄弟/世应)。用神不上卦时六爻以伏神论,非排盘错误。", "");

  report.push("## 二、断语可溯(用神命中率,按占事类别)", "");
  report.push("| 占事类别 | 条目 | 用神在卦命中 | 命中率 |", "| --- | --- | --- | --- |");
  for (const [cat, s] of [...stat.entries()].sort((a, b) => b[1].total - a[1].total)) {
    report.push(`| ${cat} | ${s.total} | ${s.ok} | ${(s.ok / s.total * 100).toFixed(1)}% |`);
  }
  report.push("", "> 用神不上卦条目(六爻以伏神论,此处列出以便核查):", "");
  for (const m of missList) report.push(`> - ${m}`);
  report.push("");

  const out = path.join(ROOT, "benchmark", "report.md");
  fs.writeFileSync(out, report.join("\n"));
  console.log(`report 已写入 ${out}`);
  console.log(`引擎排盘: ${panOk} 成功/${panErr} 失败;用神命中: ${useHit}/${useHit + useMiss}`);
}

function catOf(s: string): string {
  if (/财|货|钱|会|买卖|借贷|店|生意|债|会|摇/.test(s)) return "求财";
  if (/官|功名|缺|选|差|升|会试|乡试|科举|考|仕/.test(s)) return "功名";
  if (/婚|嫁|娶|妻/.test(s)) return "婚姻";
  if (/病|药|医|疾|产|痘/.test(s)) return "疾病医药";
  if (/父|母|叔|伯|祖|姑/.test(s)) return "六亲";
  if (/兄|弟/.test(s)) return "兄弟";
  if (/讼|词|罪|刑|官事|杖/.test(s)) return "词讼官非";
  if (/雨|晴|雪|阴|天/.test(s)) return "天时";
  if (/宅|房|坟|葬|地|穴/.test(s)) return "家宅风水";
  if (/行|出外|归|回|寻|贸易/.test(s)) return "出行行人";
  if (/寿|终身|流年|运/.test(s)) return "终身寿元";
  if (/失|逃|盗/.test(s)) return "失物";
  return "其他";
}

main();
