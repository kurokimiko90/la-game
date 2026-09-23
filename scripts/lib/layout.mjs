// 場景自動擺放：小鎮是一張 2D 地圖（3/4 俯視地面 + 正面直立的物件），每個區域（zone）是一塊矩形。
// - 地帶（band）：區域內可以放東西的範圍（地面、水面、天空、檯面），y 指物件底線；預設 = 整個區域
// - 錨點（rows / spots）：有擺放邏輯的物件（沿步道、貼門面、排在檯面上）底線中心落在指定點，不抖動
// - 自動排列（arrange: "auto"，自動擴展的街區用）：依地形和物件大小自動算出錨點，見 autoAnchors
// - 其他物件抽幾個候選位置，取和別人重疊最少的；群組成員圍在主體旁邊
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

// 繪製順序：先依 layer，同層依深度（預設 = 底線；放在檯面上的東西用宿主的深度，見 staging.mjs）
export const depthOf = (p) => p.depth ?? p.y + p.h;
const drawOrder = (a, b) => a.layer - b.layer || depthOf(a) - depthOf(b);

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

function pointAlong(points, t) {
  if (points.length === 1) return points[0];
  const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let left = t * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, left / lens[i]) : 0;
      const [a, b] = [points[i], points[i + 1]];
      return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k)];
    }
    left -= lens[i];
  }
  return points.at(-1);
}

/**
 * 錨點 → 每個物件的底線中心。rows：沿折線依長度等距排，第 i 個在 t = (i + 0.5) / n（null 佔位留空）；spots：直接給點。
 * @param {Array<{ points: number[][], items: Array<string | null> }>} rows
 * @param {Record<string, number[]>} spots
 * @returns {Map<string, number[]>}
 */
export function anchorPoints(rows = [], spots = {}) {
  const out = new Map();
  for (const { points, items } of rows) {
    items.forEach((id, i) => { if (id) out.set(id, pointAlong(points, (i + 0.5) / items.length)); });
  }
  for (const [id, p] of Object.entries(spots)) out.set(id, p);
  return out;
}

// 錨點：[x, y]（rows / spots，縮放照地帶）或 { x, y, scale, tilt }（情境擺放算好的縮放）
function anchoredBox(item, band, anchor) {
  const [ax, ay] = Array.isArray(anchor) ? anchor : [anchor.x, anchor.y];
  const { w, h } = itemSize(item.viewBox, item.sizeHint, Array.isArray(anchor) ? scaleAt(band, ay) : anchor.scale);
  return { x: Math.round(ax - w / 2), y: Math.round(ay - h), w, h };
}

// ---- 自動排列 ----
// 檯面、牆腳、軌道、車道：各自一排等距排開；地面依大小分排（大的在後）；牆上的掛件最後排，避開擋在它前面的東西。
// 每一排都只用「沒被已排物件擋住」的 x 區段（只看上下有重疊的物件），所以牆腳設備和後排大物件會交錯。
// 散落小物也排（保留傾斜）；群組成員排在主體那一排、緊接在主體後面。水上、天空的物件照舊隨機。
// 成員比主體大的群組不算（例如登機梯圍著拖車會把拖車蓋住），成員照一般物件排；主體已鎖定時成員照舊圍著它隨機放。
const TIERS = ['large', 'medium', 'small'];
const ROW_FILL = 1.1; // 一排物件總寬 × 這個倍數要放得下，否則換行
const GROUP_GAP = 6; // 群組裡物件之間的距離

const isWall = (name) => name === 'wall' || name.startsWith('wall-');

// [a, b] 扣掉 blocked 裡的區段
function freeIntervals(a, b, blocked) {
  let free = [[a, b]];
  for (const [s, e] of blocked) {
    free = free.flatMap(([x, y]) => (e <= x || s >= y ? [[x, y]] : [[x, s], [e, y]].filter(([u, v]) => v > u)));
  }
  return free;
}

// n 個寬度 widths 的物件分到 intervals：每段依「放得下幾個」（用最寬的物件估）分配，數量和長度成比例，段內等距。放不下回傳 null
function spreadOver(intervals, widths) {
  const n = widths.length;
  const maxW = Math.max(...widths);
  const usable = intervals.map(([a, b]) => ({ a, b, cap: Math.floor((b - a) / maxW), k: 0 })).filter((u) => u.cap > 0);
  if (usable.reduce((t, u) => t + u.cap, 0) < n) return null;
  const total = usable.reduce((t, u) => t + u.b - u.a, 0);
  for (const u of usable) u.k = Math.min(u.cap, Math.floor((n * (u.b - u.a)) / total));
  let left = n - usable.reduce((t, u) => t + u.k, 0);
  while (left > 0) {
    const u = usable.filter((v) => v.k < v.cap).sort((p, q) => (q.b - q.a) / (q.k + 1) - (p.b - p.a) / (p.k + 1))[0];
    u.k++;
    left--;
  }
  return usable.flatMap(({ a, b, k }) => Array.from({ length: k }, (_, j) => a + ((j + 0.5) * (b - a)) / k));
}

