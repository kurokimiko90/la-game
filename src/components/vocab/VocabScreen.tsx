'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Volume2 } from 'lucide-react';
import { useProgress } from '../ProgressProvider';
import { LangToggle } from '../LangToggle';
import { SvgArt } from '../SvgArt';
import { WordText } from '../WordText';
import { allScenes } from '@/lib/scenes';
import { wordKey } from '@/lib/progress';
import { playWord } from '@/lib/audio';

type Filter = 'all' | 'seen' | 'found';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'seen', label: '認識的' },
  { id: 'found', label: '找到過的' },
];

export function VocabScreen() {
  const { progress } = useProgress();
  const { lang, showTranslation, showReading } = progress.settings;
  const [filter, setFilter] = useState<Filter>('all');
  const scenes = allScenes();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" aria-label="回小鎮地圖" className="grid size-10 place-items-center rounded-full hover:bg-black/5"><ChevronLeft /></Link>
        <h1 className="flex-1 text-2xl font-black">詞彙本</h1>
        <LangToggle compact />
      </header>
      <p className="mt-2 text-sm text-muted">在場景裡點過的物品會出現在這裡；還沒遇到的先是問號。每個單字都記得它在哪個區域。</p>

      <div role="tablist" className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filter === f.id ? 'bg-brand text-white' : 'bg-white ring-1 ring-black/10'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {scenes.map((scene) => {
        const zoneName = new Map(scene.zones.map((z) => [z.id, z.name]));
        const items = scene.items
          .map((item) => ({ item, record: progress.words[wordKey(scene.id, item.id)] }))
          .filter(({ record }) => filter === 'all' || (filter === 'seen' ? record?.seen : record?.found))
          .sort((a, b) => a.item.zone.localeCompare(b.item.zone));
        const seenCount = scene.items.filter((it) => progress.words[wordKey(scene.id, it.id)]?.seen).length;
        return (
          <section key={scene.id} className="mt-8">
            <h2 className="flex items-baseline justify-between text-lg font-bold">
              {scene.name}
              <span className="text-sm font-normal text-muted">{seenCount} / {scene.items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-muted">這裡還沒有單字。</p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {items.map(({ item, record }) => {
                  const known = Boolean(record?.seen);
                  return (
                    <li key={item.id}>
                      <button type="button" disabled={!known} onClick={() => playWord(scene.id, item.id, item.words, lang)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-black/5 enabled:hover:ring-brand">
                        <SvgArt viewBox={item.viewBox} body={item.body} className={`size-11 shrink-0 ${known ? '' : 'opacity-25 grayscale'}`} />
                        <span className="min-w-0 flex-1">
                          {known ? (
                            <>
                              <WordText words={item.words} lang={lang} showReading={showReading} className="block truncate text-lg font-bold" />
                              {showTranslation && <span className="block truncate text-xs text-muted">{item.words['zh-TW']}</span>}
                            </>
                          ) : (
                            <span className="block text-lg font-bold text-black/25">？？？</span>
                          )}
                          <span className="block text-[11px] text-muted">{zoneName.get(item.zone)}{record?.found ? ` · 找到 ${record.found} 次` : ''}</span>
                        </span>
                        {known && <Volume2 size={16} className="shrink-0 text-brand" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
