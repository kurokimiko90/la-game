// 跟讀判定（純函式）：把語音辨識的候選句和單字比對，給 great / close / miss。
import type { Lang, Words } from './types';

export type SpeechGrade = 'great' | 'close' | 'miss';

/** 相似度到這裡算「差一點」 */
export const CLOSE_THRESHOLD = 0.6;

const PUNCT = /[\s\p{P}\p{S}]+/gu;
const EN_ARTICLES = /^(a|an|the)\s+/;

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function normalizeSpeech(text: string, lang: Lang): string {
  let s = text.normalize('NFKC').toLowerCase().trim();
  if (lang === 'en') s = s.replace(/-/g, ' ').replace(EN_ARTICLES, '');
  if (lang === 'ja') s = katakanaToHiragana(s);
  return s.replace(PUNCT, '');
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** 0–1，1 = 完全相同 */
export function similarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  if (len === 0 || a.length === 0 || b.length === 0) return 0;
  return 1 - levenshtein(a, b) / len;
}

/** 這個單字可以接受的念法（日語：漢字寫法或讀音） */
function answers(words: Words, lang: Lang): string[] {
  const raw = lang === 'en' ? [words.en] : lang === 'ja' ? [words.ja.text, words.ja.reading] : [words['zh-TW']];
  return raw.map((w) => normalizeSpeech(w, lang)).filter(Boolean);
}

export function gradeSpeech(heard: readonly string[], words: Words, lang: Lang): { grade: SpeechGrade; heard: string } {
  const expected = answers(words, lang);
  let best = { score: 0, heard: heard[0] ?? '' };
  for (const alt of heard) {
    const n = normalizeSpeech(alt, lang);
    if (!n) continue;
    if (expected.some((e) => n === e || n.includes(e))) return { grade: 'great', heard: alt };
    const score = Math.max(...expected.map((e) => similarity(n, e)));
    if (score > best.score) best = { score, heard: alt };
  }
  return { grade: best.score >= CLOSE_THRESHOLD ? 'close' : 'miss', heard: best.heard };
}
