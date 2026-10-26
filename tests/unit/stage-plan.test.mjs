import { describe, expect, test } from 'vitest';
import { buildStagePrompt, parseStage, usableFixtures } from '../../scripts/lib/stage-plan.mjs';

const el = (id, zone, en = id, spot = 'ground', size = 'small') => ({ id, zone, en, zh: id, spot, size });
const PLAN = {
  id: 'clinic', name: '診所',
  zones: [
    { id: 'front', name: '門口', indoor: false, floor: 'paving', feature: 'road' },
    { id: 'room', name: '診間', indoor: true, floor: 'tile', feature: 'none' },
  ],
  elements: [
    el('car', 'front', 'car', 'road', 'large'), el('sign', 'front'), el('bench', 'front', 'bench', 'ground', 'medium'),
    el('cup', 'room'), el('pen', 'room'), el('clock', 'room', 'clock', 'wall'), el('sofa', 'room', 'sofa', 'ground', 'medium'), el('mat', 'room', 'mat'),
  ],
};
const AVAILABLE = PLAN.elements.map((e) => e.id);
const TERRAIN = { zones: [
  { id: 'front', x0: 0, y0: 0, x1: 1300, y1: 650, indoor: false, floor: 'paving', road: { y0: 460, y1: 620 } },
  { id: 'room', x0: 1300, y0: 0, x1: 2600, y1: 650, indoor: true, floor: 'tile', wallBase: 180 },
] };
const parse = (data) => parseStage(JSON.stringify(data), { plan: PLAN, available: AVAILABLE, terrain: TERRAIN });

describe('usableFixtures', () => {
  test('和單字撞名的家具不能用', () => {
    const list = usableFixtures(['mat', 'desk']);
    expect(list).not.toContain('rug');
    expect(list).not.toContain('desk');
    expect(list).toContain('shelf');
  });
});

describe('buildStagePrompt', () => {
  test('列出地上的物品，不列車道上的車；不列撞名的家具；附上次的問題', () => {
    const p = buildStagePrompt({ plan: PLAN, available: AVAILABLE, problems: ['x 重疊'] });
    expect(p).toContain('- cup');
    expect(p).not.toContain('- car');
    expect(p).not.toMatch(/rug=/);
    expect(p).toContain('x 重疊');
  });
});

describe('parseStage', () => {
  test('合法的回答原樣通過', () => {
    const r = parse({ zones: { room: { sets: [{ note: '桌子', row: 'mid', x: [0.1, 0.5], fixture: 'desk', on: ['cup', 'pen'], wall: ['clock'] }, { row: 'mid', x: [0.6, 0.9], main: 'sofa', front: ['mat'] }] } } });
    expect(r.problems).toEqual([]);
    expect(r.stage.zones.room.sets).toHaveLength(2);
    expect(r.dropped).toEqual(['sign', 'bench']);
  });

  test('修整：不存在 / 放錯區域 / 重複的物品丟掉、撞名的家具拿掉、沒地方放的 on 改放前面', () => {
    const r = parse({ zones: { room: { sets: [
      { row: 'mid', x: [0.1, 0.4], fixture: 'rug', on: ['cup', 'ghost', 'bench'] },
      { row: 'back', x: [0.5, 0.8], fixture: 'desk', on: ['cup', 'pen'] },
    ] } } });
    const [a, b] = r.stage.zones.room.sets;
    expect(a.fixture).toBeUndefined();
    expect(a.front).toEqual(['cup']);
    expect(b.on).toEqual(['pen']);
    expect(r.problems).toEqual([]);
  });

  test('同一排重疊的組丟掉，物品回到自動排列；範圍不合法也丟掉', () => {
    const r = parse({ zones: { room: { sets: [
      { row: 'mid', x: [0.1, 0.5], main: 'sofa' },
      { row: 'mid', x: [0.3, 0.7], fixture: 'desk', on: ['cup'] },
      { row: 'back', x: [0.9, 0.2], fixture: 'desk', on: ['pen'] },
    ] } } });
    expect(r.stage.zones.room.sets).toHaveLength(1);
    expect(r.dropped).toEqual(expect.arrayContaining(['cup', 'pen']));
    expect(r.problems).toEqual([]);
  });

  test('室外沒有門面的牆上物品改放旁邊；靠牆家具強制 back', () => {
    const r = parse({ zones: {
      front: { sets: [{ row: 'mid', x: [0.1, 0.4], main: 'bench', wall: ['sign'] }] },
      room: { sets: [{ row: 'mid', x: [0.1, 0.4], fixture: 'shelf', on: ['cup'] }] },
    } });
    expect(r.stage.zones.front.sets[0].beside).toEqual(['sign']);
    expect(r.stage.zones.room.sets[0].row).toBe('back');
    expect(r.problems).toEqual([]);
  });

  test('不是 JSON 就丟錯', () => {
    expect(() => parseStage('沒有', { plan: PLAN, available: AVAILABLE, terrain: TERRAIN })).toThrow();
  });
});
