// 小鎮：一張 2D 地圖，每個場景是地圖上的一個「街區」（district），由幾個矩形區域組成。
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
