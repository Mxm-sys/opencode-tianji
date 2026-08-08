# Task 7 证据 — e2e/run.ts 主入口编排与汇总

实现文件:`e2e/run.ts`(仅新增此文件,未改动任何既有 e2e 模块)

## 执行序列(严格依赖顺序)

1. detect → 2. provider → 3. scaffold(provider 嵌套 `{deepseek: ...}`)→ 4. tools → 5. chat → 6. command → finally 清理 → 写报告 → 退出码

## 验证命令与输出

### QA skip 路径(`TIANJI_E2E_SKIP_LLM=1 bun run e2e/run.ts`)
- 退出码 0 ✓;report.json 存在 ✓;tools ok=true(missing=[]);chat/command skipped:true;report.skipped=true
- 无 /tmp/tianji-e2e-* 残留 ✓
- 输出:qa-skip-output.txt / qa-skip-stderr.txt

### QA failure 路径(`TIANJI_E2E_PROVIDER_JSON='{bad json' bun run e2e/run.ts`)
- 退出码 1 ✓;中文错误「环境变量 TIANJI_E2E_PROVIDER_JSON 不是合法的 JSON 对象…」✓
- cleanup 仍执行,无残留目录 ✓;报告照常写出(ok:false + error 字段)✓
- 输出:qa-failure-output.txt / qa-failure-stderr.txt

### QA `--keep`(失败保留目录,`TIANJI_E2E_NO_COMMAND=1 bun run e2e/run.ts --keep`)
- 退出码 1;打印 `[keep] 运行失败,保留临时目录供排查:<dir>` 并保留目录 ✓(验证后手动删除)
- 注:provider 阶段失败时无临时目录可留(脚手架未创建),keep 不打印属正确行为

### QA happy 路径(全量真实,`bun run e2e/run.ts`)
- 退出码 0 ✓;detect=opencode 1.18.15;tools missing=[] port=4096(注册 27 个工具含 13 天机)
- chat ok=true,7 次工具调用(skill/qigua/paipan/duangua/cha…),输出含纯白话【总结】段
- command ok=true,4 次工具调用(qigua/paipan/duangua/cha)
- 输出:qa-happy-output.txt(报告)/ qa-happy-stderr.txt(阶段日志)

### 密钥安全
- provider 阶段记录经 `sanitizeProviderForLog` 脱敏:`"apiKey": "***"`
- grep `sk-[a-z0-9]` 在 report.json / qa-happy-output.txt / ndjson-chat.jsonl / ndjson-command.jsonl 均为 0 命中

### 进程/目录卫生
- `pgrep -x opencode` 仅 2 个常驻用户进程(10954/19763,与计划 Metis 实测一致)
- `ls /tmp/tianji-e2e-*` 无残留

## 报告文件
- 最终报告:`../report.json`(验收路径 .omo/evidence/tianji-opencode-e2e/report.json,0600 权限)

## NDJSON 证据
- ndjson-chat.jsonl(chat 阶段 16 行原始事件流)
- ndjson-command.jsonl(command 阶段 17 行原始事件流)

## 实现要点(踩坑记录)
1. **try 内 return 陷阱**:v1 在 try 内 return 会跳过 finally 之后的报告写入与退出码设置,失败路径退出码 0。
   修复:阶段序列抽成闭包 runStages,内部 return 只中止后续阶段;报告写入与 process.exitCode 放在 try/finally 之后。
2. **keep 判定陷阱**:阶段以 `ok:false` 返回(而非抛异常)时,只追踪抛错标志会漏判失败,`--keep` 不生效。
   修复:keep 条件改用汇总后的 `report.ok`。
3. **TS 收窄陷阱**:闭包内捕获赋值在 finally 处窄成 `never`(编译错误)。修复:runStages 末尾 `return scaffold`,主流程 `scaffold = await runStages()` 赋值对控制流可见。
4. 退出码全程用 `process.exitCode`(不用 process.exit),保证 finally 清理必然执行(与 chat.ts main 同款模式)。
