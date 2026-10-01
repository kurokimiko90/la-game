import { describe, expect, it } from 'vitest';
import { MAX_REJECT_RATIO, applyReview, buildReviewPrompt } from '../../scripts/lib/vocab-review.mjs';

const item = (id, over = {}) => ({ id, zh: '啞鈴', en: 'dumbbell', ja: 'ダンベル', reading: 'だんべる', category: '道具', size: 'small', zone: 'gym-floor', ...over });

describe('buildReviewPrompt', () => {
  it('列出每個物品的四語資料並要求 JSON', () => {
    const p = buildReviewPrompt({ sceneName: '健身房', elements: [item('dumbbell')], zones: { 'gym-floor': '重訓區' } });
    expect(p).toContain('健身房');
    expect(p).toContain('dumbbell【重訓區】：dumbbell｜啞鈴｜ダンベル（だんべる）');
    expect(p).toContain('"items"');
  });
});

describe('applyReview', () => {
  // 10 個物品：丟 2 個（20%）以內才算數
  const elements = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => item(id, { en: id }));
  const rest = (...drop) => elements.map((e) => e.id).filter((id) => !drop.includes(id));

  it('ok 的留下；沒審到的也留下（審核失誤不擋）', () => {
    const r = applyReview(elements, [{ id: 'a', ok: true }]);
    expect(r.ok.map((e) => e.id)).toEqual(rest());
    expect(r.rejected).toEqual([]);
  });

  it('不 ok、有合格的修正：套用修正後留下', () => {
    const r = applyReview(elements, [{ id: 'b', ok: false, issue: '日文不自然', fix: { ja: '鉄アレイ', reading: 'てつあれい' } }]);
    expect(r.ok.find((e) => e.id === 'b')).toMatchObject({ ja: '鉄アレイ', reading: 'てつあれい', zh: '啞鈴' });
    expect(r.fixed).toEqual([{ id: 'b', issue: '日文不自然', changes: { ja: '鉄アレイ', reading: 'てつあれい' } }]);
  });

  it('修正的讀音不是假名、中文不含漢字：不採用修正，整個丟掉', () => {
    const r = applyReview(elements, [
      { id: 'c', ok: false, issue: '讀音錯', fix: { reading: 'tetsu' } },
      { id: 'd', ok: false, issue: '中文不常用', fix: { zh: 'abc' } },
    ]);
    expect(r.ok.map((e) => e.id)).toEqual(rest('c', 'd'));
    expect(r.rejected).toEqual([
      { id: 'c', reason: '審核：讀音錯' },
      { id: 'd', reason: '審核：中文不常用' },
    ]);
  });

  it('修正想改英文（等於換成別的東西）：不採用，整個丟掉', () => {
    const r = applyReview(elements, [{ id: 'a', ok: false, issue: '不屬於這裡', fix: { en: 'water bottle', zh: '水壺' } }]);
    expect(r.ok.map((e) => e.id)).toEqual(rest('a'));
    expect(r.rejected).toEqual([{ id: 'a', reason: '審核：不屬於這裡' }]);
  });

  it('不 ok、沒有修正：丟掉並記原因', () => {
    const r = applyReview(elements, [{ id: 'a', ok: false, issue: '這個場景不會有' }]);
    expect(r.ok.map((e) => e.id)).toEqual(rest('a'));
    expect(r.rejected).toEqual([{ id: 'a', reason: '審核：這個場景不會有' }]);
  });

  it('不改原本的陣列和物件', () => {
    const before = JSON.stringify(elements);
    applyReview(elements, [{ id: 'b', ok: false, issue: 'x', fix: { ja: '鉄アレイ' } }]);
    expect(JSON.stringify(elements)).toBe(before);
  });

  it(`丟掉超過 ${MAX_REJECT_RATIO * 100}%：當作審核不可靠，只套用修正、不丟物品`, () => {
    const r = applyReview(elements, [
      { id: 'a', ok: false, issue: 'x' },
      { id: 'b', ok: false, issue: 'x' },
      { id: 'c', ok: false, issue: 'x' },
      { id: 'd', ok: false, issue: '日文不自然', fix: { ja: '鉄アレイ' } },
    ]);
    expect(r.unreliable).toBe(true);
    expect(r.rejected).toEqual([]);
    expect(r.ok.map((e) => e.id)).toEqual(rest());
    expect(r.ok.find((e) => e.id === 'd').ja).toBe('鉄アレイ');
  });
});
