// 室內空間（純函式）：在臨街大樓的一樓挖出店面。房間範圍用街道座標（u 沿街、v 離道路中心線），
// 大樓切成「一樓剩下的部分」（照常擋路）＋「房間上方的樓層」（底部抬高到天花板，不擋路），樓上照樣看得到。
import type { CityBuilding, Ring } from './collision';
import type { ColorKey } from './model-dsl';
import { toStreet, type StreetFrame } from './street-frame';

export interface StreetRoom {
  id: string;
  u0: number;
  u1: number;
  /** 店面（玻璃門窗）所在的 v */
  v0: number;
  v1: number;
  /** 天花板高度（公尺） */
  height: number;
  /** 門口 [u 起, u 迄]，其餘店面是玻璃 */
  door: [number, number];
}

export interface RoomStyle {
  floor: ColorKey;
  wall: ColorKey;
  /** 店面招牌帶、窗台、立柱 */
  accent: ColorKey;
  /** 後牆的陳列架 [u 起, u 迄]；bottom > 0.5 是掛牆的層板（不擋路），否則落地櫃 */
  shelf?: { u0: number; u1: number; bottom: number };
  /** 地毯 [中心 u, 中心 v, 寬, 深] 與顏色 */
  rug?: { u: number; v: number; w: number; d: number; color: ColorKey };
}

/** 街道座標的線性函數 ≤ 0 的那一側 */
type Side = (u: number, v: number) => number;

const MIN_AREA = 0.5;

function clip(ring: Ring, frame: StreetFrame, side: Side): Ring {
  const out: Ring = [];
  const g = ring.map(([x, z]) => side(...toStreet(frame, x, z)));
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const a = ring[i], b = ring[j];
    if (g[i] <= 0) out.push(a);
    if ((g[i] <= 0) !== (g[j] <= 0)) {
      const t = g[i] / (g[i] - g[j]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const clipAll = (ring: Ring, frame: StreetFrame, sides: Side[]) =>
  sides.reduce((r, side) => (r.length < 3 ? r : clip(r, frame, side)), ring);

export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
}

const inside = (r: StreetRoom): Side[] => [
  (u) => r.u0 - u, (u) => u - r.u1, (_, v) => r.v0 - v, (_, v) => v - r.v1,
];

/** 房間以外：四塊互不重疊的凸區域（左、右、前、後） */
const outside = (r: StreetRoom): Side[][] => [
  [(u) => u - r.u0],
  [(u) => r.u1 - u],
  [(u) => r.u0 - u, (u) => u - r.u1, (_, v) => v - r.v0],
  [(u) => r.u0 - u, (u) => u - r.u1, (_, v) => r.v1 - v],
];

function subtract(ring: Ring, frame: StreetFrame, room: StreetRoom): Ring[] {
  return outside(room).map((sides) => clipAll(ring, frame, sides)).filter((r) => r.length >= 3 && ringArea(r) >= MIN_AREA);
}

/** 有中庭（holes）的大樓不切，房間要放在沒有中庭的大樓裡 */
export function carveRooms(buildings: readonly CityBuilding[], frame: StreetFrame, rooms: readonly StreetRoom[]): CityBuilding[] {
  return buildings.flatMap((b) => {
    if (b.holes?.length) return [b];
    const hit = rooms.filter((room) => b.outers.some((outer) => ringArea(clipAll(outer, frame, inside(room))) >= MIN_AREA));
    if (!hit.length) return [b];
    const ground = hit.reduce<Ring[]>((rings, room) => rings.flatMap((r) => subtract(r, frame, room)), b.outers);
    const upper = hit.flatMap((room) => b.height <= room.height ? [] : b.outers
      .map((outer) => clipAll(outer, frame, inside(room)))
      .filter((r) => r.length >= 3 && ringArea(r) >= MIN_AREA)
      .map((outer, i): CityBuilding => ({ ...b, id: `${b.id}~${room.id}${i || ''}`, base: Math.max(b.base ?? 0, room.height), outers: [outer] })));
    return [{ ...b, outers: ground }, ...upper];
  });
}

/** margin > 0：只算離牆至少這麼遠的範圍（鏡頭不能貼進牆裡） */
export function roomAt(rooms: readonly StreetRoom[], frame: StreetFrame, x: number, z: number, margin = 0): StreetRoom | null {
  const [u, v] = toStreet(frame, x, z);
  return rooms.find((r) => u >= r.u0 + margin && u <= r.u1 - margin && v >= r.v0 + margin && v <= r.v1 - margin) ?? null;
}
