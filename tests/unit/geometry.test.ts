import { describe, expect, test } from 'vitest';
import { defaultScale, fitScale, clampView, zoomAt, toScene, centerOn, isNearItem, itemAtPoint, itemTransform, wholeView, MAX_ZOOM, VIEW_HEIGHT } from '@/lib/geometry';

const scene = { width: 4000, height: 3000 };
const container = { width: 800, height: 450 };

describe('defaultScale / fitScale / clampView', () => {
  test('預設縮放：畫面高度剛好看到 VIEW_HEIGHT 的地圖；fit：整張地圖放得進畫面', () => {
    expect(defaultScale(container)).toBe(450 / VIEW_HEIGHT);
    expect(fitScale(container, scene)).toBe(Math.min(800 / 4000, 450 / 3000));
  });

  test('最小可以縮到看見整張地圖；內容比容器小的方向可以在容器內拖動，但不超出容器', () => {
    const s = fitScale(container, scene);
    const room = 800 - 4000 * s;
    expect(room).toBeGreaterThan(0);
    expect(clampView({ scale: 0.001, tx: 50, ty: 0 }, container, scene)).toEqual({ scale: s, tx: 50, ty: 0 });
    expect(clampView({ scale: s, tx: -30, ty: 0 }, container, scene).tx).toBe(0);
    expect(clampView({ scale: s, tx: room + 30, ty: 0 }, container, scene).tx).toBe(room);
  });

  test('wholeView：整張地圖置中', () => {
    const v = wholeView(container, scene);
    expect(v.scale).toBe(fitScale(container, scene));
    expect(v.tx).toBe((800 - 4000 * v.scale) / 2);
    expect(v.ty).toBe((450 - 3000 * v.scale) / 2);
  });

  test('最大放大到預設的 MAX_ZOOM 倍；平移不超出地圖（上下左右都限制）', () => {
    const v = clampView({ scale: 99, tx: -99999, ty: -99999 }, container, scene);
    expect(v.scale).toBe(defaultScale(container) * MAX_ZOOM);
    expect(v.tx).toBe(800 - 4000 * v.scale);
    expect(v.ty).toBe(450 - 3000 * v.scale);
    const origin = clampView({ scale: 0.5, tx: 50, ty: 50 }, container, scene);
    expect(origin).toEqual({ scale: 0.5, tx: 0, ty: 0 });
  });
});

describe('zoomAt / toScene', () => {
  test('以錨點縮放後，錨點對應的場景座標不變', () => {
    const view = { scale: 0.5, tx: -100, ty: 0 };
    const anchor = { x: 300, y: 200 };
    const before = toScene(view, anchor);
    const after = toScene(zoomAt(view, anchor, 1), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe('centerOn', () => {
  test('目標置中且不超出邊界', () => {
    const v = centerOn({ scale: 1, tx: 0, ty: 0 }, { x: 1600, y: 1450 }, container, scene);
    expect(toScene(v, { x: 400, y: 225 })).toEqual({ x: 1600, y: 1450 });
    const edge = centerOn({ scale: 1, tx: 0, ty: 0 }, { x: 10, y: 10 }, container, scene);
    expect(edge).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('isNearItem', () => {
  const item = { x: 100, y: 100, w: 40, h: 60 };
  test('外框內與容許誤差內算命中', () => {
    expect(isNearItem(item, { x: 120, y: 130 })).toBe(true);
    expect(isNearItem(item, { x: 70, y: 90 })).toBe(true);
    expect(isNearItem(item, { x: 30, y: 130 })).toBe(false);
  });

  test('大物件的誤差依尺寸放大', () => {
    const big = { x: 0, y: 0, w: 400, h: 400 };
    expect(isNearItem(big, { x: 480, y: 10 })).toBe(true);
    expect(isNearItem(big, { x: 520, y: 10 })).toBe(false);
  });
});

describe('itemTransform', () => {
  const box = { x: 100, y: 200, w: 40, h: 60 };
  test('正立、不鏡像時不需要 transform', () => {
    expect(itemTransform({ ...box, rotate: 0, flip: false })).toBeUndefined();
  });

  test('以底部中心為支點旋轉與鏡像', () => {
    expect(itemTransform({ ...box, rotate: 15, flip: true })).toBe('translate(120 260) rotate(15) scale(-1 1) translate(-120 -260)');
  });
});

describe('itemAtPoint（點在形狀空隙時的後備判定）', () => {
  const rope = { id: 'rope', x: 100, y: 100, w: 200, h: 200 };
  const coin = { id: 'coin', x: 180, y: 180, w: 20, h: 20 };
  const bench = { id: 'bench', x: 600, y: 100, w: 100, h: 50 };

  test('點在外框內 → 該物件', () => {
    expect(itemAtPoint([rope, bench], { x: 150, y: 150 }, 0)?.id).toBe('rope');
  });

  test('外框重疊時取面積最小的（小東西優先）', () => {
    expect(itemAtPoint([rope, coin], { x: 190, y: 190 }, 0)?.id).toBe('coin');
  });

  test('外框外擴 pad 以內也算；超出就沒有', () => {
    expect(itemAtPoint([bench], { x: 590, y: 120 }, 12)?.id).toBe('bench');
    expect(itemAtPoint([bench], { x: 580, y: 120 }, 12)).toBeNull();
  });
});
