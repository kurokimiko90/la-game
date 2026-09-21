'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lightbulb } from 'lucide-react';
import { TownCanvas, type FocusRequest, type SceneClick } from '../scene/TownCanvas';
import { useProgress } from '../ProgressProvider';
import { LangToggle } from '../LangToggle';
import { useLater } from '../useLater';
import { TaskPanel } from './TaskPanel';
import { WordPopup } from './WordPopup';
import { StageMenu } from './StageMenu';
import { StageResult } from './StageResult';
import {
  HINTS_PER_STAGE, RECALL_MAX_MISSES, clickItem, createStageState, currentTarget, starsFor, takeHint,
  type StageDef, type StageEvent, type StageState,
} from '@/lib/stages';
import { isSceneUnlocked, recordStageClear, recordWordFound, recordWordSeen, wordKey } from '@/lib/progress';
import { isNearItem } from '@/lib/geometry';
import { playWord, stopAudio } from '@/lib/audio';
import { createRng } from '@/lib/rng';
import { SCENE_ORDER, TOWN } from '@/lib/scenes';
import { districtOf, rectCenter, zoneKey } from '@/lib/town';
import type { Point } from '@/lib/types';

type Phase =
  | { kind: 'menu' }
  | { kind: 'explore' }
  | { kind: 'play'; sceneId: string; stage: StageDef; state: StageState }
  | { kind: 'result'; sceneId: string; stage: StageDef; state: StageState; stars: 1 | 2 | 3 };

interface Popup {
  itemId: string;
  point: Point;
  found: boolean;
  key: number;
}

const POPUP_MS = 3200;
const HINT_MS = 4000;
const TOAST_MS = 1800;
const NEXT_TARGET_DELAY_MS = 1500;
const RESULT_DELAY_MS = 1100;
const EMPTY_FOUND: readonly string[] = [];
const itemsById = TOWN.items;
// 街區 → 解鎖條件的前一個街區名稱
const UNLOCK_HINTS: ReadonlyMap<string, string> = new Map(TOWN.districts.slice(1).map((d, i) => [d.scene.id, TOWN.districts[i].scene.name]));

