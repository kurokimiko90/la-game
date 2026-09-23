// 情境擺放（staging）：把一個區域想成真實的空間，拆成幾組「情境」（掛號櫃台、候診沙發角、藥局貨架…），
// 每組有一件家具（背景畫出來、不可點）或一個當主體的物件，其他物件依它們和家具的關係擺：
//   on     放在家具檯面上（層架有兩層）；沒有家具時放在主體物件上
//   wall   掛在這組上方的牆上（室內後牆，或室外的建築門面）；over: true 時直接掛在主體正上方（抽油煙機）
//   beside 立在家具 / 主體左右兩側的地上
//   front  散在這組前面的地上（只有這裡的 loose 物件會歪倒）
// 區域的 sky：{ 物件: x 或 [x, y] 比例 }，天空的東西（飛機、雲）指定位置，免得蓋住擺好的情境。
// 座標都相對區域（x 是區域寬的比例，row 是 back / mid / front 三排），由這裡算成地圖座標，
// 所以同一份描述可以手寫、也可以由 LLM 產生。輸出：物件錨點（底線中心 + 縮放）與要畫的家具。純函式。
// 資料在 content/stages/<scene>.json，規範見 docs/scene-standard.md §2.3。
import { createRng, itemSize } from './layout.mjs';

export const ROWS = ['back', 'mid', 'front'];
export const SLOTS = ['on', 'wall', 'beside', 'front'];

// 家具：height = 檯面前緣離地高度，depth = 3/4 俯視時檯面頂的深度（畫圖用），levels = 層架的層數，
// back = 只能靠後牆，outdoor / indoor = 只能在室外 / 室內，words = 和這些單字撞名時不能用（背景不能像可點的物品）
export const FIXTURES = {
  desk: { height: 80, depth: 50, words: ['desk', 'table', 'reception desk'] },
  counter: { height: 95, depth: 50, words: ['counter', 'bar'] },
  cabinet: { height: 55, depth: 38, words: ['cabinet', 'drawer', 'dresser', 'sideboard'] },
  display: { height: 90, depth: 45, words: ['display case', 'showcase', 'glass case'] },
  shelf: { height: 55, depth: 28, levels: 2, gap: 95, back: true, indoor: true, words: ['shelf', 'bookshelf', 'bookcase', 'rack'] },
  stand: { height: 45, depth: 50, levels: 2, gap: 70, words: ['stand', 'stall'] },
  'cloth-table': { height: 75, depth: 45, words: ['table', 'tablecloth'] },
  rug: { height: 0, depth: 110, flat: true, words: ['rug', 'carpet', 'mat', 'doormat'] },
  platform: { height: 22, depth: 70, words: ['platform', 'stage', 'pallet'] },
  planter: { height: 30, depth: 40, words: ['planter', 'flower bed', 'flowerbed'] },
  board: { height: 0, depth: 0, wallOnly: true, back: true, indoor: true, words: ['bulletin board', 'corkboard', 'noticeboard', 'whiteboard', 'blackboard', 'board'] },
  facade: { height: 0, depth: 0, back: true, outdoor: true, words: ['building', 'door', 'window', 'wall'] },
};

// 各位置的縮放（乘在 BASE_SIZE 上）：檯面上、牆上的東西比地上的小一點，接近真實比例
const SLOT_SCALE = { main: 1.15, on: 0.82, wall: 0.85, beside: 1.1, front: 0.95 };
const SCALE_JITTER = 0.08; // ±4%
const MIN_FIT = 0.7; // 放不下時最多縮到 70%，再不行就允許重疊
const SIDE_GAP = 10;
const EDGE = 30; // 區域內距
const MAIN_TOP = 0.05; // 物件當主體時，檯面在它圖形實際上緣（item.top，svg-bounds.mjs）再往下 5% 的地方
const FACADE_WALL = 70; // 門面上掛件的底線，離門面底的距離
const OVER_OVERLAP = 6; // over：掛件底線壓進主體頂端一點點
const CEILING = 20; // 掛件頂端離區域上緣至少這麼多
const SKY_BOTTOM = 150; // 天空物件的底線（離區域上緣）
const SKY_SCALE = 0.75;

