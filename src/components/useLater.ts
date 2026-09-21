'use client';

import { useCallback, useEffect, useRef } from 'react';

/** setTimeout 的包裝：元件卸載時自動清掉所有還沒執行的計時器 */
export function useLater(): (fn: () => void, ms: number) => void {
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      pending.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
}
