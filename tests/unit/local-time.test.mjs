import { describe, expect, it } from 'vitest';
import { localIso } from '../../scripts/lib/local-time.mjs';

describe('localIso', () => {
  it('帶本機偏移量，且解析回同一個時刻', () => {
    const d = new Date('2026-09-23T13:27:18.597Z');
    const s = localIso(d);
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(new Date(s).getTime()).toBe(d.getTime());
  });

  it('東九區顯示當地時間', () => {
    if (new Date().getTimezoneOffset() !== -540) return;
    expect(localIso(new Date('2026-09-23T13:27:18.597Z'))).toBe('2026-09-23T22:27:18.597+09:00');
  });
});
