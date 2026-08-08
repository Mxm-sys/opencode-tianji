// e2e/tools.test.ts — parseServerPort 纯函数单测(Todo 4)
//
// 端口解析决策:端口 0 表示服务未分配实际端口(监听行里没有真实端口,连接 0
// 端口无意义),视为解析失败返回 null —— 与越界(>65535)同一语义。

import { describe, expect, test } from "bun:test";
import { parseServerPort, TIANJI_TOOLS } from "./tools.ts";

describe("parseServerPort", () => {
  test("标准监听行 → 解析端口 4096", () => {
    expect(parseServerPort("opencode server listening on http://127.0.0.1:4096")).toBe(4096);
  });

  test("带 Warning 前缀的完整 serve 输出 → 4096", () => {
    const out =
      "Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.\n" +
      "opencode server listening on http://127.0.0.1:4096\n";
    expect(parseServerPort(out)).toBe(4096);
  });

  test("随机高位端口(1.18.15 的 --port 0 回退语义)→ 解析成功", () => {
    expect(parseServerPort("opencode server listening on http://127.0.0.1:53127")).toBe(53127);
  });

  test("端口 0(未分配实际端口)→ null(视为不可用,文档化决策)", () => {
    expect(parseServerPort("opencode server listening on http://127.0.0.1:0")).toBeNull();
  });

  test("端口越界 65536 → null", () => {
    expect(parseServerPort("opencode server listening on http://127.0.0.1:65536")).toBeNull();
  });

  test("垃圾输入 → null", () => {
    expect(parseServerPort("")).toBeNull();
    expect(parseServerPort("hello world")).toBeNull();
    expect(parseServerPort("opencode server listening on")).toBeNull();
    expect(parseServerPort("opencode server listening on http://127.0.0.1:")).toBeNull();
    expect(parseServerPort("listening on http://127.0.0.1:8080")).toBeNull();
    expect(parseServerPort("opencode server listening on http://0.0.0.0:4096")).toBeNull();
  });

  test("多行输出含多次匹配 → 取第一个匹配", () => {
    expect(
      parseServerPort("noise\nopencode server listening on http://127.0.0.1:4096\nmore noise"),
    ).toBe(4096);
  });
});

describe("TIANJI_TOOLS", () => {
  test("恰好 13 个天机工具且顺序与清单一致", () => {
    expect(TIANJI_TOOLS).toHaveLength(13);
    expect(TIANJI_TOOLS).toEqual([
      "qigua",
      "paipan",
      "duangua",
      "cha",
      "meihua",
      "bazi",
      "liuren",
      "almanac",
      "dayan",
      "yilin",
      "jingshi",
      "huozhulin",
      "chazhu",
    ]);
  });
});
