# opencode-tianji

六爻占卜 opencode 插件(天机)。提供 4 个工具:起卦、排盘、断卦、查卦。数据(六十四卦、纳甲、干支、纳音、爻辞、焦氏易林)深度绑定包内 `data/`,安装即用,无需额外配置。

## 安装

在项目 `opencode.json` 中加一行:

```json
{
  "plugin": ["opencode-tianji"]
}
```

重启 opencode 即可。安装后 4 个工具自动可用:`qigua`、`paipan`、`duangua`、`cha`。

## 工具说明

| 工具 | 说明 | 关键参数 |
| --- | --- | --- |
| `qigua` 起卦 | 梅花易数时间起卦 / 三枚铜钱六掷 / 手动指定卦名,输出本卦、变卦、卦辞、世应、起卦干支 | `method`、`datetime`、`卦名`、`动爻` |
| `paipan` 排盘 | 六爻排盘:六神/六亲/纳甲/五行、世应动空破、卦身、旬空、月破、六冲六合三合、旺相休囚、飞伏神 | `卦名`、`动爻`、`datetime`、`占事` |
| `duangua` 断卦 | 按占事取用神,结合旺衰动空破与世应关系给出规则性吉凶倾向 | `卦名`、`占事`、`动爻`、`datetime` |
| `cha` 查卦 | 卦辞、爻辞(动爻高亮)、乾坤用九用六、变卦卦辞、焦氏易林变诗、上下卦八卦象意 | `卦名`、`动爻` |

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

数据整理自公版古籍:周易、京氏易传、增删卜易、卜筮正宗、梅花易数、焦氏易林(随包 `data/*.json`)。古籍内容属公有领域,整理与结构化工作供学习研究使用,不构成任何现实决策依据。

## 开发

```sh
bun install
bun run test    # zhanbu 10 项 + lib 11 项
```
