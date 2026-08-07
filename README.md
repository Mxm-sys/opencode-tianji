# opencode-tianji

[![npm version](https://img.shields.io/npm/v/opencode-tianji)](https://www.npmjs.com/package/opencode-tianji)
[![npm downloads](https://img.shields.io/npm/dm/opencode-tianji)](https://www.npmjs.com/package/opencode-tianji)
[![license](https://img.shields.io/npm/l/opencode-tianji)](https://github.com/Mxm-sys/opencode-tianji/blob/main/LICENSE)

六爻占卜 opencode 插件(天机)。提供 7 个工具:起卦、排盘、断卦、查卦、梅花体用断卦、八字四柱、小六壬。数据(六十四卦、纳甲、干支、纳音、爻辞、焦氏易林、梅花断辞、命理、小六壬掌诀)深度绑定包内 `data/`,安装即用,无需额外配置。

## 安装

已发布到 npm:[opencode-tianji](https://www.npmjs.com/package/opencode-tianji)。在项目 `opencode.json` 中加一行:

```json
{
  "plugin": ["opencode-tianji"]
}
```

重启 opencode 即可。安装后 7 个工具自动可用:`qigua`、`paipan`、`duangua`、`cha`、`meihua`、`bazi`、`liuren`。

## 工具说明

| 工具 | 说明 | 关键参数 |
| --- | --- | --- |
| `qigua` 起卦 | 梅花易数时间起卦 / 三枚铜钱六掷 / 报数起卦 / 字占起卦 / 手动指定卦名,输出本卦、变卦、卦辞、世应、起卦干支 | `method`、`datetime`、`卦名`、`动爻`、`数`、`字` |
| `paipan` 排盘 | 六爻排盘:六神/六亲/纳甲/五行、世应动空破、卦身、旬空、月破、六冲六合三合、旺相休囚、飞伏神 | `卦名`、`动爻`、`datetime`、`占事` |
| `duangua` 断卦 | 按占事取用神,结合旺衰动空破与世应关系给出规则性吉凶倾向 | `卦名`、`占事`、`动爻`、`datetime` |
| `cha` 查卦 | 卦辞、爻辞(动爻高亮)、乾坤用九用六、变卦卦辞、焦氏易林变诗、上下卦八卦象意 | `卦名`、`动爻` |
| `meihua` 梅花断卦 | 梅花易数体用生克:分体卦用卦、求变卦互卦,按五行生克断吉凶、看体卦卦气旺衰,并按十八类占(天时/人事/家宅/婚姻/求财/疾病…)出白话断语 | `卦名`、`动爻`、`占事`、`datetime` |
| `bazi` 八字 | 八字四柱排盘:年/月/日/时干支,十神、地支藏干、纳音、五行统计、大运流年 | `datetime`、`性别` |
| `liuren` 小六壬 | 小六壬占课:月/日/时起课(大安/留连/速喜/赤口/小吉/空亡),输出落宫、吉凶与断辞 | `datetime`、`month`、`day` |

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

## 数据来源与版权

数据整理自公版古籍:周易、京氏易传、增删卜易、卜筮正宗、梅花易数、焦氏易林(随包 `data/*.json`);梅花体用断辞据《梅花易数·体用生克篇》,八字命理表据通行命理通识,小六壬掌诀据通行掌诀口诀。古籍内容属公有领域,整理与结构化工作供学习研究使用,不构成任何现实决策依据。

## 开发

```sh
bun install
bun run test    # zhanbu 10 项 + lib 11 项
```

## 发布

```sh
npm run build   # 构建插件产物
npm publish     # 发布到 npm(需 NPM_TOKEN 或 npm login)
```
