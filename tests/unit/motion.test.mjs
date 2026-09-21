import { describe, expect, test } from 'vitest';
import { motionParams, checkMotionBudget, MOTION_PRESETS, MAX_MOTION_RATIO } from '../../scripts/lib/motion.mjs';
import { validateSceneConfig } from '../../scripts/lib/scene-config.mjs';

describe('motionParams', () => {
  test('同一個物件每次參數相同，且落在預設範圍內', () => {
    for (const type of Object.keys(MOTION_PRESETS)) {
      const a = motionParams('park', 'tree', type);
      expect(a).toEqual(motionParams('park', 'tree', type));
      const [lo, hi] = MOTION_PRESETS[type].dur;
      expect(a.type).toBe(type);
      expect(a.dur).toBeGreaterThanOrEqual(lo);
      expect(a.dur).toBeLessThanOrEqual(hi);
      expect(a.delay).toBeLessThanOrEqual(0);
      expect(a.delay).toBeGreaterThan(-a.dur);
      expect(a.amp).toBeGreaterThanOrEqual(0.8);
      expect(a.amp).toBeLessThanOrEqual(1.2);
    }
  });

  test('不同物件相位錯開', () => {
    expect(motionParams('park', 'tree', 'sway').delay).not.toBe(motionParams('park', 'bush', 'sway').delay);
  });

  test('未知的動態類型報錯', () => {
    expect(() => motionParams('park', 'tree', 'spin')).toThrow(/spin/);
  });
});

describe('checkMotionBudget', () => {
  test(`會動的物件不能超過 ${MAX_MOTION_RATIO * 100}%`, () => {
    expect(() => checkMotionBudget({ a: 'sway', b: 'bob', c: 'sway' }, 10)).not.toThrow();
    expect(() => checkMotionBudget({ a: 'sway', b: 'bob', c: 'sway', d: 'bob' }, 10)).toThrow(/4/);
  });
});

describe('validateSceneConfig', () => {
  const ids = ['tree', 'kite', 'ball', 'cup'];
  const zoneIds = ['a', 'b'];
  const ok = {
    name: '公園', icon: 'tree',
    zones: { a: [0, 0, 500, 500], b: [500, 0, 1000, 500] },
    bands: { ground: {}, sky: { top: 100, bottom: 300, scale: [0.8, 0.8], layer: 3 } },
    place: { kite: 'sky' }, clusters: [['tree', 'ball']], loose: ['ball'], noFlip: [], motion: { kite: 'drift' },
  };

  test('正確的設定沒有問題', () => {
    expect(validateSceneConfig('park', ok, ids, zoneIds)).toEqual([]);
  });

  test('抓出拼錯的物件 id、不存在的地帶、未知的動態、缺 ground、錯誤的 scale、區域沒有位置或位置無效', () => {
    const bad = {
      ...ok,
      icon: 'nope',
      zones: { a: [0, 0, 500], zz: [0, 0, 10, 10] },
      bands: { sky: { top: 300, bottom: 100, scale: [0.8] } },
      place: { kite: 'sea', ghost: 'sky' },
      clusters: [['tree', 'typo']],
      loose: ['missing'],
      noFlip: ['gone'],
      motion: { tree: 'spin', phantom: 'sway' },
    };
    const problems = validateSceneConfig('park', bad, ids, zoneIds).join('\n');
    for (const word of ['nope', 'ground', 'scale', 'top', 'sea', 'ghost', 'typo', 'missing', 'gone', 'spin', 'phantom', '區域 a', '區域 b', 'zz']) {
      expect(problems).toContain(word);
    }
  });
});
