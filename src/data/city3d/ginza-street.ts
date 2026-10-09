// 商業街（street）在銀座的擺放：中央通り（銀座四丁目往北）東側人行道。
// 街道座標系見 src/lib/city3d/street-frame.ts：u 沿街（公尺），v 離道路中心線（11 = 路緣，17 = 建築立面），
// rot 0 = 正面朝馬路、90 = 朝向出生點方向（-u）、-90 = 朝 +u、180 = 朝建築。
// 四個區域沿街排開：路口 u -10–17 → 商店 18–42 → 咖啡店 45–62 → 公車站 65–82（和 2D 商業街同一組區域）。
import type { StreetFrame, StreetSpot, StreetZone } from '@/lib/city3d/street-frame';

export interface StreetPlacement extends StreetSpot {
  id: string;
}

export interface FixturePlacement extends StreetSpot {
  model: string;
}

export interface StreetSet {
  sceneId: string;
  /** Ginza city.json 的道路段：中央通り trunk 的第 1→2 點 */
  frame: StreetFrame;
  spawn: { u: number; v: number };
  /**
   * 遊戲區：這段街道不放 Ginza 的店面櫥窗／遮陽棚、不鋪道路帶狀面、不跑車流人流，
   * 否則會和要找的「櫥窗」「遮陽棚」「汽車」「計程車」「公車」混淆，行人也會穿過物品。
   */
  playZone: StreetZone;
  items: StreetPlacement[];
  fixtures: FixturePlacement[];
}

const COUNTER_TOP = 1.01;
const TABLE_TOP = 0.77;
const BENCH_SEAT = 0.48;
const DISPLAY_TOP = 0.8;

const curbs: FixturePlacement[] = Array.from({ length: 11 }, (_, i) => ({ model: 'fx-curb', u: -15 + i * 10, v: 11.15 }));
const sidewalk: FixturePlacement[] = Array.from({ length: 11 }, (_, i) => ({ model: 'fx-sidewalk', u: -15 + i * 10, v: 14.15 }));