/**
 * 區域 → 三排的底線 y、牆上掛件的 y、可放的 x 範圍。terrain：district-kit 算好的區域地形。
 * @param {{ x0: number, y0: number, x1: number, y1: number, indoor: boolean, wallBase?: number, road?: object, track?: object, pool?: object }} tz
 */
export function zoneFrame(tz) {
  const x0 = tz.x0 + EDGE;
  const x1 = tz.pool ? tz.pool.x0 - EDGE : tz.x1 - EDGE;
  if (tz.indoor) {
    const top = tz.wallBase;
    const bottom = tz.y1 - 12;
    return { x0, x1, top, bottom, wall: top - 40, rows: { back: top + 50, mid: Math.round(top + (bottom - top) * 0.6), front: bottom - 30 } };
  }
  const top = tz.y0 + 70;
  const bottom = tz.road ? tz.road.y0 - 15 : tz.track ? tz.track.y0 - 20 : tz.y1 - 20;
  return { x0, x1, top, bottom, wall: null, rows: { back: top + 100, mid: Math.round(top + (bottom - top) * 0.55), front: bottom - 8 } };
}

// 把 n 個寬 widths 的物件自然地排在 [a, b]：間距不等（依 rng 分配），放不下就先縮小再允許重疊
function spread(a, b, widths, rng) {
  const n = widths.length;
  if (!n) return { centers: [], fit: 1 };
  const total = widths.reduce((t, w) => t + w, 0);
  const fit = Math.max(MIN_FIT, Math.min(1, (b - a) / total));
  const ws = widths.map((w) => w * fit);
  const free = Math.max(0, b - a - ws.reduce((t, w) => t + w, 0));
  const weights = Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 0.5 : 1) * (0.45 + rng()));
  const sum = weights.reduce((t, w) => t + w, 0);
  const over = Math.max(0, ws.reduce((t, w) => t + w, 0) - (b - a)) / Math.max(1, n - 1);
  let x = a + (free * weights[0]) / sum;
  const centers = ws.map((w, i) => {
    const c = x + w / 2;
    x += w + (free * weights[i + 1]) / sum - over;
    return c;
  });
  return { centers, fit };
}

// [a, b] 扣掉 blocked 裡的區段（太窄放不下東西的段丟掉）
function freeIntervals(a, b, blocked) {
  let free = [[a, b]];
  for (const [s, e] of blocked) {
    free = free.flatMap(([x, y]) => (e <= x || s >= y ? [[x, y]] : [[x, s], [e, y]]));
  }
  const wide = free.filter(([x, y]) => y - x >= 40);
  if (wide.length) return wide;
  // 空隙都很窄：用最寬的一段，掛件可以稍微超出這組的範圍，但不會掛在高物件後面
  const best = free.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  if (!best) return [[a, b]];
  const mid = (best[0] + best[1]) / 2;
  return [[mid - 20, mid + 20]];
}

// n 個東西依長度分給各區段
function byLength(intervals, n) {
  const total = intervals.reduce((t, [a, b]) => t + b - a, 0);
  const k = intervals.map(([a, b]) => Math.floor((n * (b - a)) / total));
  let left = n - k.reduce((t, v) => t + v, 0);
  const order = intervals.map(([a, b], i) => ({ i, len: b - a })).sort((p, q) => q.len - p.len);
  for (let j = 0; left > 0; j = (j + 1) % order.length, left--) k[order[j].i]++;
  return k;
}

// 陣列平均切成 k 段（保留順序）
function chunks(list, k) {
  const per = Math.ceil(list.length / k);
  return Array.from({ length: k }, (_, i) => list.slice(i * per, (i + 1) * per));
}

