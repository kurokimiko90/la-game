import { describe, expect, test } from 'vitest';
import {
  layoutScene, checkLayout, visibleRatio, resolveBand, itemSize, createRng,
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
