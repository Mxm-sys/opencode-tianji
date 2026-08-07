/** 评测基准与干支直入排盘测试 */
import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPanByGanzhi, shortGuaName } from "../lib/hex.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("benchmark: guaili_gold.json 金标准 ≥ 250 条", () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "benchmark", "guaili_gold.json"), "utf8"));
  assert.ok(d.条目.length >= 250, `金标准仅 ${d.条目.length} 条`);
  assert.ok(d.条目.every((g: { 卦名: string; 月支: string | null; 日支: string | null }) => g.卦名 && (g.月支 || g.日支)));
});

test("benchmark: 全部金标准条目引擎可排盘", () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "benchmark", "guaili_gold.json"), "utf8"));
  const panable = d.条目.filter((g: { 月支: string | null; 日支: string | null }) => g.月支 && g.日支);
  assert.ok(panable.length >= 200, `可排条目 ${panable.length}`);
  for (const g of panable as { 占事: string; 卦名: string; 月支: string; 日干: string | null; 日支: string }[]) {
    const day = g.日干 ? `${g.日干}${g.日支}` : `甲${g.日支}`;
    const pan = buildPanByGanzhi(g.卦名, [], g.月支, day);
    assert.strictEqual(pan.lines.length, 6, `${g.占事} 六爻`);
  }
});

test("hex: shortGuaName 全称→单字", () => {
  assert.strictEqual(shortGuaName("兑为泽"), "兑");
  assert.strictEqual(shortGuaName("天水讼"), "讼");
  assert.strictEqual(shortGuaName("泽风大过"), "大过");
  assert.strictEqual(shortGuaName("乾"), "乾");
});

test("hex: buildPanByGanzhi 排盘正确(亥月己丑日兑为泽)", () => {
  const p = buildPanByGanzhi("兑为泽", [], "亥", "己丑");
  assert.strictEqual(p.xk.xun, "甲申");
  assert.deepStrictEqual(p.xk.kong, ["午", "未"]);
  assert.strictEqual(p.poZhi, "巳");
  assert.strictEqual(p.shiLine.qin, "父母");
  assert.strictEqual(p.lines.filter((l) => l.isKong).length, 1);
  assert.strictEqual(p.lines.filter((l) => l.isPo).length, 1);
});
