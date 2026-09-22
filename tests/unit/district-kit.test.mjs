import { describe, expect, it } from 'vitest';
import { allowedSpots, buildDistrict, nextSlot, normalizeZone, worldSize, zoneRects } from '../../scripts/lib/district-kit.mjs';
import { resolveBand } from '../../scripts/lib/layout.mjs';

const ZONES = [
  { id: 'entrance', name: '入口', indoor: false, floor: 'paving', feature: 'road' },
  { id: 'hall', name: '大廳', indoor: true, floor: 'tile', feature: 'counter' },
  { id: 'pond', name: '池塘', indoor: false, floor: 'grass', feature: 'water' },
  { id: 'platform', name: '月台', indoor: false, floor: 'concrete', feature: 'track' },
];
const slot = { x: 3600, y: 0 };

describe('zoneRects', () => {
  it('2×2，路線順時針，剛好鋪滿 slot', () => {
    expect(zoneRects(slot)).toEqual([
      [3600, 0, 4900, 650], [4900, 0, 6200, 650], [4900, 650, 6200, 1300], [3600, 650, 4900, 1300],
    ]);
  });
});

describe('normalizeZone', () => {
  it('不合法的地面換成預設，室內不能有車道、鐵軌、水池', () => {
    expect(normalizeZone({ id: 'a', name: 'A', indoor: true, floor: 'grass', feature: 'road' })).toEqual({ id: 'a', name: 'A', indoor: true, floor: 'tile', feature: 'none' });
    expect(normalizeZone({ id: 'b', name: 'B', indoor: 'yes', floor: 'lava', feature: 'volcano' })).toEqual({ id: 'b', name: 'B', indoor: false, floor: 'grass', feature: 'none' });
  });
});

describe('allowedSpots', () => {
  it('室內可以掛牆，室外可以飄在空中，地形特徵有自己的位置', () => {
    expect(allowedSpots(normalizeZone(ZONES[1]))).toEqual(['ground', 'wall', 'wallbase', 'surface']);
    expect(allowedSpots(normalizeZone(ZONES[0]))).toEqual(['ground', 'sky', 'road']);
  });
});

describe('buildDistrict', () => {
  const elements = [
    { id: 'car', zone: 'entrance', spot: 'road' },
    { id: 'poster', zone: 'hall', spot: 'wall' },
    { id: 'cup', zone: 'hall', spot: 'surface' },
    { id: 'boat', zone: 'pond', spot: 'water' },
    { id: 'train', zone: 'platform', spot: 'track' },
    { id: 'kite', zone: 'hall', spot: 'sky' }, // 室內不能飄 → 放地上
    { id: 'bench', zone: 'entrance', spot: 'ground' },
  ];
  const d = buildDistrict({ slot, zones: ZONES, elements, colorIndex: 1 });
  const zone = (id) => ({ id, x0: d.zones[id][0], y0: d.zones[id][1], x1: d.zones[id][2], y1: d.zones[id][3] });

  it('物件依位置放進對應的地帶，不合法的位置退回地上', () => {
    expect(d.place).toEqual({ car: 'road-entrance', poster: 'wall-hall', cup: 'surface-hall', boat: 'water-pond', train: 'track-platform' });
  });

  it('每個地帶都落在自己的區域內', () => {
    for (const [name, band] of Object.entries(d.bands)) {
      for (const id of band.zones ?? Object.keys(d.zones)) {
        const r = resolveBand(d.bands, name, zone(id));
        expect(r, `${name}@${id}`).not.toBeNull();
        expect(r.x0).toBeGreaterThanOrEqual(d.zones[id][0]);
        expect(r.x1).toBeLessThanOrEqual(d.zones[id][2]);
        expect(r.top).toBeGreaterThanOrEqual(d.zones[id][1]);
        expect(r.bottom).toBeLessThanOrEqual(d.zones[id][3]);
      }
    }
  });

  it('地面避開車道、鐵軌、水池和檯面', () => {
    const t = Object.fromEntries(d.terrain.zones.map((z) => [z.id, z]));
    const g = d.bands.ground.override;
    expect(g.entrance.bottom).toBeLessThan(t.entrance.road.y0);
    expect(g.platform.bottom).toBeLessThan(t.platform.track.y0);
    expect(g.pond.x1).toBeLessThan(t.pond.pool.x0);
    expect(g.hall.gaps[0][0]).toBeLessThan(d.bands['surface-hall'].levels[0]);
    expect(g.hall.gaps[0][1]).toBeGreaterThan(d.bands['surface-hall'].base);
  });

  it('terrain 帶出畫地形需要的幾何', () => {
    expect(d.terrain).toMatchObject({ x0: 3600, y0: 0, x1: 6200, y1: 1300, color: expect.any(String) });
    expect(d.terrain.zones.find((z) => z.id === 'hall')).toMatchObject({ indoor: true, floor: 'tile', wallBase: 180 });
  });

  it('區域數不是 4 就丟錯', () => {
    expect(() => buildDistrict({ slot, zones: ZONES.slice(0, 3), elements: [] })).toThrow('4 個區域');
  });
});

describe('slot 與地圖大小', () => {
  const slots = [{ x: 0, y: 2600 }, { x: 3600, y: 0 }, { x: 3600, y: 1300 }];
  it('nextSlot 跳過已用的', () => {
    expect(nextSlot(slots, [{ x: 0, y: 2600 }])).toEqual({ x: 3600, y: 0 });
    expect(nextSlot(slots, slots)).toBeNull();
  });
  it('worldSize 包住核心與所有 slot', () => {
    expect(worldSize({ width: 3600, height: 2600 }, [{ x: 0, y: 2600 }])).toEqual({ width: 3600, height: 3900 });
    expect(worldSize({ width: 3600, height: 2600 }, slots)).toEqual({ width: 6200, height: 3900 });
  });
});
