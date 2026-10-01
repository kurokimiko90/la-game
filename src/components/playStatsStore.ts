// 玩家數據的本機存取（規則在 src/lib/playstats.ts）。和進度分開存，壞掉或存不了都不影響遊戲。
import { EMPTY_PLAY_STATS, parsePlayStats, type PlayStats } from '@/lib/playstats';

export const PLAY_STATS_KEY = 'memory-town:play-stats';

export function loadPlayStats(): PlayStats {
  try {
    const raw = window.localStorage.getItem(PLAY_STATS_KEY);
    return raw ? parsePlayStats(JSON.parse(raw)) : EMPTY_PLAY_STATS;
  } catch {
    return EMPTY_PLAY_STATS;
  }
}

/** 讀出、套用 fn、寫回；存不了就算了（私密視窗、storage 被封鎖） */
export function trackPlay(fn: (s: PlayStats) => PlayStats): void {
  try {
    window.localStorage.setItem(PLAY_STATS_KEY, JSON.stringify(fn(loadPlayStats())));
  } catch {
    // 只是統計，不影響遊戲
  }
}
