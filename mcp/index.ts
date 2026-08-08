/**
 * opencode-tianji stdio MCP 入口。
 *
 * 复用插件层各工具(直接调用其 execute 函数,不经 opencode 运行时),
 * 通过 MCP 协议暴露给 Claude Desktop / Cursor / Codex 等任意 MCP 客户端。
 *
 * 运行: bun run mcp/index.ts
 * 客户端配置示例:
 *   "mcpServers": { "tianji": { "command": "bun", "args": ["run", "node_modules/opencode-tianji/mcp/index.ts"] } }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import zhanbuPlugin from "../plugins/zhanbu";
import { 工具 as almanacTools } from "../modules/almanac";

const zhanbu = { 工具: zhanbuPlugin.工具 };

const server = new McpServer({ name: "opencode-tianji", version: "0.5.4" });

/** 工具函数包装:MCP 参数 → 工具 execute 参数,返回文本结果 */
type Exec = (args: Record<string, unknown>) => Promise<string>;

function register(
  name: string,
  desc: string,
  argSpec: Record<string, { type: "string" | "number" | "array" | "boolean"; optional?: boolean; desc?: string }>,
  exec: Exec,
): void {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(argSpec)) {
    const base =
      v.type === "number" ? z.number() : v.type === "array" ? z.array(z.number()) : v.type === "boolean" ? z.boolean() : z.string();
    shape[k] = v.optional ? base.optional() : base.describe(v.desc ?? k);
  }
  server.registerTool(name, { description: desc, inputSchema: shape }, async (params) => {
    const out = await exec(params as Record<string, unknown>);
    return { content: [{ type: "text" as const, text: out }] };
  });
}

// 注册现有工具(MCP 参数名与插件工具保持一致)
register("qigua", "起卦:梅花时间/铜钱(seed可复现)/报数/字占/手动,format=json 输出结构化审计", {
  method: { type: "string", optional: true }, datetime: { type: "string", optional: true },
  卦名: { type: "string", optional: true }, 动爻: { type: "array", optional: true },
  数: { type: "array", optional: true }, 字: { type: "string", optional: true },
  晚子时: { type: "string", optional: true }, 经度: { type: "number", optional: true },
  seed: { type: "number", optional: true }, format: { type: "string", optional: true },
}, async (a) => (await zhanbu.工具.qigua.execute(a as never, {} as never)) as string);

register("paipan", "六爻排盘:六神/六亲/纳甲/世应动空破/旬空/月破/旺衰/六冲六合三合", {
  卦名: { type: "string" }, 动爻: { type: "array", optional: true }, datetime: { type: "string", optional: true },
  占事: { type: "string", optional: true }, 晚子时: { type: "string", optional: true },
  经度: { type: "number", optional: true }, format: { type: "string", optional: true },
}, async (a) => (await zhanbu.工具.paipan.execute(a as never, {} as never)) as string);

register("duangua", "断卦辅助:按占事取用神,结合旺衰动空破与世应关系给出规则性吉凶倾向", {
  卦名: { type: "string" }, 动爻: { type: "array", optional: true }, datetime: { type: "string", optional: true },
  占事: { type: "string" }, 晚子时: { type: "string", optional: true }, 经度: { type: "number", optional: true },
}, async (a) => (await zhanbu.工具.duangua.execute(a as never, {} as never)) as string);

register("cha", "查卦:卦辞/爻辞/彖传/大象/变卦卦辞/焦氏易林/八卦象意", {
  卦名: { type: "string" }, 动爻: { type: "array", optional: true },
}, async (a) => (await zhanbu.工具.cha.execute(a as never, {} as never)) as string);

register("meihua", "梅花易数体用断卦:分体用/求互卦变卦/五行生克吉凶/十八类占断", {
  卦名: { type: "string" }, 动爻: { type: "array", optional: true }, 占事: { type: "string", optional: true },
  datetime: { type: "string", optional: true }, 晚子时: { type: "string", optional: true },
  经度: { type: "number", optional: true },
}, async (a) => (await zhanbu.工具.meihua.execute(a as never, {} as never)) as string);

register("bazi", "八字四柱:干支/十神/藏干/纳音/大运流年(精确节气/晚子时/真太阳时)", {
  datetime: { type: "string", optional: true }, 性别: { type: "string", optional: true },
  晚子时: { type: "string", optional: true }, 经度: { type: "number", optional: true },
}, async (a) => (await zhanbu.工具.bazi.execute(a as never, {} as never)) as string);

register("liuren", "小六壬:月日时起课(大安/留连/速喜/赤口/小吉/空亡)", {
  datetime: { type: "string", optional: true }, month: { type: "number", optional: true },
  day: { type: "number", optional: true },
}, async (a) => (await zhanbu.工具.liuren.execute(a as never, {} as never)) as string);

register("almanac", "黄历:农历/干支/节气/宜忌/吉神方位/冲煞/旬空", {
  datetime: { type: "string", optional: true },
}, async (a) => (await almanacTools.almanac.execute(a as never, {} as never)) as string);

register("dayan", "大衍筮法(蓍草四营十八变):49策分二挂一揲四归奇,三变成爻、十八变成卦,seed可复现", {
  seed: { type: "string", optional: true }, 占事: { type: "string", optional: true },
}, async (a) => (await zhanbu.工具.dayan.execute(a as never, {} as never)) as string);

register("yilin", "焦氏易林占:本卦+之卦取4096首变诗断吉凶,之卦可指定/动爻推/随机(seed复现)", {
  本卦: { type: "string" }, 之卦: { type: "string", optional: true },
  动爻: { type: "array", optional: true }, 随机: { type: "boolean", optional: true },
  seed: { type: "string", optional: true },
}, async (a) => (await zhanbu.工具.yilin.execute(a as never, {} as never)) as string);

register("jingshi", "京氏易传占:八宫/宫五行/世应/纳甲六亲/飞伏神,据占事取用神看显伏", {
  卦名: { type: "string" }, 占事: { type: "string", optional: true },
}, async (a) => (await zhanbu.工具.jingshi.execute(a as never, {} as never)) as string);

register("huozhulin", "火珠林钱卜断占:按占事门类匹配《火珠林》口占断辞(原文+白话+来源)", {
  占事: { type: "string" }, 卦名: { type: "string", optional: true },
}, async (a) => (await zhanbu.工具.huozhulin.execute(a as never, {} as never)) as string);

register("chazhu", "经传查注:查某卦朱熹《周易本义》卦爻注/十翼(序卦杂卦文言)/彖传大象", {
  卦名: { type: "string" }, 范围: { type: "string", optional: true },
  动爻: { type: "array", optional: true },
}, async (a) => (await zhanbu.工具.chazhu.execute(a as never, {} as never)) as string);

const transport = new StdioServerTransport();
await server.connect(transport);
