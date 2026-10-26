import { describe, expect, test } from 'vitest';
import { allocateBuilding, allocateLots, lotRows, placeDistrict, roomRects, streetRects, townOccupancy, worldFor } from '../../scripts/lib/town-plan.mjs';

const TOWN = {
  minWidth: 4000,
  outdoorRows: [{ x0: 0, y: 0, cols: 2 }, { x0: 0, y: 900, cols: 3 }],
  indoor: { x0: 100, y0: 2000, width: 4100, gap: 200, rowGap: 150, gapAbove: 100 },
};

describe('戶外地塊', () => {
  test('lotRows：每列由左到右 1300×650', () => {
    expect(lotRows(TOWN.outdoorRows)[1]).toEqual([[0, 900, 1300, 1550], [1300, 900, 2600, 1550], [2600, 900, 3900, 1550]]);
  });

  test('allocateLots：同一列相鄰的空地塊，前一列放不下就往下找', () => {
    expect(allocateLots(2, [], TOWN.outdoorRows)).toEqual([[0, 0, 1300, 650], [1300, 0, 2600, 650]]);
    expect(allocateLots(2, [[1300, 0, 2600, 650]], TOWN.outdoorRows)).toEqual([[0, 900, 1300, 1550], [1300, 900, 2600, 1550]]);
    expect(allocateLots(1, [[0, 0, 1300, 650]], TOWN.outdoorRows)).toEqual([[1300, 0, 2600, 650]]);
    expect(allocateLots(4, [], TOWN.outdoorRows)).toBeNull();
    expect(allocateLots(0, [], TOWN.outdoorRows)).toEqual([]);
  });

  test('streetRects：每列地塊南邊一條大街', () => {
    expect(streetRects(TOWN)).toEqual([[0, 650, 2600, 900], [0, 1550, 3900, 1800]]);
  });
});

describe('室內建築', () => {
  test('allocateBuilding：接在最後一列後面，放不下就換列（列高取該列最高的建築）', () => {
    const a = allocateBuilding({ w: 2600, h: 960 }, [], TOWN.indoor);
    expect(a).toEqual([100, 2000, 2700, 2960]);
    const b = allocateBuilding({ w: 1300, h: 650 }, [a], TOWN.indoor);
    expect(b).toEqual([2900, 2000, 4200, 2650]);
    expect(allocateBuilding({ w: 1300, h: 650 }, [a, [2900, 2000, 4100, 2650]], TOWN.indoor)).toEqual([100, 3110, 1400, 3760]);
  });

  test('roomRects：房間由左到右', () => {
    expect(roomRects([100, 2000, 2700, 2650], 2)).toEqual([[100, 2000, 1400, 2650], [1400, 2000, 2700, 2650]]);
  });
});

describe('placeDistrict', () => {
  const zones = [{ indoor: false }, { indoor: true }, { indoor: true }, { indoor: false }];

  test('戶外拿相鄰地塊、室內合成一棟建築，依區域順序回傳', () => {
    const { rects, building } = placeDistrict(zones, { occupied: [], buildings: [], town: TOWN });
    expect(rects).toEqual([[0, 0, 1300, 650], [100, 2000, 1400, 2650], [1400, 2000, 2700, 2650], [1300, 0, 2600, 650]]);
    expect(building).toEqual([100, 2000, 2700, 2650]);
  });

  test('沒有空地塊就丟錯', () => {
    const full = lotRows(TOWN.outdoorRows).flat();
    expect(() => placeDistrict(zones, { occupied: full, buildings: [], town: TOWN })).toThrow('空地塊');
  });

  test('townOccupancy：戶外區域佔地塊、室內區域合成建築外框', () => {
    const occ = townOccupancy([{ zones: [{ rect: [0, 0, 1300, 650], indoor: false }, { rect: [100, 2000, 1400, 2650], indoor: true }, { rect: [1400, 2000, 2700, 2650], indoor: true }] }]);
    expect(occ).toEqual({ occupied: [[0, 0, 1300, 650]], buildings: [[100, 2000, 2700, 2650]] });
  });
});

test('worldFor：包住所有區域與大街，戶外高度 = 室內區上緣 - 間隔', () => {
  expect(worldFor([[100, 2000, 2700, 2650]], TOWN)).toEqual({ width: 4000, height: 2750, outdoorHeight: 1900, streets: streetRects(TOWN) });
});
