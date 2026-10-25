// 中央通り的桂樹與樹下植栽帶（純資料，可在 Node 測試）。移植自 Ginza 專案 web/decor-layout.js、web/flowerbeds.js。
// 依據：銀座通り約 1.1 km、桂樹 136 株（2019 春）；2021 植栽帶分四區（https://www.ginza.jp/topics/16958）。
// 逐株座標沒有公開資料，以下是按官方密度（每側約 16 m 一株）的近似布局，不是實測位置。
import { createCollider, type Bounds, type CityBuilding, type Obstacle } from './collision';
import type { ColorKey } from './model-dsl';
import { segmentDistance, type Road } from './road-layout';

/** 長條低框花壇（示意尺寸）；radius 包住旋轉後四角 */
export const BED = Object.freeze({ width: 1.1, length: 2.2, radius: 1.25 });
const TREE_SPACING = 16; // 136 株 ÷ 兩側約 2.2 km
const PASSAGE = 1.2;
const WALK = new Set(['footway', 'path', 'pedestrian', 'steps']);

export type PlantKind = 'cover' | 'grass' | 'flower' | 'spike' | 'sasa';

/** zone：0 = 1〜4丁目東、1 = 1〜4丁目西、2 = 5〜8丁目東、3 = 5〜8丁目西；顏色只用色票 */
export const ZONES: readonly { name: string; mix: PlantKind[]; flowers: ColorKey[]; leaf: ColorKey }[] = [
  { name: 'ギンザのノハラ', mix: ['grass', 'grass', 'flower', 'grass', 'cover'], flowers: ['white', 'yellow'], leaf: 'green' },
  { name: '銀座植物園', mix: ['flower', 'flower', 'grass', 'flower', 'cover'], flowers: ['pink', 'yellow', 'purple', 'white'], leaf: 'green' },
  { name: '銀座エキゾチック', mix: ['spike', 'cover', 'spike', 'flower', 'cover'], flowers: ['orange', 'red'], leaf: 'dgreen' },
  { name: 'SASA deco', mix: ['sasa', 'sasa', 'flower', 'sasa', 'sasa'], flowers: ['pink', 'white', 'indigo'], leaf: 'dgreen' },
];

export interface TreeBed extends Obstacle {
  zone: number;
}

export interface BedPlant {
  x: number;
  z: number;
  heading: number;
  kind: PlantKind;
  height: number;
  potted: boolean;
  flower: ColorKey;
  leaf: ColorKey;
}

export interface GreeneryCity {
  buildings: readonly CityBuilding[];
  bounds: Bounds;
  signs?: readonly { x: number; z: number; kind?: string }[];
}

/** 花壇長軸上三點：以半寬為半徑的膠囊近似長條花壇，用於和步道線的淨空判定 */
export function bedAxis(x: number, z: number, heading: number): [number, number][] {
  const reach = BED.length / 2 - BED.width / 2, ax = Math.sin(heading), az = Math.cos(heading);
  return [-1, 0, 1].map((k) => [x + ax * reach * k, z + az * reach * k]);
}

/** skip(x, z) 為 true 的地方不放（遊戲區：物品擺在人行道上，樹會擋視線也會混淆）。 */
export function planGreenery(city: GreeneryCity, roads: readonly Road[], skip: (x: number, z: number) => boolean = () => false): TreeBed[] {
  const collider = createCollider(city.buildings, city.bounds);
  const main = roads.filter((r) => r.name === '中央通り' && !r.crossing && !WALK.has(r.kind));
  const crossing = roads.filter((r) => r.crossing);
  const vehicles = roads.filter((r) => !r.crossing && !WALK.has(r.kind) && r.kind !== 'cycleway');
  const walking = roads.filter((r) => !r.crossing && WALK.has(r.kind));
  const near = (list: readonly Road[], x: number, z: number, clearance: (r: Road) => number) =>
    list.some((r) => r.points.slice(1).some((b, i) => segmentDistance(x, z, r.points[i], b) < clearance(r)));
  const items: TreeBed[] = [];
  for (const road of main) {
    let carry = TREE_SPACING / 2;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) continue;
      const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length, heading = Math.atan2(dx, dz);
      for (let s = carry; s < length; s += TREE_SPACING) for (const side of [-1, 1]) {
        for (const margin of [BED.radius + 0.2, 1.8, 2.5, 3.2, 4.0]) {
          const offset = side * (road.width / 2 + margin);
          const x = a[0] + dx * s - dz * offset, z = a[1] + dz * s + dx * offset;
          if (skip(x, z) || Math.hypot(x, z) < 24) continue; // 銀座四丁目交差點中心留空
          if (collider.blockedCircle(x, z, BED.width / 2 + PASSAGE)) continue; // 花壇外緣到建築留 1.2 m
          if (items.some((p) => Math.hypot(x - p.x, z - p.z) < TREE_SPACING - 4)) continue;
          if (near(vehicles, x, z, (r) => r.width / 2 + BED.radius + 0.2)) continue;
          if (near(crossing, x, z, () => 7)) continue;
          if (bedAxis(x, z, heading).some(([px, pz]) => near(walking, px, pz, () => BED.width / 2 + 0.6))) continue;
          if ((city.signs ?? []).some((p) => p.kind !== 'crown' && Math.hypot(x - p.x, z - p.z) < 3.5)) continue;
          // z > 0 是四丁目以南（5〜8丁目）；x 大於中心線為東側
          const zone = (z > 0 ? 2 : 0) + (x > a[0] + dx * s ? 0 : 1);
          items.push({ x, z, heading, radius: BED.radius, halfWidth: BED.width / 2, halfLength: BED.length / 2, zone });
          break;
        }
      }
      carry = ((carry - length) % TREE_SPACING + TREE_SPACING) % TREE_SPACING;
    }
  }
  return items;
}

/** 花壇內 24 株配植（local z 沿街）；每次結果相同 */
export function bedPlants(bed: TreeBed): BedPlant[] {
  const zone = ZONES[bed.zone % ZONES.length];
  const c = Math.cos(bed.heading), s = Math.sin(bed.heading);
  return Array.from({ length: 24 }, (_, i) => {
    const lx = (i % 4 - 1.5) * 0.21, lz = (Math.floor(i / 4) - 2.5) * 0.34;
    const kind: PlantKind = Math.abs(lz) < 0.25 ? 'cover' : zone.mix[(i + bed.zone) % zone.mix.length];
    return {
      x: bed.x + lx * c + lz * s, z: bed.z - lx * s + lz * c,
      heading: bed.heading + (i % 3 - 1) * 0.3, kind,
      height: 0.28 + ((i * 7 + bed.zone) % 5) * 0.055,
      potted: bed.zone === 3 && kind === 'flower', // SASA deco 以盆栽做高低差
      flower: zone.flowers[i % zone.flowers.length], leaf: zone.leaf,
    };
  });
}
