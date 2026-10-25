import { describe, expect, it } from 'vitest';
import { footprintBox, hitsFootprint, type Footprint } from '@/lib/city3d/footprint';

describe('footprintBox', () => {
  it('ignores parts above foot height (overhanging arms)', () => {
    // 一根細柱 + 高處往外伸 3 m 的橫臂
    const pts = [-0.1, 0, -0.1, 0.1, 0, 0.1, -0.1, 3, -0.1, 3, 3, 0];
    expect(footprintBox(pts)).toEqual({ minX: -0.1, maxX: 0.1, minZ: -0.1, maxZ: 0.1 });
  });

  it('returns null for flat things you can step on', () => {
    expect(footprintBox([-1, 0, -1, 1, 0.02, 1])).toBeNull();
  });
});

describe('hitsFootprint', () => {
  const counter: Footprint = { x: 10, z: 5, yaw: 0, minX: -2, maxX: 2, minZ: -0.3, maxZ: 0.3 };

  it('blocks a player touching the box edge', () => {
    expect(hitsFootprint(counter, 10, 5.5, 0.35)).toBe(true);
    expect(hitsFootprint(counter, 10, 6, 0.35)).toBe(false);
  });

  it('respects the object rotation', () => {
    const turned = { ...counter, yaw: Math.PI / 2 };
    // 轉 90° 後長邊沿 z：(10, 6.5) 在長邊上，(11.5, 5) 已在短邊外
    expect(hitsFootprint(turned, 10, 6.5, 0.35)).toBe(true);
    expect(hitsFootprint(turned, 11.5, 5, 0.35)).toBe(false);
  });
});
