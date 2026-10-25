// 移植自 Ginza 專案 tests/test_shop_layout.mjs、test_shop_types.mjs
import { describe, expect, it } from 'vitest';
import { INTERIOR_TYPES, interiorTypeFor, nearestShopCategory, shopBays, shopRooms, type InteriorType } from '@/lib/city3d/shop-types';

describe('shopBays', () => {
  it('covers the wall continuously and reproducibly', () => {
    for (const length of [2.5, 5, 11, 24, 100]) {
      const bays = shopBays(length, 'building-42');
      expect(bays).toEqual(shopBays(length, 'building-42'));
      expect(bays[0].start).toBe(0);
      expect(bays.at(-1)!.end).toBe(length);
      bays.forEach((bay, i) => {
        expect(bay.end).toBeGreaterThan(bay.start);
        expect(bay.variant).toBeGreaterThanOrEqual(0);
        expect(bay.variant).toBeLessThan(8);
        if (i) expect(bay.start).toBe(bays[i - 1].end);
      });
      if (bays.length > 1) expect(bays[0].variant).not.toBe(bays[1].variant);
    }
  });

  it('rejects invalid lengths', () => {
    for (const length of [0, -1, 2, NaN, Infinity]) expect(shopBays(length, 'x')).toEqual([]);
  });
});

describe('interiorTypeFor', () => {
  it('maps OSM categories', () => {
    expect(interiorTypeFor('jewelry', 'a')).toBe('jewelry');
    expect(interiorTypeFor('Cafe', 'a')).toBe('cafe');
    expect(interiorTypeFor('restaurant', 'a')).toBe('dining');
    expect(interiorTypeFor('hairdresser', 'a')).toBe('salon');
  });

  it('samples unknown categories reproducibly, never convenience or salon', () => {
    const counts: Partial<Record<InteriorType, number>> = {};
    for (let i = 0; i < 4000; i++) {
      const cat = i % 2 ? null : 'unknown_tag';
      const type = interiorTypeFor(cat, `bay-${i}`);
      expect(type).toBe(interiorTypeFor(cat, `bay-${i}`));
      expect(INTERIOR_TYPES).toContain(type);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    expect(counts.convenience).toBeUndefined();
    expect(counts.salon).toBeUndefined();
    expect(counts.fashion!).toBeGreaterThan(counts.cafe!);
    expect(counts.cafe!).toBeGreaterThan(counts.books!);
  });
});

describe('nearestShopCategory', () => {
  const signs = [
    { kind: 'crown', cat: 'clothes', x: 0, z: 0, nx: 1, nz: 0 },
    { kind: 'shop', cat: 'jewelry', x: 3, z: 0, nx: 1, nz: 0 },
    { kind: 'cafe', cat: 'cafe', x: 1, z: 0, nx: -1, nz: 0 },
    { kind: 'shop', cat: 'books', x: 20, z: 0, nx: 1, nz: 0 },
  ];
  it('skips crown signs and walls facing the other way', () => {
    expect(nearestShopCategory(signs, 0, 0, 1, 0)).toBe('jewelry');
    expect(nearestShopCategory(signs, 0, 0, -1, 0)).toBe('cafe');
    expect(nearestShopCategory(signs, 10, 0, 1, 0)).toBeNull();
  });
});

describe('shopRooms', () => {
  it('merges neighbouring bays of the same type into one shop', () => {
    const bays = [0, 5, 10, 15].map((start) => ({ start, end: start + 5, variant: 0 }));
    expect(shopRooms(bays, ['cafe', 'cafe', 'books', 'cafe']).map((r) => [r.type, r.width, r.from, r.to]))
      .toEqual([['cafe', 10, 0, 5], ['cafe', 10, 5, 10], ['books', 5, 0, 5], ['cafe', 5, 0, 5]]);
    expect(shopRooms([], [])).toEqual([]);
  });
});
