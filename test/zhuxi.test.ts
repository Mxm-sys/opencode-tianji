import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mirrorTest } from "./helpers/mirror";

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

  mirrorTest("镜像(知识库)与包内一致", "books/08_周易本义.json", (mirror) => {
    const b = JSON.parse(readFileSync(mirror, "utf8"));
    expect(b.卷注).toEqual(data);
  });
});

type 章 = { 章次: number; 首句: string; 内容: { 经文: string; 注: string }[] };
const v3 = (data["卷三·系辞传"] ?? []) as { 传: string; 前言: unknown; 章: 章[] }[];
const xu = (data["卷四·序卦传"] ?? {}) as { 上篇: { 引言: string; 条: { 卦序: number; 卦名: string }[] }; 下篇: { 引言: string; 条: { 卦序: number; 卦名: string }[] } };
const za = (data["卷四·杂卦传"] ?? []) as { 卦名: string; 经文: string; 注: string }[];

describe("周易本义朱熹传注(书8·卷三系辞/卷四序卦杂卦)", () => {
  test("卷三系辞传存在,上传/下传各12章", () => {
    expect(v3.length).toBe(2);
    const [shang, xia] = v3;
    expect(shang.传).toBe("繫辭上傳");
    expect(xia.传).toBe("繫辭下傳");
    expect(shang.章.length).toBe(12);
    expect(xia.章.length).toBe(12);
    expect(shang.章[0].首句).toContain("天尊地卑");
    expect(xia.章[0].首句).toContain("八卦成列");
    expect(shang.章.at(-1)!.内容.at(-1)).toMatchObject({ 经文: "右第十二章" });
    expect(xia.章.at(-1)!.内容.at(-1)).toMatchObject({ 经文: "右第十二章" });
  });

  test("系辞每章内容条数>0且首尾衔接", () => {
    for (const c of v3) {
      for (const ch of c.章) {
        expect(ch.内容.length).toBeGreaterThan(0);
        expect(ch.内容[0].经文).toBe(ch.首句);
        expect(ch.内容.at(-1)!.经文).toMatch(/^右第.+章$/);
      }
    }
  });

  test("序卦传共61条(上篇28屯起/下篇33恒起),卦序连续", () => {
    expect(xu.上篇.条.length).toBe(28);
    expect(xu.下篇.条.length).toBe(33);
    const all = [...xu.上篇.条, ...xu.下篇.条];
    expect(all.length).toBe(61);
    expect(all[0]).toMatchObject({ 卦名: "屯", 卦序: 3 });
    expect(all.at(-1)).toMatchObject({ 卦名: "未濟", 卦序: 64 });
    // 上篇 3..30, 下篇 32..64 (卦序31咸含于下篇引言)
    expect(xu.上篇.条.every((x, i) => x.卦序 === 3 + i)).toBe(true);
    expect(xu.下篇.条.every((x, i) => x.卦序 === 32 + i)).toBe(true);
  });

  test("杂卦传34条,覆盖64卦,首尾正确", () => {
    expect(za.length).toBe(34);
    expect(za[0].卦名).toBe("乾、坤");
    expect(za[1].卦名).toBe("師、比");
    expect(za.at(-1)!.卦名).toBe("夬");
    const gua = new Set(za.flatMap((x) => x.卦名.split("、")));
    expect(gua.size).toBe(64);
  });

  test("杂卦注文保留(第1条有注,卦名匹配)", () => {
    expect(za[1].注).toContain("樂音洛");
    expect(za.at(-1)!.注).toContain("長丁丈反");
  });
});
