/**
 * 占卜自定义工具插件聚合器:qigua(起卦)/paipan(排盘)/duangua(断卦辅助)/cha(查卦)
 * + 聚合 meihua(梅花易数)/bazi(八字四柱)/liuren(小六壬)。
 *
 * 数据来源:全部取自 知识库/data/*.json(经 ../lib/db 惰性加载),
 * 卦辞/爻辞/纳甲/六亲/六神/旬空/月破/旺相休囚等一律查数据,不硬编码。
 * 六爻/梅花共享计算核心在 ../lib/hex,公历→干支换算复用 ../lib/ganzhi。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import * as db from "../lib/db";
import * as hex from "../lib/hex";
import * as meihua from "./meihua";
import * as bazi from "./bazi";
import * as liuren from "./liuren";
import * as almanac from "./almanac";

const DI = hex.DI;
const TG = hex.TG;
const WEI = hex.WEI;
const NUM_TO_GUA = hex.NUM_TO_GUA;
const LINES_TO_TRIGRAM = hex.LINES_TO_TRIGRAM;
const { guaList, guaOf, guaOfTrigrams, splitUpDown } = hex;
const { parseDT, fullGanZhi, normDongs, bianGuaName, relation, 口径披露 } = hex;

/** 常用汉字笔画表(字占用)。未收录的字按 Unicode 码点 mod 8 兜底,与梅花字占"以笔画起卦"的简化近似 */
const STROKE_POS: Map<string, number> = new Map([
  ["一", 1], ["二", 2], ["三", 3], ["四", 5], ["五", 4], ["六", 4], ["七", 2], ["八", 2], ["九", 2], ["十", 2],
  ["人", 2], ["口", 3], ["日", 4], ["月", 4], ["山", 3], ["水", 4], ["火", 4], ["木", 4], ["金", 8], ["土", 3],
  ["天", 4], ["地", 6], ["大", 3], ["小", 3], ["上", 3], ["下", 3], ["中", 4], ["心", 4], ["王", 4], ["玉", 5],
  ["生", 5], ["死", 6], ["好", 6], ["坏", 7], ["男", 7], ["女", 3], ["财", 7], ["官", 8], ["我", 7], ["你", 7],
  ["他", 5], ["她", 6], ["来", 7], ["去", 5], ["是", 9], ["非", 8], ["有", 6], ["无", 4], ["成", 6], ["败", 8],
]);

type Gua = hex.Gua;
type Pan = hex.Pan;

/** 占事→用神六亲(据 docs/07_分类占断.md 附:分类取用总表)。'世'/'应' 为特殊用神 */
function yongShenFor(shi: string): { use: string[]; note: string } {
  const S: Record<string, { use: string[]; note: string }> = {
    求财: { use: ["妻财"], note: "妻财为用神,子孙为原神" },
    功名: { use: ["官鬼"], note: "官鬼为用神,父母为文书" },
    婚姻: { use: ["妻财", "官鬼"], note: "男占以妻财为用,女占以官鬼为用(此盘双看)" },
    疾病: { use: ["官鬼", "子孙"], note: "官鬼为病、子孙为药;自占以世为用" },
    出行: { use: ["世", "应"], note: "世为己、应为地头" },
    行人: { use: ["应"], note: "行人以应爻为用(亲者用六亲)" },
    词讼: { use: ["官鬼"], note: "下状告人看官鬼旺相" },
    失物: { use: ["妻财"], note: "失物专看财爻,贼看官鬼、捕看子孙" },
    家宅: { use: ["父母"], note: "盖造买宅看世与父爻" },
    天时: { use: ["父母", "子孙"], note: "父母为雨、子孙为晴" },
    胎孕: { use: ["子孙"], note: "亲占代占皆以子孙为用" },
    终身: { use: ["世"], note: "终身财福看世财福,寿元独重世爻" },
    其他: { use: ["世"], note: "未定类别,以世爻为用神参考" },
  };
  const cat = Object.keys(S).find((k) => k !== "其他" && shi.includes(k));
  return S[cat ?? "其他"];
}

