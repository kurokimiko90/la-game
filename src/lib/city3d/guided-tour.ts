// 聽讀導覽：小人自動沿人行道走過遊戲區，每站停下、依序轉向站內物品並念出單字（移植自 Ginza web/guided-tour.js）。
// 只有路線與狀態機，不碰 DOM／three.js。座標用街道座標 [u, v]（見 street-frame.ts）。
import type { StreetRoom } from './rooms';

export type StreetPoint = [number, number];

export interface TourStopDef {
  id: string;
  /** 對應 2D 場景的區域 id（字卡顯示區域名） */
  zone: string;
  /** 站立位置 */
  stand: { u: number; v: number };
  /** 依序轉向並念出的物品 */
  items: string[];
}

export interface TourStop extends TourStopDef {
  /** 從上一站走到這裡的路徑（含起點）；第一站只有站立點，直接傳送 */
  path: StreetPoint[];
}

export type TourPhase = 'walking' | 'turning' | 'looking';

export interface TourState {
  index: number;
  phase: TourPhase;
  /** walking：已走距離；turning／looking：本階段經過秒數 */
  walked: number;
  timer: number;
  paused: boolean;
  /** 本站是傳送抵達（介面淡入） */
  cut: boolean;
  finished: boolean;
}

/** 人行道上的步行線（v）：路緣物品在 11.3–11.8、店側物品在 14.2 以外 */
export const WALK_V = 13.3;
/** 門口內外各留多遠再轉彎 */
const DOOR_STEP = 1.2;
export const WALK_SPEED = 2.6;
export const TURN_TIME = 0.9;
/** 每個物品的停留秒數（單字卡顯示 3.2 秒） */
export const SHOT_TIME = 3.2;

const roomOf = (rooms: readonly StreetRoom[], p: StreetPoint) =>
  rooms.find((r) => p[0] > r.u0 && p[0] < r.u1 && p[1] > r.v0 && p[1] < r.v1) ?? null;
const doorU = (r: StreetRoom) => (r.door[0] + r.door[1]) / 2;

/**
 * 室內 → 店面內側走道 → 門口 → 步行線 → 門口 → 走道 → 室內；同在室外就沿步行線走。
 * 室內先垂直走到走道（店面內側 DOOR_STEP）再橫移，不斜穿桌椅。
 */
function legPath(from: StreetPoint, to: StreetPoint, rooms: readonly StreetRoom[]): StreetPoint[] {
  const a = roomOf(rooms, from), b = roomOf(rooms, to);
  if (a && a === b) return [from, to];
  const pts: StreetPoint[] = [from];
  if (a) pts.push([from[0], a.v0 + DOOR_STEP], [doorU(a), a.v0 + DOOR_STEP], [doorU(a), a.v0 - DOOR_STEP]);
  pts.push([pts[pts.length - 1][0], WALK_V]);
  if (b) pts.push([doorU(b), WALK_V], [doorU(b), b.v0 - DOOR_STEP], [doorU(b), b.v0 + DOOR_STEP], [to[0], b.v0 + DOOR_STEP]);
  else pts.push([to[0], WALK_V]);
  pts.push(to);
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
}

export function planTour(defs: readonly TourStopDef[], rooms: readonly StreetRoom[]): TourStop[] {
  return defs.map((def, i) => {
    const stand: StreetPoint = [def.stand.u, def.stand.v];
    const prev = defs[i - 1];
    return { ...def, path: prev ? legPath([prev.stand.u, prev.stand.v], stand, rooms) : [stand] };
  });
}

export function pathLength(path: readonly StreetPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return total;
}

/** 路徑上距起點 d 公尺的位置與前進方向（單位向量） */
export function pointAlong(path: readonly StreetPoint[], d: number): { position: StreetPoint; dir: StreetPoint } {
  let rest = d;
  for (let i = 1; i < path.length; i++) {
    const [au, av] = path[i - 1], [bu, bv] = path[i];
    const len = Math.hypot(bu - au, bv - av);
    if (rest <= len || i === path.length - 1) {
      const t = len ? Math.min(1, rest / len) : 1;
      return { position: [au + (bu - au) * t, av + (bv - av) * t], dir: len ? [(bu - au) / len, (bv - av) / len] : [1, 0] };
    }
    rest -= len;
  }
  return { position: path[0], dir: [1, 0] };
}

export const dwellOf = (stop: TourStopDef) => stop.items.length * SHOT_TIME;

/** 停留時目前轉向第幾個物品（其他階段為 -1） */
export function shotIndex(tour: TourState, stop: TourStopDef): number {
  if (tour.phase !== 'looking' || stop.items.length === 0) return -1;
  return Math.min(stop.items.length - 1, Math.floor(tour.timer / SHOT_TIME));
}

/** 目前應轉向的物品（walking 時為 null） */
export function lookTarget(tour: TourState, stops: readonly TourStop[]): string | null {
  const stop = stops[tour.index];
  if (tour.phase === 'walking') return null;
  return stop.items[Math.max(0, shotIndex(tour, stop))] ?? null;
}

/** 狀態機（不可變）：walking → turning → looking（逐一物品）→ 下一站 */
export function startTour(stops: readonly TourStop[], index = 0): TourState {
  const cut = index === 0 || stops[index].path.length < 2;
  return { index, phase: cut ? 'turning' : 'walking', walked: 0, timer: 0, paused: false, cut, finished: false };
}

export function stepTour(tour: TourState, stops: readonly TourStop[], dt: number): TourState {
  if (tour.paused || tour.finished) return tour;
  const stop = stops[tour.index];
  if (tour.phase === 'walking') {
    const walked = tour.walked + WALK_SPEED * dt;
    return walked >= pathLength(stop.path) ? { ...tour, walked, phase: 'turning', timer: 0 } : { ...tour, walked };
  }
  const timer = tour.timer + dt;
  if (tour.phase === 'turning') return timer >= TURN_TIME ? { ...tour, phase: 'looking', timer: 0 } : { ...tour, timer };
  if (timer < dwellOf(stop)) return { ...tour, timer };
  return tour.index + 1 < stops.length ? startTour(stops, tour.index + 1) : { ...tour, timer, finished: true };
}

/** 目前小人位置；walking 時附前進方向，停下時 dir 為 null（由 lookTarget 決定朝向） */
export function tourPose(tour: TourState, stops: readonly TourStop[]): { position: StreetPoint; dir: StreetPoint | null; remaining: number } {
  const stop = stops[tour.index];
  if (tour.phase === 'walking') {
    const { position, dir } = pointAlong(stop.path, tour.walked);
    return { position, dir, remaining: Math.max(0, pathLength(stop.path) - tour.walked) };
  }
  return { position: stop.path[stop.path.length - 1], dir: null, remaining: 0 };
}

/** 直接到第 index 站（略過步行），用於「上一站／下一站」 */
export function jumpTo(stops: readonly TourStop[], index: number): TourState {
  const clamped = Math.max(0, Math.min(stops.length - 1, index));
  return { index: clamped, phase: 'turning', walked: 0, timer: 0, paused: false, cut: true, finished: false };
}

/** 進度 0–1：步行中看走了多少，停留中看念到第幾個 */
export function tourProgress(tour: TourState, stops: readonly TourStop[]): number {
  const stop = stops[tour.index];
  if (tour.finished) return 1;
  if (tour.phase === 'walking') return Math.min(1, tour.walked / (pathLength(stop.path) || 1));
  if (tour.phase === 'looking') return Math.min(1, tour.timer / (dwellOf(stop) || 1));
  return 0;
}
