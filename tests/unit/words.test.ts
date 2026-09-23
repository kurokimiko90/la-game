import { describe, expect, test } from 'vitest';
import { isLang, translationLabel, translationOf, wordText } from '@/lib/words';
import type { Words } from '@/lib/types';

const bench: Words = { 'zh-TW': '長椅', en: 'bench', ja: { text: 'ベンチ', reading: 'ベンチ' } };

describe('words', () => {
  test('各語言的寫法', () => {
    expect(wordText(bench, 'en')).toBe('bench');
    expect(wordText(bench, 'ja')).toBe('ベンチ');
    expect(wordText(bench, 'zh')).toBe('長椅');
  });

  test('學中文時翻譯改顯示英文', () => {
    expect(translationOf(bench, 'en')).toBe('長椅');
    expect(translationOf(bench, 'ja')).toBe('長椅');
    expect(translationOf(bench, 'zh')).toBe('bench');
    expect(translationLabel('zh')).toBe('英文翻譯');
    expect(translationLabel('en')).toBe('中文翻譯');
  });

  test('isLang 只收支援的語言', () => {
    expect(['en', 'ja', 'zh'].every(isLang)).toBe(true);
    expect(isLang('fr')).toBe(false);
    expect(isLang(1)).toBe(false);
  });
});
