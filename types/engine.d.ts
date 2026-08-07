/**
 * opencode-tianji 引擎类型声明(纯计算层,不依赖 opencode 运行时)。
 * 对应入口: package.json exports["./engine"] → lib/engine.ts。
 */

export declare const TIAN_GAN: readonly [
  "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸",
];
export declare const DI_ZHI: readonly [
  "子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥",
];

export interface GzOpts {
  /** 晚子时(23:00~24:00)日柱是否归次日。默认 "换日"。 */
  晚子时?: "换日" | "不换日";
  /** 出生地经度(东经正)。默认 120(东八区);传入且 !=120 时用真太阳时定时辰支。 */
  经度?: number;
}

export type Gz = { gan: string; zhi: string };
export type FullGz = { ygz: Gz; mgz: Gz; dgz: Gz; hgz: Gz };

export declare function 节气时刻(y: number, 节气黄经: number): Date;
export declare function getTrueSolarHours(dateUtc: Date, longitude?: number): number;
export declare function getFullGanZhi(y: number, m: number, d: number, hour: number, opts?: GzOpts): FullGz;
export declare function getYearGanZhi(year: number, month?: number, day?: number, opts?: GzOpts): Gz;
export declare function getYearGanZhiEx(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz;
export declare function getMonthGanZhi(year: number, month: number, day?: number, opts?: GzOpts): Gz;
export declare function getMonthGanZhiEx(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz;
export declare function getDayGanZhi(y: number, m: number, d: number): Gz;
export declare function getDayGanZhiEx(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz;
export declare function getHourZhi(hour: number): string;
export declare function getHourGanZhi(y: number, m: number, d: number, hour: number, opts?: GzOpts): Gz;
export declare const 口径披露: () => string;

export declare const DI: readonly string[];
export declare const TG: readonly string[];
export declare const WEI: readonly string[];
export declare const NUM_TO_GUA: Record<number, string>;
export declare const SHENG: Map<string, string>;
export declare const KE: Map<string, string>;
export declare const WANGXIANG: Record<string, { 季节: string; 旺: string; 相: string; 休: string; 囚: string; 死: string }>;
export declare const GAN_WX: Map<string, string>;
export declare const GAN_YY: Map<string, string>;
export declare const NAYIN: Map<string, string>;
export declare const CHONG: Map<string, string>;
export declare const HE: Map<string, string>;
export declare const SANHE: { 局: string; 三支: string[] }[];
export declare const XUNKONG: Record<string, string[]>;
export declare const TRIGRAM_LINES: Record<string, number[]>;
export declare const LINES_TO_TRIGRAM: Record<string, string>;
export declare const BAGUA_WX: Map<string, string>;
export declare const BAGUA_SYM: Map<string, string>;

export declare function zhiWX(): Map<string, string>;
export declare function liuShenStart(gan: string): string;
export declare function liuShenOrder(): string[];

export type Gua = {
  卦名: string;
  卦符: string;
  上下卦: string;
  八宫: string;
  宫五行: string;
  世爻: number;
  应爻: number;
  纳甲: [string, string][];
  六亲: [string, string][];
  卦辞: string;
  [k: string]: unknown;
};

export declare function guaList(): Gua[];
export declare function guaOf(name: string): Gua | undefined;
export declare function guaOfTrigrams(up: string, down: string): Gua | undefined;
export declare function splitUpDown(s: string): [string, string];
export declare function bianGuaName(gua: Gua, dongs: number[]): string;

export declare function parseDT(s?: string): { y: number; m: number; d: number; h: number };
export declare function fullGanZhi(t: { y: number; m: number; d: number; h: number }, opts?: GzOpts): FullGz;
export declare function normDongs(dongs?: number[]): number[];
export declare function xunKong(dgz: { gan: string; zhi: string }): { xun: string; kong: string[] };
export declare function yuePo(mgz: { zhi: string }): string;
export declare function seasonOf(zhi: string): string;
export declare function wangState(monthZhi: string, wx: string): string;
export declare function qinByWX(gongWX: string, wx: string): string;
export declare function relation(a: string, b: string): string;
export declare function guaBody(gua: Gua, gongWX: string): { zhi: string; wx: string; qin: string; line: number | null };

export interface LineInfo {
  wei: string;
  pos: number;
  shen: string;
  qin: string;
  gzName: string;
  zhi: string;
  wx: string;
  isShi: boolean;
  isYing: boolean;
  isDong: boolean;
  isKong: boolean;
  isPo: boolean;
  state: string;
}

export interface Pan {
  gua: Gua;
  dongs: number[];
  t: { y: number; m: number; d: number; h: number };
  gzFull: FullGz;
  lines: LineInfo[];
  body: { zhi: string; wx: string; qin: string; line: number | null };
  xk: { xun: string; kong: string[] };
  poZhi: string;
  chong: string[];
  he: string[];
  sanhe: string[];
  shiLine: LineInfo;
  yingLine: LineInfo;
  rel: string;
  yongQin?: string[];
  fushen: Record<string, { gzName: string; wx: string; fei: LineInfo; shengKe: string }>;
}

export declare function buildPan(name: string, dongsArg: number[], dt?: string, opts?: GzOpts): Pan;
export declare function shortGuaName(name: string): string;
export declare function buildPanByGanzhi(name: string, dongsArg: number[], monthZhi: string, dayGanZhi: string): Pan;
