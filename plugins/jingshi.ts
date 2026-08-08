/**
 * 京氏易传占工具:jingshi
 *
 * 京房《京氏易传》以八宫为纲:每卦归八宫之一,世爻位定卦在宫中第几变(宫首八纯卦、
 * 一世二世三世四世五世游魂归魂),本宫五行统摄六亲,卦之飞伏神为用神隐现之要。
 * 数据:64卦飞伏(宫/伏卦/伏神干支/五行/六亲)据 jingshi_fufu.json;
 * 纳甲/六亲/世应/八宫/卦辞 据 liushi_si_gua.json(经 ../lib/hex)。
 * 据占事取用神(六亲),用神在卦内则显、不在则看伏神是否恰为用神。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as hex from "../lib/hex";

const WEI = hex.WEI;
const { guaOf, shortGuaName, 口径披露 } = hex;

/** 占事→用神六亲(简化版,据 docs/07_分类占断.md 附:分类取用总表) */
function yongShenFor(shi: string): { use: string[]; note: string } {
  const S: Record<string, { use: string[]; note: string }> = {
    求财: { use: ["妻财"], note: "京氏求财以妻财为用神(白话:代表钱财收益的那一爻)" },
    功名: { use: ["官鬼"], note: "京氏功名以官鬼为用神(白话:代表官职名位的爻)" },
    婚姻: { use: ["妻财", "官鬼"], note: "男占以妻财、女占以官鬼为用(此占双看)" },
    疾病: { use: ["官鬼", "子孙"], note: "官鬼为病、子孙为药(自占兼以世爻)" },
    出行: { use: ["世"], note: "出行以世爻为用(己身),应爻为地头" },
    行人: { use: ["应"], note: "行人以应爻为用(亲者取六亲)" },
    词讼: { use: ["官鬼"], note: "词讼以官鬼为用,旺相主有理" },
    失物: { use: ["妻财"], note: "失物专看妻财,贼看官鬼" },
    家宅: { use: ["父母"], note: "家宅造作以父母爻为用" },
    天时: { use: ["父母", "子孙"], note: "父母为雨、子孙为晴" },
    胎孕: { use: ["子孙"], note: "胎孕以子孙为用" },
    终身: { use: ["世"], note: "终身福寿以世爻为用" },
  };
  const cat = Object.keys(S).find((k) => shi.includes(k));
  return cat ? S[cat] : { use: ["世"], note: "未定类别,以世爻为用神参考" };
}

