/**
 * 知识库 JSON 加载器(仅用 Node 内置 node:fs / node:path)。
 * 所有 load* 函数惰性加载并缓存,重复调用不再读盘;文件缺失/解析失败抛带路径的清晰错误。
 *
 * 数据文件均为统一 schema(tianji/data/v1):顶层固定头信息 + 主题语义命名的内容数组,
 * 内容数组条目必带「来源」溯源数组。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// lib → 包内 data;books 位于 data 上一级的包内 books
export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

type Json = Record<string, unknown>;

const cache = new Map<string, Json>();

function loadJson(file: string): Json {
  return loadJsonPath(path.join(DATA_DIR, file));
}

function loadJsonPath(p: string): Json {
  const hit = cache.get(p);
  if (hit !== undefined) return hit;
  if (!fs.existsSync(p)) {
    throw new Error(`知识库数据文件缺失: ${p}`);
  }
  let parsed: Json;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Json;
  } catch (e) {
    throw new Error(`知识库数据文件解析失败: ${p} — ${(e as Error).message}`);
  }
  cache.set(p, parsed);
  return parsed;
}

type Baguas = { 八卦: Record<string, unknown>[] };
type Gua64 = { 六十四卦: { 卦名: string; 卦序: number }[] };
export type YilinItem = { 本卦: string; 之卦: string; 诗: string };
type BooksIndex = { 说明: string; 书: { 书号: number; 书名: string }[] };

export function loadBaguas(): Record<string, unknown>[] {
  return (loadJson("bagua.json") as Baguas).八卦;
}

export function loadGua64(): { 卦名: string; 卦序: number }[] {
  return (loadJson("liushi_si_gua.json") as Gua64).六十四卦;
}

export function loadGanzhi(): Json {
  return loadJson("ganzhi.json");
}

/** 五行内容条目数组(新 schema:数组,按 项 区分 相生/相克/旺相休囚) */
export function loadGanzhiWuxing(): { 项: string; 内容: unknown }[] {
  const w = loadGanzhi().五行;
  return Array.isArray(w) ? (w as { 项: string; 内容: unknown }[]) : [];
}

/** 五行相生/相克 内容字符串(如 "金生水，水生木…") */
export function wuxingShengKe(): { sheng: string; ke: string } {
  const items = loadGanzhiWuxing();
  const sheng = items.find((x) => x.项 === "相生")?.内容 ?? "";
  const ke = items.find((x) => x.项 === "相克")?.内容 ?? "";
  return { sheng: String(sheng), ke: String(ke) };
}

export type WangXiangRow = { 季节: string; 旺: string; 相: string; 休: string; 囚: string; 死: string };

/** 旺相休囚:季节(春/夏/秋/冬) → {旺,相,休,囚,死}(据 ganzhi.json 五行·旺相休囚) */
export function wangXiangXiuQiu(): Record<string, WangXiangRow> {
  const items = loadGanzhiWuxing();
  const rows = items.find((x) => String(x.项).includes("旺相休囚"))?.内容;
  const list = Array.isArray(rows) ? (rows as WangXiangRow[]) : [];
  return Object.fromEntries(list.map((r) => [r.季节, r]));
}

export function loadNayin(): Json {
  return loadJson("nayin.json");
}

export function loadYaoci(): Json {
  return loadJson("爻辞.json");
}

/** 焦氏易林:新 schema 为数组(4096 条:本卦 × 之卦) */
export function loadYilin(): YilinItem[] {
  return (loadJson("yilin.json") as { 易林: YilinItem[] }).易林;
}

/** 书层书目摘要(books/index.json,位于 data 上一级的 books 目录) */
export function loadBooks(): BooksIndex {
  return loadJsonPath(path.join(DATA_DIR, "..", "books", "index.json")) as BooksIndex;
}

/** 彖传/大象(tuan_xiang.json 若存在,返回 undefined 表示尚未就位) */
export function loadTuanXiang(): Json | undefined {
  const p = path.join(DATA_DIR, "tuan_xiang.json");
  return fs.existsSync(p) ? loadJsonPath(p) : undefined;
}

/** 按卦名精确匹配(如「乾」),找不到返回 undefined */
export function guaByName(name: string): { 卦名: string; 卦序: number } | undefined {
  return loadGua64().find((g) => g.卦名 === name);
}

/** 卦序 1-64;找不到返回 undefined */
export function guaIndex(name: string): number | undefined {
  return guaByName(name)?.卦序;
}
