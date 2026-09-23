// 城市路網：街區之間的街道、路口、河上的橋、空地、地圖邊緣（東側丘陵、南側海岸）。純函式，WorldBackground 只負責畫。
// 規劃見 docs/city-plan.md。格線要和 scripts/lib/district-kit.mjs 的 slot 一致（tests/unit/city.test.ts 會檢查）：
//
//   核心（手畫 3600×2600） │街│ slot │街│ slot │街│ … │環│ 丘陵
//   ══════ 街 ══════════════╪══╪══════╪══╪══════╪══╪   │  │
//   站前廣場（核心南側）     │  │ slot │  │ slot │  │   │  │
//   slot（車站）…           │  │      │  │      │  │   │  │
//   ════════════════════ 濱海環路 ═══════════════════════╧══╧═══
//   沙灘、海
import type { Rect, Town } from './town';

export const CORE = { w: 3600, h: 2600 };
export const SLOT = { w: 2600, h: 1300 };
/** 街道寬（含兩側人行道） */
export const STREET = 240;
export const SIDEWALK = 50;
/** 環路外的地圖邊緣 */
export const EDGE = { east: 900, south: 800 };
/** 河（核心東側往南流到海）：含西岸步道 */
export const RIVER = { x0: 2600, x1: 2940 };

/** 第 i 欄的左緣（0 = 核心那一欄） */
export const colX = (i: number) => (i === 0 ? 0 : CORE.w + STREET + (i - 1) * (SLOT.w + STREET));
/** 第 j 列的上緣 */
export const rowY = (j: number) => j * (SLOT.h + STREET);

export type StreetKind = 'avenue' | 'ring' | 'plaza';
export interface Street extends Rect {
  id: string;
  dir: 'h' | 'v';
  kind: StreetKind;
}

export interface City {
  /** 所有街區（含核心）的外框右緣、下緣 */
  inner: { w: number; h: number };
  streets: Street[];
  /** 橫向和縱向街道交會處（畫斑馬線） */
  crossings: Rect[];
  /** 地標圓環所在的路口 */
  roundabout: Rect | null;
  /** 街道跨過河的地方 */
  bridges: Rect[];
  /** 格線上沒有街區的空地（畫樹林） */
  vacant: Rect[];
  /** 海岸線（沙灘上緣）、海的上緣 */
  coast: { sand: number; sea: number };
  /** 東側丘陵的左緣 */
  hills: number;
}

const overlap = (a: Rect, b: Rect): Rect | null => {
  const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return r.x0 < r.x1 && r.y0 < r.y1 ? r : null;
};

/** 地圖大小 = 內側範圍 + 環路 + 邊緣（district-kit 的 worldSize 用同一個算法） */
export function worldFromInner(inner: { w: number; h: number }) {
  return { width: inner.w + STREET + EDGE.east, height: inner.h + STREET + EDGE.south };
}

export function districtRects(town: Town): Rect[] {
  return town.districts.map((d) => {
    const zs = d.scene.zones;
    return { x0: Math.min(...zs.map((z) => z.x0)), y0: Math.min(...zs.map((z) => z.y0)), x1: Math.max(...zs.map((z) => z.x1)), y1: Math.max(...zs.map((z) => z.y1)) };
  });
}

export function buildCity(districts: readonly Rect[]): City {
  const w = Math.max(CORE.w, ...districts.map((d) => d.x1));
  const h = Math.max(CORE.h, ...districts.map((d) => d.y1));
  const streets: Street[] = [];

  // 縱向：每一欄的左邊一條，從地圖北緣到濱海環路
  for (let i = 1; colX(i) + SLOT.w <= w; i++) {
    streets.push({ id: `v${i}`, dir: 'v', kind: 'avenue', x0: colX(i) - STREET, x1: colX(i), y0: 0, y1: h });
  }
  // 橫向：每一列的上面一條；核心那一欄只有核心以南才有路，核心南邊多一塊站前廣場
  for (let j = 1; rowY(j) + SLOT.h <= h; j++) {
    const top = rowY(j) - STREET;
    if (top < CORE.h) {
      streets.push({ id: `h${j}`, dir: 'h', kind: 'avenue', x0: CORE.w, x1: w, y0: top, y1: rowY(j) });
    } else if (rowY(j - 1) < CORE.h) {
      // 核心以南第一列：路貼著核心南緣，路和車站之間是站前廣場；東段照常
      streets.push({ id: `h${j}w`, dir: 'h', kind: 'avenue', x0: 0, x1: CORE.w, y0: CORE.h, y1: CORE.h + STREET });
      streets.push({ id: 'plaza', dir: 'h', kind: 'plaza', x0: 0, x1: RIVER.x0, y0: CORE.h + STREET, y1: rowY(j) });
      streets.push({ id: `h${j}`, dir: 'h', kind: 'avenue', x0: CORE.w, x1: w, y0: top, y1: rowY(j) });
    } else {
      streets.push({ id: `h${j}`, dir: 'h', kind: 'avenue', x0: 0, x1: w, y0: top, y1: rowY(j) });
    }
  }
  streets.push({ id: 'ring-e', dir: 'v', kind: 'ring', x0: w, x1: w + STREET, y0: 0, y1: h + STREET });
  streets.push({ id: 'ring-s', dir: 'h', kind: 'ring', x0: 0, x1: w + STREET, y0: h, y1: h + STREET });

  const roads = streets.filter((s) => s.kind !== 'plaza');
  const crossings: Rect[] = [];
  for (const a of roads.filter((s) => s.dir === 'h')) {
    for (const b of roads.filter((s) => s.dir === 'v')) {
      const r = overlap(a, b);
      if (r) crossings.push(r);
    }
  }
  // 地標圓環：車站東北角、第一條縱向街和站前那條橫向街的路口
  const target = { x: colX(1) - STREET / 2, y: rowY(2) - STREET / 2 };
  const roundabout = crossings.length
    ? crossings.reduce((best, r) => (dist(r, target) < dist(best, target) ? r : best))
    : null;

  const bridges = roads
    .filter((s) => s.dir === 'h' && s.x0 < RIVER.x1 && s.x1 > RIVER.x0)
    .map((s) => ({ x0: RIVER.x0 + 70, x1: RIVER.x1 + 20, y0: s.y0, y1: s.y1 }));

  const vacant: Rect[] = [];
  for (let i = 0; colX(i) < w; i++) {
    for (let j = i === 0 ? 2 : 0; rowY(j) < h; j++) {
      const cell = { x0: colX(i), y0: rowY(j), x1: colX(i) + SLOT.w, y1: rowY(j) + SLOT.h };
      if (cell.x1 > w || cell.y1 > h) continue;
      if (!districts.some((d) => overlap(d, cell))) vacant.push(cell);
    }
  }

  return {
    inner: { w, h },
    streets,
    crossings,
    roundabout,
    bridges,
    vacant,
    coast: { sand: h + STREET, sea: h + STREET + 150 },
    hills: w + STREET,
  };
}

const dist = (r: Rect, p: { x: number; y: number }) => Math.hypot((r.x0 + r.x1) / 2 - p.x, (r.y0 + r.y1) / 2 - p.y);
