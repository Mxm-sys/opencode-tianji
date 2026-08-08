# Task 6 证据 — e2e/command.ts(/zhanbu 命令模板验证)

计划:`.omo/plans/tianji-opencode-e2e.md` Todo 6
日期:2026-08-09 | 环境:bun v1.3.14 | opencode 1.18.15(`~/.opencode/bin/opencode`)| 仓库根:`/home/mm/桌面/opencode/项目/天机`(含空格与 CJK,命令一律加引号)

## 交付物

- `e2e/command.ts` — 导出:
  - `COMMAND_ARGS`(5 项必问信息一次给齐,前缀为计划原串);
  - `runCommandCheck(opts: { dir; model?; opencodeBin }): Promise<{ ok; output; toolCalls; reason?; skipped? }>`;
  - 纯函数:`parseNdjsonEvents` / `errorEventText` / `findCommandError` / `collectTianjiToolCalls` / `lastTextOutput` / `evaluateCommandEvents` / `checkCommandPresence`;
  - `TIANJI_TOOLS` 复用自 `e2e/tools.ts`(计划要求);CLI 入口 `bun run e2e/command.ts`。
- `e2e/command.test.ts` — bun:test 14 项全过(NDJSON 解析、error 对象/文本检出、question 前置容忍、全 error 失败、缺失判定)。
- 本目录:NDJSON 样本 + 各 QA 输出。

## 关键实现决策(实测驱动)

1. **provider 嵌套修复(CLI 侧)**:`createScaffold({ provider: buildProviderConfig() })` 会把 `provider.deepseek` 整段平铺到顶层 `provider`,而 opencode 1.18.15 要求 `provider` 是「providerID → 配置」映射(实测报错 `Expected ProviderConfig, got "@ai-sdk/openai-compatible" provider.npm`;源码 `packages/core/src/v1/config/config.ts:110` 确认 `Record<string, ProviderConfig>`)。因此 CLI 组装为 `createScaffold({ provider: { deepseek: buildProviderConfig() } })`(与 scaffold.test.ts 注入形态一致;wave-2 的 tools.ts/chat.ts 采用相同策略)。
2. **COMMAND_ARGS 补足情境追问**:仅 5 项必问信息时,模型按模板第 2 步对求财追问「周期/量级」后停在等待(实测输出「还差一个关键情境…你补一句,我马上起卦」)。COMMAND_ARGS 保留计划原串前缀,追加「短线快进快出、资金量级中等,信息已齐无需追问,请直接起卦排盘断卦」,实测一次通过(未硬断言完整流程,仅要求命令被识别 + ≥1 次 completed 天机工具调用)。
3. **error 事件为对象形态**:实测 `opencode run` 失败时事件为 `{"type":"error","error":{"name":"UnknownError","data":{"message":"…"}}}`,字符串判断会漏检(命令未找到也会以对象形态出现);故 `errorEventText` 兼容字符串与 `{name, data:{message}}` 两种形态。
4. **TIANJI_TOOLS 复用 tools.ts**;NDJSON 解析保留本地增强版(chat.ts 的 `parseNdjsonTools` 会丢弃 error 事件信息,无法识别 command-not-found,见 command.ts 头注释)。

## 运行命令与输出

### 1. 单元测试 `bun test e2e/command.test.ts`

```
14 pass
 0 fail
23 expect() calls
Ran 14 tests across 1 file. [16.00ms]
```

### 2. QA skip(确定性,零费用)

```
$ TIANJI_E2E_SKIP_LLM=1 bun run e2e/command.ts
{
  "ok": true,
  "output": "",
  "toolCalls": [],
  "skipped": true
}
exit=0
```

### 3. QA missing(确定性,不假成功)

```
$ TIANJI_E2E_NO_COMMAND=1 bun run e2e/command.ts
{
  "ok": false,
  "output": "",
  "toolCalls": [],
  "reason": "command 模板缺失(由 TIANJI_E2E_NO_COMMAND=1 强制)"
}
exit=1
```

### 4. QA real(真实 LLM,ok=true)

```
$ TIANJI_E2E_NDJSON_FILE=.../ndjson-sample.jsonl bun run e2e/command.ts
{
  "ok": true,
  "output": "【求测】投资求财(短线快进快出) | 男 | 本人自占 | 北京 | 2024-02-10 12:00 …(完整断卦,含纯白话【总结】段)",
  "toolCalls": ["qigua", "paipan", "duangua", "cha", "chazhu"]
}
exit=0
```

NDJSON 样本 `ndjson-sample.jsonl` 共 18 行,6 个 `tool_use` 事件全部 `completed`:`skill`(加载 zhanbu 技能)+ `qigua` → `paipan` → `duangua` → `cha` → `chazhu`,均为天机 13 工具。全程无 `question` 调用(COMMAND_ARGS 预填 5 项 + 情境信息生效)。

### 5. QA failure(确定性:模型不存在;无残留进程)

```
$ TIANJI_E2E_MODEL=deepseek/deepseek-nonexistent bun run e2e/command.ts
{
  "ok": false,
  "reason": "命令执行失败(command 未找到或运行错误):Unexpected server error. Check server logs for details."
}
exit=1
```

失败后 `ps -eo pid,cmd | grep "opencode run"` 无输出(子进程已在 finally 中 SIGTERM→SIGKILL 回收);`/tmp` 无残留 `tianji-e2e-*` 目录(CLI finally 清理)。

## QA 结论

| 场景 | 期望 | 实际 | 通过 |
| --- | --- | --- | --- |
| bun test 单测 | 全过 | 14 pass / 0 fail | ✅ |
| skip:TIANJI_E2E_SKIP_LLM=1 | skipped,exit 0 | skipped: true,exit 0 | ✅ |
| missing:TIANJI_E2E_NO_COMMAND=1 | ok=false,reason 含「缺失」,exit 1 | reason `command 模板缺失…`,exit 1 | ✅ |
| real:默认模型 | ok=true,记录实际工具调用 | ok=true,toolCalls 5 个(均 ∈ 13 工具,全部 completed),NDJSON 已存 | ✅ |
| failure:模型不存在 | 失败不假成功,无残留进程 | ok=false,reason 含实际错误,`ps` 无残留 | ✅ |

验收准则全部满足。另注:本模块未硬断言 /zhanbu 完整流程(命令模板驱动模型行为,保留合理弹性),仅断言「命令被识别/执行 + ≥1 次 completed 天机工具调用」。

## 并发协作说明

wave-2 与 todo 4(tools.ts)、todo 5(chat.ts)并行开发,共享 `e2e/types.d.ts`。已协调:TIANJI_TOOLS 复用 tools.ts;删除 types.d.ts 中与 lib.dom 冲突的 console/fetch/Response 冗余声明;setTimeout 返回类型按 chat.ts 使用的 `unknown` 约定(本模块 terminateChild 用运行时判别兼容)。全目录 `lsp_diagnostics` 仅剩 1 条既有 hint,无 error;`bun test e2e/` 51 项全过。

## 防泄露核对

- 证据目录内 grep `sk-[a-z0-9]` 明文:无命中(ndjson 样本为对话事件,不含配置)。
- 证据不含 apiKey;provider 经 `sanitizeProviderForLog` 原则,未在输出中出现。