// 一排物件：先試只用沒被擋的區段，不行就用整段
// 一排物件群（每群 = 主體 + 成員，群內緊貼、群和群等距）。
// 依序試：整群排進沒被擋的空隙 → 拆成單件排進空隙 → 整群均分整段
function placeRow(groups, band, y, boxes, out) {
  const size = (it) => ({ it, ...itemSize(it.viewBox, it.sizeHint, scaleAt(band, y)) });
  const top = y - Math.max(...groups.flat().map((it) => size(it).h));
  const blocked = boxes.filter((b) => b.y < y && b.y + b.h > top).map((b) => [b.x, b.x + b.w]).sort((p, q) => p[0] - q[0]);
  const free = freeIntervals(band.x0, band.x1, blocked);
  const widthOf = (g) => g.reduce((t, s) => t + s.w, 0) + GROUP_GAP * (g.length - 1);
  const grouped = groups.map((g) => g.map(size));
  const singles = grouped.flat().map((s) => [s]);
  const attempt = (gs, intervals) => { const c = spreadOver(intervals, gs.map(widthOf)); return c && { sized: gs, centers: c }; };
  const len = band.x1 - band.x0;
  const plan = attempt(grouped, free) ?? attempt(singles, free) ?? attempt(grouped, [[band.x0, band.x1]])
    ?? { sized: singles, centers: singles.map((_, i) => band.x0 + ((i + 0.5) * len) / singles.length) };
  const { sized, centers } = plan;
  const widths = sized.map(widthOf);
  sized.forEach((g, i) => {
    let left = centers[i] - widths[i] / 2;
    for (const { it, w, h } of g) {
      const x = Math.round(left + w / 2);
      out.set(it.id, [x, y]);
      boxes.push({ x: x - w / 2, y: y - h, w, h });
      left += w + GROUP_GAP;
    }
  });
}

