'use client';

// 3D 銀座版的商業街：和 2D GameScreen 同一套關卡規則（src/lib/stages.ts）、進度、發音與 UI 元件，
// 只把 TownCanvas 換成 CityWorld。進度 key 相同，2D 學過的字在 3D 也算數。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lightbulb, Map as MapIcon, Footprints } from 'lucide-react';
import { useProgress } from '../ProgressProvider';
import { LangToggle } from '../LangToggle';
import { useLater } from '../useLater';
import { trackPlay } from '../playStatsStore';
import { TaskPanel } from '../game/TaskPanel';
import { WordPopup } from '../game/WordPopup';
import { StageMenu } from '../game/StageMenu';
import { StageResult } from '../game/StageResult';
import { CityWorld, type PickEvent, type ViewMode } from './CityWorld';
import {
  RECALL_MAX_MISSES, clickItem, createStageState, currentTarget, starsFor, takeHint,
  type StageDef, type StageEvent, type StageState,
} from '@/lib/stages';
import { recordStageClear, recordWordFound, recordWordSeen, wordKey } from '@/lib/progress';
import { recordFind, recordHint, recordRevealed, recordWrong } from '@/lib/playstats';
import { playWord, stopAudio } from '@/lib/audio';
import { createRng } from '@/lib/rng';
import { TOWN } from '@/lib/scenes';
import { districtOf } from '@/lib/town';
import type { Point } from '@/lib/types';
import { GINZA_STREET } from '@/data/city3d/ginza-street';
import { STREET_FIXTURES, STREET_MODELS } from '@/data/city3d/street-models';

type Phase =
  | { kind: 'menu' }
  | { kind: 'explore' }
  | { kind: 'play'; stage: StageDef; state: StageState }
  | { kind: 'result'; stage: StageDef; state: StageState; stars: 1 | 2 | 3 };

interface Popup { itemId: string; point: Point; found: boolean; key: number }

const POPUP_MS = 3200;
const HINT_MS = 5000;
const TOAST_MS = 1800;
const NEXT_TARGET_DELAY_MS = 1500;
const RESULT_DELAY_MS = 1100;
const itemsById = TOWN.items;
const TOUCH_KEYS = [['KeyW', '↑', 'col-start-2'], ['KeyA', '←', 'col-start-1'], ['KeyS', '↓', ''], ['KeyD', '→', '']] as const;

