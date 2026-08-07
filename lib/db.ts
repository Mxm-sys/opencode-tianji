/**
 * 知识库 JSON 加载器(仅用 Node 内置 node:fs / node:path)。
 * 所有 load* 函数惰性加载并缓存,重复调用不再读盘;文件缺失/解析失败抛带路径的清晰错误。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// lib → 包内 data
export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

type Json = Record<string, unknown>;

const cache = new Map<string, Json>();

function loadJson(file: string): Json {
  const p = path.join(DATA_DIR, file);
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
type Yilin = { 易林: Record<string, unknown> };

export function loadBaguas(): Record<string, unknown>[] {
  return (loadJson("bagua.json") as Baguas).八卦;
}

export function loadGua64(): { 卦名: string; 卦序: number }[] {
  return (loadJson("liushi_si_gua.json") as Gua64).六十四卦;
}

export function loadGanzhi(): Json {
  return loadJson("ganzhi.json");
}

export function loadNayin(): Json {
  return loadJson("nayin.json");
}

export function loadYaoci(): Json {
  return loadJson("爻辞.json");
}

export function loadYilin(): Yilin {
  return loadJson("yilin.json") as Yilin;
}

/** 按卦名精确匹配(如「乾」),找不到返回 undefined */
export function guaByName(name: string): { 卦名: string; 卦序: number } | undefined {
  return loadGua64().find((g) => g.卦名 === name);
}

/** 卦序 1-64;找不到返回 undefined */
export function guaIndex(name: string): number | undefined {
  return guaByName(name)?.卦序;
}
