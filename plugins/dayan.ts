/**
 * 大衍筮法(蓍草四营十八变)工具:dayan
 *
 * 《周易·系辞上》:"大衍之数五十,其用四十有九。分而为二以象两,挂一以象三,
 * 揲之以四以象四时,归奇于扐以象闰。三变而成爻,十八变而成卦。"
 * 每爻三变:分二(随机分左右)→ 挂一(取一策挂于指间)→ 揲四(左右各以4数之)→
 * 归奇(两余+挂一计入用策)。三变后余策÷4:9为老阳(动)、6为老阴(动)、7为少阳、8为少阴;
 * 六爻自下而上成卦,动爻阳变阴、阴变阳得变卦。
 * 数据:卦辞/爻辞/用九用六 据 爻辞.json;卦名/卦符/上下卦 经 ../lib/hex 查找。
 * 随机用 mulberry32 种子 PRNG,同 seed 可复现同一卦。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as hex from "../lib/hex";

const WEI = hex.WEI;
const { guaOfTrigrams, guaOf, bianGuaName, LINES_TO_TRIGRAM, 口径披露 } = hex;

/** mulberry32 种子 PRNG(与 liuyao 同实现,支持 seed 复现) */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seed 参数(string/number) → 32 位整数;string 用 FNV-1a 哈希 */
function toSeed(s: string | number): number {
  if (typeof s === "number") return Math.floor(Math.abs(s)) || 1;
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193); }
  return h || 1;
}

/** 四营之一变(分二→挂一→揲四→归奇):返回本变用策与简记 */
function yiBian(rand: () => number, total: number): { used: number; note: string } {
  const left = 1 + Math.floor(rand() * (total - 2)); // 分二:左右各至少留1策
  const right = total - left;
  const r2 = right - 1; // 挂一:取右一策
  const rem = (n: number) => (n % 4 === 0 ? 4 : n % 4); // 揲四:整除取余4
  const lr = rem(left), rr = rem(r2);
  const used = 1 + lr + rr; // 归奇:挂一+两余
  return { used, note: `分二${left}/${r2}·挂1·揲四左余${lr}右余${rr}→用${used}策` };
}

/** 三变成一爻:返回爻值(6/7/8/9)、爻性与每变简记 */
function chengYao(rand: () => number): { value: number; label: string; yang: boolean; dong: boolean; steps: string[] } {
  let total = 49;
  const steps: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const r = yiBian(rand, total);
    total -= r.used;
    steps.push(`第${i}变${r.note}→剩${total}策`);
  }
  const value = total / 4;
  const label = value === 9 ? "老阳" : value === 7 ? "少阳" : value === 8 ? "少阴" : "老阴";
  return { value, label, yang: value === 9 || value === 7, dong: value === 9 || value === 6, steps };
}

