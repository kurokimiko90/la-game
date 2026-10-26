'use client';

// 跟讀：用瀏覽器的語音辨識（Web Speech API）聽玩家念，再用 gradeSpeech 判定。
// Chrome 的辨識會把聲音送到 Google 的伺服器；Firefox 不支援（按鈕不顯示）。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SPEECH_LANG, stopAudio } from '@/lib/audio';
import { gradeSpeech, type SpeechGrade } from '@/lib/speech-match';
import type { Lang, Words } from '@/lib/types';

interface RecognitionAlternative { transcript: string }
interface RecognitionResultEvent { results: ArrayLike<ArrayLike<RecognitionAlternative>> }
interface RecognitionErrorEvent { error: string }
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

export type ShadowPhase =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'result'; grade: SpeechGrade; heard: string }
  | { kind: 'error'; message: string };

const LISTEN_MS = 6000;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** onDone：有判定結果給 grade；出錯、沒聽到給 null */
export function useShadowing(onDone: (grade: SpeechGrade | null) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionCtor() !== null, () => false);
  const [phase, setPhase] = useState<ShadowPhase>({ kind: 'idle' });
  const recRef = useRef<Recognition | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });

  const cleanup = useCallback(() => {
    window.clearTimeout(timerRef.current);
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback((words: Words, lang: Lang) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    cleanup();
    stopAudio(); // 不要讓辨識聽到自己播的發音
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang];
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let done = false;
    rec.onresult = (e) => {
      done = true;
      const first = e.results[0];
      const heard = first ? Array.from({ length: first.length }, (_, i) => first[i].transcript) : [];
      const result = gradeSpeech(heard, words, lang);
      setPhase({ kind: 'result', ...result });
      onDoneRef.current(result.grade);
      cleanup();
    };
    rec.onerror = (e) => {
      done = true;
      const message = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? '需要麥克風權限才能跟讀'
        : e.error === 'no-speech' ? '沒聽到聲音，再試一次' : '辨識失敗，再試一次';
      setPhase({ kind: 'error', message });
      onDoneRef.current(null);
      cleanup();
    };
    rec.onend = () => {
      if (!done) {
        setPhase({ kind: 'error', message: '沒聽到聲音，再試一次' });
        onDoneRef.current(null);
      }
      cleanup();
    };
    recRef.current = rec;
    setPhase({ kind: 'listening' });
    try {
      rec.start();
    } catch {
      setPhase({ kind: 'error', message: '麥克風忙碌中，再試一次' });
      onDoneRef.current(null);
      cleanup();
      return;
    }
    timerRef.current = window.setTimeout(() => {
      if (!done) {
        setPhase({ kind: 'error', message: '沒聽到聲音，再試一次' });
        onDoneRef.current(null);
      }
      cleanup();
    }, LISTEN_MS);
  }, [cleanup]);

  return { supported, phase, start };
}
