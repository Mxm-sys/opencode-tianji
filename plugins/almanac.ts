/**
 * 农历/黄历工具:almanac
 *
 * 用 6tail/lunar-javascript(MIT,生态历法事实标准)提供农历/干支/宜忌/吉神方位等黄历信息。
 * 纯计算,不读知识库;弥补本项目"无农历输出"的生态缺项(taibu/6tail 均为标配)。
 */
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { Solar } from "lunar-javascript";
import { parseDT } from "../lib/hex";
import { 口径披露 } from "../lib/ganzhi";

const DIZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

async function almanac(args: { datetime?: string }): Promise<string> {
  const t = parseDT(args.datetime);
  const solar = Solar.fromYmd(t.y, t.m, t.d);
  const l = solar.getLunar();

  const yi = l.getDayYi().join("、");
  const ji = l.getDayJi().join("、");
  const jiShen = l.getDayJiShen(); // 吉神
  const xiongSha = l.getDayXiongSha(); // 凶煞
  const xunKong = l.getDayXunKong(); // 旬空
  const chong = l.getDayChongDesc(); // 冲
  const sha = l.getDaySha(); // 煞
  const shengxiao = l.getDayShengXiao(); // 生肖

  const gz = `${l.getYearInGanZhi()}年 ${l.getMonthInGanZhi()}月 ${l.getDayInGanZhi()}日`;
  const nian = l.getYearShengXiao();
  const jieQi = l.getJieQi();

  const out: string[] = [
    `【黄历】${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")} 星期${"日一二三四五六"[solar.getWeek()]}`,
    `农历: ${l.toString()}  (${nian}年)`,
    `干支: ${gz}`,
    `节气: ${jieQi || "无"}`,
    `纳音: ${l.getYearNaYin()} ${l.getMonthNaYin()} ${l.getDayNaYin()}`,
    `宜: ${yi || "无"}`, `忌: ${ji || "无"}`,
    `吉神: ${jiShen || "无"}   凶煞: ${xiongSha || "无"}`,
    `喜神: ${l.getDayPositionXiDesc()}   福神: ${l.getDayPositionFuDesc()}   财神: ${l.getDayPositionCaiDesc()}`,
    `冲: ${chong} 煞: ${sha}   生肖: ${shengxiao}`,
    `旬空: ${xunKong || "无"}`,
    ``,
    `白话: ${t.y}年${t.m}月${t.d}日,农历${l.getMonthInChinese()}月${l.getDayInChinese()},${nian}年${gz}。当日宜做「${yi || "无特别忌讳"}」,忌做「${ji || "无"}」;冲煞${chong}${sha ? "、煞" + sha : ""}。仅供择日参考。`,
    `依据: 6tail/lunar-javascript(农历/黄历事实标准, MIT)`,
    口径披露(),
  ];
  return out.join("\n");
}

const almanacTool = tool({
  description: "黄历:查询指定日期的农历/干支/节气/宜忌/吉神方位/冲煞/旬空(基于 lunar-javascript 农历历法标准)。",
  args: {
    datetime: tool.schema.string().optional().describe("ISO 时间字符串(默认今天)"),
  },
  execute: almanac,
});

/** 模块自声明:元信息/工具/数据(数据为空,纯计算) */
export const 元信息 = { 名: "农历黄历", 书号: [] as number[], 法式: ["lunar-javascript 农历历法"] };
export const 工具 = { almanac: almanacTool };
export const 数据: string[] = [];

const plugin: Plugin = async () => ({ tool: { almanac: almanacTool } });
export default plugin;
