import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCollider, type Bounds, type CityBuilding } from '@/lib/city3d/collision';
import { inZone, poseOf, toStreet, toWorld, type StreetFrame } from '@/lib/city3d/street-frame';
import { validateModel, modelBounds, box } from '@/lib/city3d/model-dsl';
import { STREET_FIXTURES, STREET_MODELS } from '@/data/city3d/street-models';
import { GINZA_STREET } from '@/data/city3d/ginza-street';
import street from '@/data/scenes/street.json';

describe('collision', () => {
  const square: CityBuilding = { id: 'a', height: 10, outers: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
  const courtyard: CityBuilding = {
    id: 'b', height: 10,
    outers: [[[30, 0], [60, 0], [60, 30], [30, 30]]],
    holes: [[[40, 10], [50, 10], [50, 20], [40, 20]]],
  };
  const elevated: CityBuilding = { id: 'c', height: 10, base: 6, outers: [[[-30, -30], [-20, -30], [-20, -20], [-30, -20]]] };
  const c = createCollider([square, courtyard, elevated], [-50, -50, 100, 100]);

  test('建築內、地圖邊界不可走；建築外、中庭、架空建築下方可走', () => {
    expect(c.blocked(5, 5)).toBe(true);
    expect(c.blocked(100, 0)).toBe(true);
    expect(c.blocked(-1, 5)).toBe(false);
    expect(c.blocked(45, 15)).toBe(false);
    expect(c.blocked(-25, -25)).toBe(false);
    expect(c.buildingAt(35, 5)).toBe('b');
  });

  test('斜向撞牆時沿牆滑動', () => {
    expect(c.move(-0.5, 5, 0.4, 0.4, 0.35)).toEqual([-0.5, 5.4]);
  });

  test('找得到最近可站立點', () => {
    const spot = c.nearestFree(5, 5, 0.35);
    expect(spot).not.toBeNull();
    expect(c.blockedCircle(spot![0], spot![1], 0.35)).toBe(false);
  });
});

describe('street-frame', () => {
  const frame: StreetFrame = { origin: [10, 20], dir: [0.6, -0.8] };

  test('街道座標與世界座標可以互換', () => {
    const [x, z] = toWorld(frame, 12, -3);
    const [u, v] = toStreet(frame, x, z);
    expect(u).toBeCloseTo(12);
    expect(v).toBeCloseTo(-3);
  });

  test('inZone 用街道座標判斷範圍', () => {
    const zone = { u0: 0, u1: 10, v0: -2, v1: 2 };
    expect(inZone(frame, zone, ...toWorld(frame, 5, 1))).toBe(true);
    expect(inZone(frame, zone, ...toWorld(frame, 11, 0))).toBe(false);
    expect(inZone(frame, zone, ...toWorld(frame, 5, -3))).toBe(false);
  });

  test('rot 0 正面朝馬路（-v），rot 90 正面朝 -u', () => {
    const front = (rot: number) => {
      const { yaw } = poseOf(frame, { u: 0, v: 0, rot });
      const [u, v] = toStreet(frame, frame.origin[0] + Math.sin(yaw), frame.origin[1] + Math.cos(yaw));
      return [Math.round(u) + 0, Math.round(v) + 0];
    };
    expect(front(0)).toEqual([0, -1]);
    expect(front(90)).toEqual([-1, 0]);
    expect(front(-90)).toEqual([1, 0]);
  });
});

describe('model-dsl', () => {
  test('box 的 y 參數是底部高度', () => {
    expect(box(1, 2, 1, 0, 0.5, 0, 'red').p).toEqual([0, 1.5, 0]);
  });

  test('檢查會抓出不在色票的顏色與空模型', () => {
    expect(validateModel('x', { parts: [] })).toHaveLength(1);
    const bad = { parts: [{ ...box(1, 1, 1, 0, 0, 0, 'red'), c: 'hotpink' as never }] };
    expect(validateModel('x', bad).join()).toMatch(/色票/);
  });
});

describe('商業街 3D 資料', () => {
  const itemIds = street.items.map((it) => it.id);

  test('每個 2D 物件都有 3D 模型，模型都通過檢查', () => {
    expect(Object.keys(STREET_MODELS).sort()).toEqual([...itemIds].sort());
    const problems = Object.entries({ ...STREET_MODELS, ...STREET_FIXTURES }).flatMap(([id, m]) => validateModel(id, m));
    expect(problems).toEqual([]);
  });

  test('所有物品與出生點都在遊戲區內', () => {
    const { frame, playZone } = GINZA_STREET;
    for (const spot of [...GINZA_STREET.items, GINZA_STREET.spawn]) {
      expect(inZone(frame, playZone, ...toWorld(frame, spot.u, spot.v)), String('id' in spot ? spot.id : 'spawn')).toBe(true);
    }
  });

  test('每個物件剛好擺一次，家具都有模型', () => {
    expect(GINZA_STREET.items.map((p) => p.id).sort()).toEqual([...itemIds].sort());
    for (const f of GINZA_STREET.fixtures) expect(STREET_FIXTURES[f.model], f.model).toBeDefined();
  });

  test('小東西放大到第一人稱看得見（最長邊至少 18 cm）', () => {
    for (const [id, m] of Object.entries(STREET_MODELS)) {
      const { min, max } = modelBounds(m);
      expect(Math.max(...max.map((v, i) => v - min[i])), id).toBeGreaterThanOrEqual(0.18);
    }
  });

  test('在真實銀座地圖上：物件、家具和出生點都不在建築裡', () => {
    const city = JSON.parse(readFileSync(path.join(__dirname, '../../public/city3d/ginza/city.json'), 'utf8')) as { buildings: CityBuilding[]; bounds: Bounds };
    const collider = createCollider(city.buildings, city.bounds);
    const { frame } = GINZA_STREET;
    for (const spot of [...GINZA_STREET.items, ...GINZA_STREET.fixtures, GINZA_STREET.spawn]) {
      const [x, z] = toWorld(frame, spot.u, spot.v);
      const label = String('id' in spot ? spot.id : 'model' in spot ? spot.model : 'spawn');
      expect(collider.blocked(x, z), label).toBe(false);
    }
  });
});
