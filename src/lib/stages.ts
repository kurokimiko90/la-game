// 階段規則（純函式，UI 只負責呼叫與顯示）。
// 同一場景物品位置不變，提示逐步減少：看圖 → 看字 → 聽音 → 憑記憶點出原位置。
// 看圖、看字、聽音的題目都附物品圖示。

export type StageMode = 'picture' | 'text' | 'audio' | 'recall';
export type StageId = 1 | 2 | 3 | 4;

export interface StageDef {
  id: StageId;
  mode: StageMode;
  name: string;
  description: string;
  count: number;
  /** true：一次只找一個（聽音、記憶）；false：清單上的任意順序 */
  sequential: boolean;
  /** 這一關可用的提示次數 */
  hints: number;
}

export const STAGES: readonly StageDef[] = [
  { id: 1, mode: 'picture', name: '看圖找', description: '看圖示和單字，找出物品', count: 10, sequential: false, hints: 3 },
  { id: 2, mode: 'text', name: '看字找', description: '看單字和圖示，找出物品', count: 8, sequential: false, hints: 3 },
  { id: 3, mode: 'audio', name: '聽音找', description: '聽發音、看圖示，找出物品', count: 10, sequential: true, hints: 3 },
  { id: 4, mode: 'recall', name: '記憶挑戰', description: '物品都藏起來了，聽到單字後點出它原本的位置', count: 10, sequential: true, hints: 10 },
];

/** 記憶挑戰同一個物品點錯幾次後直接揭曉位置 */
export const RECALL_MAX_MISSES = 3;

export function getStage(id: number): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function pickTargets(itemIds: readonly string[], count: number, rng: () => number): string[] {
  const pool = [...itemIds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export interface StageState {
  stageId: StageId;
  targets: string[];
  found: string[];
  /** 記憶挑戰：點錯太多次而被揭曉的物品（算完成但扣星） */
  revealed: string[];
  misses: Record<string, number>;
  hintsUsed: number;
  startedAt: number;
  finishedAt: number | null;
}

export type StageEvent =
  | { type: 'found'; itemId: string }
  | { type: 'not-target'; itemId: string }
  | { type: 'miss'; targetId: string; misses: number }
  | { type: 'revealed'; itemId: string }
  | { type: 'complete' };

export function createStageState(stage: StageDef, itemIds: readonly string[], rng: () => number, now: number): StageState {
  return {
    stageId: stage.id,
    targets: pickTargets(itemIds, stage.count, rng),
    found: [],
    revealed: [],
    misses: {},
    hintsUsed: 0,
    startedAt: now,
    finishedAt: null,
  };
}

export function remainingTargets(state: StageState): string[] {
  return state.targets.filter((id) => !state.found.includes(id));
}

/** 依序模式下目前要找的物品；清單模式回 null */
export function currentTarget(state: StageState, stage: StageDef): string | null {
  if (!stage.sequential) return null;
  return remainingTargets(state)[0] ?? null;
}

function markFound(state: StageState, itemId: string, now: number): { state: StageState; events: StageEvent[] } {
  const found = [...state.found, itemId];
  const done = found.length === state.targets.length;
  return {
    state: { ...state, found, finishedAt: done ? now : null },
    events: done ? [{ type: 'found', itemId }, { type: 'complete' }] : [{ type: 'found', itemId }],
  };
}

/**
 * 玩家點擊。itemId = 點到的物品；null = 點到空白處。
 * 記憶模式由 UI 用座標判斷「有沒有點在目前目標的原位置附近」，點中傳目標 id，否則傳 null。
 */
export function clickItem(state: StageState, stage: StageDef, itemId: string | null, now: number): { state: StageState; events: StageEvent[] } {
  if (state.finishedAt !== null) return { state, events: [] };

  if (stage.mode === 'recall') {
    const target = currentTarget(state, stage);
    if (!target) return { state, events: [] };
    if (itemId === target) return markFound(state, target, now);
    const misses = (state.misses[target] ?? 0) + 1;
    const next = { ...state, misses: { ...state.misses, [target]: misses } };
    if (misses < RECALL_MAX_MISSES) return { state: next, events: [{ type: 'miss', targetId: target, misses }] };
    const revealedState = { ...next, revealed: [...next.revealed, target] };
    const result = markFound(revealedState, target, now);
    return { state: result.state, events: [{ type: 'miss', targetId: target, misses }, { type: 'revealed', itemId: target }, ...result.events.filter((e) => e.type !== 'found')] };
  }

  if (itemId === null) return { state, events: [] };
  const isTarget = stage.sequential
    ? itemId === currentTarget(state, stage)
    : state.targets.includes(itemId) && !state.found.includes(itemId);
  if (!isTarget) return { state, events: [{ type: 'not-target', itemId }] };
  return markFound(state, itemId, now);
}

/** 用掉一次提示，回傳要提示的物品（依序模式 = 目前目標；清單模式 = 第一個還沒找到的） */
export function takeHint(state: StageState, stage: StageDef): { state: StageState; targetId: string | null } {
  if (state.finishedAt !== null || state.hintsUsed >= stage.hints) return { state, targetId: null };
  const targetId = stage.sequential ? currentTarget(state, stage) : remainingTargets(state)[0] ?? null;
  if (!targetId) return { state, targetId: null };
  return { state: { ...state, hintsUsed: state.hintsUsed + 1 }, targetId };
}

/** 星級：只看求助程度（提示 + 被揭曉），沒有時間壓力 */
export function starsFor(state: StageState): 1 | 2 | 3 {
  const penalty = state.hintsUsed + state.revealed.length;
  if (penalty === 0) return 3;
  if (penalty <= 2) return 2;
  return 1;
}