/**
 * 一個區域的情境 → 錨點與家具。
 * @param {{ sceneId: string, zone: object, stage: { sets: object[] }, items: Map<string, { viewBox: number[], sizeHint: string, top?: number }>, scale?: Record<string, number> }} input
 *   items[].top：圖形實際上緣在 viewBox 高度的比例（svg-bounds.mjs），物件當主體時用來算檯面
 *   zone：TerrainZone（地圖座標）
 * @returns {{ anchors: Map<string, { x: number, y: number, scale: number, tilt: boolean }>, fixtures: object[] }}
 */
export function stageZone({ sceneId, zone, stage, items, scale = {} }) {
  const frame = zoneFrame(zone);
  const W = zone.x1 - zone.x0;
  const anchors = new Map();
  const fixtures = [];
  const wallTasks = [];
  const wallIds = new Set();
  const tallFixtures = [];

  stage.sets.forEach((set, si) => {
    const rng = createRng(`${sceneId}:${zone.id}:set${si}`);
    const jitter = () => 1 + (rng() - 0.5) * SCALE_JITTER;
    const sizeOf = (id, slot) => {
      const it = items.get(id);
      const s = SLOT_SCALE[slot] * (scale[id] ?? 1) * jitter();
      return { id, s, ...itemSize(it.viewBox, it.sizeHint, s) };
    };
    // depth：繪製順序用的深度。放在檯面 / 主體上的東西跟著宿主的深度（宿主落地的 y），不然會被後排的東西蓋住
    const put = (p, x, y, fit = 1, tilt = false, depth = null) => anchors.set(p.id, {
      x: Math.round(x), y: Math.round(y), scale: +(p.s * fit).toFixed(3), tilt, ...(depth === null ? {} : { depth: depth + 0.5 }),
    });

    const boxOf = (id, a) => itemSize(items.get(id).viewBox, items.get(id).sizeHint, a.scale);
    const heightOf = (id, a) => boxOf(id, a).h;
    const widthOf = (id, a) => boxOf(id, a).w;
    const X0 = Math.max(frame.x0, zone.x0 + set.x[0] * W);
    const X1 = Math.min(frame.x1, zone.x0 + set.x[1] * W);
    const base = frame.rows[set.row];
    const fx = set.fixture ? FIXTURES[set.fixture] : null;

    // 兩側的物件左右交替，由內往外
    const beside = (set.beside ?? []).map((id) => sizeOf(id, 'beside'));
    const left = beside.filter((_, i) => i % 2 === 0);
    const right = beside.filter((_, i) => i % 2 === 1);
    const sideW = (list) => list.reduce((t, p) => t + p.w + SIDE_GAP, 0);
    const coreX0 = fx?.wallOnly || set.fixture === 'facade' ? X0 : X0 + sideW(left);
    const coreX1 = fx?.wallOnly || set.fixture === 'facade' ? X1 : X1 - sideW(right);
    let edgeL = coreX0;
    for (const p of left) { put(p, edgeL - SIDE_GAP / 2 - p.w / 2, base + 4 + rng() * 14); edgeL -= p.w + SIDE_GAP; }
    let edgeR = coreX1;
    for (const p of right) { put(p, edgeR + SIDE_GAP / 2 + p.w / 2, base + 4 + rng() * 14); edgeR += p.w + SIDE_GAP; }

    // 家具
    let surfaces = []; // 檯面：{ x0, x1, y }，on 的物件底線落在 y
    let wallBottom = frame.wall;
    if (fx) {
      const nLevels = fx.levels ?? 1;
      const levels = Array.from({ length: nLevels }, (_, k) => base - fx.height - k * (fx.gap ?? 0));
      if (set.fixture === 'facade') {
        wallBottom = base - FACADE_WALL;
        fixtures.push({ look: set.door ? 'facade-door' : 'facade', zone: zone.id, x0: Math.round(coreX0), x1: Math.round(coreX1), levels: [zone.y0 + 12], base });
      } else if (fx.wallOnly) {
        fixtures.push({ look: set.fixture, zone: zone.id, x0: Math.round(coreX0), x1: Math.round(coreX1), levels: [frame.wall - 110], base: frame.wall + 8 });
      } else {
        fixtures.push({ look: set.fixture, zone: zone.id, x0: Math.round(coreX0), x1: Math.round(coreX1), levels: fx.flat ? [base - fx.depth] : levels, base });
        surfaces = fx.flat ? [{ x0: coreX0 + 20, x1: coreX1 - 20, y: base - fx.depth / 2 }] : levels.map((y) => ({ x0: coreX0 + 18, x1: coreX1 - 18, y }));
        // 層架整面擋住牆；矮家具頂端以上才是牆面
        if (nLevels > 1 && set.row === 'back') tallFixtures.push([coreX0 - 6, coreX1 + 6]);
        else if (wallBottom !== null) wallBottom = Math.min(wallBottom, levels[0] - fx.depth - 10);
      }
    }

    // 主體物件：站在地毯 / 平台上，或直接站在地上
    if (set.main) {
      const p = sizeOf(set.main, 'main');
      const onFlat = fx && fx.flat;
      const y = onFlat ? surfaces[0].y + 10 : fx && !fx.wallOnly && set.fixture !== 'facade' ? base - fx.height : base;
      put(p, (coreX0 + coreX1) / 2, y);
      if (!fx || onFlat) {
        const top = y - p.h;
        surfaces = [{ x0: (coreX0 + coreX1) / 2 - p.w * 0.4, x1: (coreX0 + coreX1) / 2 + p.w * 0.4, y: top + p.h * ((items.get(set.main).top ?? 0) + MAIN_TOP) }];
      }
    }

    // 檯面上：依序分到各層
    const on = (set.on ?? []).map((id) => sizeOf(id, 'on'));
    const hostDepth = set.main && (!fx || fx.flat) ? anchors.get(set.main).y : base;
    if (on.length) {
      const levels = surfaces.length ? surfaces : [{ x0: coreX0, x1: coreX1, y: base }];
      chunks(on, levels.length).forEach((list, k) => {
        const lv = levels[k];
        const { centers, fit } = spread(lv.x0, lv.x1, list.map((p) => p.w), rng);
        list.forEach((p, i) => put(p, centers[i], lv.y, fit, false, hostDepth));
      });
    }

    // 牆上：等所有組的地上物件都擺好再掛（wallTasks），避開整個區域裡高到擋住牆面的物件（冰箱、衣帽架、層架）
    const wall = (set.wall ?? []).map((id) => sizeOf(id, 'wall'));
    for (const p of wall) wallIds.add(p.id);
    wallTasks.push(() => {
    const mainAnchor = set.main && anchors.get(set.main);
    const overRoom = mainAnchor ? mainAnchor.y - heightOf(set.main, mainAnchor) + OVER_OVERLAP - (zone.y0 + CEILING) : 0;
    // 主體太高、上方放不下（縮到一半以下）就照一般牆面掛法
    if (wall.length && set.over && mainAnchor && overRoom >= Math.max(...wall.map((p) => p.h)) * 0.4) {
      // 掛在主體正上方（抽油煙機在爐台上），縮到牆面放得下
      const top = mainAnchor.y - heightOf(set.main, mainAnchor);
      const room = overRoom;
      const mw = widthOf(set.main, mainAnchor);
      const tallest = Math.max(...wall.map((p) => p.h));
      const fit = Math.min(1, room / tallest);
      const { centers, fit: wfit } = spread(mainAnchor.x - mw / 2, mainAnchor.x + mw / 2, wall.map((p) => p.w * fit), rng);
      wall.forEach((p, i) => put(p, centers[i], top + OVER_OVERLAP, fit * wfit));
    } else if (wall.length && wallBottom !== null) {
      const tall = [...anchors.entries()].filter(([id, a]) => !wallIds.has(id) && a.y - heightOf(id, a) < wallBottom).map(([id, a]) => {
        const w = widthOf(id, a);
        return [a.x - w / 2 - 6, a.x + w / 2 + 6];
      });
      const free = freeIntervals(X0 + 10, X1 - 10, [...tall, ...tallFixtures]);
      const groups = byLength(free, wall.length);
      let k = 0;
      free.forEach(([a, b], j) => {
        const list = wall.slice(k, k + groups[j]);
        k += groups[j];
        // 掛件頂端不能超出牆頂（室外門面比較矮）
        const caps = list.map((p) => Math.min(1, (wallBottom - 12 - (zone.y0 + CEILING)) / p.h));
        const { centers, fit } = spread(a, b, list.map((p, i) => p.w * caps[i]), rng);
        list.forEach((p, i) => put(p, centers[i], wallBottom - rng() * 12, fit * caps[i]));
      });
    }
    });

    // 前面地上：散開、前後錯落
    const front = (set.front ?? []).map((id) => sizeOf(id, 'front'));
    if (front.length) {
      const { centers, fit } = spread(X0, X1, front.map((p) => p.w), rng);
      front.forEach((p, i) => put(p, centers[i], Math.min(frame.bottom, base + 38 + rng() * 28), fit, true));
    }
  });
  for (const task of wallTasks) task();

  // 天空的東西（飛機、雲、風箏）：指定 x（區域寬的比例），高度固定在區域上緣附近，避開地上擺好的情境
  // 值是 x 比例，或 [x, y] 比例（y = 底線在區域高的哪裡，飛得低一點鑽進情境之間的空隙）
  for (const [id, f] of Object.entries(stage.sky ?? {})) {
    const [fx, fy] = Array.isArray(f) ? f : [f, null];
    const y = fy === null ? zone.y0 + SKY_BOTTOM : zone.y0 + fy * (zone.y1 - zone.y0);
    anchors.set(id, { x: Math.round(zone.x0 + fx * W), y: Math.round(y), scale: SKY_SCALE * (scale[id] ?? 1), tilt: false });
  }
  return { anchors, fixtures };
}

