import { describe, expect, test } from 'vitest';
import {
  layoutScene, checkLayout, visibleRatio, resolveBand, itemSize, createRng, anchorPoints,
  MIN_VISIBLE, MAX_TILT, ZONE_MARGIN,
} from '../../scripts/lib/layout.mjs';

const mk = (id, zone, sizeHint, viewBox = [0, 0, 100, 100]) => ({ id, zone, sizeHint, viewBox });
const bottom = (p) => p.y + p.h;
const inRect = (p, z) => p.x >= z.x0 && p.x + p.w <= z.x1 && bottom(p) >= z.y0 && bottom(p) <= z.y1;

// 2D 區域：a 在左上、b 在右上、c 在 a 的下方
const ZONES = [
  { id: 'a', x0: 0, y0: 0, x1: 1000, y1: 900 },
  { id: 'b', x0: 1000, y0: 0, x1: 2000, y1: 900 },
  { id: 'c', x0: 0, y0: 900, x1: 1000, y1: 1800 },
];
const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]));

const BANDS = {
  ground: { scale: [1, 1], gaps: [[400, 500]] },
  sky: { top: 100, bottom: 300, layer: 3, float: 120 },
  water: { top: 600, bottom: 700, layer: 1, zones: ['b'], x0: 1200, x1: 1800 },
  counter: { levels: [700, 780], zones: ['a'], inset: 60, look: 'counter', base: 830 },
};

const items = [
  mk('tree', 'a', 'large'), mk('bench', 'a', 'medium'), mk('ball', 'a', 'small'), mk('kite', 'a', 'small'),
  mk('cup', 'a', 'small'), mk('plate', 'a', 'small'), mk('boat', 'b', 'medium'), mk('rock', 'b', 'small'),
  mk('blanket', 'b', 'medium'), mk('basket', 'b', 'small'), mk('buoy', 'a', 'small'),
  mk('cone', 'c', 'small'), mk('sign', 'c', 'medium'),
];
const config = {
  bands: BANDS,
  place: { kite: 'sky', boat: 'water', buoy: 'water', cup: 'counter', plate: 'counter' },
  clusters: [['blanket', 'basket']],
  loose: ['ball', 'rock'],
  noFlip: ['tree'],
};
const run = (extra = {}) => layoutScene({ sceneId: 's', zones: ZONES, items, ...config, ...extra });

describe('resolveBand', () => {
  test('預設 = 區域範圍扣掉內距；地帶的 x0/x1/top/bottom 與區域取交集；override 針對單一區域', () => {
    const z = { id: 'a', x0: 0, y0: 100, x1: 800, y1: 900 };
    expect(resolveBand({ ground: {} }, 'ground', z)).toMatchObject({ x0: ZONE_MARGIN, x1: 800 - ZONE_MARGIN, top: 100 + ZONE_MARGIN, layer: 2, levels: null, float: 0 });
    const b = resolveBand({ ground: { top: 50, bottom: 600, override: { a: { x1: 500 } } } }, 'ground', z);
    expect(b).toMatchObject({ x1: 500, top: 100 + ZONE_MARGIN, bottom: 600 });
  });

  test('限定區域的地帶在其他區域回傳 null；levels 決定上下界', () => {
    expect(resolveBand(BANDS, 'water', zoneById.a)).toBeNull();
    expect(resolveBand(BANDS, 'counter', zoneById.a)).toMatchObject({ top: 700, bottom: 780, x0: 60, x1: 940, levels: [700, 780] });
  });

  test('和區域沒有交集時回傳 null；沒有這個地帶就報錯', () => {
    expect(resolveBand({ w: { x0: 5000 } }, 'w', zoneById.a)).toBeNull();
    expect(() => resolveBand(BANDS, 'road', zoneById.a)).toThrow(/road/);
  });
});