/** 京氏飞伏:世爻位 + 八宫定位 + 纳甲六亲简表 */
async function jingshiExecute(args: { 卦名: string; 占事?: string }): Promise<string> {
  const gua = guaOf(shortGuaName(args.卦名));
  if (!gua) throw new Error(`未找到卦:「${args.卦名}」`);
  const ff = db.loadJingshiFufu().find((x) => x.卦名 === gua.卦名);
  if (!ff) throw new Error(`jingshi_fufu.json 中无「${gua.卦名}」飞伏数据`);

  const fv = guaOf(ff.伏卦);
  const vIdx = fv ? fv.纳甲.findIndex((n) => n[0] === ff.伏神干支) : -1;
  const fei = vIdx >= 0
    ? { pos: vIdx + 1, gz: gua.纳甲[vIdx][0], wx: gua.纳甲[vIdx][1], qin: gua.六亲[vIdx][0] }
    : undefined;

  const shiQin = gua.六亲[gua.世爻 - 1][0];
  const out: string[] = [
    "【京氏易传占】",
    `卦名: ${gua.卦名}(${gua.上下卦}) ${gua.卦符}`,
    `八宫: ${ff.宫}  宫五行: ${ff.宫五行}  (八宫为纲,宫五行统摄全卦六亲)` +
      `  世在${WEI[gua.世爻 - 1]}(六亲:${shiQin})  应在${WEI[gua.应爻 - 1]}`,
    "──────────────────────────────",
    "本卦纳甲六亲简表(据 liushi_si_gua.json):",
    ...[...gua.纳甲].map((n, i) => {
      const pos = 6 - i;
      const f = [pos === gua.世爻 ? "世" : "", pos === gua.应爻 ? "应" : ""].join("").padEnd(2, " ");
      return `  ${WEI[pos - 1]}${f}  ${gua.六亲[pos - 1][0]}  ${n[0]}${n[1]}`;
    }),
    "──────────────────────────────",
    `飞伏神(据 jingshi_fufu.json): 伏卦 ${ff.伏卦} → 伏神 ${ff.伏神干支}${ff.伏神五行}(${ff.伏神六亲})`,
    ...(fei
      ? [`  伏神${ff.伏神六亲}${ff.伏神干支}${ff.伏神五行}伏于 ${WEI[fei.pos - 1]},其下飞神为${fei.qin}${fei.gz}${fei.wx}`]
      : [`  伏神${ff.伏神六亲}${ff.伏神干支}${ff.伏神五行}(京氏原伏神,不入本卦纳甲表,伏于本宫首卦同位)`]),
  ];

  if (args.占事) {
    const ys = yongShenFor(args.占事);
    out.push(`──────────────────────────────`, `── 占事:${args.占事} · 用神:${ys.use.join("、")} ──`, `取用依据: ${ys.note}`);
    const qins = gua.六亲.map((q) => q[0]);
    for (const q of ys.use) {
      const hit = qins.map((x, i) => (x === q ? i + 1 : 0)).filter((x) => x > 0);
      if (q === "世") {
        out.push(`  ${q}(世爻): 世在${WEI[gua.世爻 - 1]},六亲${shiQin}${gua.纳甲[gua.世爻 - 1][0]}${gua.纳甲[gua.世爻 - 1][1]},京氏以世爻定宫中变数、为卦之主人`);
      } else if (hit.length) {
        out.push(`  ${q}在卦中显见: ${hit.map((p) => `${WEI[p - 1]}${gua.纳甲[p - 1][0]}${gua.纳甲[p - 1][1]}`).join("、")}  (用神显于飞爻,主其事当前可见、可凭)`);
      } else if (ff.伏神六亲 === q) {
        out.push(`  ${q}不上卦,伏神恰为${q}(${ff.伏神干支}${ff.伏神五行}),用神以伏神论  (京氏:用神不现而伏神当之,其事隐而未形,待时而现)`);
      } else {
        out.push(`  ${q}不上卦,伏神${ff.伏神六亲}(${ff.伏神干支}${ff.伏神五行})非${q},卦内卦外皆无所依  (京氏:用神全伏,事难专凭卦断,宜另择时再占)`);
      }
    }
  }

  out.push(
    "",
    "── 白话说明 ──",
    "八宫(白话:六十四卦分属八个宫,每宫由一纯卦统辖,如乾宫八卦皆以金为宫五行)是京氏断卦之纲;世爻(白话:代表求占者自己/事情主体的那一爻)所在位置决定卦在宫中的次序,应爻(白话:代表对方/所应之事的爻)与世爻相对。",
    "飞伏神(白话:" + `${ff.伏卦}` + "卦中的伏神" + `${ff.伏神干支}${ff.伏神五行}` + `「` + `${ff.伏神六亲}` + `」)是京氏看"用神"(白话:代表所问之事的六亲爻)是否显见的关键:用神在本卦六亲中则显,不显则看伏神是否恰为用神,伏神当位主其事隐而未形。`,
    "",
    "[总结]: " +
      `此次占「${gua.卦名}」卦,属${ff.宫}(白话:归${ff.宫}统辖),宫五行${ff.宫五行},世在${WEI[gua.世爻 - 1]}(六亲${shiQin})、应在${WEI[gua.应爻 - 1]}。` +
      `${args.占事 ? `问的是「${args.占事}」:` : ""}` +
      (args.占事
        ? (() => {
            const qins = gua.六亲.map((q) => q[0]);
            const lines: string[] = [];
            for (const q of yongShenFor(args.占事).use) {
              if (q === "世") lines.push(`用神世爻现于${WEI[gua.世爻 - 1]},主人事当前可凭`);
              else if (qins.includes(q)) lines.push(`${q}用神现于卦中,其事现而可断`);
              else if (ff.伏神六亲 === q) lines.push(`${q}用神不上卦,恰伏神当之,其事隐而未形、待时而现`);
              else lines.push(`${q}用神不上卦且伏神非之,其事难凭卦断`);
            }
            return lines.join(";") + ";";
          })()
        : "未指定占事,以京氏飞伏体例呈卦内宫位、世应与飞伏神之全貌。") +
      `京氏之法以飞伏定用神之显隐,以宫五行与世爻定卦气之主从。`,
    "",
    "数据出处: jingshi_fufu.json(宫/伏卦/伏神)/ liushi_si_gua.json(纳甲/六亲/世应/八宫)",
    口径披露(),
    "仅供参考,现实决策请结合实际情况。",
  );
  return out.join("\n");
}

const jingshiTool = tool({
  description: "京氏易传占:按八宫定位卦之宫/宫五行/世应爻位,列本卦纳甲六亲简表与飞伏神(伏卦/伏神干支五行六亲),据占事取用神看显伏。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名,如:乾"),
    占事: tool.schema.string().optional().describe("占问之事,如:求财、功名、婚姻、疾病、出行、词讼、失物、家宅、天时、胎孕、终身(缺省看飞伏全貌)"),
  },
  execute: jingshiExecute,
});

/** 模块自声明:元信息 / 工具 / 数据(供 zhanbu 聚合器合并) */
export const 元信息 = { 名: "京氏易传", 书号: [2], 法式: ["京氏八宫/飞伏占"] };
export const 工具 = { jingshi: jingshiTool };
export const 数据 = ["jingshi_fufu.json", "liushi_si_gua.json"];

export { jingshiTool, jingshiExecute };

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
