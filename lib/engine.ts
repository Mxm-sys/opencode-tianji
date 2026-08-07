/**
 * tianji-engine 独立引擎入口。
 *
 * 纯计算引擎(hex + ganzhi),仅依赖 astronomy-engine 与包内 data/ 数据,
 * 不依赖 opencode 运行时。供插件层薄调用,也可被外部直接 import:
 *   import { buildPan, buildPanByGanzhi } from "opencode-tianji/engine";
 *
 * 依赖仅 astronomy-engine(MIT);数据加载走 lib/db(包内 data/ 统一 schema)。
 */
export * from "./hex";
export * from "./ganzhi";
export { buildPan, buildPanByGanzhi, guaOf, bianGuaName } from "./hex";
