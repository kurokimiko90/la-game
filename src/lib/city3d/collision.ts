// 3D 城市的行走碰撞（純函式，可在 Node 測試）。移植自 Ginza 專案的 web/collision.js。
// 座標：x 往東、z 往南，單位公尺；建築用 OSM 外框（outers）與中庭（holes）。

export type Ring = [number, number][];
/** [minX, minZ, maxX, maxZ] */
export type Bounds = [number, number, number, number];

export interface CityBuilding {
  id: string;
  height: number;
  base?: number;
  tone?: number;
  outers: Ring[];
  holes?: Ring[];
}

export interface Collider {
  buildingAt(x: number, z: number): string | null;
  blocked(x: number, z: number): boolean;
  blockedCircle(x: number, z: number, radius: number): boolean;
  /** 撞牆時沿牆滑動：先試完整位移，再試只走 x 或只走 z */
  move(x: number, z: number, dx: number, dz: number, radius: number): [number, number];
  nearestFree(x: number, z: number, radius: number, maxDistance?: number): [number, number] | null;
}

const CELL = 24;
/** 底部高於這個值（騎樓上方、天橋）不擋路 */
const ELEVATED_BASE = 2;

interface Solid {
  id: string;
  outer: Ring;
  holes: Ring[];
  box: Bounds;
}

export function pointInRing(x: number, z: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function ringBox(ring: Ring): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return [minX, minZ, maxX, maxZ];
}

export function createCollider(buildings: readonly CityBuilding[], bounds: Bounds): Collider {
  const grid = new Map<string, Solid[]>();
  const solids: Solid[] = buildings
    .filter((b) => (b.base ?? 0) < ELEVATED_BASE)
    .flatMap((b) => b.outers.map((outer) => ({ id: b.id, outer, holes: b.holes ?? [], box: ringBox(outer) })));

  for (const solid of solids) {
    const [x0, z0, x1, z1] = solid.box;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const key = `${cx},${cz}`;
        const cell = grid.get(key);
        if (cell) cell.push(solid);
        else grid.set(key, [solid]);
      }
    }
  }

  function buildingAt(x: number, z: number): string | null {
    const cell = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    const hit = cell?.find(({ outer, holes, box }) =>
      x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3]
      && pointInRing(x, z, outer) && !holes.some((hole) => pointInRing(x, z, hole)));
    return hit ? hit.id : null;
  }

  function blocked(x: number, z: number): boolean {
    if (x <= bounds[0] || z <= bounds[1] || x >= bounds[2] || z >= bounds[3]) return true;
    return buildingAt(x, z) !== null;
  }

  function blockedCircle(x: number, z: number, radius: number): boolean {
    if (blocked(x, z)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (blocked(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return true;
    }
    return false;
  }

  function move(x: number, z: number, dx: number, dz: number, radius: number): [number, number] {
    if (!blockedCircle(x + dx, z + dz, radius)) return [x + dx, z + dz];
    if (!blockedCircle(x + dx, z, radius)) return [x + dx, z];
    if (!blockedCircle(x, z + dz, radius)) return [x, z + dz];
    return [x, z];
  }

  function nearestFree(x: number, z: number, radius: number, maxDistance = 160): [number, number] | null {
    if (!blockedCircle(x, z, radius)) return [x, z];
    for (let d = 4; d <= maxDistance; d += 4) {
      const steps = Math.max(12, Math.round(d));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (!blockedCircle(px, pz, radius)) return [px, pz];
      }
    }
    return null;
  }

  return { buildingAt, blocked, blockedCircle, move, nearestFree };
}
