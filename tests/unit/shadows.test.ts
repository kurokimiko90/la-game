import { describe, expect, it } from 'vitest';
import { restingOnOthers } from '../../src/lib/shadows';

const box = (key: string, x: number, y: number, w: number, h: number) => ({ key, x, y, w, h });

describe('restingOnOthers', () => {
  it('放在另一個物件上半部的東西（柱子上的鐘）算疊放', () => {
    const pole = box('pole', 100, 100, 40, 200);
    const clock = box('clock', 90, 40, 60, 70); // 底邊 110，落在柱子頂端附近
    expect(restingOnOthers([pole, clock])).toEqual(new Set(['clock']));
  });

  it('並排站在地上的東西不算（底邊差不多同高）', () => {
    const a = box('a', 0, 100, 50, 100);
    const b = box('b', 30, 95, 50, 100);
    expect(restingOnOthers([a, b]).size).toBe(0);
  });

  it('底邊中心在別人左右範圍外不算', () => {
    const pole = box('pole', 100, 100, 40, 200);
    const side = box('side', 200, 40, 60, 70);
    expect(restingOnOthers([pole, side]).size).toBe(0);
  });

  it('站在大物件前面（底邊比對方底邊低）不算', () => {
    const wall = box('wall', 0, 0, 400, 300);
    const front = box('front', 100, 250, 50, 80);
    expect(restingOnOthers([wall, front]).size).toBe(0);
  });
});
