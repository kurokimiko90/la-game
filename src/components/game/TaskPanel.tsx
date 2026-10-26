'use client';

import type { ReactNode } from 'react';
import { Check, Heart, MousePointerClick, Volume2 } from 'lucide-react';
import { SvgArt } from '../SvgArt';
import { WordText } from '../WordText';
import { ResidentAvatar } from './ResidentAvatar';
import { useSpeaking } from './useSpeaking';
import type { StageDef, StageState } from '@/lib/stages';
import { activeRequest, currentTarget } from '@/lib/stages';
import { requestLine, residentFor, thanksLine } from '@/lib/residents';
import type { Lang, SceneItem } from '@/lib/types';

export interface Thanks {
  /** 剛完成的委託編號 */
  index: number;
  key: number;
}

interface TaskPanelProps {
  sceneId: string;
  stage: StageDef | null;
  state: StageState | null;
  /** 委託剛完成：居民道謝（下一位居民稍後出場） */
  thanks: Thanks | null;
  itemsById: ReadonlyMap<string, SceneItem>;
  lang: Lang;
  showReading: boolean;
  exploredCount: number;
  totalCount: number;
  onSay: (itemId: string) => void;
}

function Dots({ state, items }: { state: StageState; items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`已找到 ${state.found.length} / ${state.targets.length}`}>
      {items.map((id) => (
        <span key={id} className={`size-3 rounded-full ${state.found.includes(id) ? (state.revealed.includes(id) ? 'bg-accent' : 'bg-brand') : 'bg-black/15'}`} />
      ))}
    </div>
  );
}

function SpeakButton({ label, onClick, big = false }: { label: string; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-full bg-brand text-white shadow hover:brightness-110 ${big ? 'size-12' : 'size-8'}`}>
      <Volume2 size={big ? 22 : 16} />
    </button>
  );
}

interface SpeakerProps {
  sceneId: string;
  index: number;
  total: number;
  line: string;
  talking: boolean;
  happy: boolean;
  children?: ReactNode;
}

/** 居民 + 對話框 */
function Speaker({ sceneId, index, total, line, talking, happy, children }: SpeakerProps) {
  const resident = residentFor(sceneId, index);
  return (
    <div className="flex items-end gap-3 px-3 py-3">
      <div className="flex w-16 shrink-0 flex-col items-center">
        <ResidentAvatar key={happy ? 'happy' : index} look={resident.look} talking={talking} happy={happy} className="size-14 drop-shadow" />
        <span className="mt-0.5 max-w-full truncate text-[11px] font-bold">{resident.name}</span>
      </div>
      {/* 固定最小高度：道謝時面板不縮，畫布才不會跟著跳 */}
      <div className="relative min-h-[112px] min-w-0 flex-1 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
        <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
          <span className="truncate">{resident.role}</span>
          {total > 1 && <span className="shrink-0 font-semibold">委託 {index + 1} / {total}</span>}
        </div>
        <div key={line} className="pop-in font-bold">{line}</div>
        {children}
      </div>
    </div>
  );
}

export function TaskPanel({ sceneId, stage, state, thanks, itemsById, lang, showReading, exploredCount, totalCount, onSay }: TaskPanelProps) {
  const speaking = useSpeaking();

  if (!stage || !state) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted">
        <MousePointerClick size={20} className="text-brand" />
        <span className="flex-1">點任何物品，聽它的名字；按麥克風可以跟著念。拖曳可以在小鎮裡走動。</span>
        <span className="font-semibold text-ink">{exploredCount} / {totalCount}</span>
      </div>
    );
  }

  const request = activeRequest(state, stage);
  if (thanks) {
    return (
      <Speaker sceneId={sceneId} index={thanks.index} total={request.total} line={thanksLine(thanks.index)} talking={false} happy>
        <div className="mt-2 flex gap-1 text-danger" aria-hidden>
          {[0, 1, 2].map((i) => <Heart key={i} size={26} className="combo-pop fill-current" style={{ animationDelay: `${i * 0.12}s` }} />)}
        </div>
      </Speaker>
    );
  }

  if (stage.sequential) {
    const target = currentTarget(state, stage);
    const item = target ? itemsById.get(target) : undefined;
    return (
      <Speaker sceneId={sceneId} index={request.index} total={request.total} line={requestLine(stage.mode, 1)} talking={speaking} happy={false}>
        <div className="mt-1 flex items-center gap-3">
          <SpeakButton big label="再聽一次" onClick={() => target && onSay(target)} />
          {stage.mode === 'audio' && item && <SvgArt viewBox={item.viewBox} body={item.body} className="size-9 shrink-0" />}
          {stage.mode === 'recall' && item && (
            <WordText words={item.words} lang={lang} showReading={showReading} className="min-w-0 truncate text-2xl font-bold" />
          )}
          <div className="ml-auto"><Dots state={state} items={request.items} /></div>
        </div>
      </Speaker>
    );
  }

  return (
    <Speaker sceneId={sceneId} index={request.index} total={request.total} line={requestLine(stage.mode, request.items.length)} talking={false} happy={false}>
      <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-0.5" aria-label="要找的物品">
        {request.items.map((id) => {
          const item = itemsById.get(id);
          if (!item) return null;
          const done = state.found.includes(id);
          return (
            <li key={id} className={`flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5 transition-opacity ${done ? 'border-brand bg-brand-soft opacity-60' : 'border-line bg-paper'}`}>
              <SvgArt viewBox={item.viewBox} body={item.body} className="size-8" />
              <WordText words={item.words} lang={lang} showReading={showReading} className={`text-lg font-bold ${done ? 'line-through' : ''}`} />
              {done ? <Check size={18} className="text-brand" /> : <SpeakButton label="聽發音" onClick={() => onSay(id)} />}
            </li>
          );
        })}
      </ul>
    </Speaker>
  );
}
