// 街道座標系：沿一段直線街道擺放場景。u = 沿街方向（公尺），v = 離道路中心線的距離（往人行道為正）。
// 物件模型的正面朝本地 +z；rot = 0 表示正面朝向馬路，正值為從上往下看逆時針轉（度）。

export interface StreetFrame {
  /** 道路中心線上 u = 0 的點 [x, z] */
  origin: [number, number];
  /** 沿街方向的單位向量 [dx, dz] */
  dir: [number, number];
}

export interface StreetSpot {
  u: number;
  v: number;
  /** 離地高度（放在檯面上時 > 0） */
  y?: number;
  rot?: number;
}

export interface WorldPose {
  x: number;
  y: number;
  z: number;
  /** three.js 的 rotation.y：把本地 +z 轉到世界的朝向 */
  yaw: number;
}

/** v 增加的方向（從道路中心線指向人行道） */
export function normalOf(frame: StreetFrame): [number, number] {
  const [dx, dz] = frame.dir;
  return [-dz, dx];
}

export function toWorld(frame: StreetFrame, u: number, v: number): [number, number] {
  const [dx, dz] = frame.dir;
  const [nx, nz] = normalOf(frame);
  return [frame.origin[0] + dx * u + nx * v, frame.origin[1] + dz * u + nz * v];
}

/** 從世界座標換回街道座標 */
export function toStreet(frame: StreetFrame, x: number, z: number): [number, number] {
  const ox = x - frame.origin[0], oz = z - frame.origin[1];
  const [dx, dz] = frame.dir;
  const [nx, nz] = normalOf(frame);
  return [ox * dx + oz * dz, ox * nx + oz * nz];
}

/** 街道座標的矩形範圍 */
export interface StreetZone {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export function inZone(frame: StreetFrame, zone: StreetZone, x: number, z: number): boolean {
  const [u, v] = toStreet(frame, x, z);
  return u >= zone.u0 && u <= zone.u1 && v >= zone.v0 && v <= zone.v1;
}

export function poseOf(frame: StreetFrame, spot: StreetSpot): WorldPose {
  const [x, z] = toWorld(frame, spot.u, spot.v);
  const [nx, nz] = normalOf(frame);
  // 正面朝馬路 = 朝 -normal；再依 rot 逆時針轉
  const base = Math.atan2(-nx, -nz);
  return { x, y: spot.y ?? 0, z, yaw: base + ((spot.rot ?? 0) * Math.PI) / 180 };
}