describe('visibleRatio', () => {
  test('沒被擋 = 1，完全蓋住 = 0，蓋一半 ≈ 0.5', () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    expect(visibleRatio(box, [])).toBe(1);
    expect(visibleRatio(box, [{ x: -10, y: -10, w: 200, h: 200 }])).toBe(0);
    expect(visibleRatio(box, [{ x: 50, y: 0, w: 100, h: 100 }])).toBeCloseTo(0.5, 1);
  });
});

describe('layoutScene', () => {
  test('每個物品都有位置；左右不出區域，底線落在區域內（2D）', () => {
    const placed = run();
    expect(placed.map((p) => p.id).sort()).toEqual(items.map((i) => i.id).sort());
    for (const p of placed) expect(inRect(p, zoneById[items.find((i) => i.id === p.id).zone])).toBe(true);
  });

  test('同 seed 結果相同，不同 seed 不同', () => {
    expect(run()).toEqual(run());
    expect(layoutScene({ sceneId: 'other', zones: ZONES, items, ...config })).not.toEqual(run());
  });

  test('物件底線落在所屬地帶：天空、水面、檯面 levels，地面避開 gaps', () => {
    const byId = Object.fromEntries(run().map((p) => [p.id, p]));
    expect(bottom(byId.kite)).toBeGreaterThanOrEqual(100);
    expect(bottom(byId.kite)).toBeLessThanOrEqual(300);
    expect(byId.kite.float).toBe(120);
    expect(bottom(byId.boat)).toBeGreaterThanOrEqual(600);
    expect(bottom(byId.boat)).toBeLessThanOrEqual(700);
    expect(byId.boat.x).toBeGreaterThanOrEqual(1200);
    expect(byId.boat.x + byId.boat.w).toBeLessThanOrEqual(1800);
    expect([700, 780]).toContain(bottom(byId.cup));
    for (const id of ['tree', 'bench', 'ball', 'rock', 'blanket', 'basket']) {
      const b = bottom(byId[id]);
      expect(b > 400 && b < 500).toBe(false);
      expect(byId[id].float).toBe(0);
    }
  });

  test('地帶不適用的區域改放地面（buoy 在區域 a，水面只在 b）', () => {
    const buoy = run().find((p) => p.id === 'buoy');
    expect(buoy.layer).toBe(2);
  });

  test('繪製順序：先依 layer（水面 → 地面 → 天空），同層依底線由上到下', () => {
    const placed = run();
    expect(placed.at(-1).id).toBe('kite');
    for (let i = 1; i < placed.length; i++) {
      const [a, b] = [placed[i - 1], placed[i]];
      expect(a.layer < b.layer || (a.layer === b.layer && bottom(a) <= bottom(b))).toBe(true);
    }
  });

  test('群組成員放在主體旁邊', () => {
    const byId = Object.fromEntries(run().map((p) => [p.id, p]));
    const host = byId.blanket;
    const cx = byId.basket.x + byId.basket.w / 2;
    expect(Math.abs(cx - (host.x + host.w / 2))).toBeLessThanOrEqual(host.w * 0.6 + byId.basket.w);
    expect(Math.abs(bottom(byId.basket) - bottom(host))).toBeLessThanOrEqual(60);
  });

  test('散落物件傾斜不超過上限，其他物件正立；noFlip 不鏡像', () => {
    const byId = Object.fromEntries(run().map((p) => [p.id, p]));
    for (const p of Object.values(byId)) {
      if (config.loose.includes(p.id)) expect(Math.abs(p.rotate)).toBeLessThanOrEqual(MAX_TILT);
      else expect(p.rotate).toBe(0);
    }
    expect(byId.tree.flip).toBe(false);
    expect(Object.values(byId).some((p) => p.flip)).toBe(true);
  });

  test('擁擠的區域每個物件仍至少露出 MIN_VISIBLE', () => {
    const crowd = [
      ...Array.from({ length: 4 }, (_, i) => mk(`big${i}`, 'a', 'large')),
      ...Array.from({ length: 5 }, (_, i) => mk(`mid${i}`, 'a', 'medium')),
      ...Array.from({ length: 8 }, (_, i) => mk(`small${i}`, 'a', 'small')),
    ];
    const zones = [{ id: 'a', x0: 0, y0: 0, x1: 800, y1: 800 }];
    const placed = layoutScene({ sceneId: 'crowd', zones, items: crowd, bands: { ground: {} } });
    expect(checkLayout({ zones, items: crowd, placements: placed })).toEqual([]);
  });

  test('其他場景的物件（obstacles）也會避開，且一起檢查可見比例', () => {
    const zones = [{ id: 'a', x0: 0, y0: 0, x1: 600, y1: 600 }];
    const obstacles = [{ id: 'wall', x: 0, y: 0, w: 300, h: 600, layer: 2 }];
    const its = Array.from({ length: 5 }, (_, i) => mk(`m${i}`, 'a', 'medium'));
    const placed = layoutScene({ sceneId: 'obs', zones, items: its, bands: { ground: {} }, obstacles });
    expect(placed.map((p) => p.id)).not.toContain('wall');
    expect(checkLayout({ zones, items: its, placements: placed, obstacles })).toEqual([]);
  });

  test('鎖定的位置不動，新物件避開它們', () => {
    const first = run();
    const locked = Object.fromEntries(first.filter((p) => p.id !== 'rock').map(({ id, x, y, w, h, rotate, flip }) => [id, { x, y, w, h, rotate, flip }]));
    const again = layoutScene({ sceneId: 'changed-seed', zones: ZONES, items, ...config, locked });
    for (const p of again) {
      if (locked[p.id]) expect({ x: p.x, y: p.y, w: p.w, h: p.h }).toEqual({ x: locked[p.id].x, y: locked[p.id].y, w: locked[p.id].w, h: locked[p.id].h });
    }
    expect(checkLayout({ zones: ZONES, items, placements: again })).toEqual([]);
  });

  test('放不下時報錯並列出物件', () => {
    const tooMany = Array.from({ length: 40 }, (_, i) => mk(`huge${i}`, 'a', 'large'));
    expect(() => layoutScene({ sceneId: 'x', zones: [{ id: 'a', x0: 0, y0: 0, x1: 800, y1: 300 }], items: tooMany, bands: { ground: { top: 200, bottom: 220 } } }))
      .toThrow(/huge/);
  });
});

