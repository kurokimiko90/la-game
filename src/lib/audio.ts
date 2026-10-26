// 單字發音：優先播 public/audio 的預先合成音檔；載入失敗時退回瀏覽器語音合成。
// 「正在說話」的狀態可以訂閱（居民頭像說話時嘴巴會動）。
import type { Lang, Words } from './types';
import { wordText } from './words';

export const SPEECH_LANG: Record<Lang, string> = { en: 'en-US', ja: 'ja-JP', zh: 'zh-TW' };
let current: HTMLAudioElement | null = null;
let speaking = false;
const listeners = new Set<(speaking: boolean) => void>();

function setSpeaking(on: boolean): void {
  if (speaking === on) return;
  speaking = on;
  for (const l of listeners) l(on);
}

export function subscribeSpeaking(listener: (speaking: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isSpeaking = () => speaking;

function speak(text: string, lang: Lang): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  u.rate = 0.9;
  u.onstart = () => setSpeaking(true);
  u.onend = () => setSpeaking(false);
  u.onerror = () => setSpeaking(false);
  window.speechSynthesis.speak(u);
}

export function playWord(sceneId: string, itemId: string, words: Words, lang: Lang): void {
  if (typeof window === 'undefined') return;
  current?.pause();
  const audio = new Audio(`/audio/${lang}/${sceneId}/${itemId}.mp3`);
  current = audio;
  const off = () => { if (current === audio) setSpeaking(false); };
  audio.addEventListener('playing', () => { if (current === audio) setSpeaking(true); });
  audio.addEventListener('ended', off);
  audio.addEventListener('pause', off);
  audio.play().catch(() => {
    // 自動播放被擋或檔案不存在：改用語音合成（至少聽得到）
    if (current === audio) speak(wordText(words, lang), lang);
  });
}

export function stopAudio(): void {
  current?.pause();
  current = null;
  setSpeaking(false);
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
