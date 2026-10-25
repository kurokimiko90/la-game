// 道路幾何修正與標線（純函式，可在 Node 測試）。移植自 Ginza 專案 web/road-layout.js、web/road-markings.js。
// 中央通り在 OSM 是上下行兩條中心線（相距約 6–9 m），原始資料各估 22 m 寬會互相重疊、吃掉人行道；
// 這裡把每條寬度改成與對向中心線的間距，人行道恢復約 6 m（和遊戲區 v = 11 路緣、v = 17 立面一致）。

export interface Road {
  kind: string;
  width: number;
  points: [number, number][];
  name?: string;
  en?: string;
  widthSource?: 'osm' | 'estimated';
  widthStatus?: string;
  /** OSM footway=crossing：過街線，不畫成人行道帶狀面 */
  crossing?: boolean;
  /** 有明確斑馬線標記 */
  marked?: boolean;
}

type Point = [number, number];

export const PAIRED = 'estimated-from-paired-carriageway';
const PAIR_RANGE: [number, number] = [4, 12];
const CURB_WIDTH = 0.3;

export function segmentDistance(x: number, z: number, a: Point, b: Point): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

function segments(road: Road): { a: Point; b: Point }[] {
  return road.points.slice(1).map((b, i) => ({ a: road.points[i], b }));
}

/** 與平行對向中心線的中位間距（公尺）；配對長度不足一半時回傳 null。 */
function pairedSeparation(road: Road, roads: readonly Road[]): number | null {
  const others = roads
    .filter((o) => o !== road && o.name === road.name && o.kind === road.kind && !o.crossing)
    .flatMap(segments);
  const samples: { d: number; length: number }[] = [];
  let total = 0;
  for (const { a, b } of segments(road)) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 10) continue;
    total += length;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const distances = others
      .filter((o) => {
        const ol = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
        const cos = ((o.b[0] - o.a[0]) * (b[0] - a[0]) + (o.b[1] - o.a[1]) * (b[1] - a[1])) / (ol * length);
        return ol >= 5 && Math.abs(cos) >= 0.96;
      })
      .map((o) => segmentDistance(mx, mz, o.a, o.b))
      .filter((d) => d >= PAIR_RANGE[0] && d <= PAIR_RANGE[1]);
    if (distances.length) samples.push({ d: Math.min(...distances), length });
  }
  const paired = samples.reduce((sum, s) => sum + s.length, 0);
  if (!total || paired < total / 2) return null;
  const sorted = samples.map((s) => s.d).sort((x, y) => x - y);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
}

/**
 * 只修正估算寬度的中央通り trunk；不移動中心線、不拆段，回傳新陣列（不改輸入）。
 * 1. 上下行分開 → 寬度 = 對向間距；2. 否則以平行人行道推估車道邊界（半寬至少 7 m）。
 */
export function fitCentralRoads(roads: readonly Road[]): Road[] {
  const walks = roads.filter((r) => r.kind === 'footway' && !r.crossing)
    .flatMap((r) => segments(r).map((s) => ({ ...s, width: r.width })));
  return roads.map((r) => {
    if (r.name !== '中央通り' || r.kind !== 'trunk' || r.width !== 22 || r.widthSource !== 'estimated') return r;
    const separation = pairedSeparation(r, roads);
    if (separation) return { ...r, width: separation, widthStatus: PAIRED };
    let half = 11;
    for (const { a, b } of segments(r)) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      for (const walk of walks) {
        const wx = walk.b[0] - walk.a[0], wz = walk.b[1] - walk.a[1], wl = Math.hypot(wx, wz);
        if (wl < 5 || Math.abs((wx * (b[0] - a[0]) + wz * (b[1] - a[1])) / (wl * length)) < 0.96) continue;
        const distance = segmentDistance(mx, mz, walk.a, walk.b);
        if (distance < 7 || distance > 15) continue;
        half = Math.min(half, Math.max(7, distance - walk.width / 2 - 1.4));
      }
    }
    return { ...r, width: half * 2, widthStatus: 'estimated-from-osm-footways' };
  });
}

/** 主要幹道：寬 ≥ 11 m，或上下行分開繪製的多車道單向段（每條約 6–9 m）。畫車道虛線用。 */
export function isMajorRoad(road: Road): boolean {
  return road.width >= 11 || road.widthStatus === PAIRED;
}

/**
 * 上下行分開路段只在外側（人行道側）畫路緣；內側是對向車道，不畫。
 * skip(x, z) 為 true 的路段不畫（遊戲區自己有路緣積木）。回傳平面三角形頂點 [x, y, z, ...]。
 */
export function curbTriangles(roads: readonly Road[], skip: (x: number, z: number) => boolean = () => false, y = 0.038): number[] {
  const paired = roads.filter((r) => r.widthStatus === PAIRED);
  const buf: number[] = [];
  const push = (quad: Point[]) => { for (const k of [0, 1, 2, 0, 2, 3]) buf.push(quad[k][0], y, quad[k][1]); };
  for (const road of paired) {
    const others = paired.filter((o) => o !== road);
    for (const { a: [ax, az], b: [bx, bz] } of segments(road)) {
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01 || skip((ax + bx) / 2, (az + bz) / 2)) continue;
      const nx = -(bz - az) / length, nz = (bx - ax) / length;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const inner = road.width / 2, outer = inner + CURB_WIDTH;
      for (const side of [-1, 1]) {
        const px = mx + nx * side * (outer + 0.6), pz = mz + nz * side * (outer + 0.6);
        if (others.some((o) => segments(o).some((s) => segmentDistance(px, pz, s.a, s.b) < o.width / 2))) continue;
        push(side > 0
          ? [[ax + nx * outer, az + nz * outer], [bx + nx * outer, bz + nz * outer], [bx + nx * inner, bz + nz * inner], [ax + nx * inner, az + nz * inner]]
          : [[ax - nx * inner, az - nz * inner], [bx - nx * inner, bz - nz * inner], [bx - nx * outer, bz - nz * outer], [ax - nx * outer, az - nz * outer]]);
      }
    }
  }
  return buf;
}
