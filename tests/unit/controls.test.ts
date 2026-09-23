import { describe, expect, test } from 'vitest';
import { KEY_PAN_STEP, keyIntent, primaryButtonChange, wheelIntent } from '@/lib/controls';

const wheel = (patch: Partial<Parameters<typeof wheelIntent>[0]>) =>
  wheelIntent({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...patch });

const factorOf = (i: ReturnType<typeof wheelIntent>) => (i.kind === 'zoom' ? i.factor : NaN);

describe('wheelIntent', () => {
  test('滾輪往下 = 縮小、往上 = 放大，一格約 20%', () => {
    expect(factorOf(wheel({ deltaY: 100 }))).toBeCloseTo(Math.exp(-0.2));
    expect(factorOf(wheel({ deltaY: -100 }))).toBeCloseTo(Math.exp(0.2));
  });

  test('以行 / 頁為單位的滾輪換算成像素', () => {
    expect(factorOf(wheel({ deltaY: 3, deltaMode: 1 }))).toBeCloseTo(factorOf(wheel({ deltaY: 48 })));
    expect(factorOf(wheel({ deltaY: 1, deltaMode: 2 }))).toBeLessThan(1);
  });

  test('一次滾很多也不會縮放超過一格', () => {
    expect(factorOf(wheel({ deltaY: 1000 }))).toBeCloseTo(factorOf(wheel({ deltaY: 100 })));
  });

  test('ctrl / ⌘（含觸控板捏合）也是縮放，小幅度較靈敏', () => {
    expect(factorOf(wheel({ deltaY: 5, ctrlKey: true }))).toBeCloseTo(Math.exp(-0.05));
    expect(factorOf(wheel({ deltaY: 100, metaKey: true }))).toBeCloseTo(Math.exp(-0.2));
  });

  test('觸控板左右滑 = 橫向平移', () => {
    expect(wheel({ deltaX: 30, deltaY: 5 })).toEqual({ kind: 'pan', dx: 30, dy: 0 });
  });

  test('Shift + 滾輪 = 橫向平移', () => {
    expect(wheel({ deltaY: 100, shiftKey: true })).toEqual({ kind: 'pan', dx: 100, dy: 0 });
  });

  test('沒有移動量就不動作', () => {
    expect(wheel({})).toEqual({ kind: 'none' });
  });
});

describe('keyIntent', () => {
  test('+ / = 放大，- 縮小，0 看整個小鎮', () => {
    expect(keyIntent('+')).toEqual({ kind: 'zoom', factor: 1.25 });
    expect(keyIntent('=')).toEqual({ kind: 'zoom', factor: 1.25 });
    expect(keyIntent('-')).toEqual({ kind: 'zoom', factor: 0.8 });
    expect(keyIntent('_')).toEqual({ kind: 'zoom', factor: 0.8 });
    expect(keyIntent('0')).toEqual({ kind: 'fit' });
  });

  test('方向鍵與 WASD 平移（dx/dy 是畫面要看的方向）', () => {
    expect(keyIntent('ArrowLeft')).toEqual({ kind: 'pan', dx: -KEY_PAN_STEP, dy: 0 });
    expect(keyIntent('d')).toEqual({ kind: 'pan', dx: KEY_PAN_STEP, dy: 0 });
    expect(keyIntent('W')).toEqual({ kind: 'pan', dx: 0, dy: -KEY_PAN_STEP });
    expect(keyIntent('ArrowDown')).toEqual({ kind: 'pan', dx: 0, dy: KEY_PAN_STEP });
  });

  test('其他按鍵不處理', () => {
    expect(keyIntent('Enter')).toEqual({ kind: 'none' });
  });
});

describe('primaryButtonChange（右鍵卡住時的和弦按鍵）', () => {
  test('左鍵按著、還沒在追蹤 → press；左鍵放開、正在追蹤 → release', () => {
    expect(primaryButtonChange(3, false)).toBe('press'); // 右鍵卡住 + 按左鍵
    expect(primaryButtonChange(2, true)).toBe('release'); // 放開左鍵，右鍵還卡著
    expect(primaryButtonChange(1, false)).toBe('press');
    expect(primaryButtonChange(0, true)).toBe('release');
  });

  test('狀態沒變 → null', () => {
    expect(primaryButtonChange(3, true)).toBeNull();
    expect(primaryButtonChange(2, false)).toBeNull();
    expect(primaryButtonChange(0, false)).toBeNull();
  });
});
