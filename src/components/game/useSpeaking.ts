'use client';

import { useSyncExternalStore } from 'react';
import { isSpeaking, subscribeSpeaking } from '@/lib/audio';

/** 發音是否正在播放（居民頭像的嘴巴跟著動） */
export function useSpeaking(): boolean {
  return useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);
}
