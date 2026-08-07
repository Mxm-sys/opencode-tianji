import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const BOOK8 = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "books", "08_周易本义.json"), "utf8"));
const data = BOOK8.卷注 as Record<string, unknown[]>;
const v1 = (data["卷一·上经"] ?? []) as { 卦名: string; 爻注: { 爻位: string }[]; 彖曰注: unknown[]; 象曰注: unknown[] }[];
const v2 = (data["卷二·下经"] ?? []) as { 卦名: string; 爻注: { 爻位: string }[]; 彖曰注: unknown[]; 象曰注: unknown[] }[];
const ALL = [...v1, ...v2];

describe("周易本义朱熹卦爻注(书8)", () => {
  test("书层元数据正确", () => {
    expect(BOOK8.书名).toBe("周易本义");
    expect(BOOK8.作者).toBe("朱熹");
    expect(BOOK8.原名).toBe("08_周易本义.txt");
  });

  test("卷注含上下经共 64 卦(上30下34)", () => {
    expect(v1.length).toBe(30);
    expect(v2.length).toBe(34);
    expect(ALL[0].卦名).toBe("乾");
    expect(ALL[29].卦名).toBe("離");
    expect(ALL[30].卦名).toBe("咸");
    expect(ALL.at(-1)!.卦名).toBe("未濟");
  });

  test("卦爻注完整(每卦6爻+乾坤用九用六,共386)", () => {
    const total = ALL.reduce((n, g) => n + g.爻注.length, 0);
    expect(total).toBe(386);
    expect(ALL.find((g) => g.卦名 === "乾")!.爻注.at(-1)!.爻位).toBe("用九");
    expect(ALL.find((g) => g.卦名 === "坤")!.爻注.at(-1)!.爻位).toBe("用六");
  });

  test("每卦含彖曰/象曰注", () => {
    for (const g of ALL) {
      expect(g.彖曰注.length).toBeGreaterThan(0);
      expect(g.象曰注.length).toBeGreaterThan(0);
    }
  });

  test("镜像(知识库)与包内一致", () => {
    const mirror = path.join(import.meta.dir, "..", "..", "知识库", "books", "08_周易本义.json");
    if (existsSync(mirror)) {
      const b = JSON.parse(readFileSync(mirror, "utf8"));
      expect(b.卷注).toEqual(data);
    }
  });
});