/**
 * 整個場景的情境 → 錨點與家具（只處理 stage 裡有的區域）。
 * @returns {{ anchors: Map<string, { x: number, y: number, scale: number, tilt: boolean }>, fixtures: object[], zones: Set<string> }}
 */
export function stageScene({ sceneId, terrain, stage, items }) {
  const anchors = new Map();
  const fixtures = [];
  const zones = new Set();
  for (const tz of terrain.zones) {
    const zs = stage.zones?.[tz.id];
    if (!zs) continue;
    zones.add(tz.id);
    const r = stageZone({ sceneId, zone: tz, stage: zs, items, scale: stage.scale });
    for (const [id, a] of r.anchors) anchors.set(id, a);
    fixtures.push(...r.fixtures);
  }
  return { anchors, fixtures, zones };
}

const isFrac = (n) => typeof n === 'number' && n >= 0 && n <= 1;

/**
 * 檢查情境描述：物件存在、在這個區域、只出現一次；家具種類、排、x 範圍合法；同一排的組不重疊；
 * 家具不能和場景裡的單字撞名（背景不能長得像可點的物品）；檯面上的東西要有家具或主體可以放。
 * @param {{ stage: object, zoneOf: Record<string, string>, terrain: object, words: string[] }} input  words：場景裡所有英文單字
 * @returns {string[]} 問題清單
 */
