import { describe, expect, test } from 'vitest';
import { buildTown, districtAt, districtBounds, districtParts, partSwitch, zoneKey } from '@/lib/town';
import type { SceneData, SceneItem, Zone } from '@/lib/types';

const item = (id: string, zone: string, x: number): SceneItem => ({
  id, zone, category: '', words: { 'zh-TW': id, en: id, ja: { text: id, reading: id } },
  viewBox: [0, 0, 10, 10], body: '', x, y: 500, w: 50, h: 50, rotate: 0, flip: false,
});
const scene = (id: string, zones: Zone[], items: SceneItem[]): SceneData => ({ id, name: id, width: 2000, height: 1000, outdoorHeight: 1000, streets: [], surfaces: [], zones, items });
const z = (id: string, x0: number, y0: number, x1: number, y1: number, indoor = false): Zone => ({ id, name: id, x0, y0, x1, y1, indoor });

// a 在上半，b 在下半（L 形：b 的 z3 在右上）
const town = buildTown([
  scene('a', [z('z1', 0, 0, 1000, 500)], [item('apple', 'z1', 100)]),
  scene('b', [z('z2', 0, 500, 2000, 1000), z('z3', 1000, 0, 2000, 500)], [item('bench', 'z2', 300)]),
]);

describe('buildTown', () => {
  test('場景共用同一張地圖，座標不變', () => {
    expect([town.width, town.height]).toEqual([2000, 1000]);
    expect(town.items.get('bench')).toMatchObject({ sceneId: 'b', x: 300 });
    expect(town.zones.get(zoneKey('b', 'z3'))).toMatchObject({ sceneId: 'b', x0: 1000, y0: 0 });
  });

  test('物件 id 重複時報錯', () => {
    expect(() => buildTown([scene('a', [], [item('x', 'z1', 0)]), scene('b', [], [item('x', 'z1', 0)])])).toThrow(/x/);
  });

  test('districtBounds：所有區域的外框', () => {
    expect(districtBounds(town.districts[1])).toEqual({ x0: 0, y0: 0, x1: 2000, y1: 1000 });
  });
});

describe('districtAt', () => {
  test('依點所在的區域找街區（2D）', () => {
    expect(districtAt(town, { x: 10, y: 10 })?.scene.id).toBe('a');
    expect(districtAt(town, { x: 1500, y: 10 })?.scene.id).toBe('b');
    expect(districtAt(town, { x: 10, y: 900 })?.scene.id).toBe('b');
  });

  test('地圖外回傳 null', () => {
    expect(districtAt(town, { x: -5, y: 10 })).toBeNull();
  });
});

describe('戶外 / 室內分區', () => {
  // 戶外在北（y < 1000）、室內在南
  const split = buildTown([
    { ...scene('h', [z('door', 0, 0, 500, 500), z('hall', 0, 1200, 500, 1700, true), z('ward', 500, 1200, 1000, 1700, true)], []), height: 1800 },
    scene('park', [z('lawn', 500, 0, 1000, 500)], []),
  ]);
  const h = split.districts[0];

  test('districtParts：戶外在前，各自的外框', () => {
    expect(districtParts(h).map((p) => [p.indoor, p.zones.map((q) => q.id), p.bounds])).toEqual([
      [false, ['door'], { x0: 0, y0: 0, x1: 500, y1: 500 }],
      [true, ['hall', 'ward'], { x0: 0, y0: 1200, x1: 1000, y1: 1700 }],
    ]);
    expect(districtParts(split.districts[1])).toHaveLength(1);
  });

  test('partSwitch：在戶外給「進入室內」（第一個室內區域），在室內給「回到戶外」；只有一部分沒有按鈕', () => {
    expect(partSwitch(h, { x: 200, y: 300 }, 1000)).toEqual({ toIndoor: true, zoneName: 'hall', target: { x: 250, y: 1450 } });
    expect(partSwitch(h, { x: 200, y: 1500 }, 1000)).toEqual({ toIndoor: false, zoneName: 'door', target: { x: 250, y: 250 } });
    expect(partSwitch(split.districts[1], { x: 600, y: 100 }, 1000)).toBeNull();
  });

  test('buildTown 帶出戶外高度與大街', () => {
    expect(split.outdoorHeight).toBe(1000);
    expect(split.height).toBe(1800);
  });
});
