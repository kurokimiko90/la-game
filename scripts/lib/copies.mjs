// 重複擺放：同一個物品在它所在的情境裡多放幾份（檯面補滿、同類小物並排），場景才不會空蕩蕩。
// 複本只填空位、不動原物件（玩家記住的位置不變）；點到複本 = 點到原物件（同一個單字）。
// 複本 id 是 `<原 id>#<n>`，和原物件一起存在 content/layouts/<scene>.json。純函式。
import { MAX_TILT, createRng } from './layout.mjs';

export const COPY_SEP = '#';

/** 複本 id → 原物件 id；不是複本回傳 null */
export const copyOf = (id) => {
  const i = id.indexOf(COPY_SEP);
  return i > 0 ? id.slice(0, i) : null;
};

const GAP = 8;
const EDGE = 30; // 地上的複本離區域左右邊至少這麼多
const LEVEL_TOLERANCE = 2;
const SURFACE_FILL = 0.9; // 檯面上物件（含原物件）最多佔檯面寬度的比例
const MAX_PER_ITEM = 4;
const GROUND_COPIES = 2; // 地上的物品每個最多再放幾份（左右各一）
const GROUND_JITTER = [-6, 10]; // 地上複本底線的前後錯開
// 地上能重複的：可以有好幾個的東西。設施（櫃台、提款機）、交通工具多半一個場景只有一個
const GROUND_CATEGORIES = new Set(['道具', '食物', '植物', '自然']);
const GROUND_SIZES = new Set(['small', 'medium']);
const FIXTURE_TOP = 40;
// 空著時可以借同一區商品來擺的家具（門面、布告欄、地毯不是放東西的檯面）
const STOCKABLE = new Set(['shelf', 'stand', 'counter', 'desk', 'cabinet', 'display', 'cloth-table', 'platform']); // 家具畫在檯面上方的部分（3/4 俯視的檯面頂）