/** 飞伏神:用神六亲在卦中缺失时,自本宫首卦(八纯卦)同位取伏神,伏于本卦该爻(飞神)之下(据 docs/05_六爻排盘.md 飞伏神) */
function fillFuShen(pan: Pan, yongQin: string): void {
  const qins = pan.lines.map((l) => l.qin);
  if (qins.includes(yongQin)) return;
  const pureName = pan.gua.八宫[0];
  const pure = guaOf(pureName);
  if (!pure) return;
  const idx = pure.六亲.findIndex((q) => q[0] === yongQin);
  if (idx < 0) return;
  const fei = pan.lines[idx];
  const fvWX = pure.纳甲[idx][1];
  const rel = relation(fei.wx, fvWX);
  pan.fushen[yongQin] = {
    gzName: pure.纳甲[idx][0], wx: pure.纳甲[idx][1], fei,
    shengKe: rel.includes("生") ? (rel.startsWith(fei.wx) ? "飞来生伏,伏神得生扶" : "伏去生飞,泄气") :
             rel.includes("克") ? (rel.startsWith(fei.wx) ? "飞来克伏" : "伏克飞") : "飞伏比和",
  };
}

/* ==================== 输出辅助 ==================== */

function lineFlags(l: hex.LineInfo): string {
  const f: string[] = [];
  if (l.isShi) f.push("世");
  if (l.isYing) f.push("应");
  if (l.isDong) f.push("动");
  if (l.isKong) f.push("空");
  if (l.isPo) f.push("破");
  return f.length ? `  [${f.join("·")}]` : "";
}

function fmtDT(t: { y: number; m: number; d: number; h: number }): string {
  return `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")} ${String(t.h).padStart(2, "0")}:00`;
}

function guzhiStr(g: ReturnType<typeof fullGanZhi>): string {
  return `${g.ygz.gan}${g.ygz.zhi}年 ${g.mgz.gan}${g.mgz.zhi}月 ${g.dgz.gan}${g.dgz.zhi}日 ${g.hgz.gan}${g.hgz.zhi}时`;
}

/* ==================== 工具 1:起卦 ==================== */

/** mulberry32 种子 PRNG(替代裸 Math.random,支持 seed 复现) */
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

