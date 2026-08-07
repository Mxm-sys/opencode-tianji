/** 卦例库 guaili.json 质量测试:数量、字段完整性、来源溯源、去重 */
import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "../lib/db.ts";

type GuaCase = {
  书号: number; 卷: string; 章节: string; 占事: string; 卦名: string; 变卦: string;
  干支: string; 卦象与断语: string; 应期原理: string; 白话: string;
  来源: { 书号: number; 书: string; 卷: string; 章: string; 行: string }[];
};

function loadGuaili(): GuaCase[] {
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "guaili.json"), "utf8")) as { 卦例: GuaCase[] };
  return d.卦例;
}

test("guaili: 卦例库 ≥ 260 则", () => {
  const g = loadGuaili();
  assert.ok(g.length >= 260, `卦例仅 ${g.length} 则,未达 260 目标`);
});

test("guaili: 每条 11 字段完整且非空", () => {
  const fields = ["书号", "卷", "章节", "占事", "卦名", "变卦", "干支", "卦象与断语", "应期原理", "白话", "来源"];
  for (const e of loadGuaili()) {
    for (const f of fields) {
      const v = e[f as keyof GuaCase];
      assert.ok(v !== undefined && v !== null && v !== "", `卦例「${e.占事}」缺字段 ${f}`);
    }
  }
});

test("guaili: 每则均有「来源」溯源且行号有效", () => {
  const maxLine: Record<number, number> = { 4: 5993, 6: 1917 };
  for (const e of loadGuaili()) {
    assert.ok(Array.isArray(e.来源) && e.来源.length >= 1, `卦例「${e.占事}」缺来源`);
    for (const s of e.来源) {
      assert.strictEqual(s.书号, e.书号, `卦例「${e.占事}」来源书号不一致`);
      const m = /^\s*(\d+)/.exec(s.行);
      assert.ok(m, `卦例「${e.占事}」行号格式非法: ${s.行}`);
      const n = +m[1];
      assert.ok(n >= 1 && n <= maxLine[e.书号], `卦例「${e.占事}」行号 ${n} 超出书${e.书号}范围`);
    }
  }
});

test("guaili: 书号/章节/占事/行 无重复条目", () => {
  const seen = new Set<string>();
  for (const e of loadGuaili()) {
    const key = `${e.书号}|${e.章节}|${e.占事}|${e.来源[0].行}`;
    assert.ok(!seen.has(key), `卦例重复: ${e.章节}·${e.占事}·行${e.来源[0].行}`);
    seen.add(key);
  }
});

test("guaili: 卦名/变卦可用全称解析或为占位", () => {
  const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "liushi_si_gua.json"), "utf8"));
  const all: string[] = [];
  for (const x of g.六十四卦) {
    const ud = x.上下卦 as string;
    const a = ud[0], b = ud[2];
    const XIANG_INV: Record<string, string> = { 乾: "天", 坤: "地", 震: "雷", 巽: "风", 坎: "水", 离: "火", 艮: "山", 兑: "泽" };
    all.push(a === b ? `${a}为${XIANG_INV[a]}` : `${XIANG_INV[a]}${XIANG_INV[b]}${x.卦名}`);
  }
  for (const e of loadGuaili()) {
    for (const f of ["卦名", "变卦"] as const) {
      const v = e[f];
      if (v.startsWith("(") || v.includes("未题") || v === "(静卦无变)") continue;
      // 全称可能带括号注释(如"地雷复(再占山泽损、渐之巽)"),取括号前前缀判断
      const core = v.split("(")[0].trim();
      assert.ok(all.includes(core), `卦例「${e.占事}」${f}「${v}」不在六十四卦全称表`);
    }
  }
});