describe('anchorPoints', () => {
  test('rows 沿折線依長度等距排（t = (i + 0.5) / n），null 佔位但不放東西；spots 直接給點', () => {
    const pts = anchorPoints(
      [{ points: [[0, 100], [300, 100], [300, 400]], items: ['a', null, 'b'] }, { points: [[50, 50]], items: ['c', 'd'] }],
      { e: [10, 20] },
    );
    expect(pts.get('a')).toEqual([100, 100]);
    expect(pts.get('b')).toEqual([300, 300]);
    expect(pts.has(null)).toBe(false);
    expect(pts.get('c')).toEqual([50, 50]);
    expect(pts.get('d')).toEqual([50, 50]);
    expect(pts.get('e')).toEqual([10, 20]);
  });
});

describe('layoutScene 錨點（rows / spots）', () => {
  const zones = [{ id: 'a', x0: 0, y0: 0, x1: 1000, y1: 800 }];
  const its = [mk('lamp', 'a', 'medium'), mk('bin', 'a', 'small'), mk('sign', 'a', 'medium'), mk('cat', 'a', 'small'), mk('hat', 'a', 'small'), mk('cup', 'a', 'small')];
  const bands = { ground: { scale: [1, 1] }, counter: { levels: [300], scale: [0.5, 0.5] } };
  const placeAll = (extra = {}) => Object.fromEntries(layoutScene({
    sceneId: 'anchor', zones, items: its, bands,
    rows: [{ points: [[100, 700], [700, 700]], items: ['lamp', 'bin', 'sign'] }],
    spots: { cat: [850, 500], cup: [500, 300] },
    place: { cup: 'counter' },
    ...extra,
  }).map((p) => [p.id, p]));
  const center = (p) => [p.x + p.w / 2, p.y + p.h];

  test('底線中心落在錨點上，大小不抖動（依地帶縮放）', () => {
    const byId = placeAll();
    expect(center(byId.lamp)).toEqual([200, 700]);
    expect(center(byId.bin)).toEqual([400, 700]);
    expect(center(byId.sign)).toEqual([600, 700]);
    expect(center(byId.cat)).toEqual([850, 500]);
    expect(Math.max(byId.lamp.w, byId.lamp.h)).toBe(130);
    expect(Math.max(byId.cup.w, byId.cup.h)).toBe(40);
    expect(byId.cup.layer).toBe(2);
  });

  test('換 seed 錨點物件不動；沒錨點的物件照舊隨機擺', () => {
    const a = placeAll();
    const b = Object.fromEntries(layoutScene({
      sceneId: 'other', zones, items: its, bands,
      rows: [{ points: [[100, 700], [700, 700]], items: ['lamp', 'bin', 'sign'] }],
      spots: { cat: [850, 500], cup: [500, 300] }, place: { cup: 'counter' },
    }).map((p) => [p.id, p]));
    for (const id of ['lamp', 'bin', 'sign', 'cat', 'cup']) expect(center(b[id])).toEqual(center(a[id]));
    expect(checkLayout({ zones, items: its, placements: Object.values(a) })).toEqual([]);
  });

  test('群組成員圍在錨點主體旁邊', () => {
    const byId = placeAll({ clusters: [['lamp', 'hat']] });
    const [hx] = center(byId.lamp);
    expect(Math.abs(center(byId.hat)[0] - hx)).toBeLessThanOrEqual(byId.lamp.w * 0.6 + byId.hat.w);
    expect(Math.abs(bottom(byId.hat) - 700)).toBeLessThanOrEqual(60);
  });

  test('鎖定的位置優先於錨點', () => {
    const byId = placeAll({ locked: { lamp: { x: 10, y: 10, w: 50, h: 50, rotate: 0, flip: false } } });
    expect(byId.lamp).toMatchObject({ x: 10, y: 10 });
  });

  test('錨點物件互相擋太多時報錯', () => {
    const rows = [{ points: [[100, 700], [700, 700]], items: ['lamp', 'bin', null] }];
    expect(() => placeAll({ rows, spots: { sign: [205, 700], cat: [850, 500], cup: [500, 300] } })).toThrow(/sign|lamp/);
  });
});