export const GINZA_STREET: StreetSet = {
  sceneId: 'street',
  frame: { origin: [-29.36, -22.83], dir: [0.6577, -0.7533] },
  spawn: { u: -9, v: 14 },
  playZone: { u0: -30, u1: 100, v0: -20, v1: 22 },
  items: [
    // 路口
    { id: 'crosswalk', u: -1.5, v: 0 },
    { id: 'traffic-light', u: -4, v: 11.5, rot: 90 },
    { id: 'pedestrian-signal', u: 1.5, v: 11.6, rot: 45 },
    { id: 'road-sign', u: 4, v: 11.6, rot: 60 },
    { id: 'manhole-lid', u: 5, v: 14.2 },
    { id: 'fire-hydrant', u: 7, v: 11.8, rot: 30 },
    { id: 'mailbox', u: 8.5, v: 16.2, rot: 30 },
    { id: 'parking-meter-post', u: 10.5, v: 11.6 },
    { id: 'traffic-cone', u: 12, v: 11.7 },
    { id: 'bicycle-rack', u: 13.5, v: 16.1 },
    { id: 'traffic-barrier', u: 16, v: 11.35 },
    { id: 'car', u: 6, v: 4 },
    { id: 'taxi', u: -9, v: 8, rot: 180 },
    { id: 'scooter', u: 11, v: 9.6, rot: 180 },
    // 商店
    { id: 'mannequin', u: 20, v: 15.6, rot: 30 },
    { id: 'shop-window', u: 22.5, v: 16.55 },
    { id: 'awning', u: 22.5, v: 16.95, y: 2.55 },
    { id: 'dress', u: 25.3, v: 15.7, rot: 20 },
    { id: 'scarf-display', u: 27.2, v: 16.1, rot: 10 },
    { id: 'shoe-box', u: 29.9, v: 15.6, y: DISPLAY_TOP, rot: 10 },
    { id: 'toy-train', u: 31.1, v: 15.55, y: DISPLAY_TOP, rot: 30 },
    { id: 'paper-bag', u: 32.4, v: 15.9, rot: 20 },
    { id: 'bouquet', u: 33.8, v: 16.2 },
    { id: 'barber-pole', u: 35.6, v: 16.8, y: 1.1 },
    { id: 'blackboard', u: 35.6, v: 14.2, rot: 90 },
    { id: 'umbrella-stand', u: 37.2, v: 16.3 },
    { id: 'vending-machine', u: 39, v: 16.5 },
    { id: 'atm', u: 40.6, v: 16.55 },
    // 咖啡店（吧台在 u 49.4–55.6）
    { id: 'menu-board', u: 46, v: 13.4, rot: 70 },
    { id: 'coffee-maker', u: 50, v: 16.35, y: COUNTER_TOP },
    { id: 'coffee-grinder', u: 50.9, v: 16.35, y: COUNTER_TOP },
    { id: 'espresso-tamper', u: 51.55, v: 16.3, y: COUNTER_TOP },
    { id: 'milk-frothing-pitcher', u: 52.1, v: 16.3, y: COUNTER_TOP, rot: 30 },
    { id: 'coffee-canister', u: 52.65, v: 16.35, y: COUNTER_TOP },
    { id: 'coffee-scoop', u: 53.15, v: 16.25, y: COUNTER_TOP },
    { id: 'stirring-spoon', u: 53.6, v: 16.3, y: COUNTER_TOP },
    { id: 'paper-cup', u: 54.1, v: 16.3, y: COUNTER_TOP },
    { id: 'mug', u: 54.6, v: 16.3, y: COUNTER_TOP },
    { id: 'teapot', u: 55.2, v: 16.3, y: COUNTER_TOP, rot: 20 },
    { id: 'coffee-plant', u: 56.4, v: 16.4 },
    { id: 'table', u: 58.5, v: 14 },
    { id: 'cake', u: 58.3, v: 14.15, y: TABLE_TOP },
    { id: 'cookie', u: 58.85, v: 14.3, y: TABLE_TOP },
    { id: 'newspaper', u: 58.55, v: 13.72, y: TABLE_TOP },
    // 公車站
    { id: 'utility-pole', u: 65.5, v: 11.6 },
    { id: 'bus-stop', u: 68.5, v: 11.7, rot: 45 },
    { id: 'bus-shelter', u: 74, v: 15.9 },
    { id: 'bus-stop-bench', u: 73.6, v: 16 },
    { id: 'backpack', u: 73, v: 15.95, y: BENCH_SEAT },
    { id: 'smartphone', u: 74, v: 15.95, y: BENCH_SEAT },
    { id: 'bus-ticket', u: 74.35, v: 15.85, y: BENCH_SEAT },
    { id: 'bus-route-map', u: 72.6, v: 16.55, y: 1.05 },
    { id: 'timetable', u: 75.4, v: 16.55, y: 1.0 },
    { id: 'suitcase', u: 76.6, v: 15.4, rot: 20 },
    { id: 'traffic-mirror', u: 80, v: 11.6, rot: 90 },
    { id: 'bus', u: 74, v: 7.2 },
  ],
  fixtures: [
    ...sidewalk,
    ...curbs,
    { model: 'fx-tree', u: 18.5, v: 12.2 },
    { model: 'fx-display-table', u: 30.5, v: 15.6 },
    { model: 'fx-planter', u: 43, v: 11.7 },
    { model: 'fx-counter', u: 52.5, v: 16.4 },
    { model: 'fx-chair', u: 57.6, v: 14, rot: -90 },
    { model: 'fx-chair', u: 59.4, v: 14, rot: 90 },
    { model: 'fx-tree', u: 63, v: 12.2 },
    { model: 'fx-tree', u: 84, v: 12.2 },
  ],
};