async function qigua(args: {
  method?: string; datetime?: string; 卦名?: string; 动爻?: number[]; 数?: number[]; 字?: string;
  晚子时?: "换日" | "不换日"; 经度?: number; seed?: string | number; format?: string;
}): Promise<string> {
  const method = args.method ?? "time";
  const opts = { 晚子时: args.晚子时, 经度: args.经度 };
  const t = parseDT(args.datetime);
  const gzFull = fullGanZhi(t, opts);
  const mName = method === "time" ? "梅花易数时间起卦" : method === "coins" ? "三枚铜钱六掷" :
    method === "shu" ? "报数起卦" : method === "zi" ? "字占起卦" : "手动指定卦名";
  const out: string[] = [`【起卦·${mName}】`, ""];
  out.push(`起卦时间: ${fmtDT(t)}   ${guzhiStr(gzFull)}`, "");

  let gua: Gua;
  let dongs: number[] = [];
  let throwLines: string[] = [];

  if (method === "shu") {
    // 报数起卦(梅花易数·物数占):取一至三个数;上卦=第一数÷8余(0取8),
    // 下卦=第二数÷8余(缺省取 第一数+时辰 或 第三数),动爻=(两数之和或第三数)÷6(0取6)。
    const nums = (args.数 ?? []).map((n) => Math.round(Math.abs(n))).filter((n) => n > 0);
    if (!nums.length) throw new Error("shu 方式需提供 数(报出的数字,1~3 个)");
    const hz = DI.indexOf(gzFull.hgz.zhi) + 1;
    const up = NUM_TO_GUA[nums[0] % 8 === 0 ? 8 : nums[0] % 8];
    const second = nums[1] ?? nums[0] + hz;
    const dn = NUM_TO_GUA[second % 8 === 0 ? 8 : second % 8];
    const total = nums[2] ?? nums[0] + second;
    const dong = total % 6 === 0 ? 6 : total % 6;
    gua = guaOfTrigrams(up, dn)!;
    dongs = [dong];
    out.push(
      `所报数: ${nums.join("、")}${nums.length < 3 ? `(补第${nums.length + 1}数 = 第1数+时辰${gzFull.hgz.zhi}=${hz} → ${second};补第3数 = ${total})` : ""}`,
      `上卦 = ${nums[0]}÷8 余${nums[0] % 8 || "0(取8)"} = ${up}   下卦 = ${second}÷8 余${second % 8 || "0(取8)"} = ${dn}`,
      `动爻 = ${total}÷6 余${total % 6 || "0(取6)"} = 第${dong}爻`,
      "",
    );
  } else if (method === "zi") {
    // 字占(梅花易数·字占/声音占):以字笔画总数(或字数)起卦。
    // 一字:以该字笔画数为上卦,上卦+时辰为下卦,总数÷6取动爻;
    // 多字:平分字数,上卦=前半总笔画÷8余,下卦=后半总笔画÷8余,动爻=(前后笔画和)÷6余。
    if (!args.字) throw new Error("zi 方式需提供 字(所报之字)");
    const chars = [...args.字.trim()];
    const hz = DI.indexOf(gzFull.hgz.zhi) + 1;
    const strokes = (ch: string) => {
      const p = STROKE_POS.get(ch);
      if (p !== undefined) return p;
      if (ch >= "一" && ch <= "十") return "一二三四五六七八九十".indexOf(ch) + 1;
      return ch.codePointAt(0)! % 8 || 8;
    };
    if (chars.length === 1) {
      const n = strokes(chars[0]);
      const up = NUM_TO_GUA[n % 8 === 0 ? 8 : n % 8];
      const dn = NUM_TO_GUA[(n + hz) % 8 === 0 ? 8 : (n + hz) % 8];
      const dong = (n + hz) % 6 === 0 ? 6 : (n + hz) % 6;
      gua = guaOfTrigrams(up, dn)!;
      dongs = [dong];
      out.push(`单字「${args.字}」笔画≈${n}(据笔画表/余8),上卦=${up},下卦=${n}+时${gzFull.hgz.zhi}=${n + hz}→${dn},动爻=${dong}`, "");
    } else {
      const half = Math.ceil(chars.length / 2);
      const head = chars.slice(0, half), tail = chars.slice(half);
      const hs = head.reduce((a, c) => a + strokes(c), 0);
      const ts = tail.reduce((a, c) => a + strokes(c), 0);
      const up = NUM_TO_GUA[hs % 8 === 0 ? 8 : hs % 8];
      const dn = NUM_TO_GUA[ts % 8 === 0 ? 8 : ts % 8];
      const dong = (hs + ts) % 6 === 0 ? 6 : (hs + ts) % 6;
      gua = guaOfTrigrams(up, dn)!;
      dongs = [dong];
      out.push(
        `「${args.字}」${chars.length}字,前半「${head.join("")}」笔画${hs},后半「${tail.join("")}」笔画${ts}`,
        `上卦 = ${hs}÷8 余${hs % 8 || "0(取8)"} = ${up}   下卦 = ${ts}÷8 余${ts % 8 || "0(取8)"} = ${dn}`,
        `动爻 = ${hs + ts}÷6 余${(hs + ts) % 6 || "0(取6)"} = 第${dong}爻`,
        "",
      );
    }
  } else if (method === "time") {
    // 年支序号(子1..亥12),按当年立春后之年支;月数取节气月序号(寅月=1..丑月=12,近农历月);
    // 日数取公历日;时辰序号(子1..亥12)。上卦=(年支+月数+日数)÷8 余(0取8),
    // 下卦=(再+时辰)÷8,动爻=(总数)÷6(0取6)。先天数:乾1兑2离3震4巽5坎6艮7坤8。
    const yz = DI.indexOf(gzFull.ygz.zhi) + 1;
    const mz = (DI.indexOf(gzFull.mgz.zhi) - DI.indexOf("寅") + 12) % 12 + 1;
    const dz = t.d;
    const hz = DI.indexOf(gzFull.hgz.zhi) + 1;
    const base = yz + mz + dz;
    const up = NUM_TO_GUA[base % 8 === 0 ? 8 : base % 8];
    const dn = NUM_TO_GUA[(base + hz) % 8 === 0 ? 8 : (base + hz) % 8];
    const dong = (base + hz) % 6 === 0 ? 6 : (base + hz) % 6;
    gua = guaOfTrigrams(up, dn)!;
    dongs = [dong];
    out.push(
      `时间数: 年支${gzFull.ygz.zhi}=${yz} + 月${gzFull.mgz.zhi}=${mz} + 日=${dz} = ${base}`,
      `上卦 = ${base}÷8 余${base % 8 || "0(取8)"} = ${up}   下卦 = ${base}+时辰${gzFull.hgz.zhi}=${hz} → ${base + hz}÷8 余${(base + hz) % 8 || "0(取8)"} = ${dn}`,
      `动爻 = ${base + hz}÷6 余${(base + hz) % 6 || "0(取6)"} = 第${dong}爻`,
      "",
    );
  } else if (method === "coins") {
    // 模拟三枚铜钱六掷:三背=老阳(9,动)、三字=老阴(6,动)、二背一字=少阳(7)、一背二字=少阴(8)
    // 用 mulberry32 种子 PRNG:无 seed 用 Date.now() 生成并输出;有 seed 可复现同卦。
    const seedNum = args.seed === undefined ? (Date.now() >>> 0) || 1 : toSeed(args.seed);
    const rand = mulberry32(seedNum);
    const lineStrs: string[] = [];
    for (let i = 0; i < 6; i++) {
      const backs = [0, 1, 2].map(() => (rand() < 0.5 ? 1 : 0)).reduce((a, b) => a + b, 0);
      const kind = backs === 3 ? "老阳(9·动)" : backs === 0 ? "老阴(6·动)" : backs === 2 ? "少阳(7)" : "少阴(8)";
      const yang = backs >= 2;
      lineStrs.push(`${WEI[i]}: ${backs}背 → ${kind}${yang ? "⚊" : "⚋"}`);
      if (backs === 3 || backs === 0) dongs.push(i + 1);
    }
    out.push(`掷卦(由下而上)  [seed=0x${seedNum.toString(16)}${args.seed !== undefined ? " 复现seed" : ""}]:`, ...lineStrs.map((s) => `  ${s}`), "");
    const b = new Array<string>(6).fill("0");
    for (const [i, s] of lineStrs.entries()) b[i] = s.includes("⚊") ? "1" : "0";
    // 由六爻串反推上下卦
    const down = LINES_TO_TRIGRAM[b.slice(0, 3).join("")];
    const up = LINES_TO_TRIGRAM[b.slice(3, 6).join("")];
    gua = guaOfTrigrams(up, down)!;
  } else {
    if (!args.卦名) throw new Error("manual 方式需提供 卦名");
    gua = guaOf(args.卦名) ?? (() => { throw new Error(`未找到卦:「${args.卦名}」`); })();
    dongs = normDongs(args.动爻);
  }

  const bian = bianGuaName(gua, dongs);
  const bianGua = dongs.length ? guaOf(bian) : undefined;
  out.push(
    `──────────────────────────────`,
    `本卦: ${gua.卦名}(${gua.上下卦}) ${gua.卦符}`,
    `八宫: ${gua.八宫}  宫五行: ${gua.宫五行}   世在${WEI[gua.世爻 - 1]} 应在${WEI[gua.应爻 - 1]}`,
    `动爻位: ${dongs.length ? dongs.map((d) => WEI[d - 1]).join("、") : "无(静卦)"}`,
    `变卦: ${dongs.length ? `${bian}(${bianGua?.上下卦}) ${bianGua?.卦符 ?? ""}` : "无(静卦)"}`,
    "",
    `本卦卦辞: ${gua.卦辞}  (据 liushi_si_gua.json)`,
  );
  if (bianGua) out.push(`变卦卦辞: ${bianGua.卦辞}  (据 liushi_si_gua.json)`);
  out.push("", "数据出处: 起卦算法据梅花易数·时间起卦/增删卜易·铜钱卦;卦名/卦辞/世应据 liushi_si_gua.json", 口径披露());
  void throwLines;
  if (args.format === "json") {
    return JSON.stringify({
      工具: "qigua", method, 起卦时间: `${fmtDT(t)} ${guzhiStr(gzFull)}`,
      本卦: gua.卦名, 变卦: dongs.length ? bian : null, 动爻位: dongs,
      卦辞: gua.卦辞, 世爻: WEI[gua.世爻 - 1], 应爻: WEI[gua.应爻 - 1],
      依据: ["liushi_si_gua.json", "梅花易数·时间起卦", "增删卜易·铜钱卦"],
      口径: 口径披露(),
    }, null, 2);
  }
  return out.join("\n");
}

