/**
 * 卦例库质检:校验 guaili.json(或任意卦例 JSON 片段文件)结构、字段、卦名/变卦可解析性、来源行号。
 *
 * 用法:
 *   bun run scripts/check_guaili.ts                    # 检查包内 data/guaili.json
 *   bun run scripts/check_guaili.ts /path/to/frag.json # 检查子代理产出的卦例片段
 *   bun run scripts/check_guaili.ts <frag> --name 增删卜易卷之二  # 给片段加书名上下文
 *
 * 退出码:0=通过,1=有问题。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 各书总行数(校验来源行号是否在原文范围内) */
const BOOK_LINES: Record<number, number> = { 4: 5993, 6: 1917 };
const GUA_NAMES = new Set<string>();
{
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "liushi_si_gua.json"), "utf8"));
  for (const g of d["六十四卦"]) GUA_NAMES.add(g["卦名"]);
}
const UPDOWN: Record<string, string> = {};
{
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "liushi_si_gua.json"), "utf8"));
  for (const g of d["六十四卦"]) UPDOWN[g["上下卦"]] = g["卦名"];
}
const XIANG: Record<string, string> = { 天: "乾", 泽: "兑", 火: "离", 雷: "震", 风: "巽", 水: "坎", 山: "艮", 地: "坤" };
const GUA8 = new Set(["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"]);

const REQUIRED = ["书号", "卷", "章节", "占事", "卦名", "变卦", "干支", "卦象与断语", "应期原理", "白话", "来源"];

/** 全称卦名 → 上下卦,如 "兑为泽"→(兑,兑)、"天水讼"→(乾,坎)、"泽风大过"→(兑,巽) */
function resolveFull(name: string): [string, string] | null {
  if (name[1] === "为") {
    const up = GUA8.has(name[0]) ? name[0] : XIANG[name[0]];
    const dn = GUA8.has(name[2]) ? name[2] : XIANG[name[2]];
    return up && dn ? [up, dn] : null;
  }
  const up = XIANG[name[0]], dn = XIANG[name[1]];
  return up && dn ? [up, dn] : null;
}

/** 卦名字段 → 卦名(去括号注释);占位(未题/以"("开头)返回 null */
function guaNameOf(raw: string): string | null {
  const t = raw.trim();
  if (t.startsWith("(") || t.includes("未题")) return null;
  const i = t.indexOf("(");
  return (i > 0 ? t.slice(0, i) : t).trim();
}

function checkGuaName(raw: string): string | null {
  const nm = guaNameOf(raw);
  if (nm === null) return null; // 占位,不校验
  if (GUA_NAMES.has(nm)) return null;
  const r = resolveFull(nm);
  if (r && UPDOWN[`${r[0]}上${r[1]}下`]) return null;
  return `卦名「${raw}」无法匹配六十四卦`;
}

/** 来源.行:"1734-1752" 或 "108" → 起始行;非法返回 null */
function lineStart(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = /^\s*(\d+)/.exec(v);
    return m ? +m[1] : null;
  }
  return null;
}

function collectErrors(items: unknown[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  items.forEach((it, idx) => {
    const tag = `#${idx + 1}`;
    const e = it as Record<string, unknown>;
    for (const f of REQUIRED) {
      const v = e[f];
      if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
        errs.push(`${tag} 缺字段「${f}」`);
      }
    }
    const guaErr = checkGuaName(String(e["卦名"] ?? ""));
    if (guaErr) errs.push(`${tag} ${guaErr}`);
    const bianErr = checkGuaName(String(e["变卦"] ?? ""));
    if (bianErr) errs.push(`${tag} 变卦: ${bianErr}`);
    const book = e["书号"];
    const maxLine = typeof book === "number" ? BOOK_LINES[book] : undefined;
    if (!maxLine) {
      errs.push(`${tag} 书号非法: ${String(book)}`);
    } else {
      const src = e["来源"];
      if (!Array.isArray(src) || src.length < 1) {
        errs.push(`${tag} 缺「来源」溯源数组`);
      } else {
        for (const s of src) {
          const sBook = s["书号"];
          const ls = lineStart(s["行"]);
          if (sBook !== book) errs.push(`${tag} 来源书号(${sBook})与条目书号(${book})不一致`);
          if (ls === null) errs.push(`${tag} 来源行号非法: ${String(s["行"])}`);
          else if (ls < 1 || ls > maxLine) errs.push(`${tag} 来源行号 ${ls} 超出书${book}范围(1-${maxLine})`);
        }
      }
    }
    const key = `${e["书号"]}|${String(e["章节"])}|${String(e["占事"])}|${(Array.isArray(e["来源"]) ? e["来源"][0]?.["行"] : "")}`;
    if (seen.has(key)) errs.push(`${tag} 与前面条目重复(书号/章节/占事/来源行)「${e["章节"]}·${e["占事"]}·行${e["来源"][0]?.["行"]}」`);
    seen.add(key);
  });
  return errs;
}

function main(): void {
  const args = process.argv.slice(2);
  let file = path.join(ROOT, "data", "guaili.json");
  const fragIdx = args.findIndex((a) => !a.startsWith("--"));
  if (fragIdx >= 0) file = path.resolve(args[fragIdx]);
  const raw = fs.readFileSync(file, "utf8");
  let items: unknown[];
  let subject: string;
  try {
    const d = JSON.parse(raw);
    items = Array.isArray(d["卦例"]) ? d["卦例"] : Array.isArray(d) ? d : null;
    subject = (d["主题"] as string) ?? path.basename(file);
  } catch {
    items = null;
    subject = path.basename(file);
  }
  if (!items) {
    console.error(`✗ ${file} 不是卦例数据(需顶层「卦例」数组或纯数组)`);
    process.exit(1);
  }
  const errs = collectErrors(items);
  console.log(`检查 ${file}: 卦例 ${items.length} 条,${subject}`);
  if (errs.length) {
    console.error(`✗ 发现 ${errs.length} 个问题:`);
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ 全部通过(字段/卦名/变卦/行号/去重)`);
}

main();
