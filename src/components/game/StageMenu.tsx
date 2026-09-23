'use client';

import Link from 'next/link';
import { Compass, Lock, Star } from 'lucide-react';
import { STAGES, type StageDef } from '@/lib/stages';
import { isStageUnlocked, stageKey, type Progress } from '@/lib/progress';

interface StageMenuProps {
  sceneId: string;
  sceneName: string;
  progress: Progress;
  onExplore: () => void;
  onStart: (stage: StageDef) => void;
}

export function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Stars({ count, size = 16 }: { count: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${count} 顆星`}>
      {[1, 2, 3].map((i) => <Star key={i} size={size} className={i <= count ? 'fill-accent text-accent' : 'text-black/15'} />)}
    </span>
  );
}

export function StageMenu({ sceneId, sceneName, progress, onExplore, onStart }: StageMenuProps) {
  return (
    // 遮罩不擋滑鼠：面板外可以直接拖曳地圖；只有面板本身攔截
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-ink/20 p-4">
      <div data-ui="overlay" className="pop-in pointer-events-auto w-full max-w-md rounded-3xl bg-paper p-5 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold">{sceneName}</h2>
        <p className="mt-1 text-sm text-muted">物品的位置永遠不變。從看圖開始，一路練到憑記憶找到它們。</p>

        <button type="button" onClick={onExplore}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-brand/40 bg-white px-4 py-3 text-left hover:border-brand">
          <Compass className="text-brand" />
          <span>
            <span className="block font-bold">自由探索</span>
            <span className="block text-xs text-muted">隨意點物品，先認識它們的名字和位置</span>
          </span>
        </button>

        <ol className="mt-3 flex flex-col gap-2">
          {STAGES.map((stage) => {
            const unlocked = isStageUnlocked(progress, sceneId, stage.id);
            const record = progress.stages[stageKey(sceneId, stage.id)];
            return (
              <li key={stage.id}>
                <button type="button" disabled={!unlocked} onClick={() => onStart(stage)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-black/5 enabled:hover:ring-brand disabled:opacity-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-lg font-bold text-white">{stage.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{stage.name} <span className="text-xs font-normal text-muted">· {stage.count} 個</span></span>
                    <span className="block text-xs text-muted">{stage.description}</span>
                  </span>
                  {!unlocked && <Lock size={18} className="text-muted" aria-label="尚未解鎖" />}
                  {record && (
                    <span className="flex flex-col items-end gap-0.5">
                      <Stars count={record.stars} size={14} />
                      <span className="text-[11px] text-muted">{formatTime(record.bestTimeMs)}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <Link href="/" className="mt-4 block text-center text-sm font-semibold text-muted hover:text-ink">← 回小鎮地圖</Link>
      </div>
    </div>
  );
}
