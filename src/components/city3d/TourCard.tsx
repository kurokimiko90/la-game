'use client';

// 聽讀導覽字卡：第幾站、區域、本站物品（念到的高亮）、進度條與控制鈕。
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import { WordText } from '../WordText';
import type { TourCommand, TourEvent } from './CityWorld';
import type { Lang, SceneItem, Zone } from '@/lib/types';

interface TourCardProps {
  tour: TourEvent;
  zones: readonly Zone[];
  itemsById: ReadonlyMap<string, Pick<SceneItem, 'words'>>;
  lang: Lang;
  showReading: boolean;
  onCommand: (cmd: TourCommand) => void;
  onClose: () => void;
}

const btn = 'grid size-9 place-items-center rounded-full bg-black/5 hover:bg-black/10 disabled:opacity-30';

export function TourCard({ tour, zones, itemsById, lang, showReading, onCommand, onClose }: TourCardProps) {
  const { state, stop, total, shot, progress, remaining } = tour;
  const zone = zones.find((z) => z.id === stop.zone)?.name ?? '';
  const walking = state.phase === 'walking';
  const status = state.finished ? '導覽結束' : state.paused ? '已暫停' : walking ? `前往下一站 · 剩 ${Math.ceil(remaining)} m` : '';
  return (
    <div className="pop-in absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-paper/95 p-3 shadow-lg sm:right-auto sm:w-96" role="region" aria-label="聽讀導覽">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">聽讀導覽 · 第 {state.index + 1} / {total} 站</div>
          <div className="truncate font-bold">{zone}{status && <span className="ml-2 text-sm font-normal text-muted">{status}</span>}</div>
        </div>
        <button type="button" aria-label="結束導覽" onClick={onClose} className={btn}><X size={18} /></button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {stop.items.map((id, i) => {
          const words = itemsById.get(id)?.words;
          const now = !walking && i === shot;
          const done = !walking && i < shot;
          return words ? (
            <li key={id} className={`rounded-full px-2.5 py-1 text-sm ${now ? 'bg-accent font-semibold text-ink' : done ? 'bg-brand-soft text-brand' : 'bg-black/5 text-muted'}`}>
              <WordText words={words} lang={lang} showReading={showReading && now} />
            </li>
          ) : null;
        })}
      </ul>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-brand transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button type="button" aria-label="上一站" onClick={() => onCommand('prev')} disabled={state.index === 0} className={btn}><ChevronLeft size={18} /></button>
        {state.finished ? (
          <button type="button" aria-label="重新開始" onClick={() => onCommand('restart')} className={btn}><RotateCcw size={18} /></button>
        ) : (
          <button type="button" aria-label={state.paused ? '繼續' : '暫停'} aria-pressed={state.paused} onClick={() => onCommand('pause')} className={btn}>
            {state.paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        )}
        <button type="button" aria-label={walking ? '直接抵達' : '下一站'} onClick={() => onCommand('next')}
          disabled={state.finished || (!walking && state.index === total - 1)} className={btn}><ChevronRight size={18} /></button>
      </div>
      <div className="mt-1 hidden text-center text-[11px] text-muted sm:block">方向鍵或點地面 = 自己走 · Esc 結束</div>
    </div>
  );
}