/* ==================== 工具 2:排盘 ==================== */

async function paipan(args: { 卦名: string; 动爻?: number[]; datetime?: string; 占事?: string; 晚子时?: "换日" | "不换日"; 经度?: number; format?: string }): Promise<string> {
  const pan = hex.buildPan(args.卦名, args.动爻, args.datetime, { 晚子时: args.晚子时, 经度: args.经度 });
  const { gua, dongs, gzFull, lines, body, xk, poZhi, shiLine, yingLine } = pan;
  const out: string[] = [
    `【排盘】${gua.卦名} ${gua.卦符} (${gua.上下卦})`,
    `八宫: ${gua.八宫}  宫五行: ${gua.宫五行}   世在${WEI[gua.世爻 - 1]} 应在${WEI[gua.应爻 - 1]}   ` +
      `起卦: ${fmtDT(pan.t)} ${guzhiStr(gzFull)}`,
    `动爻位: ${dongs.length ? dongs.map((d) => WEI[d - 1]).join("、") : "无(静卦)"}`,
    `──────────────────────────────`,
  ];
  for (const l of [...lines].reverse()) {
    out.push(`  ${l.wei}  ${l.shen}  ${l.qin}  ${l.gzName}${l.wx}${lineFlags(l)}`);
  }
  out.push(
    `──────────────────────────────`,
    `六神: 据 nayin.json·六神起例(${gzFull.dgz.gan}日起${hex.liuShenStart(gzFull.dgz.gan)}),自初爻起按六神顺序排`,
    `卦身: ${body.zhi}${body.wx}(${body.qin})${body.line ? `,于${WEI[body.line - 1]}` : ",不上卦"}  (阳世从子月起/阴世从午月生,自初爻数至世爻,据 nayin.json·卦身)`,
    `旬空: ${xk.xun}旬 空[${xk.kong.join("、")}]   空亡爻: ${lines.filter((l) => l.isKong).map((l) => l.wei).join("、") || "无"}  (据 ganzhi.json·旬空)`,
    `月破: ${gzFull.mgz.zhi}月冲${poZhi}   破爻: ${lines.filter((l) => l.isPo).map((l) => l.wei).join("、") || "无"}  (据 ganzhi.json·六冲)`,
    `六冲: ${pan.chong.length ? pan.chong.join("；") : "无"}   六合: ${pan.he.length ? pan.he.join("；") : "无"}   三合: ${pan.sanhe.length ? pan.sanhe.join("；") : "无"}`,
    `旺相休囚(${gzFull.mgz.zhi}月·${hex.seasonOf(gzFull.mgz.zhi)}季,据 ganzhi.json·五行·旺相休囚): ${lines.map((l) => `${l.wei}${l.zhi}${l.wx}${l.state}`).join("、")}`,
    `世应关系: 世(${shiLine.gzName}${shiLine.wx}) 与 应(${yingLine.gzName}${yingLine.wx}) → ${pan.rel}`,
  );
  if (args.占事) {
    const ys = yongShenFor(args.占事);
    for (const q of ys.use) fillFuShen(pan, q);
    out.push(`─ 用神(${args.占事}) ─`, `  取用: ${ys.note} (据 docs/07_分类占断.md 附:分类取用总表)`);
    for (const q of ys.use) {
      const hit = lines.filter((l) => l.qin === q);
      if (hit.length) {
        for (const l of hit) {
          out.push(`  ${q}现于${l.wei}(${l.gzName}${l.wx}),${l.state}${l.isDong ? ",发动" : ""}${l.isKong ? ",旬空" : ""}${l.isPo ? ",月破" : ""}${l.isShi ? ",持世" : ""}`);
        }
      } else if (pan.fushen[q]) {
        const f = pan.fushen[q];
        out.push(`  ${q}不上卦,伏神${q}${f.gzName}${f.wx}伏于${f.fei.wei}${f.fei.qin}(${f.fei.gzName}${f.fei.wx})之下 → ${f.shengKe}`);
      } else {
        out.push(`  卦中无${q}爻`);
      }
    }
  }
  out.push("", "数据出处: 纳甲/六亲/世应/八宫据 liushi_si_gua.json;六神/卦身据 nayin.json;旬空/月破/旺相休囚/六冲六合三合据 ganzhi.json", 口径披露());
  if (args.format === "json") {
    return JSON.stringify({
      工具: "paipan", 卦名: gua.卦名, 变卦: dongs.length ? hex.bianGuaName(gua, dongs) : null,
      起卦: `${fmtDT(pan.t)} ${guzhiStr(gzFull)}`, 动爻位: dongs,
      旬空: `${xk.xun}旬 空[${xk.kong.join("、")}]`, 月破: poZhi,
      六冲: pan.chong, 六合: pan.he, 三合: pan.sanhe,
      世爻: shiLine.gzName, 应爻: yingLine.gzName, 世应关系: pan.rel,
      爻: lines.map((l) => ({ 爻位: l.wei, 六神: l.shen, 六亲: l.qin, 干支: l.gzName, 五行: l.wx, 旺衰: l.state, 旬空: l.isKong, 月破: l.isPo, 持世: l.isShi, 持应: l.isYing, 动: l.isDong })),
      依据: ["liushi_si_gua.json", "nayin.json", "ganzhi.json"],
      口径: 口径披露(),
    }, null, 2);
  }
  return out.join("\n");
}

