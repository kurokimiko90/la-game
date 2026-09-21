import { describe, expect, test } from 'vitest';
import { sanitizeSvg } from '../../scripts/lib/svg-sanitize.mjs';

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
