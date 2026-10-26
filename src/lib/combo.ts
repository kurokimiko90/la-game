// 連擊：時間內連續找到目標就累加；點錯、用提示、被揭曉就中斷。純顯示與音效用，不影響星級。

export interface Combo {
  count: number;
  best: number;
  /** 上一次找到的時間；中斷後為 null */
  lastAt: number | null;
}

/** 兩次找到之間最多隔多久還算連擊 */
export const COMBO_WINDOW_MS = 12_000;
/** 連擊幾次開始顯示 */
export const COMBO_SHOW_FROM = 2;

export const EMPTY_COMBO: Combo = { count: 0, best: 0, lastAt: null };

export function comboAfterFound(combo: Combo, now: number): Combo {
  const chained = combo.lastAt !== null && now - combo.lastAt <= COMBO_WINDOW_MS;
  const count = chained ? combo.count + 1 : 1;
  return { count, best: Math.max(combo.best, count), lastAt: now };
}

export function comboAfterMiss(combo: Combo): Combo {
  return { ...combo, count: 0, lastAt: null };
}
