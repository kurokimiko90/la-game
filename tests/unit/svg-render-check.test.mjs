import { describe, expect, it } from 'vitest';
import { MIN_COVERAGE, flagRender } from '../../scripts/lib/svg-render-check.mjs';

describe('flagRender', () => {
  it('正常的圖不標記', () => {
    expect(flagRender({ coverage: 0.3, colors: 6, error: null })).toBeNull();
  });
  it('渲染失敗', () => {
    expect(flagRender({ coverage: 0, colors: 0, error: 'decode' })).toBe('渲染失敗：decode');
  });
  it('幾乎是空白', () => {
    expect(flagRender({ coverage: MIN_COVERAGE / 2, colors: 3, error: null })).toMatch(/幾乎空白/);
  });
  it('只有一種顏色（剪影）', () => {
    expect(flagRender({ coverage: 0.4, colors: 1, error: null })).toMatch(/只有 1 種顏色/);
  });
});
