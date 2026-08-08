# Task 3 — deepseek provider 安全注入模块(e2e/provider.ts)

状态:通过(5/5 单测、QA happy、QA failure 确定性)

## 交付物

- `e2e/provider.ts` — 导出 `buildProviderConfig()` 与 `sanitizeProviderForLog()`(TypeScript ESM,bun 运行时,无新依赖,不写文件不 chmod)
  - `buildProviderConfig()`:(1) `TIANJI_E2E_PROVIDER_JSON` 已设置且非空 → JSON.parse 直接返回(CI/他机覆盖);(2) 否则读 `~/.config/opencode/opencode.json` 的 `provider.deepseek` 整段原样返回;(3) 读不到/不存在 → 抛中文错误,提示复制全局配置的 provider.deepseek 到环境变量
  - `sanitizeProviderForLog()`:structuredClone 深拷贝 + `options.apiKey` 替换为 `"***"`,不修改输入对象
- `e2e/provider.test.ts` — bun:test 5 项:脱敏替换、输入不可变、返回值深拷贝、env 注入路径、非法 JSON 抛中文错误

## 运行命令与输出

### 1. 单元测试

```
$ bun test e2e/provider.test.ts
bun test v1.3.14 (0d9b296a)

 5 pass
 0 fail
 11 expect() calls
Ran 5 tests across 1 file. [14.00ms]
EXIT=0
```

### 2. QA happy 路径(真实读取全局配置 + 脱敏 + 防泄露断言)

```
$ bun -e "import {buildProviderConfig,sanitizeProviderForLog} from './e2e/provider.ts'; const p = buildProviderConfig(); const s = sanitizeProviderForLog(p); console.log(JSON.stringify(s)); const raw = JSON.stringify(p); const key = raw.match(/sk-[a-z0-9]+/i)?.[0] ?? 'sk-xxx'; console.log('key-leak:', JSON.stringify(s).includes(key))"
{"models":{"deepseek-v4-flash":{"name":"DeepSeek V4 Flash"},"deepseek-v4-pro":{"name":"DeepSeek V4 Pro"}},"npm":"@ai-sdk/openai-compatible","options":{"apiKey":"***","baseURL":"https://api.deepseek.com/v1","setCacheKey":true}}
key-leak: false
EXIT=0
```

结论:从 `/home/mm/.config/opencode/opencode.json` 成功读取 `provider.deepseek` 整段(models/npm/options 含 apiKey/baseURL/setCacheKey);脱敏后 apiKey 为 `***`;真实 key 与脱敏输出比对 `key-leak: false`。

### 3. QA failure 路径(确定性:HOME 指向不存在目录 + 空 env 覆盖)

```
$ HOME=/nonexistent-home TIANJI_E2E_PROVIDER_JSON= bun -e "import {buildProviderConfig} from './e2e/provider.ts'; buildProviderConfig()"
error: 无法读取全局配置 /nonexistent-home/.config/opencode/opencode.json(文件缺失或不可读)。请将你全局 opencode.json 中的 provider.deepseek 整段复制到环境变量 TIANJI_E2E_PROVIDER_JSON(JSON 字符串)后重试,例如:TIANJI_E2E_PROVIDER_JSON='{"npm":"@ai-sdk/openai-compatible","models":{},"options":{"apiKey":"sk-...","baseURL":"https://api.deepseek.com/v1"}}'
EXIT=1
```

结论:中文错误、退出码非 0。空字符串 env 按「未设置」处理落入全局配置路径,符合确定性失败场景。

## 防泄露核对

- 证据目录内 grep 真实 apiKey 值(实际值已从本文件移除,比对方式:用全局配置中 options.apiKey 的原文执行 `grep -r "<原文>" e2e/ .omo/evidence/tianji-opencode-e2e/task-3/`)→ 无输出(空)
- 证据目录内 grep `sk-[a-z0-9]` 明文:无输出(空;仅有的 2 处命中为 QA 命令里的正则字面量 `/sk-[a-z0-9]+/i` 与上文占位符描述,均非密钥明文)
- 仓库内(e2e/ + 证据)不含真实 apiKey 值
- 真实 key 仅出现过一次:此处证据文件早前版本曾引用其值,已在本版移除

详见同目录 `test-output.txt` 与 `provider-config-sanitized.json`。
