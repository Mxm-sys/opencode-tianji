# Task 8: package.json test:e2e scripts + README E2E section

Date: 2026-08-09
Plan: .omo/plans/tianji-opencode-e2e.md todo 8

## Changes

### package.json (scripts object only; "test" untouched)
- `"test:e2e": "bun run e2e/run.ts"`
- `"test:e2e:skip-llm": "bun run e2e/run.ts --skip-llm"`

Verified via `bun -e` JSON parse of package.json (see scripts-json.txt):
```json
{
  "test": "bun test test/",
  "test:e2e": "bun run e2e/run.ts",
  "test:e2e:skip-llm": "bun run e2e/run.ts --skip-llm"
}
```
`bun run` (bare) also showed no JSON parse error.

### README.md
Appended subsection「E2E 真实 opencode 实例测试」under「开发」section (before「发布」).
Contains: 用途 / 前置 / 命令 / 环境变量表 (TIANJI_E2E_OPENCODE_BIN, TIANJI_E2E_PROVIDER_JSON,
TIANJI_E2E_SKIP_LLM, TIANJI_E2E_MODEL, TIANJI_E2E_NO_COMMAND) / 注意.
No existing README content was removed or rewritten.

## Verification (commands + exit codes)

| Command | Exit | Output file |
| --- | --- | --- |
| `bun run test:e2e:skip-llm` | 0 | skip-llm.log |
| `bun run e2e/run.ts --skip-llm` | 0 | direct-skip-llm.log (equivalent: same ok/skipped structure, only elapsedMs differs) |
| `bun run test` (regression) | 0 | unit-test.log (Ran 113 tests, 0 fail) |
| `bun test e2e/` (regression) | 0 | e2e-bun-test.log (51 pass, 0 fail) |

skip-llm run: chat.skipped=true, command.skipped=true, tools 全部 13 注册 (missing: []),
command.ok=true, overall ok=true, no temp-dir/process residue (run.ts cleanup).

## Notes
- 任务描述中预期 `bun run test` 为 107 pass;实际为 113 pass(并行任务新增的 e2e 单元测试
  已并入 test/ 之外? 实为 15 files 113 tests),0 fail —— 回归通过。
- 未触碰:产品代码、e2e/*.ts、plan 文件、package.json 其他字段。