/* ==================== 工具 3:断卦辅助 ==================== */

async function duangua(args: {
  卦名: string; 动爻?: number[]; datetime?: string; 占事: string; 晚子时?: "换日" | "不换日"; 经度?: number;
}): Promise<string> {
  const pan = hex.buildPan(args.卦名, args.动爻, args.datetime, { 晚子时: args.晚子时, 经度: args.经度 });
  const ys = yongShenFor(args.占事);
  const { gua, gzFull, shiLine, yingLine, xk } = pan;
  const out: string[] = [
    `【断卦辅助】占事:${args.占事}   卦:${gua.卦名} ${gua.卦符} (${gua.上下卦})`,
    `起卦: ${fmtDT(pan.t)} ${guzhiStr(gzFull)}   动爻位: ${pan.dongs.length ? pan.dongs.join("、") : "无(静卦)"}`,
    `──────────────────────────────`,
    `── 用神 ──`,
    `取用: ${ys.note} (据 docs/07_分类占断.md 附:分类取用总表)`,
  ];
  const verdicts: string[] = [];
  for (const q of ys.use) {
    fillFuShen(pan, q);
    const hit = pan.lines.filter((l) => l.qin === q);
    if (hit.length) {
      for (const l of hit) {
        out.push(`  ${q}现于${l.wei}(${l.gzName}${l.wx}),处${l.state}${l.isDong ? ",发动" : ",安静"}${l.isKong ? ",旬空" : ""}${l.isPo ? ",月破" : ""}${l.isShi ? ",持世" : ""}`);
      }
      const good = hit.some((l) => (l.state === "旺" || l.state === "相") && !l.isKong && !l.isPo);
      const bad = hit.some((l) => l.isKong || l.isPo || l.state === "死" || l.state === "囚");
      verdicts.push(`${q}: ${good ? "旺相有气,主吉" : bad ? "失陷(空/破/衰死),主不利" : "平(有气但未旺)"}`);
    } else if (pan.fushen[q]) {
      const f = pan.fushen[q];
      out.push(`  ${q}不上卦,伏神${f.gzName}${f.wx}伏于${f.fei.wei}${f.fei.qin}(${f.fei.gzName}${f.fei.wx})之下 → ${f.shengKe}`);
      verdicts.push(`${q}: 伏神${f.shengKe.includes("生扶") ? "得生扶,可用" : "未得生扶,谨慎"}`);
    } else {
      out.push(`  卦中无${q}爻`);
      verdicts.push(`${q}: 卦中不现`);
    }
  }
  out.push(
    `── 世应 ──`,
    `世在${shiLine.wei}(${shiLine.gzName}${shiLine.wx}),应在${yingLine.wei}(${yingLine.gzName}${yingLine.wx}),世应关系:${pan.rel}`,
    `  世应相生相合为宾主相投,相克相冲为两情不睦(据增删卜易·世应论用神)`,
    `── 吉凶倾向 ──`,
    ...verdicts.map((v) => `  ${v}`),
    `── 注意事项 ──`,
    `  ${yuNote(args.占事)}`,
  );
  out.push(
    "",
    `── 解卦任务书(给解读方,用神/旺衰/空破已算好,勿改) ──`,
    `占事: ${args.占事}   本卦: ${gua.卦名}(${gua.上下卦})  动爻位: ${pan.dongs.length ? pan.dongs.join("、") : "无(静卦)"}`,
    `用神: ${ys.use.join("、")} (${ys.note.split(",")[0]})`,
    `关键爻: ${pan.lines.filter((l) => l.isShi || l.isYing || l.isDong).map((l) => `${l.wei}${l.qin}${l.gzName}${l.wx}(${l.state}${l.isKong ? "空" : ""}${l.isPo ? "破" : ""})`).join("、")}`,
    `旬空: ${xk.kong.join("、")}   月破: ${pan.poZhi}   世应: ${pan.rel}`,
    `任务: 以上规则要素已确定,解读方仅据此组织白话表达(术语附翻译+结尾纯白话【总结】),不得自行改动用神或重排卦象。`,
  );
  out.push("", "以上为规则性辅助,最终解读由解读方结合卦辞爻辞综合判断。", 口径披露());
  return out.join("\n");
}

