// 單字發音：優先播 public/audio 的預先合成音檔；載入失敗時退回瀏覽器語音合成。
import type { Lang, Words } from './types';

const SPEECH_LANG: Record<Lang, string> = { en: 'en-US', ja: 'ja-JP' };
let current: HTMLAudioElement | null = null;

export function wordText(words: Words, lang: Lang): string {
  return lang === 'ja' ? words.ja.text : words.en;
}

function speak(text: string, lang: Lang): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export function playWord(sceneId: string, itemId: string, words: Words, lang: Lang): void {
  if (typeof window === 'undefined') return;
  current?.pause();
  const audio = new Audio(`/audio/${lang}/${sceneId}/${itemId}.mp3`);
  current = audio;
  audio.play().catch(() => {
    // 自動播放被擋或檔案不存在：改用語音合成（至少聽得到）
    if (current === audio) speak(wordText(words, lang), lang);
  });
}

export function stopAudio(): void {
  current?.pause();
  current = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
