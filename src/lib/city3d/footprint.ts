// 物件的地面佔地（純函式）：第三人稱小人不能穿過郵筒、桌子、立牌。
// 只取腳邊高度以下的頂點算外框，紅綠燈的橫臂、遮陽棚不會把佔地撐大。

/** 物件本地座標的佔地矩形，放到世界上要配合 x、z、yaw */
export interface Footprint {
  x: number;
  z: number;
  /** 同 three.js rotation.y */
  yaw: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 低於這個高度的部分才算擋路（公尺） */
export const FOOT_HEIGHT = 0.9;
/** 比這矮的物件（水溝蓋、斑馬線）可以踩過去 */
const MIN_HEIGHT = 0.15;

/** positions：模型頂點 [x, y, z, x, y, z, …]（本地座標）；baseY：物件底部離地高度（放在檯面上、掛在牆上） */
export function footprintBox(positions: ArrayLike<number>, baseY = 0): Omit<Footprint, 'x' | 'z' | 'yaw'> | null {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const y = positions[i + 1] + baseY;
    maxY = Math.max(maxY, y);
    if (y > FOOT_HEIGHT) continue;
    const x = positions[i], z = positions[i + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (maxY < MIN_HEIGHT || minX === Infinity) return null;
  return { minX, maxX, minZ, maxZ };
}

/** 半徑 radius 的圓（玩家）站在世界座標 (px, pz) 會不會碰到佔地 */
export function hitsFootprint(f: Footprint, px: number, pz: number, radius: number): boolean {
  // 轉到物件本地：先平移再反向旋轉（three.js 繞 y 旋轉 θ：x' = x cos + z sin，z' = -x sin + z cos）
  const dx = px - f.x, dz = pz - f.z;
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const cx = Math.min(Math.max(lx, f.minX), f.maxX);
  const cz = Math.min(Math.max(lz, f.minZ), f.maxZ);
  return Math.hypot(lx - cx, lz - cz) < radius;
}
