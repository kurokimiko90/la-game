// 場景自動擺放：小鎮是一張 2D 地圖（3/4 俯視地面 + 正面直立的物件），每個區域（zone）是一塊矩形。
// - 地帶（band）：區域內可以放東西的範圍（地面、水面、天空、檯面），y 指物件底線；預設 = 整個區域
// - 每個物件抽幾個候選位置，取和別人重疊最少的；群組成員圍在主體旁邊
// - 驗收：每個物件至少露出 MIN_VISIBLE（連其他場景的物件一起算），底線不出區域；沒過就換 seed 重排
// 規範見 docs/scene-standard.md。產出寫進 content/layouts/<scene>.json 後就鎖定，可以手改。

// 物件最長邊（地圖單位，乘上地帶縮放前）
export const BASE_SIZE = { small: 80, medium: 130, large: 200 };

export const ZONE_MARGIN = 30;
export const MIN_VISIBLE = 0.6;
export const MAX_TILT = 20;

const CANDIDATES = 24;
const MAX_ATTEMPTS = 20;
const SCALE_JITTER = 0.16; // ±8%
const CLUSTER_SPREAD = 0.6;
const CLUSTER_DEPTH = [-10, 45];
const HOST_OVERLAP_WEIGHT = 0.4;
const ZONE_BOTTOM_EDGE = 10;

// mulberry32：同一個 seed 每次產生同樣的擺放
export function createRng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function itemSize(viewBox, sizeHint, scale) {
  const [, , vw, vh] = viewBox;
  const longest = (BASE_SIZE[sizeHint] || BASE_SIZE.medium) * scale;
  const ratio = longest / Math.max(vw, vh);
  return { w: Math.round(vw * ratio), h: Math.round(vh * ratio) };
}

/**
 * 地帶在某個區域內的實際範圍（地帶的 x0/x1/top/bottom 與區域取交集；override 針對單一區域）。
 * 地帶限定了別的區域，或和這個區域沒有交集時回傳 null。
 * @param {object} bands
 * @param {string} name
 * @param {{ id: string, x0: number, y0: number, x1: number, y1: number }} zone
 */
export function resolveBand(bands, name, zone) {
  const band = bands[name];
  if (!band) throw new Error(`沒有地帶 ${name}`);
  if (band.zones && !band.zones.includes(zone.id)) return null;
  const o = band.override?.[zone.id] ?? {};
  const pick = (key) => o[key] ?? band[key];
  const inset = band.inset ?? ZONE_MARGIN;
  const levels = pick('levels') ?? null;
  const r = {
    x0: Math.max(zone.x0 + inset, pick('x0') ?? -Infinity),
    x1: Math.min(zone.x1 - inset, pick('x1') ?? Infinity),
    top: levels ? Math.min(...levels) : Math.max(zone.y0 + inset, pick('top') ?? -Infinity),
    bottom: levels ? Math.max(...levels) : Math.min(zone.y1 - ZONE_BOTTOM_EDGE, pick('bottom') ?? Infinity),
    gaps: pick('gaps') ?? [],
    levels,
    scale: band.scale ?? [1, 1],
    layer: band.layer ?? 2,
    float: band.float ?? 0,
  };
  return r.x1 > r.x0 && r.bottom >= r.top ? r : null;
}

// 地帶扣掉 gaps 之後的可用區段
function segmentsOf(band) {
  let segs = [[band.top, band.bottom]];
  for (const [g0, g1] of band.gaps) {
    segs = segs.flatMap(([a, b]) => {
      if (g1 <= a || g0 >= b) return [[a, b]];
      return [[a, g0], [g1, b]].filter(([s, e]) => e > s);
    });
  }
  return segs;
}

// t ∈ [0,1) → 地帶內的底線 y（levels 取其中一層）
function pickBottom(band, t) {
  if (band.levels) return band.levels[Math.min(band.levels.length - 1, Math.floor(t * band.levels.length))];
  const segs = segmentsOf(band);
  let left = t * segs.reduce((n, [a, b]) => n + (b - a), 0);
  for (const [a, b] of segs) {
    if (left <= b - a) return Math.round(a + left);
    left -= b - a;
  }
  return segs.at(-1)[1];
}

function clampBottom(band, y) {
  if (band.levels) return band.levels.reduce((best, l) => (Math.abs(l - y) < Math.abs(best - y) ? l : best));
  const segs = segmentsOf(band);
  if (segs.some(([a, b]) => y >= a && y <= b)) return Math.round(y);
  return segs.flat().reduce((best, e) => (Math.abs(e - y) < Math.abs(best - y) ? e : best));
}

