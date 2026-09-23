// 玩家進度與設定：不可變更新 + 讀取 localStorage 時的防禦性解析（外部資料不可信）。
import type { Lang } from './types';
import { isLang } from './words';

export interface StageRecord {
  stars: number;
  bestTimeMs: number;
  clears: number;
}

export interface WordRecord {
  seen: number;
  found: number;
  lastAt: number;
}

export interface Settings {
  lang: Lang;
  showTranslation: boolean;
  showReading: boolean;
  /** 測試用：解鎖全部場景與階段 */
  unlockAll: boolean;
}

export interface Progress {
  version: 1;
  settings: Settings;
  /** key：`${sceneId}:${stageId}` */
  stages: Record<string, StageRecord>;
  /** key：`${sceneId}/${itemId}` */
  words: Record<string, WordRecord>;
}

export const DEFAULT_SETTINGS: Settings = { lang: 'en', showTranslation: true, showReading: true, unlockAll: false };
export const DEFAULT_PROGRESS: Progress = { version: 1, settings: DEFAULT_SETTINGS, stages: {}, words: {} };

export const stageKey = (sceneId: string, stageId: number) => `${sceneId}:${stageId}`;
export const wordKey = (sceneId: string, itemId: string) => `${sceneId}/${itemId}`;

export function recordStageClear(p: Progress, sceneId: string, stageId: number, stars: number, timeMs: number): Progress {
  const key = stageKey(sceneId, stageId);
  const prev = p.stages[key];
  const record: StageRecord = prev
    ? { stars: Math.max(prev.stars, stars), bestTimeMs: Math.min(prev.bestTimeMs, timeMs), clears: prev.clears + 1 }
    : { stars, bestTimeMs: timeMs, clears: 1 };
  return { ...p, stages: { ...p.stages, [key]: record } };
}

function bumpWord(p: Progress, sceneId: string, itemId: string, field: 'seen' | 'found', now: number): Progress {
  const key = wordKey(sceneId, itemId);
  const prev = p.words[key] ?? { seen: 0, found: 0, lastAt: 0 };
  return { ...p, words: { ...p.words, [key]: { ...prev, [field]: prev[field] + 1, lastAt: now } } };
}

export const recordWordSeen = (p: Progress, sceneId: string, itemId: string, now: number) => bumpWord(p, sceneId, itemId, 'seen', now);
export const recordWordFound = (p: Progress, sceneId: string, itemId: string, now: number) => bumpWord(p, sceneId, itemId, 'found', now);

export function updateSettings(p: Progress, patch: Partial<Settings>): Progress {
  return { ...p, settings: { ...p.settings, ...patch } };
}

export function isStageCleared(p: Progress, sceneId: string, stageId: number): boolean {
  return Boolean(p.stages[stageKey(sceneId, stageId)]);
}

/** 一開始就開放的場景數（小鎮路線上的前幾個） */
export const FREE_SCENE_COUNT = 8;

/** 場景依小鎮路線解鎖：前 freeCount 個一開始就開放，之後前一個場景過了階段 1 才開下一個 */
export function isSceneUnlocked(p: Progress, sceneId: string, order: readonly string[], freeCount = FREE_SCENE_COUNT): boolean {
  if (p.settings.unlockAll) return true;
  const i = order.indexOf(sceneId);
  if (i < 0) return false;
  if (i < Math.max(1, freeCount)) return true;
  return isStageCleared(p, order[i - 1], 1);
}

/** 階段依序解鎖：過了第 n 關才開第 n+1 關 */
export function isStageUnlocked(p: Progress, sceneId: string, stageId: number): boolean {
  if (p.settings.unlockAll || stageId <= 1) return true;
  return isStageCleared(p, sceneId, stageId - 1);
}

export function sceneStars(p: Progress, sceneId: string): number {
  return Object.entries(p.stages)
    .filter(([key]) => key.startsWith(`${sceneId}:`))
    .reduce((sum, [, r]) => sum + r.stars, 0);
}

// ── localStorage 解析：欄位型別不對就丟掉該欄位，不讓壞資料弄壞遊戲 ──

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseSettings(raw: unknown): Settings {
  if (!isObject(raw)) return DEFAULT_SETTINGS;
  return {
    lang: isLang(raw.lang) ? raw.lang : DEFAULT_SETTINGS.lang,
    showTranslation: typeof raw.showTranslation === 'boolean' ? raw.showTranslation : DEFAULT_SETTINGS.showTranslation,
    showReading: typeof raw.showReading === 'boolean' ? raw.showReading : DEFAULT_SETTINGS.showReading,
    unlockAll: typeof raw.unlockAll === 'boolean' ? raw.unlockAll : DEFAULT_SETTINGS.unlockAll,
  };
}

function parseRecords<T>(raw: unknown, check: (v: Record<string, unknown>) => T | null): Record<string, T> {
  if (!isObject(raw)) return {};
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    const parsed = check(value);
    if (parsed) out[key] = parsed;
  }
  return out;
}

export function parseProgress(raw: unknown): Progress {
  if (!isObject(raw) || raw.version !== 1) return DEFAULT_PROGRESS;
  return {
    version: 1,
    settings: parseSettings(raw.settings),
    stages: parseRecords(raw.stages, (v) => (isCount(v.stars) && isCount(v.bestTimeMs) && isCount(v.clears)
      ? { stars: Math.min(v.stars, 3), bestTimeMs: v.bestTimeMs, clears: v.clears } : null)),
    words: parseRecords(raw.words, (v) => (isCount(v.seen) && isCount(v.found) && isCount(v.lastAt)
      ? { seen: v.seen, found: v.found, lastAt: v.lastAt } : null)),
  };
}
