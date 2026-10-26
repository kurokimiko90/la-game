import { describe, expect, test } from 'vitest';
import { residentFor, residentsOf, requestLine, thanksLine } from '@/lib/residents';

describe('居民', () => {
  test('已知街區有自己的居民；未知街區用通用居民', () => {
    expect(residentsOf('park').length).toBeGreaterThanOrEqual(3);
    expect(residentsOf('some-new-district').length).toBeGreaterThanOrEqual(3);
    expect(residentsOf('park')[0].name).not.toBe(residentsOf('some-new-district')[0].name);
  });

  test('委託依序輪流，同一個輸入結果相同', () => {
    const cast = residentsOf('park');
    expect(residentFor('park', 0)).toBe(cast[0]);
    expect(residentFor('park', 1)).toBe(cast[1]);
    expect(residentFor('park', cast.length)).toBe(cast[0]);
  });

  test('每位居民都有外觀與身分', () => {
    for (const id of ['park', 'street', 'riverside', 'supermarket', 'station', 'restaurant', 'school', 'hospital', 'airport', 'library', 'post-office', 'fire-station', 'x']) {
      for (const r of residentsOf(id)) {
        expect(r.name).toBeTruthy();
        expect(r.role).toBeTruthy();
        expect(r.look.skin).toMatch(/^#/);
      }
    }
  });

  test('台詞', () => {
    expect(requestLine('picture', 3)).toContain('3');
    expect(requestLine('audio', 1)).toBeTruthy();
    expect(requestLine('recall', 1)).toBeTruthy();
    expect(thanksLine(0)).not.toBe(thanksLine(1));
  });
});
