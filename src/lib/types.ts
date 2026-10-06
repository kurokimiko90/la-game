import type { VenuePlan } from './venue';
export type Lang = 'en' | 'ja' | 'zh';

export interface Words {
  'zh-TW': string;
  en: string;
  ja: { text: string; reading: string };
}

export interface SceneItem {
  id: string;
  zone: string;
  category: string;
  words: Words;
  viewBox: number[];
  /** 已清洗過的 SVG 內文（scripts/lib/svg-sanitize.mjs） */
  body: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 傾斜角度（度），以底部中心為支點；只有散落的小物件不是 0 */
  rotate: number;
  /** 左右鏡像 */
  flip: boolean;
  /** 飄在空中的高度（風箏、氣球）：地上畫影子 */
  float?: number;
  motion?: ItemMotion;
}

export type MotionType = 'sway' | 'bob' | 'drift' | 'wobble';

/** 物件動態參數（scripts/lib/motion.mjs 在 build 時算好） */
export interface ItemMotion {
  type: MotionType;
  /** 週期（秒） */
  dur: number;
  /** 負值：錯開相位 */
  delay: number;
  /** 幅度倍率 */
  amp: number;
}

/** 背景要畫出來的檯面（貨架台、吧台、餐桌）：levels 是檯面 y，base 是底座落地的 y */
export interface Surface {
  look: string;
  zone: string;
  x0: number;
  x1: number;
  levels: number[];
  base: number;
}

/** 地圖上的區域（矩形，地圖座標） */
export interface Zone {
  id: string;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 自動產生的街區的一個區域（scripts/lib/district-kit.mjs 算好的地形幾何） */
export interface TerrainZone {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  indoor: boolean;
  floor: 'tile' | 'wood' | 'carpet' | 'grass' | 'paving' | 'sand' | 'concrete';
  /** 室內後牆的牆腳 y */
  wallBase?: number;
  road?: { y0: number; y1: number };
  track?: { y0: number; y1: number };
  pool?: { x0: number; y0: number; x1: number; y1: number };
  /** 參考實際場地的地面分區與家具；同時供 build 檢查物件的落點。 */
  details?: SiteFeature[];
  architecture?: 'greenhouse';
}

export interface SiteFeature {
  id: string;
  kind: 'path' | 'walkway' | 'queue' | 'habitat' | 'bed' | 'pond' | 'canopy' | 'shelter' | 'court' | 'worktop' | 'shelf' | 'plinth' | 'seating';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  surface?: 'grass' | 'sand' | 'rock' | 'mulch';
  /** 物件底線中心必須落在這個範圍，避免水生植物回到乾地、動物離開棲地。 */
  items?: string[];
}

/** 自動產生的街區地形（手畫的場景沒有這個欄位，地形在 WorldBackground.tsx） */
export interface DistrictTerrain {
  /** 小地圖顏色 */
  color: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zones: TerrainZone[];
  /** 同一間教室的功能區共用外牆，內部不畫成四間獨立房間。 */
  openPlan?: boolean;
  /** 同一座公共場所共用外牆；區域以地板和功能帶區分，不切成四間盒子。 */
  sharedShell?: boolean;
  /** 場所專屬平面結構；由 scene-site-plan 依街區設定。 */
  structure?: string;
  /** 牆面材質與各區地面圖案（自動擴展由 codex 挑，src/lib/venue.ts）；手畫過的街區用 VenueStructure.tsx 的 VENUE_PLANS */
  venue?: VenuePlan;
}

/** 重複擺放：同一個物品在場景裡的另一份（scripts/lib/copies.mjs）。點到它 = 點到原物件 */
export interface ItemCopy {
  /** `<原 id>#<n>` */
  id: string;
  /** 原物件 id */
  of: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  flip: boolean;
  /** 畫在 items 的第幾個物件之前（= 前面有幾個原物件） */
  at: number;
}

/** 一個場景 = 小鎮地圖上的一個街區；width/height 是整張地圖的大小，座標都是地圖座標 */
export interface SceneData {
  id: string;
  name: string;
  width: number;
  height: number;
  zones: Zone[];
  surfaces: Surface[];
  /** 陣列順序 = 繪製順序 */
  items: SceneItem[];
  /** 重複擺放的複本（沒有就省略） */
  copies?: ItemCopy[];
  terrain?: DistrictTerrain;
}

export interface SceneSummary {
  id: string;
  name: string;
  itemCount: number;
  icon: { viewBox: number[]; body: string };
}

export interface Point {
  x: number;
  y: number;
}
