import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCollider, type Bounds, type CityBuilding } from '@/lib/city3d/collision';
import { curbTriangles, fitCentralRoads, isMajorRoad, PAIRED, segmentDistance, type Road } from '@/lib/city3d/road-layout';
import { BED, bedAxis, bedPlants, planGreenery, ZONES } from '@/lib/city3d/greenery';
import { inZone, toWorld } from '@/lib/city3d/street-frame';
import { GINZA_STREET } from '@/data/city3d/ginza-street';

const load = <T,>(file: string): T => JSON.parse(readFileSync(path.join(process.cwd(), 'public/city3d/ginza', file), 'utf8')) as T;
const city = load<{ buildings: CityBuilding[]; bounds: Bounds; signs?: { x: number; z: number; kind?: string }[] }>('city.json');
const rawRoads = load<Road[]>('roads.json');
const roads = fitCentralRoads(rawRoads);
const WALK = new Set(['footway', 'path', 'pedestrian', 'steps']);

describe('中央通り車道寬度', () => {
  const north: Road = { name: '中央通り', kind: 'trunk', width: 22, widthSource: 'estimated', points: [[0, -3.5], [40, -3.5]] };
  const south: Road = { ...north, points: [[0, 3.5], [40, 3.5]] };

  test('上下行分開時寬度 = 對向中心線間距，不改輸入、不動中心線', () => {
    const input = [north, south];
    const before = JSON.stringify(input);
    const fitted = fitCentralRoads(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(fitted.map((r) => r.width)).toEqual([7, 7]);
    expect(fitted[0].points).toEqual(north.points);
    expect(fitted[0].widthStatus).toBe(PAIRED);
  });

  test('有 OSM 寬度或不是中央通り的路不改', () => {
    expect(fitCentralRoads([{ ...north, widthSource: 'osm' }, south])[0].width).toBe(22);
    expect(fitCentralRoads([{ ...north, name: '別の道' }, south])[0].width).toBe(22);
  });

  test('路緣只畫外側；分開的單向段仍畫車道虛線', () => {
    const fitted = fitCentralRoads([north, south]);
    expect(fitted.every(isMajorRoad)).toBe(true);
    const zs = curbTriangles(fitted).filter((_, i) => i % 3 === 2);
    expect(zs.length).toBe(2 * 6);
    expect(zs.every((z) => Math.abs(z) >= 7 - 1e-9 && Math.abs(z) <= 7.3 + 1e-9)).toBe(true);
    expect(curbTriangles(fitted, () => true)).toEqual([]);
  });

  test('實際地圖：遊戲區外側路緣與遊戲區積木路緣（v = 11）對齊', () => {
    const { frame } = GINZA_STREET;
    const [ox, oz] = toWorld(frame, 0, 0);
    const pairs = roads.filter((r) => r.name === '中央通り' && r.widthStatus === PAIRED);
    expect(pairs.length).toBeGreaterThan(4);
    // 遊戲區 u = 0 處：對向車道中心 + 半寬 ≈ 11 m
    const [px, pz] = toWorld(frame, 0, 11);
    const edge = Math.min(...pairs.map((r) => Math.min(...r.points.slice(1).map((b, i) => segmentDistance(px, pz, r.points[i], b) - r.width / 2))));
    expect(Math.abs(edge)).toBeLessThan(1.2);
    expect(Math.hypot(ox, oz)).toBeGreaterThan(0);
  });
});

describe('中央通り桂樹與植栽帶', () => {
  const beds = planGreenery(city, roads, (x, z) => inZone(GINZA_STREET.frame, GINZA_STREET.playZone, x, z));

  test('依官方 136 株密度近似放置，四區都有，結果可重現', () => {
    expect(beds.length).toBeGreaterThan(60);
    expect(beds.length).toBeLessThanOrEqual(136);
    expect(new Set(beds.map((b) => b.zone)).size).toBe(4);
    expect(planGreenery(city, roads, (x, z) => inZone(GINZA_STREET.frame, GINZA_STREET.playZone, x, z))).toEqual(beds);
  });

  test('不放在遊戲區、建築、車道、過街線上；步道線兩側留通道', () => {
    const collider = createCollider(city.buildings, city.bounds);
    const bad: string[] = [];
    for (const b of beds) {
      if (inZone(GINZA_STREET.frame, GINZA_STREET.playZone, b.x, b.z)) bad.push('play-zone');
      if (collider.blockedCircle(b.x, b.z, BED.width / 2 + 1.2)) bad.push('building');
      for (const r of roads) for (let i = 1; i < r.points.length; i++) {
        const d = segmentDistance(b.x, b.z, r.points[i - 1], r.points[i]);
        if (r.crossing) { if (d < 7) bad.push('crossing'); }
        else if (WALK.has(r.kind)) {
          if (d > 6) continue;
          const axis = Math.min(...bedAxis(b.x, b.z, b.heading).map(([x, z]) => segmentDistance(x, z, r.points[i - 1], r.points[i])));
          if (axis < BED.width / 2 + 0.6) bad.push('walkway');
        } else if (r.kind !== 'cycleway' && d < r.width / 2 + BED.radius + 0.2) bad.push('vehicle');
      }
    }
    expect(bad).toEqual([]);
  });

  test('每區有自己的特徵植物，只有 SASA deco 用盆栽，植物不超出花壇', () => {
    const signature = ['grass', 'flower', 'spike', 'sasa'];
    for (const b of beds) {
      const plants = bedPlants(b);
      expect(plants).toHaveLength(24);
      expect(plants.some((p) => p.kind === signature[b.zone])).toBe(true);
      expect(plants.some((p) => p.potted)).toBe(b.zone === 3);
      expect(plants.every((p) => Math.hypot(p.x - b.x, p.z - b.z) + 0.16 < BED.radius)).toBe(true);
    }
    expect(ZONES).toHaveLength(4);
  });

  test('花壇按朝向擋路：長邊擋住、側邊外可通行', () => {
    const bed = beds[0];
    const c = createCollider([], city.bounds, [bed]);
    expect(c.blocked(bed.x + Math.sin(bed.heading), bed.z + Math.cos(bed.heading))).toBe(true);
    expect(c.blocked(bed.x + Math.cos(bed.heading) * 0.7, bed.z - Math.sin(bed.heading) * 0.7)).toBe(false);
  });
});
