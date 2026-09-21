'use client';

import Link from 'next/link';
import { BookOpen, Lock } from 'lucide-react';
import { useProgress } from '../ProgressProvider';
import { LangToggle } from '../LangToggle';
import { SvgArt } from '../SvgArt';
import { Stars } from '../game/StageMenu';
import { SCENE_LIST, SCENE_ORDER } from '@/lib/scenes';
import { STAGES } from '@/lib/stages';
import { isSceneUnlocked, isStageCleared, sceneStars, updateSettings, type Settings } from '@/lib/progress';

const CARD_COLORS = ['bg-[#dcedc8]', 'bg-[#ffe0b2]', 'bg-[#b3e5fc]', 'bg-[#f8bbd0]'];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
      {label}
    </label>
  );
}

export function HomeScreen() {
  const { progress, update } = useProgress();
  const { settings } = progress;
  const set = (patch: Partial<Settings>) => update((p) => updateSettings(p, patch));
  const wordCount = Object.values(progress.words).filter((w) => w.seen > 0).length;
  const total = SCENE_LIST.reduce((n, s) => n + s.itemCount, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-widest text-brand">MEMORY TOWN</p>
          <h1 className="mt-1 text-4xl font-black sm:text-5xl">記憶小鎮</h1>
          <p className="mt-2 max-w-md text-muted">在小鎮裡找東西、聽發音。每樣物品都待在固定的位置，用空間把單字記起來。</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <LangToggle />
          <div className="flex gap-4">
            <Toggle label="中文翻譯" checked={settings.showTranslation} onChange={(v) => set({ showTranslation: v })} />
            {settings.lang === 'ja' && <Toggle label="假名讀音" checked={settings.showReading} onChange={(v) => set({ showReading: v })} />}
          </div>
        </div>
      </header>

      <ol className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCENE_LIST.map((scene, i) => {
          const unlocked = isSceneUnlocked(progress, scene.id, SCENE_ORDER);
          const cleared = STAGES.filter((s) => isStageCleared(progress, scene.id, s.id)).length;
          const body = (
            <>
              <div className={`relative grid aspect-[4/3] place-items-center rounded-2xl ${CARD_COLORS[i % CARD_COLORS.length]}`}>
                <span className="absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-white/80 text-sm font-bold">{i + 1}</span>
                <SvgArt viewBox={scene.icon.viewBox} body={scene.icon.body} className={`h-3/5 w-3/5 ${unlocked ? '' : 'opacity-30 grayscale'}`} />
                {!unlocked && <Lock className="absolute text-ink/60" size={32} />}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-xl font-bold">{scene.name}</h2>
                <Stars count={Math.round(sceneStars(progress, scene.id) / STAGES.length)} />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted">
                <span>{scene.itemCount} 個物品</span>
                {unlocked && <span>關卡 {cleared} / {STAGES.length}</span>}
              </div>
              {!unlocked && <p className="mt-1 text-xs text-muted">完成「{SCENE_LIST[i - 1]?.name}」的看圖找後解鎖</p>}
            </>
          );
          return (
            <li key={scene.id}>
              {unlocked ? (
                <Link href={`/scene/${scene.id}`} className="block rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand">
                  {body}
                </Link>
              ) : (
                <div aria-disabled className="rounded-3xl bg-white/60 p-3 ring-1 ring-black/5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <Link href="/vocab" className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5 hover:ring-brand">
          <BookOpen className="text-brand" />
          <span>
            <span className="block font-bold">詞彙本</span>
            <span className="block text-xs text-muted">已認識 {wordCount} / {total} 個單字</span>
          </span>
        </Link>
        <Toggle label="測試用：解鎖全部場景與關卡" checked={settings.unlockAll} onChange={(v) => set({ unlockAll: v })} />
      </div>
    </main>
  );
}
