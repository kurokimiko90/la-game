// 單字在各學習語言下怎麼顯示（純函式）。
import type { Lang, Words } from './types';

export const LANGS: readonly Lang[] = ['en', 'ja', 'zh'];

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** 學習語言的寫法（日語是漢字寫法，讀音另外用 ruby 標） */
export function wordText(words: Words, lang: Lang): string {
  if (lang === 'ja') return words.ja.text;
  if (lang === 'zh') return words['zh-TW'];
  return words.en;
}

/** 翻譯：學中文時中文就是題目本身，改顯示英文 */
export function translationOf(words: Words, lang: Lang): string {
  return lang === 'zh' ? words.en : words['zh-TW'];
}

export function translationLabel(lang: Lang): string {
  return lang === 'zh' ? '英文翻譯' : '中文翻譯';
}
