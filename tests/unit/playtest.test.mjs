import { describe, expect, it } from 'vitest';
import { MIN_CLICKABLE, MIN_PHONE_PX, PHONE, clickableShare, playtestScene } from '../../scripts/lib/playtest.mjs';

const box = (id, x, y, w, h) => ({ id, x, y, w, h });

describe('clickableShare', () => {
  it('沒被擋：整個點得到', () => {
    const a = box('a', 0, 0, 100, 100);
    expect(clickableShare(a, [a])).toBe(1);
  });
  it('大物件上放了小物件：被蓋住的部分點不到（遊戲規則：小的優先）', () => {
    const big = box('big', 0, 0, 100, 100);
    const small = box('small', 0, 0, 100, 50);
    expect(clickableShare(big, [big, small])).toBeCloseTo(4 / 9, 2);
    expect(clickableShare(small, [big, small])).toBe(1);
  });
  it('完全被更小的物件蓋滿：點不到', () => {
    const big = box('big', 0, 0, 100, 100);
    const cover = [box('l', 0, 0, 50, 100), box('r', 50, 0, 50, 100)];
    expect(clickableShare(big, [big, ...cover])).toBe(0);
  });
});

describe('playtestScene', () => {
  const scale = PHONE.height / 900;
  it('標出點不到、太小的物件；正常的不標', () => {
    const big = box('big', 0, 0, 100, 100);
    const tiny = box('tiny', 500, 500, Math.floor(MIN_PHONE_PX / scale) - 1, 40);
    const cover = [box('l', 0, 0, 50, 100), box('r', 50, 0, 50, 100)];
    const r = playtestScene({ items: [big, tiny, ...cover] });
    expect(r.flagged).toEqual([
      { id: 'big', flag: '點不到（被其他物件完全蓋住）' },
      { id: 'tiny', flag: expect.stringMatching(/^手機上太小/) },
    ]);
    expect(r.stats.items).toBe(4);
  });
  it('只被擋住一部分、低於門檻才標', () => {
    const big = box('big', 0, 0, 100, 100);
    const r = playtestScene({ items: [big, box('s', 0, 0, 100, 80)] });
    expect(r.flagged[0]).toEqual({ id: 'big', flag: expect.stringMatching(/^大部分被擋住/) });
    expect(MIN_CLICKABLE).toBeGreaterThan(2 / 9);
  });
});
