// 商業街的聽讀導覽站點：從路口往北走到公車站，服飾店、咖啡店從門口進去。
// 街道座標同 ginza-street.ts（v 13.3 = 人行道步行線，16.8 = 店面玻璃）；路徑由 planTour 依門口自動排。
// 每個 2D 物品剛好出現一次（測試會檢查），站立點和路徑不能碰到物品、家具或牆。
import type { TourStopDef } from '@/lib/city3d/guided-tour';

export const GINZA_TOUR: TourStopDef[] = [
  { id: 'road', zone: 'crossing', stand: { u: -3, v: 13.3 },
    items: ['crosswalk', 'taxi', 'traffic-light', 'pedestrian-signal', 'road-sign', 'car'] },
  { id: 'curb', zone: 'crossing', stand: { u: 9.5, v: 13.3 },
    items: ['manhole-lid', 'fire-hydrant', 'mailbox', 'parking-meter-post', 'scooter', 'traffic-cone', 'bicycle-rack', 'traffic-barrier'] },
  { id: 'storefront', zone: 'shops', stand: { u: 23.5, v: 13.3 },
    items: ['shop-window', 'mannequin', 'awning'] },
  { id: 'boutique', zone: 'shops', stand: { u: 26.75, v: 20.3 },
    items: ['dress', 'bouquet', 'shoe-box', 'toy-train', 'paper-bag', 'scarf-display'] },
  { id: 'sidewalk', zone: 'shops', stand: { u: 33, v: 13.3 },
    items: ['umbrella-stand', 'barber-pole', 'blackboard', 'vending-machine', 'atm'] },
  { id: 'cafe-front', zone: 'cafe', stand: { u: 45.5, v: 13.3 },
    items: ['menu-board'] },
  { id: 'cafe-table', zone: 'cafe', stand: { u: 49.3, v: 21 },
    items: ['table', 'cake', 'cookie', 'newspaper'] },
  { id: 'cafe-counter', zone: 'cafe', stand: { u: 54, v: 22.4 },
    items: ['coffee-maker', 'coffee-grinder', 'espresso-tamper', 'milk-frothing-pitcher', 'coffee-canister',
      'coffee-scoop', 'stirring-spoon', 'paper-cup', 'mug', 'teapot', 'coffee-plant'] },
  { id: 'bus-pole', zone: 'bus-stop', stand: { u: 67, v: 13.3 },
    items: ['utility-pole', 'bus-stop', 'bus'] },
  { id: 'shelter', zone: 'bus-stop', stand: { u: 74, v: 13.3 },
    items: ['bus-shelter', 'bus-stop-bench', 'backpack', 'smartphone', 'bus-ticket', 'bus-route-map', 'timetable', 'suitcase', 'traffic-mirror'] },
];
