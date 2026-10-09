import { describe, expect, test } from 'vitest';
import { createStreetFrontFilter } from '@/lib/city3d/street-front';
import type { CityBuilding } from '@/lib/city3d/collision';

describe('臨街店面', () => {
  const building: CityBuilding = { id: 'shop', height: 10, outers: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
  const road = { width: 6, points: [[-10, -5], [20, -5]] as [number, number][] };

  test('只接受朝向近處道路的外牆，背面與遠處道路不配置店面', () => {
    const front = createStreetFrontFilter([building], [road]);
    expect(front(5, 0, 0, -1)).toBe(true);
    expect(front(5, 10, 0, 1)).toBe(false);
    expect(front(100, 0, 0, -1)).toBe(false);
  });

  test('即使朝街，緊鄰建築遮住的外牆仍不配置店面', () => {
    const neighbor: CityBuilding = { id: 'neighbor', height: 10, outers: [[[0, -2], [10, -2], [10, -0.1], [0, -0.1]]] };
    expect(createStreetFrontFilter([building, neighbor], [road])(5, 0, 0, -1)).toBe(false);
  });

  test('跨網格的道路可以查詢，零長度路段與空道路安全略過', () => {
    const front = createStreetFrontFilter([], [{ width: 6, points: [[-100, -5], [100, -5]] }]);
    expect(front(-33, 0, 0, -1)).toBe(true);
    expect(createStreetFrontFilter([], [])(5, 0, 0, -1)).toBe(false);
    expect(createStreetFrontFilter([], [{ width: 6, points: [[5, -5], [5, -5]] }])(5, 0, 0, -1)).toBe(false);
  });
});
