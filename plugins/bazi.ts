/**
 * 八字四柱排盘工具:bazi
 *
 * 四柱算法全部复用 ../lib/ganzhi(年立春分界、月节气月、日精确、时五鼠遁)。
 * 十神/藏干/纳音/大运/五行统计规则取自 知识库/data/bazi.json 与 ganzhi.json。
 * 五行生克/天干五行阴阳/纳音 等共享数据取自 ../lib/hex。
 * 输出严格遵守白话文铁律:术语后紧跟白话翻译,结尾附纯白话总结。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as path from "node:path";
import * as db from "../lib/db";
import { DATA_DIR } from "../lib/db";
import * as gz from "../lib/ganzhi";
import * as hex from "../lib/hex";

/* ==================== 数据加载 ==================== */

type BaziJson = {
  地支藏干: { 支: string; 藏干: { 干: string; 位: string }[] }[];
  十神规则: { 关系: string; 同阴阳: string; 异阴阳: string; 白话: string }[];
  大运: { 说明: string; 起运: string; 简化: string }[];
  五行统计: { 权数: { 天干: number; 本气: number; 中气: number; 余气: number } }[];
};

function loadBazi(): BaziJson {
  const p = path.join(DATA_DIR, "bazi.json");
  if (!fs.existsSync(p)) throw new Error(`知识库数据文件缺失: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as BaziJson;
}

const bazi = loadBazi();

const TG = hex.TG;
const DI = hex.DI;
const GAN_WX = hex.GAN_WX;
const GAN_YY = hex.GAN_YY;
const SHENG = hex.SHENG;
const KE = hex.KE;
const NAYIN = hex.NAYIN;

/** 地支藏干(据 bazi.json·地支藏干) */
const CANG = new Map<string, { 干: string; 位: string }[]>(
  bazi.地支藏干.map((e) => [e.支, e.藏干]),
);
/** 十神规则(据 bazi.json·十神规则,新 schema 为数组,按 关系 索引) */
const SHISHEN_TABLE = new Map(bazi.十神规则.map((r) => [r.关系, r]));

/** 十神白话翻译表 */
const SS_BAI: Record<string, string> = {
  比肩: "与日主同五行同阴阳,如同伴兄弟,主自我与同辈助力",
  劫财: "与日主同五行异阴阳,如争夺钱财的同辈,主竞争与破财",
  正印: "生日主且阴阳相反,如母亲、师长、学历靠山,主庇护",
  偏印: "生日主且阴阳相同,如偏门学问、孤僻,枭神主钻研",
  食神: "日主所生且阴阳相同,主才华、口福、享乐、子女缘",
  伤官: "日主所生且阴阳相反,主才华外露、反叛、创造力",
  正官: "克日主且阴阳相反,如官职、名誉、规则约束",
  七杀: "克日主且阴阳相同,如压力、威严、竞争、煞气",
  正财: "日主所克且阴阳相反,如正当收入、妻财、稳定财",
  偏财: "日主所克且阴阳相同,如意外之财、偏门之财",
};

/** 十神:以日干为「我」,看 other 与「我」的生克关系与阴阳异同(据 bazi.json·十神规则) */
export function shiShen(dayGan: string, other: string): string {
  const me = GAN_WX.get(dayGan)!;
  const ot = GAN_WX.get(other)!;
  const sameYY = GAN_YY.get(dayGan) === GAN_YY.get(other);
  let key: string;
  if (ot === me) key = "同我者比劫";
  else if (SHENG.get(ot) === me) key = "生我者印";
  else if (SHENG.get(me) === ot) key = "我生者食伤";
  else if (KE.get(ot) === me) key = "克我者官杀";
  else key = "我克者财";
  const row = SHISHEN_TABLE.get(key)!;
  const name = sameYY ? row.同阴阳 : row.异阴阳;
  return name.replace(/[（(].*?[）)]$/, "");
}

/** 五行加权统计(据 bazi.json·五行统计):天干 1,藏干本气1/中气0.5/余气0.3 */
function wxCount(pills: { gan: string; zhi: string }[], dayGan: string): Map<string, number> {
  const w = bazi.五行统计[0].权数;
  const m = new Map<string, number>();
  const add = (wx: string, n: number) => m.set(wx, (m.get(wx) ?? 0) + n);
  for (const p of pills) add(GAN_WX.get(p.gan)!, w.天干);
  for (const p of pills) {
    for (const c of CANG.get(p.zhi)!) add(GAN_WX.get(c.干)!, w[c.位 as "本气" | "中气" | "余气"] ?? 0);
  }
  void dayGan;
  return m;
}

/* ==================== 时间解析 ==================== */

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

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/* ==================== 大运 ==================== */

/** 近似节界(与 lib/ganzhi.ts MONTH_ZHI 一致):按月存该公历月的节界日 [月,日],1 月对应 1/6 小寒 */
const JIE_BOUNDARY: ReadonlyArray<[number, number]> = [
  [1, 6], [2, 4], [3, 6], [4, 5], [5, 6], [6, 6],
  [7, 7], [8, 8], [9, 8], [10, 8], [11, 7], [12, 7],
];

/** 该公历年第 month 月的近似节界日(月=1 对应 1/6) */
function jieDay(year: number, month: number): number {
  const pair = JIE_BOUNDARY[month - 1];
  return Date.UTC(year, pair[0] - 1, pair[1]);
}

/** 起运数估算(按近似节界):顺行数至下一节,逆行数至上一节;天数÷3取整为年,余数×4为月 */
function qiYun(t: { y: number; m: number; d: number }, forward: boolean): { years: number; months: number } {
  const birth = Date.UTC(t.y, t.m - 1, t.d);
  const cands: number[] = [];
  for (const [off, years] of [[-1, t.y - 1], [0, t.y], [1, t.y + 1]] as const) {
    void off;
    for (let mo = 1; mo <= 12; mo++) cands.push(jieDay(years, mo));
  }
  let target = 0;
  if (forward) {
    target = Math.min(...cands.filter((c) => c > birth));
  } else {
    target = Math.max(...cands.filter((c) => c < birth));
  }
  const days = Math.round(Math.abs(target - birth) / 86_400_000);
  return { years: Math.floor(days / 3), months: (days % 3) * 4 };
}

/** 大运干支:自月柱起,顺行(gan/zhi +1)/逆行(-1),排 n 步 */
function dayunPills(mgz: { gan: string; zhi: string }, forward: boolean, n = 8): string[] {
  const gi = TG.indexOf(mgz.gan);
  const zi = DI.indexOf(mgz.zhi);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = forward ? i : -i;
    out.push(TG[mod(gi + d, 10)] + DI[mod(zi + d, 12)]);
  }
  return out;
}

/* ==================== 执行与输出 ==================== */

export async function baziExecute(args: { datetime?: string; 性别?: string; 晚子时?: "换日" | "不换日"; 经度?: number } = {}): Promise<string> {
  const sex = args.性别 ?? "男";
  const t = parseDT(args.datetime);
  const { ygz, mgz, dgz, hgz } = gz.getFullGanZhi(t.y, t.m, t.d, t.h, { 晚子时: args.晚子时, 经度: args.经度 });
  const pills = [ygz, mgz, dgz, hgz];
  const dayGan = dgz.gan;

  const fmt = (v: { gan: string; zhi: string }) => `${v.gan}${v.zhi}`;
  const out: string[] = [
    "【八字四柱】",
    `出生: ${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")} ${String(t.h).padStart(2, "0")}:00  性别: ${sex}`,
    `年柱 ${fmt(ygz)}(年命纳音:${NAYIN.get(fmt(ygz))})   月柱 ${fmt(mgz)}   日柱 ${fmt(dgz)}(日主)   时柱 ${fmt(hgz)}`,
    `日柱纳音: ${NAYIN.get(fmt(dgz))}   (纳音=干支对应的五行别称,据 ganzhi.json·六甲)`,
  ];

  // 十神
  const ganSS = [["年干", ygz.gan], ["月干", mgz.gan], ["时干", hgz.gan]]
    .map(([pos, g]) => {
      const ss = shiShen(dayGan, g);
      return `${pos}${g}=${ss}(白话:${SS_BAI[ss]})`;
    })
    .join(" ");
  out.push(`十神(以日主${dayGan}为我;十神=看其他干支与日主的生克关系与阴阳异同而定的称号,据 bazi.json·十神规则): ${ganSS}`);

  // 藏干十神
  const zhiSS = pills.map((p) => {
    const inner = CANG.get(p.zhi)!.map((c) => {
      const ss = shiShen(dayGan, c.干);
      return `${c.干}·${c.位}=${ss}`;
    });
    return `${p.zhi}藏${CANG.get(p.zhi)!.map((c) => c.干).join("")}(${inner.join(" ")})`;
  });
  out.push(`地支藏干(藏干=每个地支内暗藏的天干,分本气/中气/余气表其力量,据 bazi.json·地支藏干): ${zhiSS.join(" ")}`);

  // 五行统计
  const wx = wxCount(pills, dayGan);
  const order = ["金", "木", "水", "火", "土"];
  const parts = order.map((k) => {
    const v = wx.get(k) ?? 0;
    return `${k}${Number.isInteger(v) ? v : v.toFixed(1)}`;
  });
  const maxV = Math.max(...order.map((k) => wx.get(k) ?? 0));
  const minV = Math.min(...order.map((k) => wx.get(k) ?? 0));
  const maxK = order.filter((k) => (wx.get(k) ?? 0) === maxV).join("、");
  const minK = order.filter((k) => (wx.get(k) ?? 0) === minV).join("、");
  out.push(`五行统计(天干各1、藏干本气1/中气0.5/余气0.3,据 bazi.json·五行统计): ${parts.join(" ")} → 最旺${maxK} / 最弱${minK}`);

  // 大运
  const yangYear = GAN_YY.get(ygz.gan) === "阳";
  const forward = (yangYear && sex === "男") || (!yangYear && sex === "女");
  const qy = qiYun(t, forward);
  const qyStr = `${qy.years}岁${qy.months ? `${qy.months}个月` : ""}`;
  const steps = dayunPills(mgz, forward);
  out.push(
    `大运(大运=每十年更换一步的人生运势,据 bazi.json·大运): ${sex}命·${yangYear ? "阳" : "阴"}年${forward ? "顺行" : "逆行"},自${fmt(mgz)}月起,约${qyStr}起运(起运数按近似节气界估算,据 lib/ganzhi.ts MONTH_ZHI),后行: ${steps.join(" ")}`,
  );

  // 总结(纯白话)
  const dayWX = GAN_WX.get(dayGan)!;
  const dayV = wx.get(dayWX) ?? 0;
  const strength = dayV >= maxV ? "偏强" : dayV <= minV ? "偏弱" : "中和";
  const adv = strength === "偏强"
    ? `日主五行${dayWX}偏强,性格较有主见、抗压,但要注意放平心态、避免逞强,多做减法`
    : strength === "偏弱"
      ? `日主五行${dayWX}偏弱,精力和底气易感不足,宜多借印星(长辈、学问)与比劫(同辈朋友)之力`
      : `日主五行${dayWX}力量中和,整体较平稳`;
  out.push(
    `[总结]: 这个命局五行中,${maxK}最旺、${minK}最弱。日主为${dayGan}(五行属${dayWX}),五行力量${strength}。${adv}。最需要注意的是${minK}这一行偏弱,遇到与${minK}相关的年份或事情,节奏放慢、多作规划为宜。以上为规则性排盘,仅供参考,现实决策请结合实际情况。`,
  );

  out.push("", "数据出处: bazi.json(藏干/十神规则/大运规则/五行权数) / ganzhi.json(天干五行阴阳/六甲纳音) / lib/ganzhi.ts 算法");
  out.push(hex.口径披露(), `日主所属: 日柱天干${dayGan}(五行属${dayWX}),代表命主自己`);
  out.push("仅供参考,现实决策请结合实际情况。");
  return out.join("\n");
}

const baziTool = tool({
  description: "八字四柱排盘:按出生时间排出年/月/日/时四柱干支,含十神、地支藏干、纳音、五行统计与大运。",
  args: {
    datetime: tool.schema.string().optional().describe("出生时间 ISO 字符串(默认现在)"),
    性别: tool.schema.enum(["男", "女"]).optional().describe("用于大运顺逆(默认男)"),
    晚子时: tool.schema.enum(["换日", "不换日"]).optional().describe("晚子时(23-24点)日柱处理:换日=归次日(默认),不换日=按当日"),
    经度: tool.schema.number().optional().describe("出生地经度(东经正)。默认 120(东八区);传入非120时用真太阳时定时辰"),
  },
  execute: baziExecute,
});

/** 模块自声明:元信息 / 工具 / 数据(供 zhanbu 聚合器合并) */
export const 元信息 = {
  名: "八字四柱",
  书号: [],
  法式: ["八字四柱"],
  说明: "通行命理资料(命理通识/渊海子平)",
};
export const 工具 = { bazi: baziTool };
export const 数据 = ["bazi.json", "ganzhi.json"];

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
export { baziTool };
