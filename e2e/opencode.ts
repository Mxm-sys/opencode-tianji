/**
 * e2e/opencode.ts — opencode 二进制探测与版本门禁模块(T1)
 *
 * 探测顺序:环境变量 TIANJI_E2E_OPENCODE_BIN → `command -v opencode`
 * → 常见路径(~/.opencode/bin/opencode、/usr/local/bin/opencode、/opt/homebrew/bin/opencode)。
 * 只运行 `opencode --version`,绝不启动任何 opencode 服务进程。
 */
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

/** 版本门禁:低于该版本直接报错 */
export const MIN_VERSION = "1.18.0";

export interface OpencodeInfo {
  bin: string;
  version: string;
}

/** 纯函数:语义化版本比较(点分数字逐段比较,缺位补零)。例:1.18.15 ≥ 1.18.0 → true;1.17.9 → false */
export function versionAtLeast(v: string, min: string): boolean {
  const a = v.split(".").map(Number);
  const b = min.split(".").map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

/** 从 `opencode --version` 输出中提取版本号(容忍 "v1.18.15" / "opencode 1.18.15" 等前缀) */
export function parseVersion(output: string): string | null {
  const m = output.match(/(\d+\.\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}

function runCommand(args: string[]): { ok: boolean; out: string } {
  try {
    const r = spawnSync(args[0], args.slice(1), { encoding: "utf8" });
    if (r.status !== 0 || r.error) return { ok: false, out: "" };
    return { ok: true, out: (r.stdout ?? "").trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

/** 依次探测候选二进制,首个可运行且版本达标的即返回;全部失败抛中文安装提示 */
export function detectOpencode(): OpencodeInfo {
  const home = os.homedir();
  const candidates: string[] = [];

  // 1. 环境变量显式指定
  const envBin = process.env.TIANJI_E2E_OPENCODE_BIN;
  if (envBin) candidates.push(envBin);

  // 2. PATH 查找
  const which = runCommand(["sh", "-c", "command -v opencode"]);
  if (which.ok && which.out) candidates.push(which.out);

  // 3. 常见安装路径
  candidates.push(
    path.join(home, ".opencode", "bin", "opencode"),
    "/usr/local/bin/opencode",
    "/opt/homebrew/bin/opencode",
  );

  const seen = new Set<string>();
  for (const bin of candidates) {
    if (!bin || seen.has(bin)) continue;
    seen.add(bin);
    const r = runCommand([bin, "--version"]);
    if (!r.ok) continue;
    const version = parseVersion(r.out);
    if (!version) continue;
    if (!versionAtLeast(version, MIN_VERSION)) {
      throw new Error(
        `opencode 版本过低:需要 ≥1.18,当前 ${version}(${bin})。请升级 opencode 后重试(brew upgrade opencode)。`,
      );
    }
    return { bin, version };
  }

  throw new Error(
    "未找到可用的 opencode(≥1.18)。请先安装:brew install opencode,或执行 curl -fsSL https://opencode.ai/install | bash;" +
      "也可将 opencode 二进制路径写入环境变量 TIANJI_E2E_OPENCODE_BIN 后重试。",
  );
}
