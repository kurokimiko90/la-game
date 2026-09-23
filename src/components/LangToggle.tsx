'use client';

import { useProgress } from './ProgressProvider';
import { updateSettings } from '@/lib/progress';
import type { Lang } from '@/lib/types';

const OPTIONS: Array<{ lang: Lang; label: string; full: string }> = [
  { lang: 'en', label: 'EN', full: 'English' },
  { lang: 'ja', label: '日', full: '日本語' },
  { lang: 'zh', label: '中', full: '中文' },
];

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { progress, update } = useProgress();
  const current = progress.settings.lang;
  return (
    <div role="radiogroup" aria-label="學習語言" className="inline-flex rounded-full bg-black/5 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          role="radio"
          aria-checked={current === o.lang}
          onClick={() => update((p) => updateSettings(p, { lang: o.lang }))}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${current === o.lang ? 'bg-white text-brand shadow' : 'text-muted hover:text-ink'}`}
        >
          {compact ? o.label : o.full}
        </button>
      ))}
    </div>
  );
}
