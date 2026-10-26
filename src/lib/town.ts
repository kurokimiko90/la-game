// 小鎮：一張 2D 地圖，每個場景是地圖上的一個「街區」（district），由幾個矩形區域組成。
// 地圖分成北邊的戶外街景和南邊的室內區（y ≥ outdoorHeight）；一個街區的戶外區域和室內區域分在兩處（part）。
// 場景資料已經是地圖座標；這裡把所有場景的物件、區域集中起來，給平移、提示、記憶挑戰判定使用。
import type { Point, SceneData, SceneItem, Zone } from './types';

export interface District {
  scene: SceneData;
}

export interface TownItem extends SceneItem {
  sceneId: string;
}

export interface TownZone extends Zone {
  sceneId: string;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Town {
  width: number;
  height: number;
  /** 這個 y 以北是戶外街景，以南是室內區 */
  outdoorHeight: number;
  /** 大街 [x0, y0, x1, y1] */
  streets: number[][];
  districts: District[];
  items: ReadonlyMap<string, TownItem>;
  /** key：zoneKey(sceneId, zoneId) */
  zones: ReadonlyMap<string, TownZone>;
}

export const zoneKey = (sceneId: string, zoneId: string) => `${sceneId}:${zoneId}`;

export const rectCenter = (r: Rect): Point => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });

export function buildTown(scenes: readonly SceneData[]): Town {
  const items = new Map<string, TownItem>();
  const zones = new Map<string, TownZone>();
  for (const scene of scenes) {
    for (const it of scene.items) {
      const owner = items.get(it.id);
      if (owner) throw new Error(`物件 id ${it.id} 在 ${owner.sceneId} 和 ${scene.id} 重複`);
      items.set(it.id, { ...it, sceneId: scene.id });
    }
    for (const z of scene.zones) zones.set(zoneKey(scene.id, z.id), { ...z, sceneId: scene.id });
  }
  return {
    width: Math.max(0, ...scenes.map((s) => s.width)),
    height: Math.max(0, ...scenes.map((s) => s.height)),
    outdoorHeight: Math.max(0, ...scenes.map((s) => s.outdoorHeight)),
    streets: scenes[0]?.streets ?? [],
    districts: scenes.map((scene) => ({ scene })),
    items,
    zones,
  };
}

/** 街區所有區域的外框 */
export function districtBounds(d: District): Rect {
  const zs = d.scene.zones;
  return {
    x0: Math.min(...zs.map((z) => z.x0)),
    y0: Math.min(...zs.map((z) => z.y0)),
    x1: Math.max(...zs.map((z) => z.x1)),
    y1: Math.max(...zs.map((z) => z.y1)),
  };
}

/** 點所在的街區（依區域判斷）；不在任何區域內回傳 null */
export function districtAt(town: Town, p: Point): District | null {
  return town.districts.find((d) => d.scene.zones.some((z) => p.x >= z.x0 && p.x < z.x1 && p.y >= z.y0 && p.y < z.y1)) ?? null;
}

export function districtOf(town: Town, sceneId: string): District | undefined {
  return town.districts.find((d) => d.scene.id === sceneId);
}

const boundsOf = (zs: readonly Zone[]): Rect => ({
  x0: Math.min(...zs.map((z) => z.x0)),
  y0: Math.min(...zs.map((z) => z.y0)),
  x1: Math.max(...zs.map((z) => z.x1)),
  y1: Math.max(...zs.map((z) => z.y1)),
});

export interface DistrictPart {
  indoor: boolean;
  zones: Zone[];
  bounds: Rect;
}

/** 街區分成戶外、室內兩部分（沒有區域的部分不列），戶外在前 */
export function districtParts(d: District): DistrictPart[] {
  return [false, true].flatMap((indoor) => {
    const zones = d.scene.zones.filter((z) => z.indoor === indoor);
    return zones.length ? [{ indoor, zones, bounds: boundsOf(zones) }] : [];
  });
}

export interface PartSwitch {
  /** 要去室內（true）還是戶外 */
  toIndoor: boolean;
  /** 目的地第一個區域的名稱 */
  zoneName: string;
  target: Point;
}

/**
 * 「進入室內 / 回到戶外」按鈕：畫面中心在哪一部分，就提供去另一部分的按鈕（去那部分的第一個區域）。
 * 街區只有一部分時回傳 null。
 */
export function partSwitch(d: District, viewCenter: Point, outdoorHeight: number): PartSwitch | null {
  const parts = districtParts(d);
  if (parts.length < 2) return null;
  const inIndoor = viewCenter.y >= outdoorHeight;
  const dest = parts.find((p) => p.indoor !== inIndoor);
  if (!dest) return null;
  const zone = dest.zones[0];
  return { toIndoor: dest.indoor, zoneName: zone.name, target: rectCenter(zone) };
}
