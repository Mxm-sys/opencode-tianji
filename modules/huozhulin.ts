/**
 * 火珠林钱卜断占工具:huozhulin
 *
 * 依宋·麻衣道者《火珠林》按门类分条断辞:书3·火珠林,钱卜/杂占体系(六爻前身)。
 * 该体系断辞是「口占口诀」,不强制起卦排盘——只需给出占事门类(如 求财/婚姻/疾病/出行),
 * 即按关键词匹配出对应门类,输出 首句断诀 + 原文断辞 + 白话翻译 + 来源行号。
 * 若同时给出 卦名,可作参考上下文显示(仅取 64 卦名/上下卦,不强行排盘),非必须。
 * 数据:门类断辞据 huozhulin.json;卦名校验取自 ../lib/hex。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as hex from "../lib/hex";

type HuoEntry = {
  类: string;
  首句: string;
  原文: string;
  白话: string;
  来源: { 书号: number; 书: string; 章: string; 行: string }[];
};
type HuozhulinJson = { 门类: HuoEntry[] };

function loadHuo(): HuozhulinJson {
  const d = db.loadHuozhulin();
  if (!d) throw new Error("数据 huozhulin.json 尚未就位");
  return d as unknown as HuozhulinJson;
}

/** 关键词匹配:类名或原文含关键词都命中,去重(如「病」→ 占疾病/病忌官鬼/占医药/病忌父兄) */
function matchEntries(entries: HuoEntry[], kw: string): HuoEntry[] {
  const name = kw.trim();
  if (!name) return [];
  const seen = new Set<string>();
  const hits: HuoEntry[] = [];
  for (const e of entries) {
    if (e.类 === name || e.类.includes(name) || e.原文.includes(name)) {
      if (!seen.has(e.类)) {
        seen.add(e.类);
        hits.push(e);
      }
    }
  }
  return hits;
}

async function huozhulinExecute(args: { 占事: string; 卦名?: string }): Promise<string> {
  const huo = loadHuo();
  const hits = matchEntries(huo.门类, args.占事);

  const out: string[] = [];
  out.push("【火珠林·钱卜断占】", `占事: ${args.占事}`);
  if (args.卦名) {
    const gua = hex.guaOf(hex.shortGuaName(args.卦名));
    out.push(gua
      ? `参考卦: ${gua.卦名}(${gua.上下卦})${gua.卦符} (仅作上下文,火珠林为口占口诀、不强制排盘)`
      : `提示: 未找到卦「${args.卦名}」,仅按门类断辞输出。`);
  }

  if (!hits.length) {
    out.push(
      "未匹配到该占事的门类断辞。可选门类:",
      huo.门类.map((e) => e.类).join(" / "),
      "",
      "可换个关键词重试,如 求财、婚姻、疾病、出行、行人、失物、官讼 等。",
    );
  } else {
    for (const e of hits) {
      const src = e.来源[0];
      out.push(
        `── 门类: ${e.类} ──`,
        `[首句]: ${e.首句}`,
        `[原文]: ${e.原文}`,
        `[白话]: ${e.白话}`,
        `[来源]: 书${src.书号}《${src.书}》·${src.章}·行${src.行}`,
      );
    }
    out.push(
      "",
      `[总结]: 这次问的是「${args.占事}」。共命中 ${hits.length} 个门类。` +
      hits.map((e) => `「${e.类}」`).join("、") +
      "。以上按《火珠林》口占口诀出断,白话解释已附在每条之后;火珠林属钱卜杂占体系,重在按门类取断辞,卦名仅作参考、不必强求排盘。断语以世应财官旺衰为据,凡事以自己静心专注为要。",
    );
  }
  out.push("", "数据出处: huozhulin.json", hex.口径披露(), "仅供参考,现实决策请结合实际情况。");
  return out.join("\n");
}

const huozhulinTool = tool({
  description: "火珠林钱卜断占:按占事门类(如 求财/婚姻/疾病/出行/行人/失物/官讼)匹配《火珠林》口占断辞,输出 首句断诀/原文/白话翻译/来源。可给卦名作参考(非必须,不强制排盘)。",
  args: {
    占事: tool.schema.string().describe("占问门类或关键词,如 求财、婚姻、疾病、出行、行人、失物、贼盗、官讼、家宅、起造 等;支持模糊匹配"),
    卦名: tool.schema.string().optional().describe("64 卦卦名,如 乾、坤(可选,仅作参考上下文,火珠林为口占口诀)"),
  },
  execute: huozhulinExecute,
});

/** 模块自声明:元信息 / 工具 / 数据(供 zhanbu 聚合器合并) */
export const 元信息 = {
  名: "火珠林",
  书号: [3],
  法式: ["火珠林钱卜杂占"],
};
export const 工具 = { huozhulin: huozhulinTool };
export const 数据 = ["huozhulin.json"];

export { huozhulinTool, huozhulinExecute };

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
