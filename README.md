# opencode-tianji

[![npm version](https://img.shields.io/npm/v/opencode-tianji)](https://www.npmjs.com/package/opencode-tianji)
[![npm downloads](https://img.shields.io/npm/dm/opencode-tianji)](https://www.npmjs.com/package/opencode-tianji)
[![license](https://img.shields.io/npm/l/opencode-tianji)](https://github.com/Mxm-sys/opencode-tianji/blob/main/LICENSE)

六爻占卜 opencode 插件(天机)。提供 8 个工具:起卦、排盘、断卦、查卦、梅花体用断卦、八字四柱、小六壬、农历黄历。数据深度绑定包内 `books/`(书层)+ `data/`(统一 schema 数据),安装即用,无需额外配置。

## 独家卖点(2026-08 开源生态对比)

| 卖点 | 说明 |
| --- | --- |
| **8 部古籍全文 + 条目级行号溯源** | 六十四卦/爻辞/彖象/易林 4096 诗/占验卦例等每条数据可溯源到原文行号。开源生态无等价物(kanripo 无 schema、HF 语料无溯源) |
| **375 则占验卦例库** | 增删卜易(卷一二三四)+ 卜筮正宗(十八问答)全量提取,含卦象/断语/应期原理/白话/来源,六爻领域最大结构化卦例库 |
| **六爻规则断卦引擎** | 用神/旬空/月破/六冲六合三合/旺相休囚/飞伏神,确定性算法,非 LLM 自由发挥 |
| **六爻解卦公开评测基准** | `benchmark/` 自带金标准(310 例)+ runner,排盘可判、断语可溯,填补生态空白(见下文) |
| **白话铁律** | 每个卦学术语紧跟白话翻译,结尾必有纯白话【总结】段,输出即懂 |


## 架构:低耦合 · 模块化 · 可扩展

```
opencode-tianji/
├── plugins/          # 插件层:每术一模块,自声明导出
│   ├── zhanbu.ts     #   聚合器(六爻 qigua/paipan/duangua/cha)
│   ├── meihua.ts     #   梅花易数(导出 元信息/工具/数据)
│   ├── bazi.ts       #   八字四柱
│   └── liuren.ts     #   小六壬
├── lib/              # hex.ts(共享计算核心)db.ts(数据加载)ganzhi.ts(干支)
├── books/            # 书层:8 部典籍元数据(篇章/行号/提取状态)+ index.json
├── data/             # 数据层:统一 schema(每条目带 来源 溯源)
│   └── schema/       #   JSON Schema 定义(书/数据文件/条目溯源)
└── templates/        # 技能与命令模板
```

**加新占卜术 = 新建 `plugins/X.ts`(导出 `元信息`/`工具`/`数据`)+ 聚合器数组加一行**,互不影响。数据层每条记录可溯源到典籍原文行号(`来源` 字段)。

## 安装

已发布到 npm:[opencode-tianji](https://www.npmjs.com/package/opencode-tianji)。在项目 `opencode.json` 中加一行:

```json
{
  "plugin": ["opencode-tianji"]
}
```

重启 opencode 即可。安装后 8 个工具自动可用:`qigua`、`paipan`、`duangua`、`cha`、`meihua`、`bazi`、`liuren`、`almanac`。

## 历法精度(0.4.0 起)

- **节气**:采用通用天文库 astronomy-engine(MIT)的太阳黄经天文算法,节气/立春精确到秒级(实测与权威天文年历误差 ±30 秒内),不再用近似固定节界。
- **晚子时**:默认 **23 点换日**(晚子时归次日,对齐生态主流);工具可传 `晚子时:"换日"|"不换日"` 切换。
- **真太阳时**:默认按北京时间(东八区);工具可传 `经度`(如乌鲁木齐 87)按地方真太阳时定生辰/起卦时辰,内置 Meeus 均时差算法。
- 每个工具输出末尾附 `[口径]` 行披露历法口径。

## 可审计(0.4.0 起)

- `qigua` 铜钱起卦支持 `seed` 参数:同 seed 结果可复现,输出含 `[seed=0x…]`;不传则自动生成并展示,便于事后核对。
- `qigua`/`paipan` 支持 `format="json"`:输出结构化审计 JSON(含卦象/动爻/旬空/月破/爻信息/依据/口径),可直接机器核对(0.5.0)。

## stdio MCP(0.5.0 起)

复用全部 8 个工具的 stdio MCP 通道,可接入 Claude Desktop / Cursor / Codex 等任意 MCP 客户端:

```sh
bun run node_modules/opencode-tianji/mcp/index.ts
```

客户端 `mcpServers` 配置:

```json
{ "tianji": { "command": "bun", "args": ["run", "node_modules/opencode-tianji/mcp/index.ts"] } }
```

## 引擎独立入口(0.5.0 起)

纯计算引擎(hex + ganzhi,仅依赖 astronomy-engine)可从子路径直接调用,不依赖 opencode 运行时:

```ts
import { buildPan, buildPanByGanzhi } from "opencode-tianji/engine";
```

## 工具说明

| 工具 | 说明 | 关键参数 |
| --- | --- | --- |
| `qigua` 起卦 | 梅花易数时间起卦 / 三枚铜钱六掷(seed 可复现) / 报数起卦 / 字占起卦 / 手动指定卦名,输出本卦、变卦、卦辞、世应、起卦干支 | `method`、`datetime`、`卦名`、`动爻`、`数`、`字`、`seed`、`晚子时`、`经度` |
| `paipan` 排盘 | 六爻排盘:六神/六亲/纳甲/五行、世应动空破、卦身、旬空、月破、六冲六合三合、旺相休囚、飞伏神 | `卦名`、`动爻`、`datetime`、`占事`、`晚子时`、`经度` |
| `duangua` 断卦 | 按占事取用神,结合旺衰动空破与世应关系给出规则性吉凶倾向 | `卦名`、`占事`、`动爻`、`datetime`、`晚子时`、`经度` |
| `cha` 查卦 | 卦辞、爻辞(动爻高亮)、乾坤用九用六、**彖传/大象**、变卦卦辞、焦氏易林变诗、上下卦八卦象意 | `卦名`、`动爻` |
| `meihua` 梅花断卦 | 梅花易数体用生克:分体卦用卦、求变卦互卦,按五行生克断吉凶、看体卦卦气旺衰,并按十八类占(天时/人事/家宅/婚姻/求财/疾病…)出白话断语 | `卦名`、`动爻`、`占事`、`datetime`、`晚子时`、`经度` |
| `bazi` 八字 | 八字四柱排盘:年/月/日/时干支(精确节气),十神、地支藏干、纳音、五行统计、大运流年 | `datetime`、`性别`、`晚子时`、`经度` |
| `liuren` 小六壬 | 小六壬占课:月/日/时起课(大安/留连/速喜/赤口/小吉/空亡),输出落宫、吉凶与断辞 | `datetime`、`month`、`day` |
| `almanac` 黄历 | 农历/干支/节气/宜忌/吉神方位/冲煞/旬空(基于 lunar-javascript 农历历法标准) | `datetime` |

## 使用技能(推荐)

复制技能到项目并重启 opencode:

```sh
mkdir -p .opencode/skills/zhanbu
cp node_modules/opencode-tianji/templates/skills/zhanbu/SKILL.md .opencode/skills/zhanbu/
```

技能定义"先问清楚再算"的完整占卜流程:先收集【占卜事项、求测人性别、地理位置、是否本人、起卦时间】,再起卦、排盘、断卦,并要求每个卦学术语后附白话翻译。

## 使用 /zhanbu 命令

```sh
mkdir -p .opencode/command
cp node_modules/opencode-tianji/templates/command/zhanbu.md .opencode/command/
```

之后直接输入 `/zhanbu 占卜事项` 触发完整流程。

## 示例用法

- 让模型"起一卦问求财" → 模型会先问必问信息,再依次调 `qigua` → `paipan` → `duangua` + `cha`。
- 手动指定:`qigua` method=`manual`,卦名=`乾`,动爻=`[1,3]`。
- 起卦时间:`qigua` method=`time`,datetime=`2024-02-10 12:00`。

## 六爻解卦评测基准(生态空白)

`benchmark/` 提供一个**排盘可判、断语可溯**的六爻解卦评测基准——这是开源生态当前空白(现有基准如 MingLi-Bench 只覆盖八字/紫微选择题):

```sh
bun run benchmark/gold.ts   # 从 data/guaili.json 生成金标准(310 例)
bun run benchmark/run.ts    # 引擎排盘 + 用神命中统计 → benchmark/report.md
```

- **排盘可判**:每条例以「卦名 + 月支 + 日干支」重建六爻盘,校验旬空/月破/六亲/世应(引擎零失败)。
- **断语可溯**:按占事类别推断用神,校验用神六亲在卦或伏神可引拔,输出各类别命中率。
- 与 MingLi-Bench 的差异:后者测"排盘结果选择",本基准测**规则断卦引擎**在真实古籍卦例上的表现。

## 数据来源与版权

数据整理自公版古籍(周易·经传、京氏易传、火珠林、增删卜易、梅花易数、卜筮正宗、焦氏易林、周易本义),全部收录于 `books/`(书层:篇章/行号/提取状态)与 `data/`(统一 schema 数据,每条目带 `来源` 溯源到原文行号)。含:六十四卦排盘、彖传/大象、64 卦飞伏、十二长生、星煞、进神退神、梅花起卦法与三要十应、焦氏易林 4096 诗、占验卦例、命理与小六壬通行资料。古籍内容属公有领域,整理与结构化工作供学习研究使用,不构成任何现实决策依据。

## 开发

```sh
bun install
bun run test    # 全量:zhanbu/meihua/bazi/liuren 工具 + lib(数据/schema/干支)
```

## 发布

```sh
npm run build   # 构建插件产物
npm publish     # 发布到 npm(需 NPM_TOKEN 或 npm login)
```