/** 小鎮：所有場景接成一張地圖；initialSceneId 是一開始的「目前街區」（關卡、提示都以它為準） */
export function GameScreen({ initialSceneId }: { initialSceneId: string }) {
  const { progress, ready, update } = useProgress();
  const { lang, showTranslation, showReading } = progress.settings;
  const later = useLater();
  const [requestedId, setRequestedId] = useState(initialSceneId);
  const [phase, setPhase] = useState<Phase>({ kind: 'menu' });
  const [popup, setPopup] = useState<Popup | null>(null);
  const [hintZoneKey, setHintZoneKey] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  const lockedSceneIds = useMemo(() => new Set(SCENE_ORDER.filter((id) => !isSceneUnlocked(progress, id, SCENE_ORDER))), [progress]);
  // 要求的街區還沒解鎖 → 改用路線上最後一個已解鎖的
  const activeId = lockedSceneIds.has(requestedId) ? ([...SCENE_ORDER].reverse().find((id) => !lockedSceneIds.has(id)) ?? SCENE_ORDER[0]) : requestedId;
  const district = districtOf(TOWN, activeId) ?? TOWN.districts[0];
  const scene = district.scene;
  const itemIds = useMemo(() => scene.items.map((it) => it.id), [scene]);

  useEffect(() => stopAudio, []);

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
    const sceneId = itemsById.get(itemId)?.sceneId;
    if (sceneId) {
      update((p) => {
        const seen = recordWordSeen(p, sceneId, itemId, now);
        return found ? recordWordFound(seen, sceneId, itemId, now) : seen;
      });
    }
    later(() => setPopup((cur) => (cur?.key === key ? null : cur)), POPUP_MS);
  }, [say, update, later]);

  const resetOverlays = () => {
    setPopup(null);
    setHintZoneKey(null);
    setFlashId(null);
    setToast(null);
    stopAudio();
  };

  const startStage = (stage: StageDef) => {
    resetOverlays();
    const state = createStageState(stage, itemIds, createRng(Date.now()), Date.now());
    setPhase({ kind: 'play', sceneId: scene.id, stage, state });
    if (stage.sequential) later(() => say(state.targets[0]), 500);
  };

  const finish = (sceneId: string, stage: StageDef, state: StageState) => {
    const stars = starsFor(state);
    const timeMs = (state.finishedAt ?? Date.now()) - state.startedAt;
    update((p) => recordStageClear(p, sceneId, stage.id, stars, timeMs));
    // 延遲期間玩家若已離開這一局（回選關、重玩），只記錄成績、不切畫面
    setPhase((cur) => (cur.kind === 'play' && cur.state.startedAt === state.startedAt ? { kind: 'result', sceneId, stage, state, stars } : cur));
  };

  const handleEvents = (sceneId: string, stage: StageDef, next: StageState, events: StageEvent[], point: Point) => {
    for (const ev of events) {
      if (ev.type === 'found') {
        showWord(ev.itemId, point, true);
        const upcoming = currentTarget(next, stage);
        if (upcoming && next.finishedAt === null) later(() => say(upcoming), NEXT_TARGET_DELAY_MS);
      } else if (ev.type === 'not-target') {
        showWord(ev.itemId, point, false);
      } else if (ev.type === 'miss') {
        const left = RECALL_MAX_MISSES - ev.misses;
        if (left > 0) showToast(`不在這裡，再想想看（還有 ${left} 次機會）`);
      } else if (ev.type === 'revealed') {
        const item = itemsById.get(ev.itemId);
        showToast('在這裡！記住它的位置');
        setFlashId(ev.itemId);
        later(() => setFlashId(null), 2700);
        if (item) setFocus({ x: item.x + item.w / 2, y: item.y + item.h / 2, key: Date.now() });
        say(ev.itemId);
        update((p) => recordWordSeen(p, sceneId, ev.itemId, Date.now()));
        const upcoming = currentTarget(next, stage);
        if (upcoming && next.finishedAt === null) later(() => say(upcoming), NEXT_TARGET_DELAY_MS + 800);
      } else if (ev.type === 'complete') {
        later(() => finish(sceneId, stage, next), RESULT_DELAY_MS);
      }
    }
  };

  const lockedMessage = (sceneId: string) => `「${districtOf(TOWN, sceneId)?.scene.name}」還沒解鎖：先完成「${UNLOCK_HINTS.get(sceneId)}」的看圖找`;

  const onSceneClick = ({ itemId, sceneId, locked, scenePoint, localPoint }: SceneClick) => {
    if (locked && sceneId) {
      showToast(lockedMessage(sceneId));
      return;
    }
    if (phase.kind === 'explore') {
      if (itemId) showWord(itemId, localPoint, false);
      return;
    }
    if (phase.kind !== 'play') return;
    const { stage, state } = phase;
    let hit = itemId;
    if (stage.mode === 'recall') {
      // 記憶挑戰：物品是隱形的，用座標判斷有沒有點在目前目標的原位置附近（itemsById 是小鎮座標）
      const target = currentTarget(state, stage);
      const item = target ? itemsById.get(target) : undefined;
      hit = item && isNearItem(item, scenePoint) ? item.id : null;
    }
    const { state: next, events } = clickItem(state, stage, hit, Date.now());
    setPhase({ ...phase, state: next });
    handleEvents(phase.sceneId, stage, next, events, localPoint);
  };

  const onHint = () => {
    if (phase.kind !== 'play') return;
    const { state: next, targetId } = takeHint(phase.state, phase.stage);
    const item = targetId ? itemsById.get(targetId) : undefined;
    const hintKey = item ? zoneKey(item.sceneId, item.zone) : null;
    const zone = hintKey ? TOWN.zones.get(hintKey) : undefined;
    if (!item || !hintKey || !zone) return;
    setPhase({ ...phase, state: next });
    setHintZoneKey(hintKey);
    setFocus({ ...rectCenter(zone), key: Date.now() });
    later(() => setHintZoneKey((z) => (z === hintKey ? null : z)), HINT_MS);
    showToast(`提示：在「${zone.name}」附近`);
    if (phase.stage.sequential) say(item.id);
  };

  // 點小地圖上的其他街區：鏡頭移過去；選關或自由探索時順便切換「目前街區」（闖關中只移鏡頭）
  const onDistrict = (sceneId: string) => {
    const target = districtOf(TOWN, sceneId);
    if (!target) return;
    setFocus({ ...rectCenter(target.scene.zones[0]), key: Date.now() });
    if (lockedSceneIds.has(sceneId)) {
      showToast(lockedMessage(sceneId));
      return;
    }
    if (phase.kind === 'menu' || phase.kind === 'explore') {
      setRequestedId(sceneId);
      window.history.replaceState(null, '', `/scene/${sceneId}`);
    }
  };

  if (!ready) return <div className="grid h-dvh place-items-center text-muted">載入中…</div>;

  const playing = phase.kind === 'play' ? phase : null;
  const stageForCanvas = phase.kind === 'play' || phase.kind === 'result' ? phase : null;
  const exploredCount = scene.items.filter((it) => progress.words[wordKey(scene.id, it.id)]).length;
  const popupItem = popup ? itemsById.get(popup.itemId) : undefined;

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
          <div className="truncate font-bold leading-tight">{scene.name}</div>
          <div className="truncate text-xs text-muted">
            {phase.kind === 'explore' ? '自由探索' : stageForCanvas ? `${stageForCanvas.stage.id}. ${stageForCanvas.stage.name}` : '選擇關卡'}
            {playing && ` · ${playing.state.found.length} / ${playing.state.targets.length}`}
          </div>
        </div>
        {playing && (
          <button type="button" onClick={onHint} disabled={playing.state.hintsUsed >= HINTS_PER_STAGE}
            className="flex items-center gap-1 rounded-full bg-accent/20 px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-40">
            <Lightbulb size={16} /> {HINTS_PER_STAGE - playing.state.hintsUsed}
          </button>
        )}
        <LangToggle compact />
      </header>

      <main className="relative min-h-0 flex-1">
        <TownCanvas
          town={TOWN}
          activeSceneId={scene.id}
          lockedSceneIds={lockedSceneIds}
          unlockHints={UNLOCK_HINTS}
          initialFocus={rectCenter(scene.zones[0])}
          foundIds={stageForCanvas ? stageForCanvas.state.found : EMPTY_FOUND}
          hideUnfound={stageForCanvas?.stage.mode === 'recall'}
          flashId={flashId}
          hintZoneKey={hintZoneKey}
          focus={focus}
          onSceneClick={onSceneClick}
          onDistrict={onDistrict}
        >
          {popup && popupItem && (
            <WordPopup key={popup.key} words={popupItem.words} lang={lang} showTranslation={showTranslation} showReading={showReading}
              point={popup.point} found={popup.found} onReplay={() => say(popup.itemId)} />
          )}
          {toast && (
            <div key={toast.key} className="pop-in pointer-events-none absolute inset-x-0 top-14 z-40 flex justify-center px-4">
              <div className="rounded-full bg-ink/85 px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast.text}</div>
            </div>
          )}
          {phase.kind === 'menu' && (
            <StageMenu sceneId={scene.id} sceneName={scene.name} progress={progress}
              onExplore={() => { resetOverlays(); setPhase({ kind: 'explore' }); }} onStart={startStage} />
          )}
          {phase.kind === 'result' && (
            <StageResult stage={phase.stage} state={phase.state} stars={phase.stars} itemsById={itemsById} lang={lang}
              showReading={showReading} showTranslation={showTranslation} onSay={say}
              onRetry={() => startStage(phase.stage)} onNext={startStage}
              onMenu={() => { resetOverlays(); setPhase({ kind: 'menu' }); }} />
          )}
        </TownCanvas>
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