function scaleAt(band, y) {
  const [s0, s1] = band.scale;
  const span = band.bottom - band.top;
  return span > 0 ? s0 + (s1 - s0) * ((y - band.top) / span) : s0;
}

const area = (b) => b.w * b.h;
function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** box 沒被 covers 擋住的比例（外框估算，12×12 取樣） */
export function visibleRatio(box, covers) {
  const N = 12;
  let visible = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const px = box.x + ((i + 0.5) / N) * box.w;
      const py = box.y + ((j + 0.5) / N) * box.h;
      if (!covers.some((c) => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h)) visible++;
    }
  }
  return visible / (N * N);
}

const drawOrder = (a, b) => a.layer - b.layer || (a.y + a.h) - (b.y + b.h);

// 每個物件的可見比例（只算畫在它後面、也就是蓋在它上面的物件）
function visibility(placements) {
  const ordered = [...placements].sort(drawOrder);
  return ordered.map((p, i) => {
    const covers = ordered.slice(i + 1).filter((c) => overlapArea(p, c) > 0);
    return { p, ratio: visibleRatio(p, covers), covers };
  });
}

// 放置順序：主體和大物件先放，群組成員在主體之後
function placementOrder(zoneItems, hostOf) {
  const bySize = [...zoneItems].sort((a, b) => (BASE_SIZE[b.sizeHint] || 0) - (BASE_SIZE[a.sizeHint] || 0));
  return [...bySize.filter((it) => !hostOf.has(it.id)), ...bySize.filter((it) => hostOf.has(it.id))];
}

function candidate(item, band, host, rng) {
  const y = host && !band.levels
    ? clampBottom(band, host.y + host.h + CLUSTER_DEPTH[0] + rng() * (CLUSTER_DEPTH[1] - CLUSTER_DEPTH[0]))
    : pickBottom(band, rng());
  const scale = scaleAt(band, y) * (1 + (rng() - 0.5) * SCALE_JITTER);
  const { w, h } = itemSize(item.viewBox, item.sizeHint, scale);
  const room = band.x1 - band.x0 - w;
  let x = host
    ? host.x + host.w / 2 + (rng() * 2 - 1) * (host.w * CLUSTER_SPREAD + w) - w / 2
    : band.x0 + rng() * Math.max(0, room);
  x = Math.round(Math.min(Math.max(x, band.x0), band.x0 + Math.max(0, room)));
  return { x, y: y - h, w, h };
}

function score(box, placed, host) {
  let s = 0;
  for (const p of placed) {
    // 成員可以疊在主體前面，但不要整個蓋住它（主體很窄時，例如公車站牌）
    s += (overlapArea(box, p) / Math.min(area(box), area(p))) * (p === host ? HOST_OVERLAP_WEIGHT : 1);
  }
  if (host) s += Math.abs(box.x + box.w / 2 - (host.x + host.w / 2)) / (host.w * 4);
  return s;
}

function bandFor(bands, place, item, zone) {
  const band = resolveBand(bands, place[item.id] ?? 'ground', zone) ?? resolveBand(bands, 'ground', zone);
  if (!band) throw new Error(`${item.id}：區域 ${zone.id} 沒有可以放的地面`);
  return band;
}

