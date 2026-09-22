// 自動擴展的街區模板：一個 slot（2600×1300）切成 2×2 個區域，路線順時針（左上 → 右上 → 右下 → 左下）。
// 每個區域有「室內 / 室外」、地面材質、最多一種地形特徵。從這些資料算出：
//   - scene-config 的 zones / bands / place（擺放用，和手寫的場景同一套格式）
//   - terrain：畫地形用的幾何（build 時寫進場景 JSON，由 GeneratedDistrict.tsx 畫）
// 幾何只在這裡算一次，地形和擺放才不會對不上。純函式，不讀檔。

export const SLOT_SIZE = { w: 2600, h: 1300 };
export const FLOORS = { indoor: ['tile', 'wood', 'carpet'], outdoor: ['grass', 'paving', 'sand', 'concrete'] };
export const SURFACE_LOOKS = { counter: 'cafe-counter', table: 'table', stand: 'stand', chiller: 'chiller', checkout: 'checkout' };
const OUTDOOR_ONLY = ['road', 'track', 'water'];
export const FEATURES = ['none', ...OUTDOOR_ONLY, ...Object.keys(SURFACE_LOOKS)];
export const SPOTS = ['ground', 'wall', 'wallbase', 'surface', 'road', 'track', 'water', 'sky'];
export const MAP_COLORS = ['#ce93d8', '#80cbc4', '#ffab91', '#9fa8da', '#c5e1a5', '#ffe082', '#f48fb1', '#90caf9', '#bcaaa4', '#a5d6a7'];

// 區域內的幾何（相對區域上緣 / 下緣，區域高 650）
const WALL_BASE = 180; // 室內後牆的牆腳
const GROUND_TOP = { indoor: 240, outdoor: 70 };
const ROAD = { top: 190, bottom: 30 }; // 距下緣
const TRACK = { top: 160, rail: 40 };
const SKY = { top: 150, bottom: 300 };

/** slot → 4 個區域矩形 [x0, y0, x1, y1]，順序 = 路線順序 */
export function zoneRects(slot) {
  const { x, y } = slot;
  const w = SLOT_SIZE.w / 2;
  const h = SLOT_SIZE.h / 2;
  return [
    [x, y, x + w, y + h],
    [x + w, y, x + 2 * w, y + h],
    [x + w, y + h, x + 2 * w, y + 2 * h],
    [x, y + h, x + w, y + 2 * h],
  ];
}

/** 規劃裡的區域設定 → 合法值（不合法的欄位換成預設，不丟錯：LLM 的輸出不可信） */
export function normalizeZone(spec) {
  const indoor = spec.indoor === true;
  const floors = FLOORS[indoor ? 'indoor' : 'outdoor'];
  const floor = floors.includes(spec.floor) ? spec.floor : floors[0];
  let feature = FEATURES.includes(spec.feature) ? spec.feature : 'none';
  if (indoor && OUTDOOR_ONLY.includes(feature)) feature = 'none';
  return { id: spec.id, name: spec.name, indoor, floor, feature };
}

export function allowedSpots(zone) {
  const spots = ['ground'];
  if (zone.indoor) spots.push('wall', 'wallbase');
  else spots.push('sky');
  if (SURFACE_LOOKS[zone.feature]) spots.push('surface');
  if (OUTDOOR_ONLY.includes(zone.feature)) spots.push(zone.feature);
  return spots;
}

/** 一個區域的地形幾何 + 地面可放的範圍 */
export function zoneGeometry(rect, zone) {
  const [x0, y0, x1, y1] = rect;
  const geo = { ground: { top: y0 + GROUND_TOP[zone.indoor ? 'indoor' : 'outdoor'], bottom: y1 - 20, gaps: [] } };
  if (zone.indoor) geo.wallBase = y0 + WALL_BASE;
  if (zone.feature === 'road') {
    geo.road = { y0: y1 - ROAD.top, y1: y1 - ROAD.bottom };
    geo.ground.bottom = geo.road.y0 - 15;
  } else if (zone.feature === 'track') {
    geo.track = { y0: y1 - TRACK.top, y1 };
    geo.ground.bottom = geo.track.y0 - 20;
  } else if (zone.feature === 'water') {
    geo.pool = { x0: Math.round((x0 + x1) / 2), y0: y0 + 110, x1: x1 - 50, y1: y1 - 40 };
    geo.ground.x1 = geo.pool.x0 - 30;
  } else if (SURFACE_LOOKS[zone.feature]) {
    const level = geo.ground.top + 70;
    const base = level + (zone.feature === 'counter' ? 42 : 70);
    const levels = zone.feature === 'stand' ? [level, level + 95] : [level];
    geo.surface = { look: SURFACE_LOOKS[zone.feature], x0: x0 + 150, x1: x1 - 150, levels, base: zone.feature === 'stand' ? base + 95 : base };
    geo.ground.gaps.push([level - 120, geo.surface.base + 30]);
  }
  return geo;
}

