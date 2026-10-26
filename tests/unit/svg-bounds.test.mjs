import { describe, expect, test } from 'vitest';
import { contentTop } from '../../scripts/lib/svg-bounds.mjs';

describe('contentTop', () => {
  test('各種形狀的上緣取最小值', () => {
    expect(contentTop('<rect x="10" y="30" width="5" height="5"/><circle cx="5" cy="50" r="10"/>', [0, 0, 100, 100])).toBeCloseTo(0.3);
    expect(contentTop('<ellipse cx="5" cy="50" rx="3" ry="35"/>', [0, 0, 100, 100])).toBeCloseTo(0.15);
    expect(contentTop('<polygon points="0,80 10,20 20,80"/>', [0, 0, 100, 100])).toBeCloseTo(0.2);
    expect(contentTop('<line x1="0" y1="60" x2="5" y2="45"/>', [0, 0, 100, 100])).toBeCloseTo(0.45);
  });
  test('絕對座標 path（含 H / V）', () => {
    expect(contentTop('<path d="M21 13 V8 H39 V13"/>', [0, 0, 60, 80])).toBeCloseTo(0.1);
    expect(contentTop('<path d="M10 40 C 0 12, 20 30, 30 40 Z"/>', [0, 0, 60, 100])).toBeCloseTo(0.12);
  });
  test('相對座標 path、有 transform 的元素略過；什麼都沒有回傳 0', () => {
    expect(contentTop('<path d="m10 5 l5 5"/><rect x="0" y="50" width="1" height="1"/>', [0, 0, 100, 100])).toBeCloseTo(0.5);
    expect(contentTop('<rect x="0" y="0" width="1" height="1" transform="rotate(5)"/><rect x="0" y="40" width="1" height="1"/>', [0, 0, 100, 100])).toBeCloseTo(0.4);
    expect(contentTop('', [0, 0, 100, 100])).toBe(0);
  });
  test('viewBox 有位移時換算，結果限制在 0–1', () => {
    expect(contentTop('<rect x="0" y="60" width="1" height="1"/>', [0, 50, 100, 100])).toBeCloseTo(0.1);
    expect(contentTop('<rect x="0" y="-20" width="1" height="1"/>', [0, 0, 100, 100])).toBe(0);
  });
});