function layoutZone({ sceneId, zone, zoneItems, bands, place, hostOf, loose, noFlip, locked, others, attempt }) {
  const rng = createRng(`${sceneId}:${zone.id}${attempt ? `#${attempt}` : ''}`);
  const placed = others.map((p) => ({ ...p, fixed: true, other: true }));
  const byId = new Map();

  for (const item of zoneItems.filter((it) => locked[it.id])) {
    const { x, y, w, h, rotate = 0, flip = false } = locked[item.id];
    const band = bandFor(bands, place, item, zone);
    const p = { id: item.id, x, y, w, h, rotate, flip, layer: band.layer, float: band.float, fixed: true };
    placed.push(p);
    byId.set(item.id, p);
  }

  for (const item of placementOrder(zoneItems.filter((it) => !locked[it.id]), hostOf)) {
    const band = bandFor(bands, place, item, zone);
    const hostBox = byId.get(hostOf.get(item.id));
    const host = hostBox && hostBox.layer === band.layer ? hostBox : null;
    let best = null;
    for (let k = 0; k < CANDIDATES; k++) {
      const box = candidate(item, band, host, rng);
      const s = score(box, placed, host);
      if (!best || s < best.s) best = { box, s };
    }
    const rotate = loose.has(item.id) ? Math.round((rng() * 2 - 1) * MAX_TILT) : 0;
    const flip = noFlip.has(item.id) ? false : rng() < 0.5;
    const p = { id: item.id, ...best.box, rotate, flip, layer: band.layer, float: band.float, fixed: false };
    placed.push(p);
    byId.set(item.id, p);
  }

  // 新放的物件被擋太多，或新物件擋到別人太多 → 這次失敗（鎖定物件彼此的問題由 checkLayout 回報）
  const failing = visibility(placed).filter(({ p, ratio, covers }) => ratio < MIN_VISIBLE && (!p.fixed || covers.some((c) => !c.fixed)));
  return { placed: placed.filter((p) => !p.other), failing };
}

/**
 * @param {{ sceneId: string, zones: Array<{ id: string, x0: number, y0: number, x1: number, y1: number }>,
 *           items: Array<{ id: string, zone: string, sizeHint: string, viewBox: number[] }>,
 *           bands?: object, place?: Record<string, string>, clusters?: string[][], loose?: string[], noFlip?: string[],
 *           locked?: Record<string, { x: number, y: number, w: number, h: number, rotate?: number, flip?: boolean }>,
 *           obstacles?: Array<{ x: number, y: number, w: number, h: number, layer: number }> }} input
 *   obstacles：其他場景已經擺好的物件（地圖座標），會避開並一起檢查可見比例
 * @returns {Array<{ id: string, x: number, y: number, w: number, h: number, rotate: number, flip: boolean, layer: number, float: number }>} 繪製順序
 */
export function layoutScene({ sceneId, zones, items, bands = { ground: {} }, place = {}, clusters = [], loose = [], noFlip = [], locked = {}, obstacles = [] }) {
  const hostOf = new Map(clusters.flatMap(([host, ...members]) => members.map((m) => [m, host])));
  const looseSet = new Set(loose);
  const noFlipSet = new Set(noFlip);
  const result = [];

  for (const zone of zones) {
    const zoneItems = items.filter((it) => it.zone === zone.id);
    const others = [...obstacles, ...result];
    let last = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      last = layoutZone({ sceneId, zone, zoneItems, bands, place, hostOf, loose: looseSet, noFlip: noFlipSet, locked, others, attempt });
      if (!last.failing.length) break;
    }
    if (last.failing.length) {
      const list = last.failing.map(({ p, ratio }) => `${p.id}（露出 ${Math.round(ratio * 100)}%）`).join('、');
      throw new Error(`${sceneId}/${zone.id}：試了 ${MAX_ATTEMPTS} 次仍有物件被擋太多：${list}`);
    }
    result.push(...last.placed.map(({ id, x, y, w, h, rotate, flip, layer, float }) => ({ id, x, y, w, h, rotate, flip, layer, float })));
  }
  return result.sort(drawOrder);
}

/**
 * 檢查擺放（含手改過的鎖定檔）：物件左右不出區域、底線在區域內、每個物件至少露出 MIN_VISIBLE。
 * obstacles：其他場景的物件，一起算遮擋。
 * @returns {string[]} 問題清單，空陣列 = 通過
 */
export function checkLayout({ zones, items, placements, obstacles = [] }) {
  const problems = [];
  const zoneOf = new Map(items.map((it) => [it.id, it.zone]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  for (const p of placements) {
    const z = zoneById.get(zoneOf.get(p.id));
    if (!z) { problems.push(`${p.id}：沒有區域 ${zoneOf.get(p.id)}`); continue; }
    const b = p.y + p.h;
    if (p.x < z.x0 || p.x + p.w > z.x1 || b < z.y0 || b > z.y1) {
      problems.push(`${p.id}：超出區域 ${z.id}（x ${p.x}–${p.x + p.w}、底線 ${b}；區域 x ${z.x0}–${z.x1}、y ${z.y0}–${z.y1}）`);
    }
  }
  const own = new Set(placements.map((p) => p.id));
  for (const { p, ratio } of visibility([...placements, ...obstacles.map((o) => ({ ...o, other: true }))])) {
    if (!p.other && own.has(p.id) && ratio < MIN_VISIBLE) problems.push(`${p.id}：只露出 ${Math.round(ratio * 100)}%（至少 ${MIN_VISIBLE * 100}%）`);
  }
  return problems;
}
