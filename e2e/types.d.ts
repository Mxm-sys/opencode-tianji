/**
 * e2e/types.d.ts — Bun 运行时环境声明补齐
 *
 * 本仓库是纯 Bun 项目(package.json 无 @types/node、无 tsconfig,且计划约束"no new deps")。
 * 为了让 tsserver 对 e2e/ 下使用 node 内建模块与 bun:test 的文件给出干净诊断,
 * 在此以 ambient 声明补齐最小类型。仅影响类型检查,不参与运行时。
 */

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding?: string): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { mode: number };
}

declare module "node:fs/promises" {
  export function chmod(path: string, mode: number | string): Promise<void>;
  export function cp(
    src: string,
    dest: string,
    opts?: { recursive?: boolean },
  ): Promise<void>;
  export function mkdir(
    path: string,
    opts?: { recursive?: boolean },
  ): Promise<string | undefined>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function readdir(path: string): Promise<string[]>;
  export function rm(
    path: string,
    opts?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  export function writeFile(
    path: string,
    data: string,
    opts?: { mode?: number; encoding?: string },
  ): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
  export function homedir(): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string): string;
  export function resolve(...parts: string[]): string;
}

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args?: string[],
    options?: { encoding?: string },
  ): {
    status: number | null;
    stdout: Buffer | string;
    stderr: Buffer | string;
    error?: Error;
  };

  export function spawn(
    command: string,
    args?: string[],
    options?: {
      env?: Record<string, string | undefined>;
      cwd?: string;
      detached?: boolean;
      stdio?: unknown[];
    },
  ): ChildProcess;
}

/**
 * 最小子进程流声明(仅类型检查;真实运行时由 Bun 提供)。
 * 只覆盖本套件用到的 data 事件与 setEncoding。
 */
interface NodeStream {
  setEncoding(encoding: string): this;
  on(event: "data", listener: (chunk: string) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
}

interface ChildProcess {
  readonly pid: number;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  stdout: NodeStream;
  stderr: NodeStream;
  stdin: NodeStream;
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: "exit", cb: (code: number | null, signal: string | null) => void): this;
  once(event: "error", cb: (err: Error) => void): this;
  kill(signal?: string): boolean;
}

/**
 * 最小 Buffer 环境声明(仅类型检查;真实运行时由 Bun 提供)。
 * 补齐 spawnSync/spawn 返回类型中 Buffer 分支所需成员。
 */
interface Buffer {
  toString(encoding?: string): string;
  trim(): string;
}

interface Matchers<T> {
  toBe(v: unknown): void;
  toBeDefined(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toEqual(v: unknown): void;
  toContain(v: unknown): void;
  toHaveLength(n: number): void;
  toThrow(re: RegExp | string): void;
}

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(
    name: string,
    fn: () => void | Promise<void>,
  ): void;
  export function expect(value: unknown): Matchers<unknown>;
}

declare const process: {
  pid: number;
  cwd(): string;
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode: number;
  exit(code?: number): never;
  kill(pid: number, signal?: string): boolean;
};

interface ImportMeta {
  dir: string;
  main?: boolean;
}

declare function setTimeout(fn: () => void, ms?: number): unknown;
declare function clearTimeout(timer: unknown): void;
