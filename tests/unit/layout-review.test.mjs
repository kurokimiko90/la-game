import { describe, expect, it } from 'vitest';
import { buildLayoutPrompt, parseLayout } from '../../scripts/lib/layout-review.mjs';

const zones = [
  { id: 'lobby', name: '大廳', items: [{ id: 'sofa', en: 'sofa', zh: '沙發' }, { id: 'lamp', en: 'lamp', zh: '檯燈' }] },
  { id: 'pool', name: '泳池', items: [{ id: 'ring', en: 'swim ring', zh: '泳圈' }] },
];

describe('buildLayoutPrompt', () => {
  it('依附圖順序列出區域和裡面的物品', () => {
    const p = buildLayoutPrompt('游泳池', zones);
    expect(p).toContain('第 1 張：大廳（lobby）：sofa 沙發、lamp 檯燈');
    expect(p).toContain('第 2 張：泳池（pool）：swim ring 泳圈');
    expect(p).toContain('"score"');
  });
});

describe('parseLayout', () => {
  it('分數夾在 1–5；物品可以用 id 或英文對回 id；不認得的區域和物品丟掉', () => {
    const raw = 'ok {"score":7,"issues":[{"zone":"pool","issue":"泳圈浮在牆上","items":["swim ring","ghost"]},{"zone":"nowhere","issue":"x"},{"zone":"lobby","issue":"沙發擋住入口","items":["sofa"]}]}';
    expect(parseLayout(raw, zones)).toEqual({
      score: 5,
      issues: [
        { zone: 'pool', issue: '泳圈浮在牆上', items: ['ring'] },
        { zone: 'lobby', issue: '沙發擋住入口', items: ['sofa'] },
      ],
    });
  });
  it('沒有分數：null', () => {
    expect(parseLayout('{"issues":[]}', zones)).toEqual({ score: null, issues: [] });
  });
});
