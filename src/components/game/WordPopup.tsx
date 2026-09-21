'use client';

import { Check, Volume2 } from 'lucide-react';
import { WordText } from '../WordText';
import type { Lang, Point, Words } from '@/lib/types';

interface WordPopupProps {
  words: Words;
  lang: Lang;
  showTranslation: boolean;
  showReading: boolean;
  point: Point;
  found: boolean;
  onReplay: () => void;
}

const WIDTH = 220;

// 點擊位置上方的單字卡；本身不擋點擊（只有喇叭按鈕可按）
export function WordPopup({ words, lang, showTranslation, showReading, point, found, onReplay }: WordPopupProps) {
  // 以點擊處為中心，但不超出畫布左右邊界
  const left = `clamp(8px, ${point.x - WIDTH / 2}px, calc(100% - ${WIDTH + 8}px))`;
  const above = point.y > 170;
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
          <WordText words={words} lang={lang} showReading={showReading} className="text-2xl font-bold leading-tight" />
          <button
            type="button"
            aria-label="再聽一次"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onReplay}
            className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand hover:bg-brand hover:text-white"
          >
            <Volume2 size={18} />
          </button>
        </div>
        {showTranslation && <div className="mt-1 text-sm text-muted">{words['zh-TW']}</div>}
      </div>
    </div>
  );
}
