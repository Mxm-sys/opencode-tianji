/**
 * 占卜插件聚合器:合并各术别独立模块工具。
 *
 * 每术独立插件文件(六爻 liuyao / 梅花 meihua / 八字 bazi / 小六壬 liuren / 黄历 almanac /
 * 大衍 dayan / 易林 yilin / 京氏 jingshi / 火珠林 huozhulin / 经传查注 jingdian),
 * 本文件仅做工具注册聚合,不含任何业务逻辑。
 * 加新术 = 新建 modules/X.ts(导出 元信息/工具/数据)+ 本文件 import 一行 + zhanbuTools 合并一行。
 *
 * 注意:模块文件放在 modules/ 而非 plugins/。opencode 会扫描 plugins/ 下每个
 * *.ts 并遍历其所有导出、要求每个导出都是插件函数;modules/ 下文件不会被当作插件加载,
 * 从而避免 元信息/工具/数据 等对象导出被误判为非法插件。
 * 工具集合挂在本文件 default 插件函数上(plugin.工具),供 mcp/测试复用。
 */
import type { Plugin } from "@opencode-ai/plugin";
import * as liuyao from "../modules/liuyao";
import * as meihua from "../modules/meihua";
import * as bazi from "../modules/bazi";
import * as liuren from "../modules/liuren";
import * as almanac from "../modules/almanac";
import * as dayan from "../modules/dayan";
import * as yilin from "../modules/yilin";
import * as jingshi from "../modules/jingshi";
import * as huozhulin from "../modules/huozhulin";
import * as jingdian from "../modules/jingdian";

const zhanbuTools = {
  ...liuyao.工具,
  ...meihua.工具,
  ...bazi.工具,
  ...liuren.工具,
  ...almanac.工具,
  ...dayan.工具,
  ...yilin.工具,
  ...jingshi.工具,
  ...huozhulin.工具,
  ...jingdian.工具,
};

const 元信息 = {
  名: "占卜聚合器",
  书号: [1, 2, 3, 4, 5, 6, 7, 8],
  法式: ["六爻纳甲", "梅花易数", "大衍筮法", "焦氏易林", "京氏易传", "火珠林", "经传查注", "八字四柱", "小六壬", "黄历"],
};
const 数据 = [...new Set([
  ...liuyao.数据, ...meihua.数据, ...bazi.数据, ...liuren.数据, ...almanac.数据,
  ...dayan.数据, ...yilin.数据, ...jingshi.数据, ...huozhulin.数据, ...jingdian.数据,
])];

const plugin: Plugin = async () => ({ tool: zhanbuTools });
Object.assign(plugin, { 元信息, 工具: zhanbuTools, 数据 });
export default plugin;
