'use client';

import { RotateCcw, ArrowRight, List, Volume2 } from 'lucide-react';
import { SvgArt } from '../SvgArt';
import { WordText } from '../WordText';
import { Stars, formatTime } from './StageMenu';
import { getStage, type StageDef, type StageState } from '@/lib/stages';
import type { Lang, SceneItem } from '@/lib/types';
import { translationOf } from '@/lib/words';

interface StageResultProps {
  stage: StageDef;
  state: StageState;
  stars: number;
  itemsById: ReadonlyMap<string, SceneItem>;
  lang: Lang;
  showReading: boolean;
  showTranslation: boolean;
  onSay: (itemId: string) => void;
  onRetry: () => void;
  onNext: (stage: StageDef) => void;
  onMenu: () => void;
}

export function StageResult({ stage, state, stars, itemsById, lang, showReading, showTranslation, onSay, onRetry, onNext, onMenu }: StageResultProps) {
  const next = getStage(stage.id + 1);
  const timeMs = (state.finishedAt ?? state.startedAt) - state.startedAt;
  return (
    // 遮罩不擋滑鼠：面板外可以直接拖曳地圖；只有面板本身攔截
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-ink/20 p-4">
      <div data-ui="overlay" className="pop-in pointer-events-auto flex max-h-full w-full max-w-md flex-col rounded-3xl bg-paper p-5 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="text-sm font-semibold text-brand">{stage.name} 完成</div>
          <div className="mt-2 flex justify-center"><Stars count={stars} size={36} /></div>
          <div className="mt-2 text-sm text-muted">
            用時 {formatTime(timeMs)} · 提示 {state.hintsUsed} 次{state.revealed.length > 0 && ` · 揭曉 ${state.revealed.length} 個`}
          </div>
        </div>

        <ul className="mt-4 grid min-h-0 grid-cols-2 gap-2 overflow-y-auto">
          {state.targets.map((id) => {
            const item = itemsById.get(id);
            if (!item) return null;
            return (
              <li key={id}>
                <button type="button" onClick={() => onSay(id)}
                  className={`flex w-full items-center gap-2 rounded-xl bg-white px-2 py-2 text-left ring-1 ${state.revealed.includes(id) ? 'ring-accent' : 'ring-black/5'} hover:ring-brand`}>
                  <SvgArt viewBox={item.viewBox} body={item.body} className="size-8 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <WordText words={item.words} lang={lang} showReading={showReading} className="block truncate font-bold" />
                    {showTranslation && <span className="block truncate text-xs text-muted">{translationOf(item.words, lang)}</span>}
                  </span>
                  <Volume2 size={14} className="shrink-0 text-brand" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onMenu} className="flex flex-1 items-center justify-center gap-1 rounded-full bg-white py-3 font-semibold ring-1 ring-black/10">
            <List size={18} /> 選關
          </button>
          <button type="button" onClick={onRetry} className="flex flex-1 items-center justify-center gap-1 rounded-full bg-white py-3 font-semibold ring-1 ring-black/10">
            <RotateCcw size={18} /> 再玩
          </button>
          {next && (
            <button type="button" onClick={() => onNext(next)} className="flex flex-1 items-center justify-center gap-1 rounded-full bg-brand py-3 font-semibold text-white">
              下一關 <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
