// 店面分節與店內業態（純函式）。移植自 Ginza 專案 web/shop-layout.js、web/shop-types.js（2026-10-11 版）。
// 分節與業態都是程序化示意，不代表實際租戶或入口位置；陳列是同業態的典型擺放。

export interface ShopBay {
  start: number;
  end: number;
  /** 店面框架圖樣 0–7 */
  variant: number;
}

function fnv(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** 牆面按約 5.5 m 切成店面分節 */
export function shopBays(length: number, seed: string): ShopBay[] {
  if (!Number.isFinite(length) || length < 2.5) return [];
  const count = Math.max(1, Math.round(length / 5.5));
  const width = length / count;
  const h = fnv(seed);
  return Array.from({ length: count }, (_, i) => ({ start: i * width, end: (i + 1) * width, variant: (h + i * 3) % 8 }));
}

export const INTERIOR_TYPES = [
  'fashion', 'jewelry', 'sweets', 'cafe', 'dining', 'cosmetics',
  'books', 'gallery', 'convenience', 'goods', 'service', 'salon',
] as const;
export type InteriorType = (typeof INTERIOR_TYPES)[number];

const CATEGORY: Record<InteriorType, string[]> = {
  fashion: ['clothes', 'boutique', 'shoes', 'bag', 'fashion', 'fashion_accessories', 'sports', 'mall', 'department_store', 'yes', 'shop'],
  jewelry: ['jewelry', 'watches', 'optician'],
  sweets: ['confectionery', 'bakery', 'pastry', 'deli', 'ice_cream', 'tea', 'coffee', 'chocolate', 'seafood', 'butcher', 'alcohol', 'wine'],
  cafe: ['cafe', 'fast_food'],
  dining: ['restaurant', 'pub', 'bar', 'biergarten'],
  cosmetics: ['beauty', 'cosmetics', 'perfumery', 'chemist'],
  books: ['books', 'stationery'],
  gallery: ['gallery', 'art', 'museum', 'arts_centre', 'antiques', 'theatre', 'cinema'],
  convenience: ['convenience', 'supermarket', 'variety_store', 'pharmacy', 'mobile_phone', 'electronics'],
  goods: ['gift', 'houseware', 'knives', 'camera', 'florist', 'interior_decoration', 'kitchen', 'craft', 'tobacco'],
  service: ['bank', 'travel_agency', 'hotel', 'estate_agent', 'massage'],
  salon: ['hairdresser', 'beauty_salon'],
};
const LOOKUP = new Map(Object.entries(CATEGORY).flatMap(([type, cats]) => cats.map((c) => [c, type as InteriorType])));

// 沒有店家點位的分節按銀座低層臨街業態的大致比例抽樣（目測估計，非統計資料）
const FALLBACK: [InteriorType, number][] = [['fashion', 30], ['cafe', 14], ['jewelry', 11], ['sweets', 10], ['goods', 10],
  ['cosmetics', 8], ['dining', 8], ['gallery', 4], ['books', 3], ['service', 2]];
const FALLBACK_TOTAL = FALLBACK.reduce((sum, [, w]) => sum + w, 0);

export function interiorTypeFor(category: string | null, seed: string): InteriorType {
  const known = category ? LOOKUP.get(category.toLowerCase()) : undefined;
  if (known) return known;
  let pick = (fnv(seed) / 4294967296) * FALLBACK_TOTAL;
  for (const [type, weight] of FALLBACK) {
    pick -= weight;
    if (pick < 0) return type;
  }
  return FALLBACK[0][0];
}

export interface ShopSign { kind?: string; cat?: string; x: number; z: number; nx?: number; nz?: number }

/** 分節中心附近、朝向一致的店家招牌分類；找不到回傳 null */
export function nearestShopCategory(signs: readonly ShopSign[], x: number, z: number, nx: number, nz: number, maxDistance = 6): string | null {
  let best: string | null = null, bestDistance = maxDistance;
  for (const s of signs) {
    if (s.kind === 'crown' || !s.cat) continue;
    if ((s.nx ?? 0) * nx + (s.nz ?? 0) * nz < 0.7) continue;
    const distance = Math.hypot(s.x - x, s.z - z);
    if (distance < bestDistance) { best = s.cat; bestDistance = distance; }
  }
  return best;
}

export interface ShopRoom { type: InteriorType; width: number; from: number; to: number }

/** 相鄰同業態分節合併成一間店：每個分節記錄它在店內的起訖（公尺），側牆只出現在店的兩端 */
export function shopRooms(bays: readonly ShopBay[], types: readonly InteriorType[]): ShopRoom[] {
  const rooms: ShopRoom[] = [];
  for (let i = 0; i < bays.length;) {
    let j = i;
    while (j + 1 < bays.length && types[j + 1] === types[i]) j++;
    const start = bays[i].start, width = bays[j].end - start;
    for (let k = i; k <= j; k++) rooms.push({ type: types[i], width, from: bays[k].start - start, to: bays[k].end - start });
    i = j + 1;
  }
  return rooms;
}
