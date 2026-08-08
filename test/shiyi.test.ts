import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DATA = path.join(import.meta.dir, "..", "data");
const shiyi = JSON.parse(readFileSync(path.join(DATA, "十翼.json"), "utf8")) as {
  schema: string;
  主题: string;
  系辞上: { 章次: number; 首句: string; 内容: string }[];
  系辞下: { 章次: number; 首句: string; 内容: string }[];
  文言: { 乾: { 内容: string }[]; 坤: { 内容: string }[] };
  序卦: { 卦序: number; 卦名: string; 内容: string }[];
  杂卦: { 卦名: string; 内容: string }[];
};
const yaoci = JSON.parse(readFileSync(path.join(DATA, "爻辞.json"), "utf8")) as {
  六十四卦: { 卦序: number; 卦名: string }[];
};

describe("十翼(系辞/文言/序卦/杂卦)", () => {
  test("文件头符合数据文件 schema", () => {
    expect(shiyi.schema).toBe("tianji/data/v1");
    expect(shiyi.主题).toContain("十翼");
  });

  test("序卦正好 64 条且卦序连续 1-64,卦名与爻辞一致", () => {
    expect(shiyi.序卦.length).toBe(64);
    expect(shiyi.序卦.map((g) => g.卦序)).toEqual(
      Array.from({ length: 64 }, (_, i) => i + 1),
    );
    expect(shiyi.序卦.map((g) => g.卦名)).toEqual(
      yaoci.六十四卦.map((g) => g.卦名),
    );
  });

  test("杂卦 64 卦全覆盖(卦名集合=64卦集合)", () => {
    expect(shiyi.杂卦.length).toBe(64);
    expect(new Set(shiyi.杂卦.map((g) => g.卦名))).toEqual(
      new Set(yaoci.六十四卦.map((g) => g.卦名)),
    );
  });

  test("系辞/文言内容非空且每条带来源", () => {
    const all = [
      ...shiyi.系辞上,
      ...shiyi.系辞下,
      ...shiyi.文言.乾,
      ...shiyi.文言.坤,
      ...shiyi.序卦,
      ...shiyi.杂卦,
    ] as { 内容: string; 来源?: { 书号: number; 书: string; 卷: string; 章: string; 行: string }[] }[];
    expect(all.length).toBe(33 + 50 + 16 + 6 + 64 + 64);
    for (const e of all) {
      expect(e.内容.length).toBeGreaterThan(0);
      expect(e.来源?.[0]?.书号).toBe(1);
      expect(e.来源[0]?.行).toBeTruthy();
    }
  });

  test("镜像(知识库)与包内一致", () => {
    const mirror = path.join(import.meta.dir, "..", "..", "知识库", "data", "十翼.json");
    if (existsSync(mirror)) {
      const m = JSON.parse(readFileSync(mirror, "utf8"));
      expect(m).toEqual(shiyi);
    }
  });
});