/** 各占事忌神/要点(据 docs/07_分类占断.md 各节) */
function yuNote(shi: string): string {
  const notes: Record<string, string> = {
    求财: "兄弟为忌神(劫财),兄爻持世或发动则求之难;父动克子伤财源,缘木求鱼",
    功名: "子孙剥官,子孙持世或发动则功名不成;官父同旺为吉",
    婚姻: "男忌兄弟、女忌子孙持世;财官旺相、卦逢六合为吉,六冲为凶",
    疾病: "自占以世为用,代占以六亲为用;用神空破墓绝受克则凶,子孙旺相为药到病除",
    出行: "世旺宜行、世空宜止;应空破墓绝不宜往;子孙持世百祸潜消",
    行人: "用神克世即归、世克用未动;用神墓绝空破归信杳然",
    词讼: "官鬼旺相出现必赢,子孙持世必不成非;财动折理不可兴讼",
    失物: "财爻旺相不空不动可见;玄武带鬼为盗象,鬼空寻不见",
    家宅: "盖造买宅看世与父爻,旺相不犯冲克即宜成;六合吉六冲不久",
    天时: "父母旺动则雨,子孙旺动则晴;财动克父生孙主晴",
    胎孕: "子孙旺相逢生扶为成孕,空破衰绝为虚;问产妇安否以妻财为用",
    终身: "终身财福看世、财、福三爻无失陷;寿元独重世爻",
  };
  const cat = Object.keys(notes).find((k) => shi.includes(k)) ?? "其他";
  return notes[cat] ?? "综合看世应生克与六亲旺衰,忌用神空破墓绝";
}