function overlaps(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

const inside = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/**
 * 地形限制（和 site-plan.mjs 的檢查一致）：不擋走道、不進泳池與車道；原物件被限定在某塊地形裡的，複本也要在裡面。
 * @returns {(box: { x: number, y: number, w: number, h: number }, of: string, zoneId: string) => boolean}
 */
export function siteAllows(terrain) {
  if (!terrain) return () => true;
  const zones = new Map(terrain.zones.map((z) => [z.id, z]));
  return (box, of, zoneId) => {
    const z = zones.get(zoneId);
    if (!z) return true;
    const p = { x: box.x + box.w / 2, y: box.y + box.h };
    if (z.pool && overlaps(box, { x: z.pool.x0, y: z.pool.y0, w: z.pool.x1 - z.pool.x0, h: z.pool.y1 - z.pool.y0 })) return false;
    for (const band of [z.road, z.track]) if (band && p.y >= band.y0 && p.y <= band.y1) return false;
    const details = z.details ?? [];
    if (details.some((f) => f.kind === 'path' && inside(p, f))) return false;
    const homes = details.filter((f) => f.items?.includes(of));
    return !homes.length || homes.some((f) => inside(p, f));
  };
}

// 檯面上的空位：扣掉和這一層高度範圍重疊的所有東西
function freeIntervals(a, b, blocked) {
  let free = [[a, b]];
  for (const [s, e] of blocked) {
    free = free.flatMap(([x, y]) => (e <= x || s >= y ? [[x, y]] : [[x, s], [e, y]].filter(([u, v]) => v > u)));
  }
  return free;
}

/**
 * @param {{ sceneId: string,
 *           zones: Array<{ id: string, x0: number, y0: number, x1: number, y1: number }>,
 *           items: Array<{ id: string, zone: string, category: string, sizeHint: string }>,
 *           placements: Array<{ id: string, x: number, y: number, w: number, h: number, rotate?: number, flip?: boolean, depth?: number }>,
 *           surfaces?: Array<{ look?: string, zone: string, x0: number, x1: number, levels: number[], base: number }>,
 *           obstacles?: Array<{ x: number, y: number, w: number, h: number }>,
 *           exclude?: Set<string>, allows?: (box: object, of: string, zoneId: string) => boolean, maxRatio?: number }} input
 *   placements：原物件（鎖定的位置）；obstacles：其他場景的物件與已經存在的複本；exclude：不複製的物件（會動的、牆上的）
 * @returns {Array<{ id: string, of: string, x: number, y: number, w: number, h: number, rotate: number, flip: boolean, depth?: number }>}
 */
export function fillCopies({ sceneId, zones, items, placements, surfaces = [], obstacles = [], exclude = new Set(), allows = () => true, maxRatio = 1 }) {
  const rng = createRng(`${sceneId}:copies`);
  const itemOf = new Map(items.map((it) => [it.id, it]));
  const zoneOf = new Map(zones.map((z) => [z.id, z]));
  const boxes = [...placements, ...obstacles].map(({ x, y, w, h }) => ({ x, y, w, h }));
  const fixtureBoxes = surfaces.map((s) => {
    const top = Math.min(...s.levels) - FIXTURE_TOP;
    return { x: s.x0, y: top, w: s.x1 - s.x0, h: Math.max(1, s.base - top) };
  });
  const count = new Map();
  const nextId = (of) => {
    const n = (count.get(of) ?? 0) + 1;
    count.set(of, n);
    return `${of}${COPY_SEP}${n + 1}`;
  };
  // 已經有的複本編號往後接
  for (const o of obstacles) {
    const of = o.id && copyOf(o.id);
    if (of) count.set(of, Math.max(count.get(of) ?? 0, Number(o.id.slice(of.length + 1)) - 1));
  }
  const budget = Math.floor(items.length * maxRatio);
  const out = [];
  const copiesOf = (id) => out.filter((c) => c.of === id).length;
  const canCopy = (p) => itemOf.has(p.id) && !exclude.has(p.id) && copiesOf(p.id) < MAX_PER_ITEM && out.length < budget;
  const add = (p, box, extra) => {
    const c = { id: nextId(p.id), of: p.id, ...box, ...extra };
    out.push(c);
    boxes.push(box);
    return c;
  };

  // 1. 檯面：每一層用這一層上已有的物品補到 SURFACE_FILL，複本挨著最近的原物件（同一組情境）；
  //    空著的檯面用同一區其他檯面上的小東西補（同一區的貨架商品）
  const levels = surfaces.flatMap((s) => s.levels.map((level) => ({ s, level, residents: placements.filter((p) => Math.abs(p.y + p.h - level) <= LEVEL_TOLERANCE
    && p.x + p.w / 2 >= s.x0 && p.x + p.w / 2 <= s.x1 && itemOf.get(p.id)?.zone === s.zone) })));
  const onSurface = new Set(levels.flatMap((l) => l.residents.map((p) => p.id)));
  const shelfGoods = (zoneId) => placements.filter((p) => onSurface.has(p.id) && itemOf.get(p.id).zone === zoneId && itemOf.get(p.id).sizeHint === 'small');
  for (const { s, level, residents } of levels) {
    const own = residents.filter((p) => !exclude.has(p.id));
    const borrowed = residents.length || !STOCKABLE.has(s.look) ? [] : shelfGoods(s.zone).filter((p) => !exclude.has(p.id));
    const pool = own.length ? own : borrowed;
    if (!pool.length) continue;
    const tallest = Math.max(...pool.map((p) => p.h));
    // 上一層的層板到這一層的距離 = 這一層放得下的高度（借來的東西太高就不放）
    const headroom = Math.min(...s.levels.filter((l) => l < level).map((l) => level - l + LEVEL_TOLERANCE), Infinity);
    const blocked = boxes.filter((b) => b.y < level && b.y + b.h > level - tallest).map((b) => [b.x - GAP / 2, b.x + b.w + GAP / 2]).sort((p, q) => p[0] - q[0]);
    let used = residents.reduce((t, p) => t + p.w, 0);
    const limit = (s.x1 - s.x0) * SURFACE_FILL;
    for (const [a, b] of freeIntervals(s.x0 + 6, s.x1 - 6, blocked)) {
      let cursor = a;
      for (;;) {
        const mid = cursor;
        const fits = pool.filter((p) => canCopy(p) && cursor + p.w <= b && used + p.w <= limit && (own.length || p.h <= headroom))
          .sort((p, q) => Math.abs(p.x + p.w / 2 - mid) - Math.abs(q.x + q.w / 2 - mid));
        const p = fits[0];
        if (!p) break;
        const box = { x: Math.round(cursor), y: level - p.h, w: p.w, h: p.h };
        if (boxes.some((o) => overlaps(box, o)) || !allows(box, p.id, s.zone)) { cursor += 10; continue; }
        // 借來的東西沒有自己的深度：跟著這件家具（底座落地的 y），畫在家具前面
        const depth = own.length ? p.depth : s.base + 0.5;
        add(p, box, { rotate: 0, flip: rng() < 0.5, ...(depth === undefined ? {} : { depth }) });
        used += p.w;
        cursor += p.w + GAP;
      }
    }
  }

  // 2. 地上：可以有好幾個的小東西，左右挨著原物件再放幾份（大小相同、底線前後錯開一點）
  const ground = placements.filter((p) => {
    const it = itemOf.get(p.id);
    return it && !onSurface.has(p.id) && GROUND_CATEGORIES.has(it.category) && GROUND_SIZES.has(it.sizeHint);
  });
  for (const p of ground) {
    const zone = zoneOf.get(itemOf.get(p.id).zone);
    if (!zone) continue;
    const first = rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < GROUND_COPIES; k++) {
      if (!canCopy(p)) break;
      const side = k % 2 === 0 ? first : -first;
      const dy = Math.round(GROUND_JITTER[0] + rng() * (GROUND_JITTER[1] - GROUND_JITTER[0]));
      const x = side < 0 ? p.x - GAP - p.w : p.x + p.w + GAP;
      const box = { x: Math.round(x), y: p.y + dy, w: p.w, h: p.h };
      const bottom = box.y + box.h;
      if (box.x < zone.x0 + EDGE || box.x + box.w > zone.x1 - EDGE || bottom < zone.y0 || bottom > zone.y1) continue;
      if ([...boxes, ...fixtureBoxes].some((o) => overlaps(box, o)) || !allows(box, p.id, zone.id)) continue;
      const rotate = p.rotate ? Math.round((rng() * 2 - 1) * MAX_TILT) : 0;
      add(p, box, { rotate, flip: rng() < 0.5 });
    }
  }
  return out;
}
