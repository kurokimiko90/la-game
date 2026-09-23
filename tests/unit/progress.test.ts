import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PROGRESS, FREE_SCENE_COUNT, recordStageClear, recordWordSeen, recordWordFound, updateSettings,
  isSceneUnlocked, isStageUnlocked, isStageCleared, sceneStars, parseProgress, stageKey, wordKey,
} from '@/lib/progress';

const ORDER = ['park', 'street', 'riverside', 'supermarket'];

describe('recordStageClear', () => {
  test('首次通關建立紀錄；再次通關保留最佳', () => {
    let p = recordStageClear(DEFAULT_PROGRESS, 'park', 1, 2, 60000);
    expect(p.stages[stageKey('park', 1)]).toEqual({ stars: 2, bestTimeMs: 60000, clears: 1 });
    p = recordStageClear(p, 'park', 1, 1, 30000);
    expect(p.stages[stageKey('park', 1)]).toEqual({ stars: 2, bestTimeMs: 30000, clears: 2 });
    expect(DEFAULT_PROGRESS.stages).toEqual({});
  });
});

describe('單字紀錄', () => {
  test('seen / found 分開累計', () => {
    let p = recordWordSeen(DEFAULT_PROGRESS, 'park', 'bench', 5);
    p = recordWordSeen(p, 'park', 'bench', 6);
    p = recordWordFound(p, 'park', 'bench', 7);
    expect(p.words[wordKey('park', 'bench')]).toEqual({ seen: 2, found: 1, lastAt: 7 });
  });
});

describe('解鎖規則', () => {
  test('一開始開放前 FREE_SCENE_COUNT 個場景', () => {
    const order = Array.from({ length: FREE_SCENE_COUNT + 2 }, (_, i) => `s${i}`);
    expect(FREE_SCENE_COUNT).toBe(8);
    for (const id of order.slice(0, FREE_SCENE_COUNT)) expect(isSceneUnlocked(DEFAULT_PROGRESS, id, order)).toBe(true);
    expect(isSceneUnlocked(DEFAULT_PROGRESS, order[FREE_SCENE_COUNT], order)).toBe(false);
    expect(isSceneUnlocked(DEFAULT_PROGRESS, 'unknown', order)).toBe(false);
  });

  test('開放範圍之後：下一個要前一個過階段 1', () => {
    expect(isSceneUnlocked(DEFAULT_PROGRESS, 'park', ORDER, 1)).toBe(true);
    expect(isSceneUnlocked(DEFAULT_PROGRESS, 'street', ORDER, 1)).toBe(false);
    const p = recordStageClear(DEFAULT_PROGRESS, 'park', 1, 3, 1);
    expect(isSceneUnlocked(p, 'street', ORDER, 1)).toBe(true);
    expect(isSceneUnlocked(p, 'riverside', ORDER, 1)).toBe(false);
    expect(isSceneUnlocked(p, 'unknown', ORDER, 1)).toBe(false);
  });

  test('階段依序解鎖', () => {
    expect(isStageUnlocked(DEFAULT_PROGRESS, 'park', 1)).toBe(true);
    expect(isStageUnlocked(DEFAULT_PROGRESS, 'park', 2)).toBe(false);
    const p = recordStageClear(DEFAULT_PROGRESS, 'park', 1, 3, 1);
    expect(isStageUnlocked(p, 'park', 2)).toBe(true);
    expect(isStageCleared(p, 'park', 2)).toBe(false);
  });

  test('unlockAll 全開', () => {
    const p = updateSettings(DEFAULT_PROGRESS, { unlockAll: true });
    expect(isSceneUnlocked(p, 'supermarket', ORDER)).toBe(true);
    expect(isStageUnlocked(p, 'supermarket', 4)).toBe(true);
  });
});

describe('sceneStars', () => {
  test('只加總該場景', () => {
    let p = recordStageClear(DEFAULT_PROGRESS, 'park', 1, 3, 1);
    p = recordStageClear(p, 'park', 2, 2, 1);
    p = recordStageClear(p, 'street', 1, 3, 1);
    expect(sceneStars(p, 'park')).toBe(5);
  });
});

describe('parseProgress（localStorage 資料不可信）', () => {
  test('壞資料回預設', () => {
    expect(parseProgress(null)).toEqual(DEFAULT_PROGRESS);
    expect(parseProgress({ version: 2 })).toEqual(DEFAULT_PROGRESS);
    expect(parseProgress('x')).toEqual(DEFAULT_PROGRESS);
  });

  test('逐欄位過濾錯誤型別', () => {
    const p = parseProgress({
      version: 1,
      settings: { lang: 'fr', showTranslation: false, showReading: 'yes', unlockAll: true },
      stages: { 'park:1': { stars: 9, bestTimeMs: 100, clears: 1 }, 'park:2': { stars: -1 }, bad: 3 },
      words: { 'park/bench': { seen: 1, found: 0, lastAt: 2 }, 'park/x': { seen: 'a' } },
    });
    expect(p.settings).toEqual({ lang: 'en', showTranslation: false, showReading: true, unlockAll: true });
    expect(p.stages).toEqual({ 'park:1': { stars: 3, bestTimeMs: 100, clears: 1 } });
    expect(p.words).toEqual({ 'park/bench': { seen: 1, found: 0, lastAt: 2 } });
  });

  test('中文是合法的學習語言', () => {
    expect(parseProgress({ version: 1, settings: { lang: 'zh' } }).settings.lang).toBe('zh');
  });

  test('正常資料原樣保留', () => {
    const p = recordWordSeen(recordStageClear(updateSettings(DEFAULT_PROGRESS, { lang: 'ja' }), 'park', 1, 3, 9), 'park', 'bench', 1);
    expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
