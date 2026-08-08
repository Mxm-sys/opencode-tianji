# Task-5 证据:真实 LLM 对话端到端验证(e2e/chat.ts)

- 工作目录: `/home/mm/桌面/opencode/项目/天机`
- 时间: 2026-08-09 00:4x
- 环境: bun 1.3.14 / opencode 1.18.15 / 模型 deepseek/deepseek-v4-flash

## 产物

- `e2e/chat.ts` — CHAT_PROMPT / parseNdjsonTools / evaluateChat / runRealChat / CLI
- `e2e/chat.test.ts` — 单测(9 pass)
- `e2e/tools.ts` — TIANJI_TOOLS 常量(todo 4 将在此扩展 verifyToolsRegistered)

## 运行命令

```sh
# 1. 单测
bun test e2e/chat.test.ts
#    → 9 pass / 0 fail

# 2. QA skip 路径(无 API 调用)
TIANJI_E2E_SKIP_LLM=1 bun run e2e/chat.ts
#    → { "skipped": true, "ok": true, "toolCalls": [], "output": "" }  exit=0

# 3. QA 真实路径(真实 deepseek 调用)
bun run e2e/chat.ts
#    → { "skipped": false, "ok": true, "toolCalls": ["skill","qigua","paipan","duangua","cha",...], ... }  exit=0
#    NDJSON 原文 → ndjson-sample-ok.jsonl

# 4. QA 失败路径(确定性,不存在的模型)
TIANJI_E2E_MODEL=deepseek/deepseek-nonexistent bun run e2e/chat.ts
#    → { "skipped": false, "ok": false, "toolCalls": [], "output": "" }  exit=1
```

## 关键发现与修复

1. **provider 配置结构**: 最初 `createScaffold({ provider: buildProviderConfig() })` 平铺注入,
   opencode 1.18.15 报 `Expected ProviderConfig, got "@ai-sdk/openai-compatible" provider.npm`。
   修正为 `createScaffold({ provider: { deepseek: buildProviderConfig() } })`(providerID → 配置映射),
   与 command.ts 同款结构。

2. **断言容忍 core 工具前置调用**: 真实运行中模型先调 `skill`(加载技能)再调天机工具。
   任务规格说明 "tolerates an initial question call (only requires ≥1 completed tianji tool call)",
   故 evaluateChat 只要求 ≥1 次 completed 天机工具调用 + 输出含【总结】;
   skill/question 等 core 工具不计为失败。

## 真实对话样本(ndjson-sample-ok.jsonl)

- 21 行 NDJSON:1 × error(deepseek 瞬时 500,opencode 自动重试后成功)+ 6 × tool_use + text 事件
- completed 天机工具: qigua(起卦) → paipan(排盘) → duangua(断卦) → cha ×2(查卦) → yilin(易林)
- text 事件含【总结】纯白话段(exit 0 必要条件)
- 验证无 apiKey 明文: `grep -c "sk-…" ndjson-sample-ok.jsonl` → 0

## 残留检查

- `ps -ef | grep opencode` 无 chat.ts 自 spawn 的 opencode run 进程残留
- `/tmp/tianji-e2e-*` 无 chat.ts 产生的临时目录残留(cleanup 在 finally 执行)

## 备注

- 并行任务(todo 4)在 00:44 曾覆盖 task-5/ndjson-sample.jsonl(写入它自己的 error 行),
  已通过 `ndjson-sample-ok.jsonl` 保留本任务成功样本。
