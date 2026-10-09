// 臨街外牆篩選：道路線段以網格索引查詢，只接受朝向道路且外側沒有相鄰建築的牆面。
import { createCollider, type CityBuilding } from './collision';

interface RoadSegment { a: [number, number]; b: [number, number]; reach: number }
interface StreetRoad { width: number; points: [number, number][] }
const CELL = 32;

export function createStreetFrontFilter(buildings: readonly CityBuilding[], roads: readonly StreetRoad[]) {
  const grid = new Map<string, RoadSegment[]>();
  const collider = createCollider(buildings, [-10000, -10000, 10000, 10000]);
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const reach = road.width / 2 + 6;
      const segment = { a, b, reach };
      for (let x = Math.floor((Math.min(a[0], b[0]) - reach) / CELL); x <= Math.floor((Math.max(a[0], b[0]) + reach) / CELL); x++) {
        for (let z = Math.floor((Math.min(a[1], b[1]) - reach) / CELL); z <= Math.floor((Math.max(a[1], b[1]) + reach) / CELL); z++) {
          const key = `${x},${z}`;
          const cell = grid.get(key);
          if (cell) cell.push(segment);
          else grid.set(key, [segment]);
        }
      }
    }
  }
  return (x: number, z: number, nx: number, nz: number): boolean => {
    if (collider.buildingAt(x + nx * 0.8, z + nz * 0.8) !== null) return false;
    return (grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []).some(({ a, b, reach }) => {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const rx = a[0] + dx * t - x, rz = a[1] + dz * t - z;
      return rx * nx + rz * nz > 0.1 && Math.hypot(rx, rz) <= reach;
    });
  };
}
