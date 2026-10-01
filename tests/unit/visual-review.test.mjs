import { describe, expect, it } from 'vitest';
import { SHEET_SIZE, buildVisualPrompt, chunkItems, parseVisual } from '../../scripts/lib/visual-review.mjs';

const item = (id, en, desc = `${en} 的描述`) => ({ id, en, zh: id, desc });

describe('chunkItems', () => {
  it(`每 ${SHEET_SIZE} 個一張，編號從 1 開始`, () => {
    const items = Array.from({ length: SHEET_SIZE + 3 }, (_, i) => item(`i${i}`, `w${i}`));
    const chunks = chunkItems(items);
    expect(chunks).toHaveLength(2);
    expect(chunks[1][0]).toMatchObject({ n: 1, id: `i${SHEET_SIZE}` });
  });
});

describe('buildVisualPrompt', () => {
  it('列出編號、英文、中文和描述', () => {
    const p = buildVisualPrompt('健身房', [{ n: 1, ...item('dumbbell', 'dumbbell', '黑色啞鈴') }]);
    expect(p).toContain('1. dumbbell（dumbbell）：黑色啞鈴');
    expect(p).toContain('"items"');
  });
});

describe('parseVisual', () => {
  const chunk = [{ n: 1, ...item('a', 'apple') }, { n: 2, ...item('b', 'ball') }, { n: 3, ...item('c', 'cup') }];
  it('不符合的物件與長得太像的兩兩一組', () => {
    const raw = '```json\n{"items":[{"n":1,"ok":true},{"n":2,"ok":false,"issue":"看起來像盤子"}],"similar":[[1,3]]}\n```';
    expect(parseVisual(raw, chunk)).toEqual({
      flagged: [{ id: 'b', flag: '看圖：看起來像盤子' }],
      similar: [['a', 'c']],
    });
  });
  it('不認得的編號忽略', () => {
    expect(parseVisual('{"items":[{"n":9,"ok":false,"issue":"x"}],"similar":[[1,9]]}', chunk)).toEqual({ flagged: [], similar: [] });
  });
});
