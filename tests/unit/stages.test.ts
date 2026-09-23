import { describe, expect, test } from 'vitest';
import {
  STAGES, RECALL_MAX_MISSES, getStage, pickTargets, createStageState, clickItem,
  currentTarget, remainingTargets, takeHint, starsFor, type StageDef, type StageState,
} from '@/lib/stages';
import { createRng } from '@/lib/rng';

const ITEMS = ['bench', 'fountain', 'tree', 'kite', 'ball', 'slide', 'swing', 'stone', 'book', 'clock', 'gate', 'bush'];
const stage = (id: number) => getStage(id) as StageDef;

function stateWith(id: number, targets: string[]): StageState {
  return { ...createStageState(stage(id), ITEMS, createRng(1), 0), targets };
}

describe('STAGES', () => {
  test('四個階段，提示逐步減少', () => {
    expect(STAGES.map((s) => s.mode)).toEqual(['picture', 'text', 'audio', 'recall']);
    expect(STAGES.map((s) => s.count)).toEqual([10, 8, 10, 10]);
    expect(STAGES.map((s) => s.hints)).toEqual([3, 3, 3, 10]);
    expect(getStage(9)).toBeUndefined();
  });
});

describe('pickTargets', () => {
  test('同 seed 結果相同、不重複、不超過物品數', () => {
    const a = pickTargets(ITEMS, 5, createRng(42));
    expect(a).toEqual(pickTargets(ITEMS, 5, createRng(42)));
    expect(new Set(a).size).toBe(5);
    expect(pickTargets(['a', 'b'], 5, createRng(1))).toHaveLength(2);
  });

  test('不改動原陣列', () => {
    const copy = [...ITEMS];
    pickTargets(ITEMS, 5, createRng(3));
    expect(ITEMS).toEqual(copy);
  });
});

describe('clickItem：清單模式（看圖 / 看字）', () => {
  test('點中目標 → found；全部找到 → complete', () => {
    let s = stateWith(1, ['bench', 'tree']);
    let r = clickItem(s, stage(1), 'tree', 10);
    expect(r.events).toEqual([{ type: 'found', itemId: 'tree' }]);
    s = r.state;
    r = clickItem(s, stage(1), 'bench', 20);
    expect(r.events.map((e) => e.type)).toEqual(['found', 'complete']);
    expect(r.state.finishedAt).toBe(20);
  });

  test('非目標、重複點、空白處', () => {
    const s = stateWith(1, ['bench', 'tree']);
    expect(clickItem(s, stage(1), 'kite', 1).events).toEqual([{ type: 'not-target', itemId: 'kite' }]);
    const once = clickItem(s, stage(1), 'bench', 1).state;
    expect(clickItem(once, stage(1), 'bench', 2).events).toEqual([{ type: 'not-target', itemId: 'bench' }]);
    expect(clickItem(s, stage(1), null, 1)).toEqual({ state: s, events: [] });
  });

  test('完成後不再變動', () => {
    const done = clickItem(stateWith(1, ['bench']), stage(1), 'bench', 5).state;
    expect(clickItem(done, stage(1), 'bench', 6)).toEqual({ state: done, events: [] });
  });

  test('不改動原狀態', () => {
    const s = stateWith(2, ['bench', 'tree']);
    clickItem(s, stage(2), 'bench', 1);
    expect(s.found).toEqual([]);
  });
});

describe('clickItem：依序模式（聽音）', () => {
  test('只接受目前目標', () => {
    const s = stateWith(3, ['bench', 'tree']);
    expect(currentTarget(s, stage(3))).toBe('bench');
    expect(clickItem(s, stage(3), 'tree', 1).events).toEqual([{ type: 'not-target', itemId: 'tree' }]);
    const next = clickItem(s, stage(3), 'bench', 1).state;
    expect(currentTarget(next, stage(3))).toBe('tree');
  });
});

describe('clickItem：記憶挑戰', () => {
  test('點在原位置 → found；點錯累計 miss', () => {
    const s = stateWith(4, ['bench', 'tree']);
    expect(clickItem(s, stage(4), 'bench', 1).events).toEqual([{ type: 'found', itemId: 'bench' }]);
    const r = clickItem(s, stage(4), null, 1);
    expect(r.events).toEqual([{ type: 'miss', targetId: 'bench', misses: 1 }]);
    expect(r.state.misses.bench).toBe(1);
  });

  test(`點錯 ${RECALL_MAX_MISSES} 次 → 揭曉並前進`, () => {
    let s = stateWith(4, ['bench', 'tree']);
    let events: string[] = [];
    for (let i = 0; i < RECALL_MAX_MISSES; i++) {
      const r = clickItem(s, stage(4), null, i);
      s = r.state;
      events = r.events.map((e) => e.type);
    }
    expect(events).toEqual(['miss', 'revealed']);
    expect(s.revealed).toEqual(['bench']);
    expect(currentTarget(s, stage(4))).toBe('tree');
  });

  test('最後一個被揭曉也會 complete', () => {
    let s = stateWith(4, ['bench']);
    let last: string[] = [];
    for (let i = 0; i < RECALL_MAX_MISSES; i++) {
      const r = clickItem(s, stage(4), 'tree', i);
      s = r.state;
      last = r.events.map((e) => e.type);
    }
    expect(last).toEqual(['miss', 'revealed', 'complete']);
    expect(s.finishedAt).not.toBeNull();
  });
});

describe('takeHint', () => {
  test('清單模式提示第一個未找到；次數用完回 null', () => {
    let s = stateWith(1, ['bench', 'tree']);
    s = clickItem(s, stage(1), 'bench', 1).state;
    for (let i = 0; i < stage(1).hints; i++) {
      const r = takeHint(s, stage(1));
      expect(r.targetId).toBe('tree');
      s = r.state;
    }
    expect(takeHint(s, stage(1)).targetId).toBeNull();
    expect(s.hintsUsed).toBe(stage(1).hints);
  });

  test('記憶挑戰可以用 10 次提示', () => {
    let s = stateWith(4, ITEMS.slice(0, 10));
    for (let i = 0; i < 10; i++) {
      const r = takeHint(s, stage(4));
      expect(r.targetId).toBe('bench');
      s = r.state;
    }
    expect(takeHint(s, stage(4)).targetId).toBeNull();
  });

  test('依序模式提示目前目標；完成後不能用', () => {
    const s = stateWith(3, ['bench', 'tree']);
    expect(takeHint(s, stage(3)).targetId).toBe('bench');
    const done = { ...s, finishedAt: 1 };
    expect(takeHint(done, stage(3))).toEqual({ state: done, targetId: null });
  });
});

describe('starsFor / remainingTargets', () => {
  test('依提示與揭曉次數給星', () => {
    const s = stateWith(1, ['bench']);
    expect(starsFor(s)).toBe(3);
    expect(starsFor({ ...s, hintsUsed: 2 })).toBe(2);
    expect(starsFor({ ...s, hintsUsed: 1, revealed: ['a', 'b'] })).toBe(1);
  });

  test('remainingTargets', () => {
    const s = clickItem(stateWith(1, ['bench', 'tree']), stage(1), 'tree', 1).state;
    expect(remainingTargets(s)).toEqual(['bench']);
  });
});