/* ==================== 工具 4:查卦 ==================== */

async function cha(args: { 卦名: string; 动爻?: number[] }): Promise<string> {
  const gua = guaOf(args.卦名);
  if (!gua) throw new Error(`未找到卦:「${args.卦名}」`);
  const dongs = normDongs(args.动爻);
  const out: string[] = [
    `【查卦】${gua.卦名} ${gua.卦符} (${gua.上下卦})`,
    `──────────────────────────────`,
    `【卦辞】${gua.卦辞}  (据 liushi_si_gua.json)`,
  ];
  const yaoci = (db.loadYaoci() as { 六十四卦: { 卦名: string; 卦辞: string; 爻辞: { 爻名: string; 爻辞: string }[]; 用?: string }[] }).六十四卦.find((x) => x.卦名 === args.卦名);
  if (yaoci) {
    out.push(`【爻辞】${dongs.length ? `(动爻位:${dongs.join("、")}已标 ★)` : "(静卦)"}  (据 爻辞.json)`);
    yaoci.爻辞.forEach((y, i) => {
      const dong = dongs.includes(i + 1);
      out.push(`  ${y.爻名}${dong ? " ★动★" : ""} ${y.爻辞}`);
    });
    if (yaoci.用) out.push(`【用】${yaoci.用}  (据 爻辞.json)`);
  }
  const bian = bianGuaName(gua, dongs);
  const bianGua = dongs.length ? guaOf(bian) : undefined;
  out.push(
    `【变卦】${dongs.length ? `${bian} ${bianGua?.卦符 ?? ""} (${bianGua?.上下卦 ?? ""})` : "无(静卦)"}` +
      `${bianGua ? `  卦辞:${bianGua.卦辞} (据 liushi_si_gua.json)` : ""}`,
  );
  // 焦氏易林:新 schema 为数组,按 本卦/之卦 查找
  const yilin = db.loadYilin();
  const poem = yilin.find((e) => e.本卦 === gua.卦名 && e.之卦 === bian)?.诗;
  out.push(`【焦氏易林】${gua.卦名}之${bian}: ${poem ?? "(易林中无此条)"}  (据 yilin.json)`);
  const tuan = db.loadTuanXiang();
  if (tuan) {
    const tuanList = (tuan as { 六十四卦: { 卦名: string; 彖传?: string; 大象?: string }[] }).六十四卦;
    const t = tuanList?.find((x) => x.卦名 === gua.卦名);
    if (t) {
      if (t.彖传) out.push(`【彖传】${t.彖传}  (据 tuan_xiang.json)`);
      if (t.大象) out.push(`【大象】${t.大象}  (据 tuan_xiang.json)`);
    }
  }
  const baguas = db.loadBaguas() as { 卦名: string; 卦象: string; 卦德: string; 五行: string; 后天方位: string; 取象: string }[];
  const [up, down] = splitUpDown(gua.上下卦);
  for (const [pos, b] of ([[up, "上卦"], [down, "下卦"]] as const)) {
    const info = baguas.find((x) => x.卦名 === b);
    if (info) out.push(`【${pos}·${info.卦名}象意】卦象${info.卦象},德${info.卦德},五行${info.五行},方位${info.后天方位};取象:${info.取象}  (据 bagua.json)`);
  }
  out.push("", "数据出处: 卦辞/变卦据 liushi_si_gua.json;爻辞/用九用六据 爻辞.json;易林据 yilin.json;八卦象意据 bagua.json", 口径披露());
  return out.join("\n");
}

