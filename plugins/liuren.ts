/**
 * 小六壬占课工具:liuren(月日时起课)
 *
 * 数据来源:知识库/data/liuren.json(六宫掌诀/断辞/白话/总结),运行期惰性读取并缓存。
 * 起课法(通行小六壬):月数起大安、月上起日、日上起时,顺数六宫
 * (大安→留连→速喜→赤口→小吉→空亡,六而一周)。
 * 数法:自当前宫起顺数 n 步,落点 = (当前宫 + n - 1) % 6。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "../lib/db";
import { DI_ZHI, getHourZhi, getMonthGanZhi } from "../lib/ganzhi";

const DI = DI_ZHI as readonly string[];

const PALACE_NAMES = ["大安", "留连", "速喜", "赤口", "小吉", "空亡"] as const;

type Palace = {
  宫名: string; 位: string; 地支: string; 五行: string; 吉凶: string; 主: string;
  断辞: string; 白话: string; 总结: string;
};
type LiurenData = { 六宫: Palace[] };

let cache: LiurenData | undefined;
function data(): LiurenData {
  if (!cache) {
    const p = path.join(DATA_DIR, "liuren.json");
    if (!fs.existsSync(p)) throw new Error(`知识库数据文件缺失: ${p}`);
    cache = JSON.parse(fs.readFileSync(p, "utf8")) as LiurenData;
  }
  return cache;
}

const palaceOf = (name: string): Palace => {
  const g = data().六宫.find((x) => x.宫名 === name);
  if (!g) throw new Error(`liuren.json 中缺少六宫: ${name}`);
  return g;
};

const MONTH_CN = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
const DAY_CN = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
const dayName = (n: number): string => DAY_CN[n] ?? `${n}日`;

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

/** 农历近似月(据节气月支:寅月=正月…丑月=腊月),仅用于展示 */
function lunarMonthOf(t: { y: number; m: number; d: number }): number {
  const zhi = getMonthGanZhi(t.y, t.m, t.d).zhi;
  return ((DI.indexOf(zhi) - DI.indexOf("寅") + 12) % 12) + 1;
}

/**
 * 起课:月数起大安、月上起日、日上起时,顺数六宫。
 * 从当前宫起顺数 n 步,落点 = (当前宫 + n - 1) % 6。
 */
function cast(month: number, day: number, hourNum: number): { monthIdx: number; dayIdx: number; hourIdx: number } {
  const monthIdx = (month - 1) % 6;
  const dayIdx = (monthIdx + day - 1) % 6;
  const hourIdx = (dayIdx + hourNum - 1) % 6;
  return { monthIdx, dayIdx, hourIdx };
}

async function liuren(args: {
  datetime?: string; month?: number; day?: number;
}): Promise<string> {
  const t = parseDT(args.datetime);
  const hourZhi = getHourZhi(t.h);
  const hourNum = DI.indexOf(hourZhi) + 1; // 子=1…亥=12

  // 月数取公历月、日数取公历日;用户报农历月/日则用之。
  const month = args.month ?? t.m;
  const day = args.day ?? t.d;
  if (month < 1 || month > 12) throw new Error(`月数须在 1-12 之间: ${month}`);
  if (day < 1 || day > 31) throw new Error(`日数须在 1-31 之间: ${day}`);

  const { monthIdx, dayIdx, hourIdx } = cast(month, day, hourNum);
  const mPalace = PALACE_NAMES[monthIdx];
  const dPalace = PALACE_NAMES[dayIdx];
  const hPalace = PALACE_NAMES[hourIdx]; // 时宫 = 最终落宫
  const g = palaceOf(hPalace);

  const dtStr = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")} ${String(t.h).padStart(2, "0")}:00`;
  const lunarMonth = args.month ?? lunarMonthOf(t);
  const monthLabel = MONTH_CN[lunarMonth];

  const out = [
    "【小六壬】占课",
    `时间: ${dtStr}(农历近似:${MONTH_CN[lunarMonthOf(t)]}${dayName(day)} ${hourZhi}时)`,
    `月(${monthLabel})→ ${mPalace}  日(${dayName(day)})→ ${dPalace}  时(${hourZhi}时)→ ${hPalace}  ← 最终落宫`,
    "─────────────────────────────",
    `落宫: ${g.宫名}(${g.位}) 属${g.五行}  【${g.吉凶}】`,
    `断辞: ${g.断辞}`,
    `白话: ${g.白话}`,
    `[总结]: ${g.总结}`,
    "数据出处: liuren.json",
    "仅供参考,现实决策请结合实际情况。",
  ];
  return out.join("\n");
}

const liurenTool = tool({
  description: "小六壬占课:以月日时起课(月数起大安、月上起日、日上起时,顺数六宫),输出最终落宫、掌诀位、五行、吉凶、断辞、白话与纯白话总结。",
  args: {
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    month: tool.schema.number().optional().describe("农历月数 1-12,报数起课用,覆盖 datetime 之月"),
    day: tool.schema.number().optional().describe("农历日数 1-30,报数起课用,覆盖 datetime 之日"),
  },
  execute: liuren,
});

/** 模块自声明:元信息 / 工具 / 数据(供 zhanbu 聚合器合并) */
export const 元信息 = {
  名: "小六壬",
  书号: [0],
  法式: ["小六壬"],
  说明: "通行掌诀(公版通识)",
};
export const 工具 = { liuren: liurenTool };
export const 数据 = ["liuren.json"];

const plugin: Plugin = async () => ({ tool: 工具 });
export default plugin;
export { liurenTool };
