# Task 1 证据 — e2e/opencode.ts(opencode 二进制探测与版本门禁)

计划:`.omo/plans/tianji-opencode-e2e.md` Todo 1
日期:2026-08-09 | 环境:bun v1.3.14 | 仓库根:`/home/mm/桌面/opencode/项目/天机`(含空格与 CJK,命令一律加引号)

## 交付物

- `e2e/opencode.ts` — 导出 `detectOpencode(): { bin; version }` 与纯函数 `versionAtLeast(v, min)`、`parseVersion(out)`;探测顺序 `TIANJI_E2E_OPENCODE_BIN` → `command -v opencode` → `~/.opencode/bin/opencode`、`/usr/local/bin/opencode`、`/opt/homebrew/bin/opencode`;仅执行 `opencode --version`,不启动任何服务进程;门禁 `versionAtLeast(version, "1.18.0")`,低于报中文「版本过低」错误;全部失败抛中文安装提示。
- `e2e/opencode.test.ts` — bun:test 单测(10 项全过)。

## 运行命令与输出

### 1. 单元测试 `bun test e2e/opencode.test.ts`

```sh
$ bun test e2e/opencode.test.ts
bun test v1.3.14 (0d9b296a)

 10 pass
 0 fail
 11 expect() calls
Ran 10 tests across 1 file. [8.00ms]
```

覆盖边界:1.18.0 ≥ 1.18.0 → true;1.18.15 ≥ 1.18.0 → true;1.17.9 ≥ 1.18.0 → false;2.0.0 ≥ 1.18.0 → true;缺位补零(1.18 / 1.18.0 双向);跨主版本;parseVersion 前缀容忍(v1.18.15 / "opencode 1.18.15")。

### 2. QA happy path(真实机器)

```sh
$ bun -e "import {detectOpencode} from './e2e/opencode.ts'; console.log(JSON.stringify(detectOpencode()))"
{"bin":"/home/mm/.opencode/bin/opencode","version":"1.18.15"}
$ echo "exit=$?"        # exit=0
```

结果:输出真实 bin 路径 + 版本 1.18.15(≥ 门禁 1.18.0),退出码 0。

辅助:`command -v opencode` → `/home/mm/.opencode/bin/opencode`(PATH 探测路径与常见路径命中一致)。

### 3. QA failure path(确定性:版本过低)

```sh
$ printf '#!/bin/sh\necho "1.17.9"\n' > /tmp/opencode-stub && chmod +x /tmp/opencode-stub
$ TIANJI_E2E_OPENCODE_BIN=/tmp/opencode-stub bun -e "import {detectOpencode} from './e2e/opencode.ts'; console.log(JSON.stringify(detectOpencode()))"
error: opencode 版本过低:需要 ≥1.18,当前 1.17.9(/tmp/opencode-stub)。请升级 opencode 后重试(brew upgrade opencode)。
$ echo "exit=$?"        # exit=1
```

结果:抛中文「版本过低」错误,退出码非 0。符合验收。

### 4. QA fallback 链(env 指向不存在的二进制)

```sh
$ TIANJI_E2E_OPENCODE_BIN=/nonexistent bun -e "import {detectOpencode} from './e2e/opencode.ts'; console.log(JSON.stringify(detectOpencode()))"
{"bin":"/home/mm/.opencode/bin/opencode","version":"1.18.15"}
$ echo "exit=$?"        # exit=0
```

结果:env 候选失败后沿 fallback 链继续,最终命中真实二进制,不崩溃。符合计划 QA 场景。

## QA 结论

| 场景 | 期望 | 实际 | 通过 |
| --- | --- | --- | --- |
| bun test 单测(versionAtLeast 4 边界 + 扩展) | 全过 | 10 pass / 0 fail | ✅ |
| happy:真实探测 | bin + version ≥1.18,exit 0 | `/home/mm/.opencode/bin/opencode` + 1.18.15,exit 0 | ✅ |
| failure:stub 1.17.9 | 中文「版本过低」错误,非 0 退出 | 抛 `opencode 版本过低:需要 ≥1.18,当前 1.17.9(...)`,exit 1 | ✅ |
| fallback:/nonexistent | fallback 链不崩溃仍成功 | 命中真实二进制,exit 0 | ✅ |

验收准则(`bun test e2e/opencode.test.ts` 通过;`bun -e detectOpencode()` 输出 bin+≥1.18 version、退出码 0)全部满足。
