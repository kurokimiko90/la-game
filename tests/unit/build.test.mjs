import { describe, expect, test } from 'vitest';
import { sanitizeSvg } from '../../scripts/lib/svg-sanitize.mjs';
import { fitToViewBox } from '../../scripts/lib/scene-source.mjs';

describe('sanitizeSvg', () => {
  test('保留幾何標籤與白名單屬性，拿掉 root', () => {
    const r = sanitizeSvg('<svg viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="3" height="4" fill="#fff" onclick="x()"/><g><circle cx="5" cy="5" r="2"/></g></svg>');
    expect(r.viewBox).toEqual([0, 0, 40, 30]);
    expect(r.body).toBe('<rect x="1" y="2" width="3" height="4" fill="#fff"/><g><circle cx="5" cy="5" r="2"/></g>');
  });

  test.each([
    ['<svg viewBox="0 0 9 9"><script>alert(1)</script></svg>', /不允許的標籤/],
    ['<svg viewBox="0 0 9 9"><text x="1">A</text></svg>', /不允許/],
    ['<svg viewBox="0 0 9 9"><image href="https://x"/></svg>', /不允許的標籤/],
    ['<svg viewBox="0 0 9 9"><rect fill="url(#a)"/></svg>', /不安全/],
    ['<svg viewBox="0 0 9 9"><rect fill="javascript:x"/></svg>', /不安全/],
    ['<svg><rect/></svg>', /viewBox 無效/],
    ['<svg viewBox="0 0 0 9"><rect/></svg>', /viewBox 無效/],
    ['<rect/>', /第一個標籤必須是/],
    ['<svg viewBox="0 0 9 9"><svg viewBox="0 0 1 1"></svg></svg>', /巢狀/],
    ['<svg viewBox="0 0 9 9"></svg>', /沒有任何圖形/],
    ['<svg viewBox="0 0 9 9"><rect/>', /未正確閉合/],
    ['<svg viewBox="0 0 9 9"><rect/></svg>tail', /結尾/],
  ])('擋下不安全或壞掉的 SVG：%s', (svg, re) => {
    expect(() => sanitizeSvg(svg, 't')).toThrow(re);
  });
});

describe('fitToViewBox', () => {
  test('長寬比沒變（只差四捨五入 1 單位）時位置原封不動：擺放時的遮擋檢查才會和 build 一致', () => {
    // itemSize(80 長邊, viewBox 190×100) → w 80、h 42；用 w 反推是 42.1 → 42，viewBox 187×100 反推是 42.8 → 43
    const pos = { x: 10, y: 100, w: 80, h: 42 };
    expect(fitToViewBox(pos, [0, 0, 187, 100])).toEqual(pos);
  });

  test('SVG 重生後長寬比變了：保留寬度與底線，重算高度', () => {
    expect(fitToViewBox({ x: 10, y: 100, w: 80, h: 40 }, [0, 0, 100, 100])).toEqual({ x: 10, y: 60, w: 80, h: 80 });
  });
});
