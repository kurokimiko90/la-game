'use client';

import { Check, MousePointerClick, Volume2 } from 'lucide-react';
import { SvgArt } from '../SvgArt';
import { WordText } from '../WordText';
import type { StageDef, StageState } from '@/lib/stages';
import { currentTarget } from '@/lib/stages';
import type { Lang, SceneItem } from '@/lib/types';

interface TaskPanelProps {
  stage: StageDef | null;
  state: StageState | null;
  itemsById: ReadonlyMap<string, SceneItem>;
  lang: Lang;
  showReading: boolean;
  exploredCount: number;
  totalCount: number;
  onSay: (itemId: string) => void;
}

function Dots({ state }: { state: StageState }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`已找到 ${state.found.length} / ${state.targets.length}`}>
      {state.targets.map((id) => (
        <span key={id} className={`size-3 rounded-full ${state.found.includes(id) ? (state.revealed.includes(id) ? 'bg-accent' : 'bg-brand') : 'bg-black/15'}`} />
      ))}
    </div>
  );
}

function SpeakButton({ label, onClick, big = false }: { label: string; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-full bg-brand text-white shadow hover:brightness-110 ${big ? 'size-14' : 'size-8'}`}>
      <Volume2 size={big ? 26 : 16} />
    </button>
  );
}

export function TaskPanel({ stage, state, itemsById, lang, showReading, exploredCount, totalCount, onSay }: TaskPanelProps) {
  if (!stage || !state) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted">
        <MousePointerClick size={20} className="text-brand" />
        <span className="flex-1">點任何物品，聽它的名字。拖曳可以在小鎮裡走動。</span>
        <span className="font-semibold text-ink">{exploredCount} / {totalCount}</span>
      </div>
    );
  }

  if (stage.sequential) {
    const target = currentTarget(state, stage);
    const item = target ? itemsById.get(target) : undefined;
    return (
      <div className="flex items-center gap-4 px-4 py-3">
        <SpeakButton big label="再聽一次" onClick={() => target && onSay(target)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted">{stage.mode === 'recall' ? '它原本在哪裡？點出它的位置' : '聽發音，找出這個物品'}</div>
          {stage.mode === 'recall' && item && (
            <WordText words={item.words} lang={lang} showReading={showReading} className="text-2xl font-bold" />
          )}
          <div className="mt-2"><Dots state={state} /></div>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex gap-2 overflow-x-auto px-3 py-3" aria-label="要找的物品">
      {state.targets.map((id) => {
        const item = itemsById.get(id);
        if (!item) return null;
        const done = state.found.includes(id);
        return (
          <li key={id} className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 transition-opacity ${done ? 'border-brand bg-brand-soft opacity-60' : 'border-line bg-white'}`}>
            {stage.mode === 'picture' && <SvgArt viewBox={item.viewBox} body={item.body} className="size-9" />}
            <WordText words={item.words} lang={lang} showReading={showReading} className={`text-lg font-bold ${done ? 'line-through' : ''}`} />
            {done ? <Check size={18} className="text-brand" /> : <SpeakButton label="聽發音" onClick={() => onSay(id)} />}
          </li>
        );
      })}
    </ul>
  );
}
