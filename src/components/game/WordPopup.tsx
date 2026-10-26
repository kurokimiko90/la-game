'use client';

import { Check, Mic, Volume2 } from 'lucide-react';
import { WordText } from '../WordText';
import { useShadowing, type ShadowPhase } from './useShadowing';
import { translationOf } from '@/lib/words';
import type { SpeechGrade } from '@/lib/speech-match';
import type { Lang, Point, Words } from '@/lib/types';

interface WordPopupProps {
  words: Words;
  lang: Lang;
  showTranslation: boolean;
  showReading: boolean;
  point: Point;
  found: boolean;
  onReplay: () => void;
  /** 開始跟讀：單字卡要保持開著 */
  onShadowStart: () => void;
  /** 跟讀結束：grade 為 null 代表出錯或沒聽到 */
  onShadowResult: (grade: SpeechGrade | null) => void;
}

const WIDTH = 240;

function Feedback({ phase }: { phase: ShadowPhase }) {
  if (phase.kind === 'idle') return null;
  if (phase.kind === 'listening') return <div className="mt-2 text-sm font-semibold text-danger">請跟著念…</div>;
  if (phase.kind === 'error') return <div className="mt-2 text-sm text-muted">{phase.message}</div>;
  const heard = phase.heard ? `聽到「${phase.heard}」` : '';
  if (phase.grade === 'great') return <div className="pop-in mt-2 text-sm font-bold text-brand">念得好！{heard}</div>;
  if (phase.grade === 'close') return <div className="pop-in mt-2 text-sm font-semibold text-accent">差一點！{heard}</div>;
  return <div className="pop-in mt-2 text-sm text-muted">{heard || '沒聽清楚'}，再聽一次試試</div>;
}

// 點擊位置上方的單字卡；本身不擋點擊（只有按鈕可按）
export function WordPopup({ words, lang, showTranslation, showReading, point, found, onReplay, onShadowStart, onShadowResult }: WordPopupProps) {
  const shadow = useShadowing(onShadowResult);
  // 以點擊處為中心，但不超出畫布左右邊界
  const left = `clamp(8px, ${point.x - WIDTH / 2}px, calc(100% - ${WIDTH + 8}px))`;
  const above = point.y > 190;
  const listening = shadow.phase.kind === 'listening';
  const onMic = () => {
    onShadowStart();
    shadow.start(words, lang);
  };
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left, top: above ? point.y - 16 : point.y + 24, width: WIDTH, transform: above ? 'translateY(-100%)' : undefined }}
      role="status"
      aria-live="polite"
    >
      <div className={`pop-in rounded-2xl bg-white px-4 py-3 shadow-xl ring-2 ${found ? 'ring-brand' : 'ring-black/5'}`}>
        {found && (
          <div className="mb-1 flex items-center gap-1 text-xs font-bold text-brand">
            <Check size={14} /> 找到了！
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <WordText words={words} lang={lang} showReading={showReading} className="min-w-0 text-2xl font-bold leading-tight" />
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              aria-label="再聽一次"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onReplay}
              className="pointer-events-auto grid size-9 place-items-center rounded-full bg-brand-soft text-brand hover:bg-brand hover:text-white"
            >
              <Volume2 size={18} />
            </button>
            {shadow.supported && (
              <button
                type="button"
                aria-label="跟著念"
                title="按下後念出這個單字"
                disabled={listening}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onMic}
                className={`pointer-events-auto grid size-9 place-items-center rounded-full ${listening ? 'mic-listening bg-danger text-white' : 'bg-danger/15 text-danger hover:bg-danger hover:text-white'}`}
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        </div>
        {showTranslation && <div className="mt-1 text-sm text-muted">{translationOf(words, lang)}</div>}
        <Feedback phase={shadow.phase} />
      </div>
    </div>
  );
}