/* ==================== 工具定义与插件导出 ==================== */

const qiguaTool = tool({
  description: "起卦:支持梅花易数时间起卦、三枚铜钱六掷、报数起卦、字占起卦、手动指定卦名。输出本卦/变卦/卦辞/世应/起卦干支。",
  args: {
    method: tool.schema.enum(["time", "coins", "shu", "zi", "manual"]).describe("time=梅花易数时间起卦,coins=三枚铜钱六掷,shu=报数起卦(用 数),zi=字占起卦(用 字),manual=手动指定卦名").default("time"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    卦名: tool.schema.string().optional().describe("manual 方式必填,64卦卦名如:乾"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6,自下而上)"),
    数: tool.schema.array(tool.schema.number()).optional().describe("shu 方式报出的数字(1-3个,如 [7,3,15])"),
    字: tool.schema.string().optional().describe("zi 方式所报之字(笔画起卦,支持单字/多字)"),
    晚子时: tool.schema.enum(["换日", "不换日"]).optional().describe("晚子时(23-24点)日柱处理:换日=归次日(默认),不换日=按当日"),
    经度: tool.schema.number().optional().describe("出生地/起卦地经度(东经正,如 87=乌鲁木齐)。默认 120(东八区);传入非120时用真太阳时定时辰"),
    seed: tool.schema.string().or(tool.schema.number()).optional().describe("coins 方式的随机种子,同 seed 可复现同一卦;不传则自动生成(输出 seed=0x…)"),
    format: tool.schema.enum(["text", "json"]).optional().describe("输出格式:text=自然语言(默认);json=结构化审计 JSON(含口径/依据)"),
  },
  execute: qigua,
});

const paipanTool = tool({
  description: "排盘:输出六爻排盘(六神/六亲/纳甲/五行、世应动空破)、卦身、旬空、月破、六冲六合三合、旺相休囚、飞伏神。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6)"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    占事: tool.schema.string().optional().describe("占问之事,如:求财"),
    晚子时: tool.schema.enum(["换日", "不换日"]).optional().describe("晚子时(23-24点)日柱处理:换日=归次日(默认),不换日=按当日"),
    经度: tool.schema.number().optional().describe("起卦地经度(东经正)。默认 120(东八区);传入非120时用真太阳时定时辰"),
    format: tool.schema.enum(["text", "json"]).optional().describe("输出格式:text=自然语言(默认);json=结构化审计 JSON(含口径/依据)"),
  },
  execute: paipan,
});

const duanguaTool = tool({
  description: "断卦辅助:按占事取用神,结合旺衰动空破与世应关系给出规则性吉凶倾向。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6)"),
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认现在)"),
    占事: tool.schema.enum(["求财", "功名", "婚姻", "疾病", "出行", "行人", "词讼", "失物", "家宅", "天时", "胎孕", "终身", "其他"]).describe("占问门类"),
    晚子时: tool.schema.enum(["换日", "不换日"]).optional().describe("晚子时(23-24点)日柱处理:换日=归次日(默认),不换日=按当日"),
    经度: tool.schema.number().optional().describe("起卦地经度(东经正)。默认 120(东八区);传入非120时用真太阳时定时辰"),
  },
  execute: duangua,
});

const chaTool = tool({
  description: "查卦:卦辞、爻辞(动爻高亮)、乾坤用九用六、变卦卦辞、焦氏易林变诗、上下卦八卦象意。",
  args: {
    卦名: tool.schema.string().describe("64卦卦名"),
    动爻: tool.schema.array(tool.schema.number()).optional().describe("动爻爻位(1-6)"),
  },
  execute: cha,
});

/** 六爻核心工具自声明(供聚合器合并) */
export const 元信息 = { 名: "六爻纳甲", 书号: [1, 2, 3, 4, 5, 6], 法式: ["纳甲筮法", "三枚铜钱六掷", "梅花时间起卦", "报数起卦", "字占起卦"] };
export const 工具 = { qigua: qiguaTool, paipan: paipanTool, duangua: duanguaTool, cha: chaTool };
export const 数据 = ["liushi_si_gua.json", "爻辞.json", "nayin.json", "ganzhi.json", "bagua.json", "yilin.json", "books/index.json"];

const zhanbuTools = { ...工具, ...meihua.工具, ...bazi.工具, ...liuren.工具, ...almanac.工具 };

const plugin: Plugin = async () => ({ tool: zhanbuTools });
export default plugin;
