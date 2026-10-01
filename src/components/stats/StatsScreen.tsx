'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download } from 'lucide-react';
import { useProgress } from '../ProgressProvider';
import { SvgArt } from '../SvgArt';
import { WordText } from '../WordText';
import { loadPlayStats } from '../playStatsStore';
import { allScenes } from '@/lib/scenes';
import { wordKey } from '@/lib/progress';
import { EMPTY_PLAY_STATS, MIN_ASKED, hardestItems, type PlayStats } from '@/lib/playstats';

const LIMIT = 30;

/** 玩家數據（src/lib/playstats.ts）：最難找的物件，匯出後給 scripts/import-play-stats.mjs 用 */
export function StatsScreen() {
  const { progress } = useProgress();
  const { lang, showReading } = progress.settings;
  const [stats, setStats] = useState<PlayStats>(EMPTY_PLAY_STATS);
  // localStorage 只在瀏覽器端讀（和 ProgressProvider 一樣，避免 hydration 不一致）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setStats(loadPlayStats()), []);

  const items = useMemo(() => new Map(allScenes().flatMap((scene) => scene.items.map((item) => [wordKey(scene.id, item.id), { scene, item }]))), []);
  const hardest = hardestItems(stats, LIMIT).filter(({ key }) => items.has(key));
  const played = Object.keys(stats.items).length;

  const exportStats = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-town-play-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" aria-label="回小鎮地圖" className="grid size-10 place-items-center rounded-full hover:bg-black/5"><ChevronLeft /></Link>
        <h1 className="flex-1 text-2xl font-black">遊玩紀錄</h1>
        <button type="button" onClick={exportStats} disabled={played === 0}
          className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          <Download size={16} /> 匯出
        </button>
      </header>
      <p className="mt-2 text-sm text-muted">
        闖關時記下每個物品找了多久、點錯幾次、用了幾次提示。被問過 {MIN_ASKED} 次以上的才會列在這裡，越上面越難找。
      </p>

      {hardest.length === 0 ? (
        <p className="mt-8 text-sm text-muted">還沒有足夠的紀錄，先去闖幾關吧。</p>
      ) : (
        <ol className="mt-6 grid gap-2 sm:grid-cols-2">
          {hardest.map(({ key, stat }) => {
            const { scene, item } = items.get(key)!;
            const avgSec = stat.found ? Math.round(stat.findMs / stat.found / 1000) : null;
            return (
              <li key={key} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                <SvgArt viewBox={item.viewBox} body={item.body} className="size-11 shrink-0" />
                <span className="min-w-0 flex-1">
                  <WordText words={item.words} lang={lang} showReading={showReading} className="block truncate text-lg font-bold" />
                  <span className="block text-[11px] text-muted">
                    {scene.name} · 問 {stat.asked} 次 · 點錯 {stat.wrong} · 提示 {stat.hints} · 揭曉 {stat.revealed}{avgSec !== null ? ` · 平均 ${avgSec} 秒` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