// 依寬度把物件群（主體 + 成員，不拆開）切成幾排
function chunkRows(groups, band, len) {
  const rows = [];
  let cur = [];
  let width = 0;
  for (const group of groups) {
    const w = group.reduce((t, it) => t + itemSize(it.viewBox, it.sizeHint, band.scale[0]).w, 0);
    if (cur.length && (width + w) * ROW_FILL > len) { rows.push(cur); cur = []; width = 0; }
    cur.push(group);
    width += w;
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/**
 * 自動排列：區域裡沒有鎖定、沒有手動錨點的物件 → 錨點（底線中心）。placed：已經在區域裡的東西（鎖定物件、其他場景），會避開。
 * @returns {Map<string, number[]>}
 */
export function autoAnchors({ zone, items, bands, place, hostOf, placed = [] }) {
  const out = new Map();
  const boxes = placed.map(({ x, y, w, h }) => ({ x, y, w, h }));
  const rank = (it) => (it ? TIERS.length - Math.max(0, TIERS.indexOf(it.sizeHint)) : Infinity);
  const byId = new Map(items.map((it) => [it.id, it]));
  const bandName = (it) => (place[it.id] && resolveBand(bands, place[it.id], zone) ? place[it.id] : 'ground');
  const followsHost = (it) => hostOf.has(it.id) && rank(it) <= rank(byId.get(hostOf.get(it.id)) ?? { sizeHint: 'large' });
  // 成員跟著主體排（同一個地帶才跟；主體不在這次要排的物件裡 → 不排，照舊圍著主體隨機）
  const followers = new Map();
  for (const it of items.filter(followsHost)) {
    const host = byId.get(hostOf.get(it.id));
    if (host && bandName(host) === bandName(it)) followers.set(host.id, [...(followers.get(host.id) ?? []), it]);
  }
  const groupOf = (it) => [it, ...(followers.get(it.id) ?? [])];
  const byBand = new Map();
  for (const it of items) {
    if (followsHost(it)) continue;
    byBand.set(bandName(it), [...(byBand.get(bandName(it)) ?? []), groupOf(it)]);
  }
  const bandOf = (name) => resolveBand(bands, name, zone);
  const others = [...byBand.keys()].filter((n) => n !== 'ground' && !isWall(n));

  // 1. 有層的地帶（檯面、牆腳、軌道）和車道：分到各層，每層等距
  for (const name of others) {
    const band = bandOf(name);
    const list = byBand.get(name);
    if (band.layer !== 2 && !band.levels) continue; // 水上、天空：隨機
    const levels = band.levels ?? [band.bottom];
    const per = Math.ceil(list.length / levels.length);
    levels.forEach((y, k) => { const row = list.slice(k * per, (k + 1) * per); if (row.length) placeRow(row, band, y, boxes, out); });
  }

  // 2. 地面：大 → 中 → 小，由後往前一排一排
  const ground = byBand.get('ground');
  if (ground) {
    const band = bandOf('ground');
    const tier = (it) => Math.max(0, TIERS.indexOf(it.sizeHint));
    const inTier = (t) => ([it]) => tier(it) === t || (t === 1 && !TIERS.includes(it.sizeHint));
    const rows = TIERS.flatMap((_, t) => chunkRows(ground.filter(inTier(t)), band, band.x1 - band.x0));
    rows.forEach((row, i) => placeRow(row, band, pickBottom(band, (i + 0.5) / rows.length), boxes, out));
  }

  // 3. 牆上的掛件最後排，避開前面的東西
  for (const name of [...byBand.keys()].filter(isWall)) {
    const band = bandOf(name);
    for (const y of band.levels ?? [band.bottom]) placeRow(byBand.get(name), band, y, boxes, out);
  }
  return out;
}

function bandFor(bands, place, item, zone) {
  const band = resolveBand(bands, place[item.id] ?? 'ground', zone) ?? resolveBand(bands, 'ground', zone);
  if (!band) throw new Error(`${item.id}：區域 ${zone.id} 沒有可以放的地面`);
  return band;
}

function layoutZone({ sceneId, zone, zoneItems, bands, place, hostOf, loose, noFlip, locked, anchors, others, attempt }) {
  const rng = createRng(`${sceneId}:${zone.id}${attempt ? `#${attempt}` : ''}`);
  const placed = others.map((p) => ({ ...p, fixed: true, other: true }));
  const byId = new Map();

  for (const item of zoneItems.filter((it) => locked[it.id])) {
    const { x, y, w, h, rotate = 0, flip = false, depth } = locked[item.id];
    const band = bandFor(bands, place, item, zone);
    const p = { id: item.id, x, y, w, h, rotate, flip, layer: band.layer, float: band.float, fixed: true, ...(depth === undefined ? {} : { depth }) };
    placed.push(p);
    byId.set(item.id, p);
  }

  // 錨點物件先放（位置固定），其他物件照順序抽候選位置
  const free = zoneItems.filter((it) => !locked[it.id]);
  const ordered = [...free.filter((it) => anchors.has(it.id)), ...placementOrder(free.filter((it) => !anchors.has(it.id)), hostOf)];
  for (const item of ordered) {
    const band = bandFor(bands, place, item, zone);
    let best = null;
    if (anchors.has(item.id)) {
      best = { box: anchoredBox(item, band, anchors.get(item.id)) };
    } else {
      const hostBox = byId.get(hostOf.get(item.id));
      const host = hostBox && hostBox.layer === band.layer ? hostBox : null;
      for (let k = 0; k < CANDIDATES; k++) {
        const box = candidate(item, band, host, rng);
        const s = score(box, placed, host);
        if (!best || s < best.s) best = { box, s };
      }
    }
    // 情境擺放裡只有前面地上的物件可以歪倒（放在檯面上、掛在牆上的不歪）
    const anchor = anchors.get(item.id);
    const canTilt = loose.has(item.id) && (!anchor || Array.isArray(anchor) || anchor.tilt);
    const rotate = canTilt ? Math.round((rng() * 2 - 1) * MAX_TILT) : 0;
    const flip = noFlip.has(item.id) ? false : rng() < 0.5;
    const p = { id: item.id, ...best.box, rotate, flip, layer: band.layer, float: band.float, fixed: false, ...(anchor?.depth === undefined ? {} : { depth: anchor.depth }) };
    placed.push(p);
    byId.set(item.id, p);
  }

  // 新放的物件被擋太多，或新物件擋到別人太多 → 這次失敗（鎖定物件彼此的問題由 checkLayout 回報）
  const failing = visibility(placed).filter(({ p, ratio, covers }) => ratio < MIN_VISIBLE && (!p.fixed || covers.some((c) => !c.fixed)));
  return { placed: placed.filter((p) => !p.other), failing };
}

const AUTO_ROUNDS = 6;

// 自動排列一個區域：被擋太多的物件（和擋住它的自動錨點物件）改成隨機，其他的照排；最多 AUTO_ROUNDS 輪
function arrangeZone({ zone, zoneItems, sceneId, bands, place, hostOf, locked, anchors, others, tryAnchors, warnings }) {
  const inZone = (b) => b.x < zone.x1 && b.x + b.w > zone.x0 && b.y < zone.y1 && b.y + b.h > zone.y0;
  const placedBoxes = [...others.filter(inZone), ...zoneItems.filter((it) => locked[it.id]).map((it) => locked[it.id])];
  const free = zoneItems.filter((it) => !locked[it.id] && !anchors.has(it.id));
  const auto = autoAnchors({ zone, items: free, bands, place, hostOf, placed: placedBoxes });
  const dropped = [];
  let last = null;
  for (let round = 0; round < AUTO_ROUNDS; round++) {
    last = tryAnchors(new Map([...anchors, ...auto]));
    if (!last.failing.length) break;
    const drop = last.failing.flatMap(({ p, covers }) => [p.id, ...covers.map((c) => c.id)]).filter((id) => auto.has(id));
    if (!drop.length) break;
    for (const id of new Set(drop)) { auto.delete(id); dropped.push(id); }
  }
  if (dropped.length && !last.failing.length) warnings.push(`${sceneId}/${zone.id}：${dropped.join('、')} 排不進整齊的位置，改用隨機`);
  return last;
}

/**
 * @param {{ sceneId: string, zones: Array<{ id: string, x0: number, y0: number, x1: number, y1: number }>,
 *           items: Array<{ id: string, zone: string, sizeHint: string, viewBox: number[] }>,
 *           bands?: object, place?: Record<string, string>, clusters?: string[][], loose?: string[], noFlip?: string[],
 *           rows?: Array<{ points: number[][], items: Array<string | null> }>, spots?: Record<string, number[]>, arrange?: 'auto',
 *           staged?: Map<string, { x: number, y: number, scale: number, tilt: boolean }>,
 *           locked?: Record<string, { x: number, y: number, w: number, h: number, rotate?: number, flip?: boolean }>,
 *           obstacles?: Array<{ x: number, y: number, w: number, h: number, layer: number }> }} input
 *   obstacles：其他場景已經擺好的物件（地圖座標），會避開並一起檢查可見比例
 *   warnings：自動排列退回隨機的區域會記在這裡（呼叫端印出來）
 *   staged：情境擺放（scripts/lib/staging.mjs）算好的錨點，優先於 rows / spots
 * @returns {Array<{ id: string, x: number, y: number, w: number, h: number, rotate: number, flip: boolean, layer: number, float: number }>} 繪製順序
 */
export function layoutScene({ sceneId, zones, items, bands = { ground: {} }, place = {}, clusters = [], loose = [], noFlip = [], rows = [], spots = {}, arrange, staged = new Map(), locked = {}, obstacles = [], warnings = [] }) {
  const anchors = new Map([...anchorPoints(rows, spots), ...staged]);
  const hostOf = new Map(clusters.flatMap(([host, ...members]) => members.map((m) => [m, host])));
  const looseSet = new Set(loose);
  const noFlipSet = new Set(noFlip);
  const result = [];

  for (const zone of zones) {
    const zoneItems = items.filter((it) => it.zone === zone.id);
    const others = [...obstacles, ...result];
    const tryAnchors = (zoneAnchors) => {
      let res = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        res = layoutZone({ sceneId, zone, zoneItems, bands, place, hostOf, loose: looseSet, noFlip: noFlipSet, locked, anchors: zoneAnchors, others, attempt });
        if (!res.failing.length) break;
      }
      return res;
    };
    let last = null;
    if (arrange === 'auto') last = arrangeZone({ zone, zoneItems, sceneId, bands, place, hostOf, locked, anchors, others, tryAnchors, warnings });
    // 自動排列還是排不下 → 整個區域退回隨機，不卡住自動擴展
    if (!last || last.failing.length) {
      if (last) warnings.push(`${sceneId}/${zone.id}：自動排列排不下，整區改用隨機擺放`);
      last = tryAnchors(anchors);
    }
    if (last.failing.length) {
      const list = last.failing.map(({ p, ratio, covers }) => `${p.id}（露出 ${Math.round(ratio * 100)}%，被 ${covers.map((c) => c.id).join('、')} 擋住）`).join('、');
      throw new Error(`${sceneId}/${zone.id}：試了 ${MAX_ATTEMPTS} 次仍有物件被擋太多：${list}`);
    }
    result.push(...last.placed.map(({ id, x, y, w, h, rotate, flip, layer, float, depth }) => ({ id, x, y, w, h, rotate, flip, layer, float, ...(depth === undefined ? {} : { depth }) })));
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