describe('layoutScene 自動排列（arrange: auto）', () => {
  // 室內區域：牆（掛）、牆腳（大型設備）、檯面、地面
  const zones = [{ id: 'room', x0: 0, y0: 0, x1: 1300, y1: 650 }];
  const bands = {
    ground: { scale: [1, 1], override: { room: { top: 240, bottom: 630, gaps: [[190, 380]] } } },
    wall: { levels: [140], zones: ['room'], inset: 60, scale: [0.85, 0.85] },
    wallbase: { levels: [178], zones: ['room'], inset: 50 },
    surface: { levels: [310], zones: ['room'], x0: 150, x1: 1150, inset: 0, scale: [0.8, 0.8] },
  };
  const its = [
    mk('clock', 'room', 'small'), mk('poster', 'room', 'small'),
    mk('fridge', 'room', 'large'), mk('door', 'room', 'large'),
    mk('cup', 'room', 'small'), mk('plate', 'room', 'small'), mk('bowl', 'room', 'small'),
    mk('sofa', 'room', 'large'), mk('chair', 'room', 'medium'), mk('lamp', 'room', 'medium'),
    mk('box', 'room', 'small'), mk('bin', 'room', 'small'),
    mk('pen', 'room', 'small'), mk('cushion', 'room', 'small'),
  ];
  const place = { clock: 'wall', poster: 'wall', fridge: 'wallbase', door: 'wallbase', cup: 'surface', plate: 'surface', bowl: 'surface' };
  const opts = { zones, items: its, bands, place, loose: ['pen'], clusters: [['sofa', 'cushion']], arrange: 'auto' };
  const byIdOf = (sceneId, extra = {}) => Object.fromEntries(layoutScene({ sceneId, ...opts, ...extra }).map((p) => [p.id, p]));
  const cx = (p) => p.x + p.w / 2;

  test('同一條檯面 / 牆上的物件等距排開，底線在那一層', () => {
    const byId = byIdOf('auto');
    const cups = ['cup', 'plate', 'bowl'].map((id) => byId[id]);
    for (const p of cups) expect(bottom(p)).toBe(310);
    const xs = cups.map(cx).sort((a, b) => a - b);
    expect(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1]))).toBeLessThanOrEqual(2);
    for (const id of ['clock', 'poster']) expect(bottom(byId[id])).toBe(140);
  });

  test('地面依大小分排：大的在後、小的在前；散落小物也排（只是會歪）', () => {
    const byId = byIdOf('auto');
    expect(bottom(byId.sofa)).toBeLessThan(bottom(byId.chair));
    expect(bottom(byId.chair)).toBeLessThan(bottom(byId.box));
    expect(bottom(byId.chair)).toBe(bottom(byId.lamp));
    expect(bottom(byId.box)).toBe(bottom(byId.bin));
    expect(bottom(byId.pen)).toBe(bottom(byId.box));
    const other = byIdOf('auto-other-seed');
    for (const id of ['sofa', 'chair', 'lamp', 'box', 'bin', 'pen', 'cup', 'clock', 'fridge', 'cushion']) expect(cx(other[id])).toBe(cx(byId[id]));
  });

  test('群組成員排在主體那一排，緊貼主體', () => {
    const plain = { ground: { scale: [1, 1], override: { room: { top: 240, bottom: 630 } } } };
    const byId = Object.fromEntries(layoutScene({ sceneId: 'grp', zones, items: its.filter((it) => !place[it.id]), bands: plain, clusters: [['sofa', 'cushion']], arrange: 'auto' }).map((p) => [p.id, p]));
    expect(bottom(byId.cushion)).toBe(bottom(byId.sofa));
    expect(Math.abs(cx(byId.cushion) - cx(byId.sofa))).toBeLessThanOrEqual((byId.sofa.w + byId.cushion.w) / 2 + 10);
  });

  test('室內後排：牆腳設備和地面大物件交錯，不互相擋住', () => {
    const byId = byIdOf('auto');
    // 上下有重疊的錨點物件（牆腳設備、後排、檯面）左右不重疊
    const anchored = ['fridge', 'door', 'sofa', 'cup', 'plate', 'bowl', 'clock', 'poster'].map((id) => byId[id]);
    for (const a of anchored) {
      for (const b of anchored) {
        if (a === b || a.y >= b.y + b.h || b.y >= a.y + a.h) continue;
        expect(a.x + a.w <= b.x + 5 || b.x + b.w <= a.x + 5).toBe(true);
      }
    }
    expect(checkLayout({ zones, items: its, placements: Object.values(byId) })).toEqual([]);
  });

  test('群組成員比主體大（LLM 給的群組不一定合理）時照一般物件排，不圍著主體', () => {
    const byId = byIdOf('auto', { clusters: [['chair', 'sofa']] });
    const again = byIdOf('auto-other-seed', { clusters: [['chair', 'sofa']] });
    expect(cx(again.sofa)).toBe(cx(byId.sofa));
    expect(bottom(byId.sofa)).toBeLessThan(bottom(byId.chair));
  });

  test('一排放不下就換行', () => {
    const many = Array.from({ length: 12 }, (_, i) => mk(`m${i}`, 'room', 'medium'));
    const placed = layoutScene({ sceneId: 'wrap', zones, items: many, bands: { ground: { scale: [1, 1], override: { room: { top: 200, bottom: 630 } } } }, arrange: 'auto' });
    expect(new Set(placed.map(bottom)).size).toBeGreaterThanOrEqual(2);
  });

  test('排不下時那個區域退回隨機擺放，不報錯，並記在 warnings', () => {
    // 車道只有一層可排：11 台大車排一排會互相擋住；隨機可以上下錯開
    const cars = Array.from({ length: 11 }, (_, i) => mk(`car${i}`, 'room', 'large'));
    const road = { ground: { scale: [1, 1] }, road: { top: 250, bottom: 640, zones: ['room'] } };
    const warnings = [];
    const placed = layoutScene({ sceneId: 'crowd', zones, items: cars, bands: road, place: Object.fromEntries(cars.map((c) => [c.id, 'road'])), arrange: 'auto', warnings });
    expect(placed).toHaveLength(11);
    expect(warnings.join()).toContain('room');
  });

  test('手動的 spots 優先於自動排列', () => {
    const byId = byIdOf('auto', { spots: { chair: [900, 600] } });
    expect([cx(byId.chair), bottom(byId.chair)]).toEqual([900, 600]);
  });
});

