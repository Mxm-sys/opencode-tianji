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
  export function readdir(path: string): Promise<string[]>;
  export function rm(
    path: string,
    opts?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  export function writeFile(
    path: string,
    data: string,
    opts?: { mode?: number },
  ): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string): string;
  export function resolve(...parts: string[]): string;
}

interface Matchers<T> {
  toBe(v: unknown): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toEqual(v: unknown): void;
  toContain(v: unknown): void;
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
};

interface ImportMeta {
  dir: string;
}
