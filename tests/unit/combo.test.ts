import { describe, expect, test } from 'vitest';
import { COMBO_WINDOW_MS, EMPTY_COMBO, comboAfterFound, comboAfterMiss } from '@/lib/combo';

describe('連擊', () => {
  test('時間內連續找到 → 累加，記住最高', () => {
    let c = comboAfterFound(EMPTY_COMBO, 1000);
    expect(c).toEqual({ count: 1, best: 1, lastAt: 1000 });
    c = comboAfterFound(c, 1000 + COMBO_WINDOW_MS);
    c = comboAfterFound(c, 2000 + COMBO_WINDOW_MS);
    expect(c.count).toBe(3);
    expect(c.best).toBe(3);
  });

  test('超過時間 → 從 1 重新算，但保留最高', () => {
    const c = comboAfterFound(comboAfterFound(EMPTY_COMBO, 0), 10);
    const late = comboAfterFound(c, 10 + COMBO_WINDOW_MS + 1);
    expect(late).toEqual({ count: 1, best: 2, lastAt: 10 + COMBO_WINDOW_MS + 1 });
  });

  test('點錯 / 用提示 → 中斷，保留最高', () => {
    const c = comboAfterFound(comboAfterFound(EMPTY_COMBO, 0), 10);
    const broken = comboAfterMiss(c);
    expect(broken).toEqual({ count: 0, best: 2, lastAt: null });
    expect(comboAfterFound(broken, 20).count).toBe(1);
  });

  test('不改動原物件', () => {
    const c = comboAfterFound(EMPTY_COMBO, 0);
    comboAfterFound(c, 1);
    comboAfterMiss(c);
    expect(c).toEqual({ count: 1, best: 1, lastAt: 0 });
  });
});