function bandsFor(rect, zone, geo) {
  const id = zone.id;
  const bands = {};
  if (zone.indoor) {
    bands[`wall-${id}`] = { levels: [geo.wallBase - 40], zones: [id], inset: 60, scale: [0.85, 0.85] };
    bands[`wallbase-${id}`] = { levels: [geo.wallBase - 2], zones: [id], inset: 50 };
  } else {
    bands[`sky-${id}`] = { top: rect[1] + SKY.top, bottom: rect[1] + SKY.bottom, zones: [id], layer: 3, float: 150 };
  }
  if (geo.road) bands[`road-${id}`] = { top: geo.road.y0 + 70, bottom: geo.road.y1 - 20, zones: [id], inset: 20 };
  if (geo.track) bands[`track-${id}`] = { levels: [geo.track.y1 - TRACK.rail], zones: [id], inset: 40, scale: [2.2, 2.2] };
  if (geo.pool) {
    const p = geo.pool;
    bands[`water-${id}`] = { x0: p.x0 + 40, x1: p.x1 - 40, top: p.y0 + 70, bottom: p.y1 - 30, zones: [id], layer: 1, scale: [0.9, 0.9] };
  }
  if (geo.surface) {
    const s = geo.surface;
    bands[`surface-${id}`] = { levels: s.levels, zones: [id], x0: s.x0, x1: s.x1, inset: 0, scale: [0.8, 0.8], look: s.look, base: s.base };
  }
  return bands;
}

function groundOverride(geo) {
  const g = geo.ground;
  return { top: g.top, bottom: g.bottom, ...(g.gaps.length ? { gaps: g.gaps } : {}), ...(g.x1 ? { x1: g.x1 } : {}) };
}

/**
 * @param {{ slot: {x: number, y: number}, zones: object[], elements: Array<{ id: string, zone: string, spot?: string }>, colorIndex?: number }} input
 * @returns {{ zones: Record<string, number[]>, bands: object, place: Record<string, string>, terrain: object }}
 */
export function buildDistrict({ slot, zones: zoneSpecs, elements, colorIndex = 0 }) {
  if (zoneSpecs.length !== 4) throw new Error(`街區要剛好 4 個區域，收到 ${zoneSpecs.length} 個`);
  const rects = zoneRects(slot);
  const zones = zoneSpecs.map(normalizeZone);
  const geos = zones.map((z, i) => zoneGeometry(rects[i], z));

  const bands = { ground: { scale: [0.95, 1.05], override: Object.fromEntries(zones.map((z, i) => [z.id, groundOverride(geos[i])])) } };
  zones.forEach((z, i) => Object.assign(bands, bandsFor(rects[i], z, geos[i])));

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const place = {};
  for (const el of elements) {
    const zone = zoneById.get(el.zone);
    if (!zone || !el.spot || el.spot === 'ground' || !allowedSpots(zone).includes(el.spot)) continue;
    place[el.id] = `${el.spot}-${zone.id}`;
  }

  const [x0, y0] = [slot.x, slot.y];
  return {
    zones: Object.fromEntries(zones.map((z, i) => [z.id, rects[i]])),
    bands,
    place,
    terrain: {
      color: MAP_COLORS[colorIndex % MAP_COLORS.length],
      x0, y0, x1: x0 + SLOT_SIZE.w, y1: y0 + SLOT_SIZE.h,
      zones: zones.map((z, i) => {
        const [zx0, zy0, zx1, zy1] = rects[i];
        const g = geos[i];
        return {
          id: z.id, x0: zx0, y0: zy0, x1: zx1, y1: zy1, indoor: z.indoor, floor: z.floor,
          ...(g.wallBase ? { wallBase: g.wallBase } : {}),
          ...(g.road ? { road: g.road } : {}),
          ...(g.track ? { track: g.track } : {}),
          ...(g.pool ? { pool: g.pool } : {}),
        };
      }),
    },
  };
}

/** 已用的 slot 之外，依序找下一個空的 */
export function nextSlot(slots, usedSlots) {
  const used = new Set(usedSlots.map((s) => `${s.x},${s.y}`));
  return slots.find((s) => !used.has(`${s.x},${s.y}`)) ?? null;
}

/** 地圖大小 = 原本的核心範圍 + 所有已用 slot 的外框 */
export function worldSize(core, usedSlots) {
  return {
    width: Math.max(core.width, ...usedSlots.map((s) => s.x + SLOT_SIZE.w)),
    height: Math.max(core.height, ...usedSlots.map((s) => s.y + SLOT_SIZE.h)),
  };
}
