/**
 * 经传查注模块:chazhu(查注/解经)。
 *
 * 聚合「朱熹《周易本义》卦爻注(书8)」+「十翼(书1)」+「彖传/大象」三类经传注文,
 * 按卦名出注,动爻高亮,附白话导读与口径披露。数据全部取自 知识库 data/*.json 与 books/*.json。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as hex from "../lib/hex";

const WEI = hex.WEI;
const { 口径披露, guaOf } = hex;

type 注条 = { 经文: string; 注: string };
type ZhuxiGua = {
  卦序: number; 卦名: string; 卦符: string; 上下卦: string;
  卦辞注: 注条[];
  爻注: { 爻位: string; 爻辞: string; 注: string }[];
  彖曰注: 注条[];
  象曰注: 注条[];
  文言曰注?: 注条[];
};
type 十翼 = {
  序卦: { 卦序: number; 卦名: string; 内容: string }[];
  杂卦: { 卦名: string; 内容: string }[];
  文言: { 乾: { 内容: string }[]; 坤: { 内容: string }[] };
};

/** 超长注文截断,避免输出失控 */
function clip(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** 朱熹卷注用繁体卦名,统一为简体(如 既濟→既济),便于与 64 卦表匹配 */
const FAN2JIAN: Record<string, string> = {
  訟: "讼", 師: "师", 謙: "谦", 隨: "随", 蠱: "蛊", 臨: "临", 觀: "观", 賁: "贲",
  剝: "剥", 復: "复", 頤: "颐", 過: "过", 離: "离", 遯: "遁", 壯: "壮", 晉: "晋",
  損: "损", 漸: "渐", 歸: "归", 豐: "丰", 兌: "兑", 渙: "涣", 節: "节", 濟: "济",
};
function toJian(s: string): string {
  return [...s].map((c) => FAN2JIAN[c] ?? c).join("");
}

/** 朱熹《周易本义》卷一/卷二 找卦 */
function zhuxiGua(name: string): { 卷: string; 卦: ZhuxiGua } | undefined {
  const vz = db.loadZhuxi() as Record<string, unknown>;
  for (const 卷 of ["卷一·上经", "卷二·下经"]) {
    const 卦 = (vz[卷] as ZhuxiGua[])?.find((g) => toJian(g.卦名) === name);
    if (卦) return { 卷, 卦 };
  }
  return undefined;
}

/** 朱熹卦爻注段:卦辞注首条 + 各爻注(动爻高亮) + 彖曰/象曰/文言曰注 */
function zhuxiPart(name: string, dongs: number[]): string[] {
  const out: string[] = [`  (据 books/08_周易本义.json·卷注)`];
  const hit = zhuxiGua(name);
  if (!hit) {
    out.push(`  书8《周易本义》卷注中无「${name}」卦注。`);
    return out;
  }
  out[0] = `  (据 books/08_周易本义.json·${hit.卷})`;
  const g = hit.卦;
  const gz = g.卦辞注[0];
  if (gz) {
    out.push(`  ·卦辞注「${gz.经文}」 → 注:${clip(gz.注)}`);
    const 卦辞 = guaOf(name)?.卦辞 ?? "";
    if (卦辞) out.push(`    白话导读: 卦辞大意 — ${卦辞}`);
  }
  g.爻注.forEach((y, i) => {
    const dong = y.爻位 !== "用九" && y.爻位 !== "用六" && dongs.includes(i + 1);
    out.push(`  ·爻注 ${y.爻位}${dong ? " ★动★" : ""}「${y.爻辞}」 → 注:${clip(y.注, 70)}`);
    out.push(`    白话导读: 此爻辞 — ${y.爻辞}。`);
  });
  if (g.彖曰注?.[0]) out.push(`  ·彖曰注「${clip(g.彖曰注[0].经文, 30)}」 → 注:${clip(g.彖曰注[0].注, 80)}`);
  if (g.象曰注?.[0]) out.push(`  ·象曰注「${clip(g.象曰注[0].经文, 30)}」 → 注:${clip(g.象曰注[0].注, 80)}`);
  if (g.文言曰注?.[0]) out.push(`  ·文言曰注「${clip(g.文言曰注[0].经文, 30)}」 → 注:${clip(g.文言曰注[0].注, 80)}`);
  return out;
}

/** 十翼段:序卦(按卦序) + 杂卦(按卦名),乾/坤附文言传首段 */
function shiyiPart(name: string): string[] {
  const out: string[] = [`  (据 十翼.json)`];
  const sy = db.loadShiyi() as unknown as 十翼;
  const idx = db.guaIndex(name);
  const xq = sy.序卦?.find((x) => x.卦序 === idx);
  if (xq) out.push(`  ·序卦第${xq.卦序}位: ${xq.内容}`);
  else out.push(`  ·序卦: (序卦传中未寻得「${name}」)`);
  const zg = sy.杂卦?.find((x) => x.卦名 === name);
  if (zg) out.push(`  ·杂卦: ${zg.内容} — 古人以一字/短语点出此卦性情。`);
  else out.push(`  ·杂卦: (杂卦传中未寻得「${name}」)`);
  if ((name === "乾" || name === "坤") && sy.文言?.[name as "乾"]?.[0]) {
    out.push(`  ·文言传首段: ${clip(sy.文言[name as "乾"][0].内容, 120)}`);
  }
  return out;
}

/** 彖传/大象段 */
function tuanxiangPart(name: string): string[] {
  const out: string[] = [`  (据 tuan_xiang.json)`];
  const t = db.loadTuanXiang() as unknown as { 六十四卦: { 卦名: string; 彖传?: string; 大象?: string }[] } | undefined;
  const g = t?.六十四卦?.find((x) => x.卦名 === name);
  if (!g) {
    out.push(`  彖传/大象库中无「${name}」卦。`);
    return out;
  }
  if (g.彖传) out.push(`  ·彖传: ${g.彖传}`, `    白话导读: 彖传解释卦辞、阐发一卦大义。`);
  if (g.大象) out.push(`  ·大象: ${g.大象}`, `    白话导读: 大象由卦象引申君子法天之德。`);
  return out;
}

async function chazhu(args: { 卦名: string; 范围?: "朱熹卦爻注" | "十翼" | "彖传大象" | "全部"; 动爻?: number[] }): Promise<string> {
  const name = args.卦名.trim();
  const gua = guaOf(name);
  if (!gua) throw new Error(`未找到卦:「${name}」`);
  const dongs = hex.normDongs(args.动爻);
  const 范围 = args.范围 ?? "全部";
  const want = (s: "朱熹卦爻注" | "十翼" | "彖传大象") => 范围 === "全部" || 范围 === s;

  const out: string[] = [
    `【经传查注】${name} ${gua.卦符} (${gua.上下卦})  范围:${范围}`,
    `──────────────────────────────`,
  ];
  if (want("朱熹卦爻注")) out.push(`── 朱熹卦爻注(书8) ──`, ...zhuxiPart(name, dongs));
  if (want("十翼")) out.push(`── 十翼(书1) ──`, ...shiyiPart(name));
  if (want("彖传大象")) out.push(`── 彖传·大象 ──`, ...tuanxiangPart(name));
  out.push(
    "",
    `【总结】${name}卦:卦辞「${gua.卦辞}」,朱熹注、十翼序卦杂卦与彖象诸传皆已列上。`,
    `注文为文言,谨以白话导读撮其大意;凡问事吉凶,须结合具体动爻(${dongs.length ? dongs.map((d) => WEI[d - 1]).join("、") : "无"})与所问之事再断,切莫单凭一句卦辞定论。`,
    "仅供参考,现实决策请结合实际情况。",
    "数据出处: books/08_周易本义.json·卷注 / 十翼.json / tuan_xiang.json",
    口径披露(),
  );
  return out.join("\n");
}

const chazhuTool = tool({
  description: "经传查注:查某一卦的朱熹《周易本义》卦爻注、十翼(序卦/杂卦/文言)、彖传与大象,附白话导读与出处。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名,如:乾"),
    范围: tool.schema.enum(["朱熹卦爻注", "十翼", "彖传大象", "全部"]).optional().describe("查注范围,默认全部"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6),用于在爻注中高亮"),
  },
  execute: chazhu,
});

export const 元信息 = { 名: "经传查注", 书号: [1, 8], 法式: ["朱熹注", "十翼", "彖象"] };
export const 工具 = { chazhu: chazhuTool };
export const 数据 = ["books/08_周易本义.json", "十翼.json", "tuan_xiang.json"];

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
