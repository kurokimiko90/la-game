// 場景資料（scripts/build-scenes.mjs 產生的 JSON）。改內容請改 content/ 後重跑 build。
// JSON 在 build 時已檢查過（scene-config、擺放、動態），這裡直接當成 SceneData。
import index from '@/data/scenes/index.json';
import { SCENE_DATA } from '@/data/scenes/registry';
import { buildTown } from './town';
import type { SceneData, SceneSummary } from './types';

const SCENES = SCENE_DATA as Record<string, SceneData>;

export const SCENE_LIST: readonly SceneSummary[] = index;
export const SCENE_ORDER: readonly string[] = index.map((s) => s.id);

export function getScene(id: string): SceneData | undefined {
  return SCENES[id];
}

export function allScenes(): SceneData[] {
  return SCENE_ORDER.map((id) => SCENES[id]);
}

/** 所有場景依路線順序接成的小鎮 */
export const TOWN = buildTown(allScenes());
