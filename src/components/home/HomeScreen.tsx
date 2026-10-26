'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, Sparkles } from 'lucide-react';
import { useProgress } from '../ProgressProvider';
import { LangToggle } from '../LangToggle';
import { TownOverview, type DistrictStatus } from './TownOverview';
import { SCENE_LIST, SCENE_ORDER, TOWN } from '@/lib/scenes';
import { STAGES } from '@/lib/stages';
import { translationLabel } from '@/lib/words';
import { isSceneUnlocked, sceneSeenCount, sceneStars, updateSettings, type Settings } from '@/lib/progress';

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
  const total = SCENE_LIST.reduce((n, s) => n + s.itemCount, 0);

  const seenKeys = useMemo(
    () => new Set(Object.entries(progress.words).filter(([, w]) => w.seen > 0).map(([k]) => k)),
    [progress.words],
  );
  const status = useMemo(() => new Map<string, DistrictStatus>(TOWN.districts.map((d, i) => [d.scene.id, {
    seen: sceneSeenCount(progress, d.scene.id, d.scene.items.map((it) => it.id)),
    total: d.scene.items.length,
    stars: Math.round(sceneStars(progress, d.scene.id) / STAGES.length),
    locked: !isSceneUnlocked(progress, d.scene.id, SCENE_ORDER),
    unlockHint: TOWN.districts[i - 1]?.scene.name ?? null,
  }])), [progress]);
  const lit = [...status.values()].reduce((n, s) => n + s.seen, 0);
  const pct = total ? Math.round((lit / total) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-widest text-brand">MEMORY TOWN</p>
          <h1 className="mt-1 text-4xl font-black sm:text-5xl">記憶小鎮</h1>
          <p className="mt-2 max-w-md text-muted">每樣物品都待在固定的位置。點它、聽它、念它，它就會在小鎮裡亮起來。</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <LangToggle />
          <div className="flex flex-wrap gap-4">
            <Toggle label={translationLabel(settings.lang)} checked={settings.showTranslation} onChange={(v) => set({ showTranslation: v })} />
            {settings.lang === 'ja' && <Toggle label="假名讀音" checked={settings.showReading} onChange={(v) => set({ showReading: v })} />}
            <Toggle label="音效" checked={settings.sfx} onChange={(v) => set({ sfx: v })} />
          </div>
        </div>
      </header>

      <section className="mt-6" aria-label="記憶宮殿進度">
        <div className="mb-3 flex items-center gap-3">
          <Sparkles className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">記憶宮殿已點亮 {lit} / {total} 個物品</span>
              <span className="text-sm font-semibold text-brand">{pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <TownOverview town={TOWN} seenKeys={seenKeys} status={status} />
        <p className="mt-2 text-xs text-muted">褪色的物品還沒認識。點街區名稱進去逛逛；全部點亮的街區會有金色外框。</p>
      </section>

      <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <Link href="/vocab" className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5 hover:ring-brand">
          <BookOpen className="text-brand" />
          <span>
            <span className="block font-bold">詞彙本</span>
            <span className="block text-xs text-muted">已認識 {lit} / {total} 個單字</span>
          </span>
        </Link>
        <Toggle label="測試用：解鎖全部場景與關卡" checked={settings.unlockAll} onChange={(v) => set({ unlockAll: v })} />
      </div>
    </main>
  );
}
