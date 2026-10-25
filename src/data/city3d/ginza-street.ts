// 商業街（street）在銀座的擺放：中央通り（銀座四丁目往北）東側人行道。
// 街道座標系見 src/lib/city3d/street-frame.ts：u 沿街（公尺），v 離道路中心線（11 = 路緣，17 = 建築立面），
// rot 0 = 正面朝馬路、90 = 朝向出生點方向（-u）、-90 = 朝 +u、180 = 朝建築。
// 四個區域沿街排開：路口 u -10–17 → 商店 18–42 → 咖啡店 45–62 → 公車站 65–82（和 2D 商業街同一組區域）。
// 服飾店、咖啡店是松屋一樓的室內（v 16.8 = 店面玻璃，往裡到 25.5）；人行道上只放街上本來就有的東西。
import type { RoomStyle, StreetRoom } from '@/lib/city3d/rooms';
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
  /** 店內：從臨街大樓一樓挖出來，室內物品放在這裡面 */
  rooms: (StreetRoom & { style: RoomStyle })[];
  items: StreetPlacement[];
  fixtures: FixturePlacement[];
}

const COUNTER_TOP = 1.01;
const TABLE_TOP = 0.77;
const BENCH_SEAT = 0.48;
const DISPLAY_TOP = 0.8;

const curbs: FixturePlacement[] = Array.from({ length: 11 }, (_, i) => ({ model: 'fx-curb', u: -15 + i * 10, v: 11.15 }));
const sidewalk: FixturePlacement[] = Array.from({ length: 22 }, (_, i) => ({ model: 'fx-sidewalk', u: -17.5 + i * 5, v: 14.15 }));

export const GINZA_STREET: StreetSet = {
  sceneId: 'street',
  frame: { origin: [-29.36, -22.83], dir: [0.6577, -0.7533] },
  spawn: { u: -9, v: 14 },
  playZone: { u0: -30, u1: 100, v0: -20, v1: 26 },
  rooms: [
    { id: 'boutique', u0: 19, u1: 34.5, v0: 16.8, v1: 25.5, height: 4.2, door: [25.5, 28], style: { floor: 'tan', wall: 'light', accent: 'indigo', shelf: { u0: 26.5, u1: 33.5, bottom: 0 }, rug: { u: 30.5, v: 22, w: 4, d: 2.6, color: 'pink' } } },
    { id: 'cafe', u0: 44.5, u1: 61, v0: 16.8, v1: 25.5, height: 4.2, door: [46, 48.5], style: { floor: 'brown', wall: 'cream', accent: 'dgreen', shelf: { u0: 50, u1: 58, bottom: 1.45 }, rug: { u: 52, v: 20, w: 3.2, d: 2.4, color: 'red' } } },
  ],
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
    // 商店：服飾店（室內 u 19–34.5，門 25.5–28）＋ 人行道
    { id: 'shop-window', u: 22.3, v: 17.4 },
    { id: 'mannequin', u: 20.2, v: 18, rot: 20 },
    { id: 'awning', u: 26.75, v: 16.5, y: 2.45 },
    { id: 'dress', u: 30.2, v: 18.1, rot: -15 },
    { id: 'bouquet', u: 33.4, v: 18 },
    { id: 'scarf-display', u: 20.6, v: 23.8, rot: 10 },
    { id: 'shoe-box', u: 29.9, v: 22, y: DISPLAY_TOP, rot: 10 },
    { id: 'toy-train', u: 31.1, v: 21.95, y: DISPLAY_TOP, rot: 30 },
    { id: 'paper-bag', u: 24.2, v: 24.6, rot: 20 },
    { id: 'barber-pole', u: 35.6, v: 16.8, y: 1.1 },
    { id: 'blackboard', u: 35.6, v: 14.2, rot: 90 },
    { id: 'umbrella-stand', u: 29, v: 16.2 },
    { id: 'vending-machine', u: 39, v: 16.5 },
    { id: 'atm', u: 40.6, v: 16.55 },
    // 咖啡店：室內 u 44.5–61，門 46–48.5；吧台靠裡牆 u 50.9–57.1
    { id: 'menu-board', u: 44, v: 15.4, rot: 70 },
    { id: 'coffee-maker', u: 51.5, v: 24.15, y: COUNTER_TOP },
    { id: 'coffee-grinder', u: 52.4, v: 24.15, y: COUNTER_TOP },
    { id: 'espresso-tamper', u: 53.05, v: 24.1, y: COUNTER_TOP },
    { id: 'milk-frothing-pitcher', u: 53.6, v: 24.1, y: COUNTER_TOP, rot: 30 },
    { id: 'coffee-canister', u: 54.15, v: 24.15, y: COUNTER_TOP },
    { id: 'coffee-scoop', u: 54.65, v: 24.05, y: COUNTER_TOP },
    { id: 'stirring-spoon', u: 55.1, v: 24.1, y: COUNTER_TOP },
    { id: 'paper-cup', u: 55.6, v: 24.1, y: COUNTER_TOP },
    { id: 'mug', u: 56.1, v: 24.1, y: COUNTER_TOP },
    { id: 'teapot', u: 56.7, v: 24.1, y: COUNTER_TOP, rot: 20 },
    { id: 'coffee-plant', u: 59.9, v: 24.7 },
    { id: 'table', u: 52, v: 20 },
    { id: 'cake', u: 51.8, v: 20.15, y: TABLE_TOP },
    { id: 'cookie', u: 52.35, v: 20.3, y: TABLE_TOP },
    { id: 'newspaper', u: 52.05, v: 19.72, y: TABLE_TOP },
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
    { model: 'fx-display-table', u: 30.5, v: 22 },
    { model: 'fx-planter', u: 43, v: 11.7 },
    { model: 'fx-counter', u: 54, v: 24.2 },
    { model: 'fx-chair', u: 51.1, v: 20, rot: -90 },
    { model: 'fx-chair', u: 52.9, v: 20, rot: 90 },
    { model: 'fx-tree', u: 63, v: 12.2 },
    { model: 'fx-tree', u: 84, v: 12.2 },
  ],
};