export function GameScreen3D() {
  const { progress, ready, update } = useProgress();
  const { lang, showTranslation, showReading } = progress.settings;
  const later = useLater();
  const scene = districtOf(TOWN, GINZA_STREET.sceneId)!.scene;
  const itemIds = useMemo(() => scene.items.map((it) => it.id), [scene]);
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<CityWorld | null>(null);
  const pickRef = useRef<(e: PickEvent) => void>(() => {});
  const findSinceRef = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'menu' });
  const [mode, setMode] = useState<ViewMode>('walk');
  const [loading, setLoading] = useState<string>('loading');
  const [popup, setPopup] = useState<Popup | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  // 3D 世界只建一次；點選事件透過 ref 轉給最新的 handler
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let world: CityWorld | null = null;
    let cancelled = false;
    CityWorld.create({ container: host, set: GINZA_STREET, models: STREET_MODELS, fixtures: STREET_FIXTURES, onPick: (e) => pickRef.current(e) })
      .then((w) => {
        if (cancelled) return w.dispose();
        world = w;
        worldRef.current = w;
        // ?view=u,v,lookU,lookV：直接站到街道某處（場景預覽截圖用）
        const view = new URLSearchParams(window.location.search).get('view')?.split(',').map(Number);
        if (view?.length === 4 && view.every(Number.isFinite)) w.viewFrom(view[0], view[1], view[2], view[3]);
        setLoading('ready');
      })
      .catch((err: Error) => setLoading(`載入失敗：${err.message}`));
    return () => {
      cancelled = true;
      world?.dispose();
      worldRef.current = null;
      stopAudio();
    };
  }, []);

  const stageView = phase.kind === 'play' || phase.kind === 'result' ? phase : null;
  useEffect(() => {
    worldRef.current?.setFound(stageView?.state.found ?? [], stageView?.stage.mode === 'recall');
  }, [stageView, loading]);

  const say = useCallback((itemId: string) => {
    const item = itemsById.get(itemId);
    if (item) playWord(item.sceneId, itemId, item.words, lang);
  }, [lang]);

  const showToast = useCallback((text: string) => {
    const key = Date.now();
    setToast({ text, key });
    later(() => setToast((t) => (t?.key === key ? null : t)), TOAST_MS);
  }, [later]);

  const showWord = useCallback((itemId: string, point: Point, found: boolean) => {
    const key = Date.now();
    setPopup({ itemId, point, found, key });
    say(itemId);
    const now = Date.now();
    update((p) => {
      const seen = recordWordSeen(p, scene.id, itemId, now);
      return found ? recordWordFound(seen, scene.id, itemId, now) : seen;
    });
    later(() => setPopup((cur) => (cur?.key === key ? null : cur)), POPUP_MS);
  }, [say, update, later, scene.id]);

  const resetOverlays = () => {
    setPopup(null);
    setToast(null);
    worldRef.current?.showBeacon(null);
    stopAudio();
  };

  const startStage = (stage: StageDef) => {
    resetOverlays();
    const state = createStageState(stage, itemIds, createRng(Date.now()), Date.now());
    findSinceRef.current = state.startedAt;
    setPhase({ kind: 'play', stage, state });
    if (stage.sequential) later(() => say(state.targets[0]), 500);
  };

  const finish = (stage: StageDef, state: StageState) => {
    const stars = starsFor(state);
    update((p) => recordStageClear(p, scene.id, stage.id, stars, (state.finishedAt ?? Date.now()) - state.startedAt));
    setPhase((cur) => (cur.kind === 'play' && cur.state.startedAt === state.startedAt ? { kind: 'result', stage, state, stars } : cur));
  };

  const trackEvents = (target: string | null, events: StageEvent[], now: number) => {
    for (const ev of events) {
      if (ev.type === 'found') {
        trackPlay((s) => recordFind(s, wordKey(scene.id, ev.itemId), now - findSinceRef.current));
        findSinceRef.current = now;
      } else if (ev.type === 'not-target' && target) {
        trackPlay((s) => recordWrong(s, wordKey(scene.id, target)));
      } else if (ev.type === 'miss') {
        trackPlay((s) => recordWrong(s, wordKey(scene.id, ev.targetId)));
      } else if (ev.type === 'revealed') {
        trackPlay((s) => recordRevealed(s, wordKey(scene.id, ev.itemId)));
        findSinceRef.current = now;
      }
    }
  };

  const handleEvents = (stage: StageDef, next: StageState, events: StageEvent[], point: Point) => {
    for (const ev of events) {
      if (ev.type === 'found') {
        worldRef.current?.showBeacon(null);
        showWord(ev.itemId, point, true);
        const upcoming = stage.sequential ? currentTarget(next, stage) : null;
        if (upcoming && next.finishedAt === null) later(() => say(upcoming), NEXT_TARGET_DELAY_MS);
      } else if (ev.type === 'not-target') {
        showWord(ev.itemId, point, false);
      } else if (ev.type === 'miss') {
        const left = RECALL_MAX_MISSES - ev.misses;
        if (left > 0) showToast(`不在這裡，再想想看（還有 ${left} 次機會）`);
      } else if (ev.type === 'revealed') {
        showToast('在這裡！記住它的位置');
        worldRef.current?.flashItem(ev.itemId);
        worldRef.current?.focusItem(ev.itemId);
        say(ev.itemId);
        update((p) => recordWordSeen(p, scene.id, ev.itemId, Date.now()));
        const upcoming = currentTarget(next, stage);
        if (upcoming && next.finishedAt === null) later(() => say(upcoming), NEXT_TARGET_DELAY_MS + 800);
      } else if (ev.type === 'complete') {
        later(() => finish(stage, next), RESULT_DELAY_MS);
      }
    }
  };

  const onPick = ({ itemId, nearIds, point }: PickEvent) => {
    if (phase.kind === 'menu' || phase.kind === 'explore') {
      if (phase.kind === 'menu') setPhase({ kind: 'explore' });
      if (itemId) showWord(itemId, point, false);
      return;
    }
    if (phase.kind !== 'play') return;
    const { stage, state } = phase;
    let hit = itemId;
    if (stage.mode === 'recall') {
      // 記憶挑戰：物品隱形，看點的方向有沒有經過目標原本的位置
      const target = currentTarget(state, stage);
      hit = target && nearIds.includes(target) ? target : null;
    } else if (!hit) {
      showToast('這裡沒有物品，再找找看');
      return;
    }
    const now = Date.now();
    const { state: next, events } = clickItem(state, stage, hit, now);
    trackEvents(currentTarget(state, stage), events, now);
    setPhase({ ...phase, state: next });
    handleEvents(stage, next, events, point);
  };

  useEffect(() => {
    pickRef.current = onPick;
  });

  const onHint = () => {
    if (phase.kind !== 'play') return;
    const { state: next, targetId } = takeHint(phase.state, phase.stage);
    const item = targetId ? itemsById.get(targetId) : undefined;
    const zone = item ? scene.zones.find((z) => z.id === item.zone) : undefined;
    const world = worldRef.current;
    if (!item || !zone || !world) return;
    setPhase({ ...phase, state: next });
    trackPlay((s) => recordHint(s, wordKey(scene.id, item.id)));
    const center = world.centerOf(scene.items.filter((it) => it.zone === zone.id).map((it) => it.id));
    world.showBeacon(center);
    if (center) world.focusPoint(center);
    later(() => world.showBeacon(null), HINT_MS);
    showToast(`提示：在「${zone.name}」附近（看黃色光柱）`);
    if (phase.stage.sequential) say(item.id);
  };

  const switchMode = () => {
    const next = mode === 'walk' ? 'bird' : 'walk';
    worldRef.current?.setMode(next);
    setMode(next);
  };

  const playing = phase.kind === 'play' ? phase : null;
  const exploredCount = scene.items.filter((it) => progress.words[wordKey(scene.id, it.id)]).length;
  const popupItem = popup ? itemsById.get(popup.itemId) : undefined;
  const key = (code: string, down: boolean) => worldRef.current?.setKey(code, down);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-paper px-2 py-2">
        {phase.kind === 'menu' ? (
          <Link href="/" aria-label="回小鎮地圖" className="grid size-10 place-items-center rounded-full hover:bg-black/5"><ChevronLeft /></Link>
        ) : (
          <button type="button" aria-label="回選關" onClick={() => { resetOverlays(); setPhase({ kind: 'menu' }); }}
            className="grid size-10 place-items-center rounded-full hover:bg-black/5"><ChevronLeft /></button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight">{scene.name} · 銀座 3D</div>
          <div className="truncate text-xs text-muted">
            {phase.kind === 'explore' ? '自由探索' : stageView ? `${stageView.stage.id}. ${stageView.stage.name}` : '選擇關卡'}
            {playing && ` · ${playing.state.found.length} / ${playing.state.targets.length}`}
          </div>
        </div>
        <button type="button" onClick={switchMode} aria-label={mode === 'walk' ? '切換到鳥瞰' : '切換到街道漫遊'}
          className="flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">
          {mode === 'walk' ? <><MapIcon size={16} /> 鳥瞰</> : <><Footprints size={16} /> 漫遊</>}
        </button>
        {playing && (
          <button type="button" onClick={onHint} disabled={playing.state.hintsUsed >= playing.stage.hints}
            className="flex items-center gap-1 rounded-full bg-accent/20 px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-40">
            <Lightbulb size={16} /> {playing.stage.hints - playing.state.hintsUsed}
          </button>
        )}
        <LangToggle compact />
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden bg-[#e1f5fe]">
        <div ref={hostRef} className="absolute inset-0" />
        {loading !== 'ready' && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-paper/80 text-muted">
            {loading === 'loading' ? '正在建構銀座…' : loading}
          </div>
        )}
        {popup && popupItem && (
          <WordPopup key={popup.key} words={popupItem.words} lang={lang} showTranslation={showTranslation} showReading={showReading}
            point={popup.point} found={popup.found} onReplay={() => say(popup.itemId)} />
        )}
        {toast && (
          <div key={toast.key} className="pop-in pointer-events-none absolute inset-x-0 top-14 z-40 flex justify-center px-4">
            <div className="rounded-full bg-ink/85 px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast.text}</div>
          </div>
        )}
        {mode === 'walk' && loading === 'ready' && (
          <>
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-full bg-ink/70 px-3 py-1.5 text-xs text-white sm:block">
              WASD／方向鍵 走路 · Shift 跑 · 拖曳 轉頭 · 點物品 聽發音
            </div>
            <div className="absolute bottom-3 right-3 z-10 grid grid-cols-3 gap-1 sm:hidden">
              {TOUCH_KEYS.map(([code, label, col]) => (
                <button key={code} type="button" aria-label={label}
                  className={`grid size-12 place-items-center rounded-2xl bg-white/80 text-lg font-bold shadow ${col}`}
                  onPointerDown={(e) => { e.preventDefault(); key(code, true); }}
                  onPointerUp={() => key(code, false)} onPointerLeave={() => key(code, false)} onPointerCancel={() => key(code, false)}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
          className="absolute right-2 top-2 z-10 rounded bg-white/70 px-1.5 text-[10px] text-muted">© OpenStreetMap contributors</a>
        {phase.kind === 'menu' && ready && (
          <StageMenu sceneId={scene.id} sceneName={scene.name} progress={progress}
            onExplore={() => setPhase({ kind: 'explore' })} onClose={() => setPhase({ kind: 'explore' })} onStart={startStage} />
        )}
        {phase.kind === 'result' && (
          <StageResult stage={phase.stage} state={phase.state} stars={phase.stars} itemsById={itemsById} lang={lang}
            showReading={showReading} showTranslation={showTranslation} onSay={say}
            onRetry={() => startStage(phase.stage)} onNext={startStage}
            onMenu={() => { resetOverlays(); setPhase({ kind: 'menu' }); }} />
        )}
      </main>

      {(phase.kind === 'play' || phase.kind === 'explore') && (
        <footer className="border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
          <TaskPanel stage={playing?.stage ?? null} state={playing?.state ?? null} itemsById={itemsById} lang={lang}
            showReading={showReading} exploredCount={exploredCount} totalCount={scene.items.length} onSay={say} />
        </footer>
      )}
    </div>
  );
}