describe('checkLayout', () => {
  const zones = [{ id: 'a', x0: 0, y0: 0, x1: 1600, y1: 900 }, { id: 'b', x0: 1600, y0: 0, x1: 3200, y1: 900 }];
  const its = [mk('a1', 'a', 'small'), mk('a2', 'a', 'small')];

  test('抓出超出區域（左右或底線）的物件', () => {
    const placements = [
      { id: 'a1', x: 100, y: 850, w: 80, h: 80, layer: 2 },
      { id: 'a2', x: 1590, y: 500, w: 80, h: 80, layer: 2 },
    ];
    const text = checkLayout({ zones, items: its, placements }).join('\n');
    expect(text).toMatch(/a1.*超出/);
    expect(text).toMatch(/a2.*超出/);
  });

  test('抓出被擋太多的物件（含其他場景的 obstacles）', () => {
    const covered = [
      { id: 'a1', x: 100, y: 500, w: 80, h: 80, layer: 2 },
      { id: 'a2', x: 100, y: 505, w: 80, h: 80, layer: 2 },
    ];
    expect(checkLayout({ zones, items: its, placements: covered }).join('\n')).toMatch(/a1.*露出/);
    const alone = [{ id: 'a1', x: 100, y: 500, w: 80, h: 80, layer: 2 }];
    const obstacles = [{ id: 'x', x: 100, y: 510, w: 80, h: 80, layer: 2 }];
    expect(checkLayout({ zones, items: its.slice(0, 1), placements: alone, obstacles }).join('\n')).toMatch(/a1.*露出/);
  });

  test(`MIN_VISIBLE = ${MIN_VISIBLE}`, () => {
    expect(MIN_VISIBLE).toBe(0.6);
  });
});

describe('itemSize / createRng', () => {
  test('依尺寸等級與縮放決定最長邊，保持長寬比', () => {
    expect(itemSize([0, 0, 200, 100], 'large', 1)).toEqual({ w: 200, h: 100 });
    expect(itemSize([0, 0, 50, 100], 'small', 0.5)).toEqual({ w: 20, h: 40 });
    expect(itemSize([0, 0, 100, 100], 'unknown', 1)).toEqual({ w: 130, h: 130 });
  });

  test('亂數可重現且落在 [0,1)', () => {
    const a = createRng('x');
    const b = createRng('x');
    const seq = [a(), a(), a()];
    expect(seq).toEqual([b(), b(), b()]);
    expect(seq.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});
