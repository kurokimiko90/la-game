// 3D 物件的「積木」描述：每個物件 = 幾個基本形體（方塊、圓柱、球、圓錐、圓環）。
// 純資料、不依賴 three.js，所以能單元測試，也能讓 codex 之後照同一格式自動產生。
// 顏色只能用 PALETTE 裡的名字 = 2D SVG 物件用的同一套色票，3D 才會和現有畫風一致。
// 座標：公尺；地面 y = 0；物件正面朝本地 +z。

export const PALETTE = {
  ink: '#37474f',
  red: '#e57373',
  green: '#43a047',
  dgreen: '#388e3c',
  blue: '#64b5f6',
  yellow: '#fdd835',
  orange: '#ffb74d',
  brown: '#8d6e63',
  tan: '#d7a86e',
  grey: '#90a4ae',
  light: '#eceff1',
  white: '#fafafa',
  pink: '#f48fb1',
  purple: '#8e24aa',
  indigo: '#5c6bc0',
  glass: '#b3e5fc',
  cream: '#fff3e0',
} as const;

export type ColorKey = keyof typeof PALETTE;
export type Vec3 = [number, number, number];

interface PartBase {
  c: ColorKey;
  /** 形體中心 */
  p: Vec3;
  /** 旋轉（度），XYZ 順序 */
  r?: Vec3;
}

export type Part =
  | (PartBase & { s: 'box'; size: Vec3; round?: number })
  | (PartBase & { s: 'cyl'; r0: number; r1: number; h: number; seg?: number })
  | (PartBase & { s: 'sph'; rad: number; scale?: Vec3 })
  | (PartBase & { s: 'cone'; rad: number; h: number; seg?: number })
  | (PartBase & { s: 'tor'; R: number; t: number; arc?: number });

export interface Model3D {
  parts: Part[];
  /** 平面物件（斑馬線、水溝蓋）不描邊 */
  outline?: boolean;
}

interface Opt {
  r?: Vec3;
}

// 方便寫模型的小工具：y 參數是「底部」的高度（球、圓環是中心）。
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: ColorKey, o: Opt & { round?: number } = {}): Part =>
  ({ s: 'box', size: [w, h, d], p: [x, y + h / 2, z], c, r: o.r, round: o.round });
export const cyl = (r: number, h: number, x: number, y: number, z: number, c: ColorKey, o: Opt & { top?: number; seg?: number } = {}): Part =>
  ({ s: 'cyl', r0: r, r1: o.top ?? r, h, p: [x, y + h / 2, z], c, r: o.r, seg: o.seg });
export const sph = (rad: number, x: number, y: number, z: number, c: ColorKey, o: Opt & { scale?: Vec3 } = {}): Part =>
  ({ s: 'sph', rad, p: [x, y, z], c, r: o.r, scale: o.scale });
export const cone = (rad: number, h: number, x: number, y: number, z: number, c: ColorKey, o: Opt & { seg?: number } = {}): Part =>
  ({ s: 'cone', rad, h, p: [x, y + h / 2, z], c, r: o.r, seg: o.seg });
/** 圓環預設在 XY 平面（從正面看是一個圈） */
export const tor = (R: number, t: number, x: number, y: number, z: number, c: ColorKey, o: Opt & { arc?: number } = {}): Part =>
  ({ s: 'tor', R, t, p: [x, y, z], c, r: o.r, arc: o.arc });

/** 一個形體大約占的半徑（用來估物件大小、檢查尺寸合理） */
export function partExtent(part: Part): number {
  switch (part.s) {
    case 'box': return Math.hypot(...part.size) / 2;
    case 'cyl': return Math.hypot(Math.max(part.r0, part.r1), part.h / 2);
    case 'sph': return part.rad * Math.max(...(part.scale ?? [1, 1, 1]));
    case 'cone': return Math.hypot(part.rad, part.h / 2);
    case 'tor': return part.R + part.t;
  }
}

/** 物件外接盒（忽略旋轉，取保守的球形範圍） */
export function modelBounds(model: Model3D): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of model.parts) {
    const e = partExtent(part);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], part.p[i] - e);
      max[i] = Math.max(max[i], part.p[i] + e);
    }
  }
  return { min, max };
}

/** 模型檢查：給 build／測試用，回傳問題清單（空 = 通過） */
export function validateModel(id: string, model: Model3D, { maxParts = 60, maxSize = 25 } = {}): string[] {
  const problems: string[] = [];
  if (model.parts.length === 0) problems.push(`${id}：沒有形體`);
  if (model.parts.length > maxParts) problems.push(`${id}：形體 ${model.parts.length} 個，超過 ${maxParts}`);
  for (const [i, part] of model.parts.entries()) {
    if (!(part.c in PALETTE)) problems.push(`${id}#${i}：顏色 ${part.c} 不在色票`);
    const nums = [...part.p, ...(part.r ?? []), partExtent(part)];
    if (nums.some((n) => !Number.isFinite(n))) problems.push(`${id}#${i}：數值不是有限數`);
    if (partExtent(part) <= 0) problems.push(`${id}#${i}：尺寸要大於 0`);
  }
  const { min, max } = modelBounds(model);
  if (max.some((v, i) => v - min[i] > maxSize)) problems.push(`${id}：超過 ${maxSize} m`);
  return problems;
}
