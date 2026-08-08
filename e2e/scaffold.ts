/**
 * e2e/scaffold.ts — 隔离临时项目环境搭建模块(Todo 2)
 *
 * 在系统临时目录(os.tmpdir())创建干净的 opencode 项目:
 *   - opencode.json(plugin 指向仓库 plugins/zhanbu.ts 绝对路径,provider 经 opts 注入,写入后 chmod 600)
 *   - .opencode/skills/{zhanbu,meihua,bazi,liuren}/ 与 .opencode/command/*.md 模板复制
 * 不写任何密钥到仓库;不在仓库内建临时目录;不复制 node_modules;除 opencode.json 外不 chmod。
 */

import { existsSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/** 仓库根目录:e2e/ 的父目录(本文件所在目录的上一级)。 */
export const repoRoot = path.resolve(import.meta.dir, "..");

/** 模板技能目录(4 个技能目录名,与 templates/skills/ 下实际目录一致)。 */
const SKILL_DIRS = ["zhanbu", "meihua", "bazi", "liuren"] as const;

/**
 * 返回 opencode.json 中 plugin 数组应使用的插件绝对路径。
 * 断言插件文件真实存在,不存在抛中文错误。
 */
export function pluginAbsPath(projectRoot: string): string {
  const p = path.join(projectRoot, "plugins", "zhanbu.ts");
  if (!existsSync(p)) {
    throw new Error(
      `插件文件不存在:${p}。请确认 projectRoot 指向「天机」仓库根目录(含 plugins/zhanbu.ts)。`,
    );
  }
  return p;
}

/**
 * 创建隔离临时项目环境。
 *
 * @param opts.provider 注入到 opencode.json 的 provider 配置(由 provider 模块产出)。
 *                      必须是对象;传非对象抛中文错误(防止把密钥当字符串写进配置)。
 * @returns { dir, cleanup } dir 为临时项目根目录;cleanup 递归删除该目录(幂等)。
 */
export async function createScaffold(opts: {
  provider?: Record<string, unknown>;
}): Promise<{ dir: string; cleanup(): Promise<void> }> {
  const provider = opts.provider;
  if (
    provider !== undefined &&
    (typeof provider !== "object" || provider === null || Array.isArray(provider))
  ) {
    throw new Error(
      "createScaffold: provider 必须是对象(Record<string, unknown>),收到类型 " +
        `${provider === null ? "null" : Array.isArray(provider) ? "array" : typeof provider}。` +
        "请用 provider 模块(buildProviderConfig)产出配置后传入。",
    );
  }

  // (1) 在 os.tmpdir() 下建临时目录:tianji-e2e-<pid>-<rand>
  const rand = Math.random().toString(36).slice(2, 10);
  const dir = path.join(os.tmpdir(), `tianji-e2e-${process.pid}-${rand}`);
  await mkdir(dir, { recursive: true });

  try {
    // (2) 生成 opencode.json(plugin 数组含插件绝对路径;provider 经 opts 注入);写入后 chmod 600
    const config = {
      plugin: [pluginAbsPath(repoRoot)],
      provider,
    };
    const opencodeJsonPath = path.join(dir, "opencode.json");
    await writeFile(opencodeJsonPath, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(opencodeJsonPath, 0o600);

    // (3) 复制模板 → <tmp>/.opencode/(任一步失败由外层 catch 清理后抛中文错误)
    await copyTemplates(dir);

    return {
      dir,
      async cleanup() {
        await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    // 任一步失败:清理已创建的目录后抛中文错误
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `创建临时项目环境失败(目录 ${dir} 已清理):${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 复制技能与命令模板到临时项目;任一步失败抛中文错误(由调用方清理)。 */
async function copyTemplates(tmpDir: string): Promise<void> {
  const skillsSrc = path.join(repoRoot, "templates", "skills");
  const commandSrc = path.join(repoRoot, "templates", "command");

  // 源目录前置校验
  if (!existsSync(skillsSrc)) {
    throw new Error(`技能模板目录不存在:${skillsSrc}`);
  }
  if (!existsSync(commandSrc)) {
    throw new Error(`命令模板目录不存在:${commandSrc}`);
  }

  // .opencode/skills/{zhanbu,meihua,bazi,liuren}
  for (const skill of SKILL_DIRS) {
    const src = path.join(skillsSrc, skill);
    if (!existsSync(src)) {
      throw new Error(`技能模板缺失:${src}`);
    }
    const dest = path.join(tmpDir, ".opencode", "skills", skill);
    await mkdir(dest, { recursive: true });
    await cp(src, dest, { recursive: true });
  }

  // .opencode/command/*.md
  const commandDest = path.join(tmpDir, ".opencode", "command");
  await mkdir(commandDest, { recursive: true });
  const mdFiles = (await readdir(commandSrc)).filter((f) => f.endsWith(".md"));
  if (mdFiles.length === 0) {
    throw new Error(`命令模板目录为空(无 .md 文件):${commandSrc}`);
  }
  for (const f of mdFiles) {
    await cp(path.join(commandSrc, f), path.join(commandDest, f));
  }
}

/** 测试辅助:读取临时项目内的 opencode.json(避免测试直接依赖文件系统细节)。 */
export async function readScaffoldConfig(dir: string): Promise<{
  plugin?: unknown;
  provider?: unknown;
}> {
  const raw = readFileSync(path.join(dir, "opencode.json"), "utf8");
  return JSON.parse(raw) as { plugin?: unknown; provider?: unknown };
}