async function dayanExecute(args: {
  seed?: string | number; 占事?: string;
}): Promise<string> {
  const seedNum = args.seed === undefined ? (Date.now() >>> 0) || 1 : toSeed(args.seed);
  const rand = mulberry32(seedNum);
  const yaoList: { pos: number; value: number; label: string; yang: boolean; dong: boolean; steps: string[] }[] = [];
  for (let i = 0; i < 6; i++) {
    const y = chengYao(rand);
    yaoList.push({ pos: i + 1, ...y });
  }
  const bits = yaoList.map((y) => (y.yang ? "1" : "0"));
  const down = LINES_TO_TRIGRAM[bits.slice(0, 3).join("")];
  const up = LINES_TO_TRIGRAM[bits.slice(3, 6).join("")];
  const gua = guaOfTrigrams(up, down)!;
  const dongs = yaoList.filter((y) => y.dong).map((y) => y.pos);
  const bian = dongs.length ? bianGuaName(gua, dongs) : undefined;
  const bianGua = bian ? guaOf(bian) : undefined;

  const yaociAll = (db.loadYaoci() as {
    六十四卦: { 卦名: string; 卦辞: string; 爻辞: { 爻名: string; 爻辞: string }[]; 用?: string }[];
  }).六十四卦;
  const yaoci = yaociAll.find((x) => x.卦名 === gua.卦名);
  const bianYaoci = bian ? yaociAll.find((x) => x.卦名 === bian) : undefined;

  const dongStr = dongs.length
    ? dongs.map((d) => WEI[d - 1]).join("、")
    : "无(静卦)";
  const out: string[] = [
    "【大衍筮法·蓍草四营十八变】",
    `seed = 0x${seedNum.toString(16)}${args.seed !== undefined ? "(已传 seed,可复现)" : "(自动生成,可传同 seed 复现)"}`,
    args.占事 ? `占事: ${args.占事}` : "",
    "──────────────────────────────",
    "起卦过程(每爻三变,自下而上):",
    ...yaoList.map((y) => {
      const yaoName = WEI[y.pos - 1];
      const marks = y.dong ? "【动】" : "";
      return `  ${yaoName}  ${y.steps.join("  ")} → 余${y.value * 4}策÷4=${y.value} = ${y.label}${y.yang ? "⚊" : "⚋"}${marks}`;
    }),
    "──────────────────────────────",
    `本卦: ${gua.卦名}(${gua.上下卦}) ${gua.卦符}`,
    `动爻位: ${dongStr}`,
    `变卦: ${bian ? `${bian}(${bianGua?.上下卦})${bianGua?.卦符 ?? ""}` : "无(静卦)"}`,
    `卦辞: ${yaoci?.卦辞 ?? gua.卦辞}  (据 爻辞.json)`,
  ];
  if (yaoci) {
    out.push("爻辞(据 爻辞.json):");
    yaoci.爻辞.forEach((yc, i) => {
      const dong = dongs.includes(i + 1);
      out.push(`  ${yc.爻名}${dong ? " ★动★" : ""}  ${yc.爻辞}`);
    });
    if (yaoci.用) out.push(`用: ${yaoci.用}  (据 爻辞.json)`);
  }
  if (bian && bianYaoci) out.push(`变卦卦辞: ${bianYaoci.卦辞}  (据 爻辞.json)`);

  out.push(
    "",
    "── 白话解读 ──",
    "本卦(白话:这次摇出的卦,代表当前所处形势)为" + `${gua.卦名}(${gua.上下卦})` +
      (dongs.length
        ? `;${dongStr}为动爻(白话:这一爻是变化的、变动之爻),动爻把${dongs.map((d) => WEI[d - 1]).join("和")}由"老阳/老阴"翻转为相反的阴阳,就得到变卦(白话:事情发展变化后将会变成的局面)${bian}。${dongs.map((d) => WEI[d - 1]).join("、")}的爻辞是此次占断的紧要处。`
        : ";此为静卦(白话:六爻皆不动,事情当下按本卦卦辞与当前形势断,无变化之象)。"),
    ...(dongs.length
      ? dongs.map((d) => {
          const yc = yaoci?.爻辞[d - 1];
          return `  动爻${WEI[d - 1]}(${yaoList[d - 1].label}): ${yc ? `${yc.爻名}「${yc.爻辞}」` : "(爻辞缺)"}`;
        })
      : []),
    "",
    "[总结]: " +
      `${args.占事 ? `这次用大衍筮法问的是「${args.占事}」,` : "这次用大衍筮法起卦,"}` +
      `摇得${gua.卦名}卦,卦辞说「${yaoci?.卦辞 ?? gua.卦辞}」。` +
      (dongs.length
        ? `有${dongs.map((d) => WEI[d - 1]).join("、")}发动,变化后归于${bian}卦;${dongs.map((d) => WEI[d - 1]).join("、")}的爻辞「${dongs.map((d) => yaoci?.爻辞[d - 1]?.爻辞 ?? "—").join("」「")}」是解卦关键。大体以动爻爻辞与变卦卦辞合参:动爻主眼前之变,变卦主最终去向。`
        : "无动爻,以本卦卦辞论当前形势,静待其变。") +
      "传统断法认为老阳老阴(动爻)越多的卦变动越大,爻辞应验越显。",
    "",
    "数据出处: 大衍筮法起卦据《周易·系辞上》;卦辞/爻辞/用九用六据 爻辞.json;卦名/卦符据 liushi_si_gua.json",
    口径披露(),
    "仅供参考,现实决策请结合实际情况。",
  );
  return out.join("\n");
}

const dayanTool = tool({
  description: "大衍筮法(蓍草四营十八变):模拟古法用49策蓍草分二挂一揲四归奇,三变成爻、十八变成卦,输出每爻过程、本卦变卦、卦辞与动爻爻辞。",
  args: {
    seed: tool.schema.string().or(tool.schema.number()).optional().describe("随机种子,同 seed 可复现同一卦;不传则自动生成(输出 seed=0x…)"),
    占事: tool.schema.string().optional().describe("占问之事(仅作总结语境,不影响起卦)"),
  },
  execute: dayanExecute,
});

/** 模块自声明:元信息 / 工具 / 数据(供 zhanbu 聚合器合并) */
export const 元信息 = { 名: "大衍筮法", 书号: [1], 法式: ["大衍筮法(蓍草四营十八变)"] };
export const 工具 = { dayan: dayanTool };
export const 数据 = ["爻辞.json"];

export { dayanTool, dayanExecute };

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
