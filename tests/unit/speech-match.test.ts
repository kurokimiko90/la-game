import { describe, expect, test } from 'vitest';
import { gradeSpeech, normalizeSpeech, similarity } from '@/lib/speech-match';
import type { Words } from '@/lib/types';

const bench: Words = { 'zh-TW': '長椅', en: 'bench', ja: { text: '長椅子', reading: 'ながいす' } };
const iceCream: Words = { 'zh-TW': '冰淇淋', en: 'ice cream', ja: { text: 'アイスクリーム', reading: 'あいすくりーむ' } };

describe('normalizeSpeech', () => {
  test('英語：小寫、去標點、去冠詞、去空白', () => {
    expect(normalizeSpeech('The Ice-Cream!', 'en')).toBe('icecream');
    expect(normalizeSpeech('a bench.', 'en')).toBe('bench');
  });
  test('日語：片假名轉平假名、去標點與空白', () => {
    expect(normalizeSpeech('アイス クリーム。', 'ja')).toBe('あいすくりーむ');
  });
  test('中文：去標點與空白', () => {
    expect(normalizeSpeech('長 椅。', 'zh')).toBe('長椅');
  });
});

describe('similarity', () => {
  test('相同 = 1，完全不同接近 0', () => {
    expect(similarity('bench', 'bench')).toBe(1);
    expect(similarity('bench', 'bunch')).toBeCloseTo(0.8);
    expect(similarity('', 'x')).toBe(0);
  });
});

describe('gradeSpeech', () => {
  test('念對（任一候選相符，或句子裡包含單字）→ great', () => {
    expect(gradeSpeech(['bench'], bench, 'en').grade).toBe('great');
    expect(gradeSpeech(['french', "it's a bench"], bench, 'en')).toEqual({ grade: 'great', heard: "it's a bench" });
    expect(gradeSpeech(['ice cream'], iceCream, 'en').grade).toBe('great');
  });

  test('日語：漢字或假名都算', () => {
    expect(gradeSpeech(['長椅子'], bench, 'ja').grade).toBe('great');
    expect(gradeSpeech(['ながいす'], bench, 'ja').grade).toBe('great');
    expect(gradeSpeech(['アイスクリーム'], iceCream, 'ja').grade).toBe('great');
  });

  test('中文', () => {
    expect(gradeSpeech(['長椅'], bench, 'zh').grade).toBe('great');
  });

  test('接近 → close；差很多 → miss；沒聽到 → miss', () => {
    expect(gradeSpeech(['bunch'], bench, 'en')).toEqual({ grade: 'close', heard: 'bunch' });
    expect(gradeSpeech(['airplane'], bench, 'en')).toEqual({ grade: 'miss', heard: 'airplane' });
    expect(gradeSpeech([], bench, 'en')).toEqual({ grade: 'miss', heard: '' });
  });
});
