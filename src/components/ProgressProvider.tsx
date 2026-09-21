'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PROGRESS, parseProgress, type Progress } from '@/lib/progress';

const STORAGE_KEY = 'memory-town:progress';

interface ProgressContextValue {
  progress: Progress;
  /** localStorage 讀取完成前為 false（伺服器端與首次渲染都用預設值，避免 hydration 不一致） */
  ready: boolean;
  update: (fn: (p: Progress) => Progress) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

function load(): Progress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseProgress(JSON.parse(raw)) : DEFAULT_PROGRESS;
  } catch {
    // 私密視窗、被封鎖的 storage、壞掉的 JSON：都當作新玩家
    return DEFAULT_PROGRESS;
  }
}

function save(p: Progress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 存不了就只在本次遊玩有效，不影響遊戲進行
  }
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 只在瀏覽器端讀一次；之後以 state 為準
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save(progress);
  }, [progress, ready]);

  const update = useCallback((fn: (p: Progress) => Progress) => setProgress((p) => fn(p)), []);
  const value = useMemo(() => ({ progress, ready, update }), [progress, ready, update]);
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress 必須在 <ProgressProvider> 內使用');
  return ctx;
}
