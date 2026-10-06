import { describe, expect, it } from 'vitest';
import { copyOf, fillCopies, siteAllows } from '../../scripts/lib/copies.mjs';

const zone = { id: 'shop', x0: 0, y0: 0, x1: 1000, y1: 600 };
const item = (id, extra = {}) => ({ id, zone: 'shop', category: '道具', sizeHint: 'small', ...extra });
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

describe('copyOf', () => {
  it('複本 id 對回原物件，原物件回傳 null', () => {
    expect(copyOf('paint-can#2')).toBe('paint-can');
    expect(copyOf('paint-can')).toBeNull();
  });
});

describe('fillCopies', () => {
  const shelf = { zone: 'shop', x0: 100, x1: 500, levels: [300], base: 360 };

  it('檯面用已經在上面的物品補空位，不蓋到原物件', () => {
    const placements = [{ id: 'can', x: 120, y: 240, w: 60, h: 60, depth: 360.5 }];
    const copies = fillCopies({ sceneId: 's', zones: [zone], items: [item('can')], placements, surfaces: [shelf] });
    expect(copies.length).toBeGreaterThan(0);
    for (const c of copies) {
      expect(c.of).toBe('can');
      expect(c.y + c.h).toBe(300);
      expect(c.depth).toBe(360.5);
      expect(c.x).toBeGreaterThanOrEqual(shelf.x0);
      expect(c.x + c.w).toBeLessThanOrEqual(shelf.x1);
      expect(overlap(c, placements[0])).toBe(false);
    }
    copies.forEach((a, i) => copies.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
    expect(new Set(copies.map((c) => c.id)).size).toBe(copies.length);
  });

  it('同一個 seed 每次一樣', () => {
    const input = () => ({ sceneId: 's', zones: [zone], items: [item('can')], placements: [{ id: 'can', x: 120, y: 240, w: 60, h: 60 }], surfaces: [shelf] });
    expect(fillCopies(input())).toEqual(fillCopies(input()));
  });

  it('不複製排除的物件、不超過總數上限', () => {
    const placements = [{ id: 'can', x: 120, y: 240, w: 60, h: 60 }];
    expect(fillCopies({ sceneId: 's', zones: [zone], items: [item('can')], placements, surfaces: [shelf], exclude: new Set(['can']) })).toEqual([]);
    expect(fillCopies({ sceneId: 's', zones: [zone], items: [item('can')], placements, surfaces: [shelf], maxRatio: 1 })).toHaveLength(1);
  });

  it('地上只複製可以有好幾個的小東西，挨在原物件旁邊', () => {
    const items = [item('pot', { category: '植物' }), item('atm', { category: '設施', sizeHint: 'medium' })];
    const placements = [{ id: 'pot', x: 400, y: 450, w: 60, h: 80 }, { id: 'atm', x: 700, y: 400, w: 100, h: 130 }];
    const copies = fillCopies({ sceneId: 's', zones: [zone], items, placements, maxRatio: 2 });
    expect(copies.map((c) => c.of)).toEqual(['pot', 'pot']);
    for (const c of copies) {
      expect(Math.abs(c.x - 400)).toBeLessThan(100);
      placements.forEach((p) => expect(overlap(c, p)).toBe(false));
    }
  });

  it('已經有的複本當障礙物，編號往後接', () => {
    const placements = [{ id: 'can', x: 120, y: 240, w: 60, h: 60 }];
    const existing = [{ id: 'can#2', x: 190, y: 240, w: 60, h: 60 }];
    const copies = fillCopies({ sceneId: 's', zones: [zone], items: [item('can')], placements, surfaces: [shelf], obstacles: existing, maxRatio: 3 });
    expect(copies[0].id).toBe('can#3');
    copies.forEach((c) => expect(overlap(c, existing[0])).toBe(false));
  });
});

describe('siteAllows', () => {
  const terrain = {
    zones: [{ id: 'shop', x0: 0, y0: 0, x1: 1000, y1: 600, details: [
      { id: 'aisle', kind: 'path', x0: 400, y0: 0, x1: 600, y1: 600 },
      { id: 'bed', kind: 'bed', x0: 0, y0: 0, x1: 300, y1: 600, items: ['tulip'] },
    ], pool: { x0: 800, y0: 100, x1: 1000, y1: 500 } }],
  };
  const allows = siteAllows(terrain);
  it('不擋走道、不進泳池；限定地形的物件複本留在原地形', () => {
    expect(allows({ x: 450, y: 100, w: 40, h: 40 }, 'can', 'shop')).toBe(false);
    expect(allows({ x: 780, y: 200, w: 40, h: 40 }, 'can', 'shop')).toBe(false);
    expect(allows({ x: 650, y: 100, w: 40, h: 40 }, 'can', 'shop')).toBe(true);
    expect(allows({ x: 100, y: 100, w: 40, h: 40 }, 'tulip', 'shop')).toBe(true);
    expect(allows({ x: 650, y: 100, w: 40, h: 40 }, 'tulip', 'shop')).toBe(false);
  });
});

describe('fillCopies 空檯面', () => {
  it('空著的檯面借同一區檯面上的小東西，深度跟著家具', () => {
    const shelfA = { zone: 'shop', x0: 100, x1: 300, levels: [300], base: 360 };
    const empty = { look: 'shelf', zone: 'shop', x0: 600, x1: 900, levels: [300], base: 380 };
    const placements = [{ id: 'can', x: 120, y: 240, w: 60, h: 60, depth: 360.5 }];
    const copies = fillCopies({ sceneId: 's', zones: [zone], items: [item('can')], placements, surfaces: [shelfA, empty], maxRatio: 4 });
    const borrowed = copies.filter((c) => c.x >= empty.x0);
    expect(borrowed.length).toBeGreaterThan(0);
    borrowed.forEach((c) => expect(c.depth).toBe(380.5));
  });

  it('門面、布告欄不借東西來擺', () => {
    const shelfA = { zone: 'shop', x0: 100, x1: 300, levels: [300], base: 360 };
    const facade = { look: 'facade', zone: 'shop', x0: 600, x1: 900, levels: [20], base: 200 };
    const placements = [{ id: 'can', x: 120, y: 240, w: 60, h: 60 }];
    const copies = fillCopies({ sceneId: 's', zones: [zone], items: [item('can')], placements, surfaces: [shelfA, facade], maxRatio: 4 });
    expect(copies.every((c) => c.x < 600)).toBe(true);
  });
});
