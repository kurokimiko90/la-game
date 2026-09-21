import { describe, expect, test } from 'vitest';
import { scatter } from '@/lib/scatter';

describe('scatter', () => {
  test('數量正確、落在範圍內、由左到右', () => {
    const pts = scatter(7, 20, 100, 900);
    expect(pts).toHaveLength(20);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(100);
      expect(p.x).toBeLessThanOrEqual(900);
      expect(p.r).toBeGreaterThanOrEqual(0);
      expect(p.r).toBeLessThan(1);
    }
    expect(pts.map((p) => p.x)).toEqual([...pts.map((p) => p.x)].sort((a, b) => a - b));
  });

  test('同 seed 相同；不是等距', () => {
    expect(scatter(3, 10, 0, 1000)).toEqual(scatter(3, 10, 0, 1000));
    const gaps = scatter(3, 10, 0, 1000).map((p, i, a) => (i ? p.x - a[i - 1].x : 0)).slice(1);
    expect(new Set(gaps.map(Math.round)).size).toBeGreaterThan(3);
  });
});
