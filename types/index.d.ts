/**
 * opencode-tianji 插件主入口类型声明。
 * 对应入口: package.json main/exports["."] → plugins/zhanbu.ts。
 */
import type { Plugin, ToolDefinition } from "@opencode-ai/plugin";

/** 插件默认导出: async () => ({ tool: { qigua, paipan, duangua, cha, meihua, bazi, liuren, almanac, dayan, yilin, jingshi, huozhulin, chazhu } }) */
declare const plugin: Plugin;
export default plugin;

/** 六爻纳甲核心工具 */
export declare const 工具: {
  qigua: ToolDefinition;
  paipan: ToolDefinition;
  duangua: ToolDefinition;
  cha: ToolDefinition;
  meihua: ToolDefinition;
  bazi: ToolDefinition;
  liuren: ToolDefinition;
  almanac: ToolDefinition;
  dayan: ToolDefinition;
  yilin: ToolDefinition;
  jingshi: ToolDefinition;
  huozhulin: ToolDefinition;
  chazhu: ToolDefinition;
};

/** 插件元信息 */
export declare const 元信息: {
  名: string;
  书号: number[];
  法式: string[];
};

/** 工具名到实现(含聚合的 meihua/bazi/liuren/almanac) */
export declare const zhanbuTools: Record<string, ToolDefinition>;