export function validateStage({ stage, zoneOf, terrain, words }) {
  const problems = [];
  const seen = new Set();
  const wordSet = new Set(words.map((w) => w.toLowerCase()));
  const tzOf = new Map(terrain.zones.map((z) => [z.id, z]));
  for (const [zoneId, zs] of Object.entries(stage.zones ?? {})) {
    const tz = tzOf.get(zoneId);
    if (!tz) { problems.push(`stage.zones.${zoneId}：沒有這個區域`); continue; }
    if (!Array.isArray(zs.sets) || !zs.sets.length) { problems.push(`${zoneId}：sets 要是非空陣列`); continue; }
    const ranges = [];
    zs.sets.forEach((set, i) => {
      const where = `${zoneId}.sets[${i}]${set.note ? `（${set.note}）` : ''}`;
      if (!ROWS.includes(set.row)) problems.push(`${where}：row 要是 ${ROWS.join(' | ')}`);
      if (!Array.isArray(set.x) || set.x.length !== 2 || !set.x.every(isFrac) || set.x[0] >= set.x[1]) problems.push(`${where}：x 要是 [a, b]，0 ≤ a < b ≤ 1`);
      else {
        // 只掛牆的組（布告欄、門面、只有 wall 物件）不佔地面，不和地上的組比
        const wallOnly = set.fixture === 'board' || set.fixture === 'facade' || (!set.fixture && !set.main && !['on', 'beside', 'front'].some((k) => (set[k] ?? []).length));
        ranges.push({ row: wallOnly ? `wall-${set.row}` : set.row, x: set.x, where, wallOnly });
      }
      const fx = set.fixture ? FIXTURES[set.fixture] : null;
      if (set.fixture && !fx) problems.push(`${where}：未知的家具 ${set.fixture}`);
      if (fx) {
        if (fx.back && set.row !== 'back') problems.push(`${where}：${set.fixture} 只能靠後牆（row: back）`);
        if (fx.indoor && !tz.indoor) problems.push(`${where}：${set.fixture} 只能在室內`);
        if (fx.outdoor && tz.indoor) problems.push(`${where}：${set.fixture} 只能在室外`);
        const clash = fx.words.filter((w) => wordSet.has(w));
        if (clash.length) problems.push(`${where}：家具 ${set.fixture} 和單字 ${clash.join('、')} 撞名，背景不能像可點的物品`);
      }
      if ((set.on ?? []).length && !(fx && !fx.wallOnly && set.fixture !== 'facade') && !set.main) problems.push(`${where}：有 on 的物件，但沒有家具或主體可以放`);
      if (set.over !== undefined && (set.over !== true || !set.main || !(set.wall ?? []).length)) problems.push(`${where}：over 要是 true，而且要有 main 和 wall`);
      if ((set.wall ?? []).length && !tz.indoor && set.fixture !== 'facade') problems.push(`${where}：室外只有 facade 可以掛東西`);
      for (const id of [set.main, ...SLOTS.flatMap((s) => set[s] ?? [])].filter(Boolean)) {
        if (!zoneOf[id]) problems.push(`${where}：沒有物件 ${id}`);
        else if (zoneOf[id] !== zoneId) problems.push(`${where}：${id} 在區域 ${zoneOf[id]}，不是 ${zoneId}`);
        if (seen.has(id)) problems.push(`${where}：${id} 出現在多個位置`);
        seen.add(id);
      }
    });
    for (const [id, f] of Object.entries(zs.sky ?? {})) {
      if (!zoneOf[id]) problems.push(`${zoneId}.sky：沒有物件 ${id}`);
      else if (zoneOf[id] !== zoneId) problems.push(`${zoneId}.sky：${id} 在區域 ${zoneOf[id]}，不是 ${zoneId}`);
      if (!(isFrac(f) || (Array.isArray(f) && f.length === 2 && f.every(isFrac)))) problems.push(`${zoneId}.sky.${id} 要是 x 或 [x, y]（0–1 的比例）`);
      if (seen.has(id)) problems.push(`${zoneId}.sky：${id} 出現在多個位置`);
      seen.add(id);
    }
    // 同一排的組不能重疊（組之間留出走道）
    ranges.forEach((a, i) => ranges.slice(i + 1).forEach((b) => {
      if (a.row === b.row && !(a.wallOnly && b.wallOnly && a.row === 'wall-back') && a.x[0] < b.x[1] && b.x[0] < a.x[1]) problems.push(`${zoneId}：${a.where} 和 ${b.where} 在同一排重疊`);
    }));
  }
  for (const [id, s] of Object.entries(stage.scale ?? {})) {
    if (!zoneOf[id]) problems.push(`scale.${id}：沒有這個物件`);
    if (typeof s !== 'number' || s < 0.4 || s > 1.6) problems.push(`scale.${id} 要在 0.4–1.6 之間`);
  }
  return problems;
}
