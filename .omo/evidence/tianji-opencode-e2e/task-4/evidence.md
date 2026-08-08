# Task-4 证据 — e2e/tools.ts 确定性工具注册验证

日期:2026-08-09 | 波次:Wave 2 | 依赖:T2 scaffold.ts / T3 provider.ts / T1 opencode.ts

## 交付物
- `e2e/tools.ts`:
  - `TIANJI_TOOLS: string[]` — 天机 13 工具(README.md:59 清单)
  - `parseServerPort(stdout): number | null` — 纯函数,解析 `opencode server listening on http://127.0.0.1:<PORT>`;端口 0(未分配实际端口)与越界(>65535)视为解析失败返回 null(文档化决策)
  - `verifyToolsRegistered({dir, opencodeBin})` — 真实启动 `opencode serve --port 0`(detached + stdio pipe,XDG 三变量隔离 `<dir>/.xdg/{config,cache,data}`,`OPENCODE_DISABLE_AUTOUPDATE=1`、`OPENCODE_DISABLE_MODELS_FETCH=1`,剔除宿主 OPENCODE_* 变量)→ 解析实际端口(≤15s,绝不假设 4096)→ 轮询 /global/health(≤30s)→ preflight(软:serve 日志插件路径线索;硬:ids 一个天机工具都没有 → 抛「项目配置未加载/插件未生效」)→ GET /experimental/tool/ids(带 `x-opencode-directory` 头)→ 子集检查 missing → finally SIGTERM→2s→SIGKILL(进程组兜底)只回收自 spawn 进程
  - CLI:`bun run e2e/tools.ts [--dir <已有脚手架>]`(默认 createScaffold + buildProviderConfig 自建;`--dir` 消费 T2 目录)输出 `{ids, missing, port}`,missing 空退出 0 否则 1;`TIANJI_E2E_BAD_PLUGIN=1` 覆写插件为不存在路径(确定性失败注入)
- `e2e/tools.test.ts` — parseServerPort 单测(8 例:标准行/带 Warning 前缀/随机高位端口/端口 0/越界/垃圾输入/多行取首个)+ TIANJI_TOOLS 13 工具断言
- `e2e/types.d.ts` — 追加 spawn/NodeStream/ChildProcess/readFile/process.kill/fetch/Response/toHaveLength 等 ambient 声明(与并行波次合并,无冲突)

## 实测关键事实(1.18.15)
1. 监听行输出在 **stdout**(Warning 行也在 stdout):`opencode server listening on http://127.0.0.1:4096`
2. `--port 0` 优先 4096 → 实测解析 port=4096(实现始终解析输出,不假设)
3. serve 不打印插件加载日志 → preflight 软检查仅记录线索,硬检查(ids 全缺)为最终防线
4. **scaffold(T2) provider 形状问题**:`createScaffold({provider: buildProviderConfig()})` 把 deepseek 段直接写入 `provider` 顶层,而 opencode 要求「provider 名 → 配置」映射(缺 `deepseek` 包裹 → ConfigInvalidError)。CLI 在验证前经 `ensureProviderWrapped` 补齐包裹(已包裹则跳过);scaffold.test.ts 自身亦按 `{deepseek: ...}` 形状使用,与之一致
5. 残留进程检测必须用 `pgrep -x opencode`(精确名):`pgrep -f "opencode serve"` 会误匹配自身包装 shell 的 cmdline

## QA 结果
| 场景 | 命令 | 结果 |
| --- | --- | --- |
| 单测 | `bun test e2e/tools.test.ts` | 8 pass / 0 fail |
| 类型 | `tsc --strict --noEmit` | 无错误 |
| happy | `bun run e2e/tools.ts` | missing: [],ids 含 13 天机工具,exit 0 |
| --dir | `bun run e2e/tools.ts --dir <T2脚手架>` | missing: [],exit 0 |
| failure | `TIANJI_E2E_BAD_PLUGIN=1 bun run e2e/tools.ts` | 中文 preflight 错误「项目配置未加载/插件未生效」,exit 1 |
| 清理 | happy/failure 后 `pgrep -x opencode` diff | 无新增进程(仅宿主 2 个常驻) |
| 回归 | `bun test`(全量) | 176 pass / 0 fail / 6 skip |

## 文件清单
- `commands.txt` — 环境/单测/类型检查记录
- `happy-output.json` — happy 运行 stdout(JSON)
- `tool-ids.json` — /experimental/tool/ids 全量 27 个工具 id + missing + 天机命中 13/13
- `failure-output.txt` — BAD_PLUGIN 运行输出 + EXIT=1
- `cleanup-check.txt` — 进程/临时目录清理回执
- `happy-error.log` — happy 运行 stderr(空,正常)

## 已知非本模块问题
- `/tmp/tianji-e2e-*` 残留目录来自并行波次 T5(chat)/T6(command)的 QA 运行,与本模块无关(本模块自建脚手架均已在 finally 清理,见 cleanup-check.txt)
- 并行波次曾出现 command.test.ts 因文件未写完的瞬时失败,重跑后 176 pass 全绿
