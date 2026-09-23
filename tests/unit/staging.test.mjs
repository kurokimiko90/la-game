import { describe, expect, test } from 'vitest';
import { stageZone, stageScene, validateStage, zoneFrame, FIXTURES } from '../../scripts/lib/staging.mjs';
import { layoutScene, checkLayout } from '../../scripts/lib/layout.mjs';

const INDOOR = { id: 'room', x0: 0, y0: 0, x1: 1300, y1: 650, indoor: true, floor: 'tile', wallBase: 180 };
const OUTDOOR = { id: 'yard', x0: 1300, y0: 0, x1: 2600, y1: 650, indoor: false, floor: 'paving', road: { y0: 460, y1: 620 } };
const TERRAIN = { zones: [INDOOR, OUTDOOR] };

const mk = (id, zone, sizeHint = 'small', viewBox = [0, 0, 100, 100]) => ({ id, zone, sizeHint, viewBox, words: { en: id } });
const ITEMS = [
  mk('sofa', 'room', 'medium', [0, 0, 160, 100]), mk('lamp', 'room', 'medium', [0, 0, 60, 140]), mk('cup', 'room'), mk('book', 'room'),
  mk('clock', 'room'), mk('poster', 'room'), mk('ball', 'room'), mk('fridge', 'room', 'large', [0, 0, 100, 180]),
  mk('jar', 'room'), mk('pen', 'room'),
  mk('bench', 'yard', 'medium'), mk('sign', 'yard'), mk('flower', 'yard'), mk('car', 'yard', 'large'),
];
const byId = new Map(ITEMS.map((it) => [it.id, it]));
const zoneOf = Object.fromEntries(ITEMS.map((it) => [it.id, it.zone]));

const ROOM = {
  sets: [
    { row: 'back', x: [0.02, 0.2], main: 'fridge', wall: ['clock'] },
    { row: 'back', x: [0.25, 0.7], fixture: 'shelf', on: ['jar', 'pen', 'book'] },
    { row: 'mid', x: [0.1, 0.6], fixture: 'rug', main: 'sofa', beside: ['lamp'], front: ['ball'] },
    { row: 'mid', x: [0.65, 0.95], fixture: 'desk', on: ['cup'], wall: ['poster'] },
  ],
};

describe('zoneFrame', () => {
  test('室內三排由後往前，牆上掛件在牆腳上方', () => {
    const f = zoneFrame(INDOOR);
    expect(f.rows.back).toBeLessThan(f.rows.mid);
    expect(f.rows.mid).toBeLessThan(f.rows.front);
    expect(f.wall).toBeLessThan(INDOOR.wallBase);
    expect(f.rows.front).toBeLessThanOrEqual(f.bottom);
  });
  test('室外的地面停在車道前，沒有牆', () => {
    const f = zoneFrame(OUTDOOR);
    expect(f.rows.front).toBeLessThan(OUTDOOR.road.y0);
    expect(f.wall).toBeNull();
  });
});

describe('stageZone', () => {
  const run = () => stageZone({ sceneId: 's', zone: INDOOR, stage: ROOM, items: byId });

  test('同樣的輸入每次結果一樣', () => {
    expect([...run().anchors]).toEqual([...run().anchors]);
  });

  test('每個列出的物件都有錨點，而且在區域內', () => {
    const { anchors } = run();
    for (const id of ['fridge', 'clock', 'jar', 'pen', 'book', 'sofa', 'lamp', 'ball', 'cup', 'poster']) {
      const a = anchors.get(id);
      expect(a, id).toBeDefined();
      expect(a.x).toBeGreaterThan(INDOOR.x0);
      expect(a.x).toBeLessThan(INDOOR.x1);
      expect(a.y).toBeLessThanOrEqual(INDOOR.y1);
    }
  });

  test('層架上的物件分在兩層，層架畫成家具', () => {
    const { anchors, fixtures } = run();
    const shelf = fixtures.find((f) => f.look === 'shelf');
    expect(shelf.levels).toHaveLength(2);
    const ys = new Set(['jar', 'pen', 'book'].map((id) => anchors.get(id).y));
    expect(ys.size).toBe(2);
    for (const id of ['jar', 'pen', 'book']) {
      expect(shelf.levels).toContain(anchors.get(id).y);
      expect(anchors.get(id).x).toBeGreaterThan(shelf.x0);
      expect(anchors.get(id).x).toBeLessThan(shelf.x1);
    }
  });

  test('桌上的東西比地上的小，底線在桌面', () => {
    const { anchors, fixtures } = run();
    const desk = fixtures.find((f) => f.look === 'desk');
    expect(anchors.get('cup').y).toBe(desk.levels[0]);
    expect(anchors.get('cup').scale).toBeLessThan(anchors.get('ball').scale);
  });

  test('兩側的物件在家具外面，前面的物件在後面', () => {
    const { anchors, fixtures } = run();
    const rug = fixtures.find((f) => f.look === 'rug');
    expect(anchors.get('lamp').x).toBeLessThan(rug.x0);
    expect(anchors.get('ball').y).toBeGreaterThan(rug.base);
  });

  test('只有前面地上的東西可以歪倒', () => {
    const { anchors } = run();
    expect(anchors.get('ball').tilt).toBe(true);
    expect(anchors.get('cup').tilt).toBe(false);
    expect(anchors.get('clock').tilt).toBe(false);
  });

  test('牆上掛件避開高的主體（冰箱）', () => {
    const { anchors } = run();
    const fridge = anchors.get('fridge');
    const clock = anchors.get('clock');
    expect(Math.abs(clock.x - fridge.x)).toBeGreaterThan(30);
  });

  test('門面可以掛東西，door 時畫門', () => {
    const { anchors, fixtures } = stageZone({ sceneId: 's', zone: OUTDOOR, stage: { sets: [{ row: 'back', x: [0.3, 0.6], fixture: 'facade', door: true, wall: ['sign'] }] }, items: byId });
    expect(fixtures[0].look).toBe('facade-door');
    expect(anchors.get('sign').y).toBeLessThan(fixtures[0].base);
  });
});

describe('stageScene + layoutScene', () => {
  test('情境錨點優先，擺出來的物件通過檢查', () => {
    const stage = { zones: { room: ROOM, yard: { sets: [{ row: 'mid', x: [0.1, 0.5], fixture: 'planter', on: ['flower'] }, { row: 'back', x: [0.6, 0.9], main: 'bench', beside: ['sign'] }] } } };
    const staged = stageScene({ sceneId: 's', terrain: TERRAIN, stage, items: byId });
    expect(staged.zones).toEqual(new Set(['room', 'yard']));
    const zones = TERRAIN.zones.map(({ id, x0, y0, x1, y1 }) => ({ id, x0, y0, x1, y1 }));
    const placements = layoutScene({ sceneId: 's', zones, items: ITEMS, staged: staged.anchors, loose: ['ball', 'cup'] });
    const cup = placements.find((p) => p.id === 'cup');
    expect(cup.rotate).toBe(0);
    const flower = placements.find((p) => p.id === 'flower');
    expect(flower.y + flower.h).toBe(staged.anchors.get('flower').y);
    expect(checkLayout({ zones, items: ITEMS, placements })).toEqual([]);
  });
});

describe('validateStage', () => {
  const check = (stage, words = ITEMS.map((it) => it.id)) => validateStage({ stage, zoneOf, terrain: TERRAIN, words });

  test('合法的情境沒有問題', () => {
    expect(check({ zones: { room: ROOM } })).toEqual([]);
  });

  test('擋下：未知物件、放錯區域、重複、未知家具、撞名、重疊、沒地方放', () => {
    const problems = check({
      zones: {
        room: { sets: [
          { row: 'back', x: [0.1, 0.4], fixture: 'shelf', on: ['cup', 'nope', 'bench'] },
          { row: 'back', x: [0.3, 0.5], main: 'sofa', on: ['cup'] },
          { row: 'mid', x: [0.1, 0.3], fixture: 'spaceship' },
          { row: 'mid', x: [0.5, 0.7], on: ['pen'] },
          { row: 'side', x: [0.8, 0.7] },
        ] },
        attic: { sets: [] },
      },
    }, ['cup', 'shelf']);
    const text = problems.join('\n');
    expect(text).toMatch(/沒有物件 nope/);
    expect(text).toMatch(/bench 在區域 yard/);
    expect(text).toMatch(/cup 出現在多個位置/);
    expect(text).toMatch(/未知的家具 spaceship/);
    expect(text).toMatch(/shelf 和單字 shelf 撞名/);
    expect(text).toMatch(/同一排重疊/);
    expect(text).toMatch(/沒有家具或主體可以放/);
    expect(text).toMatch(/row 要是/);
    expect(text).toMatch(/x 要是/);
    expect(text).toMatch(/沒有這個區域/);
  });

  test('室外只有門面能掛東西；層架只能在室內靠牆', () => {
    const text = check({ zones: { yard: { sets: [{ row: 'mid', x: [0.1, 0.3], fixture: 'shelf' }, { row: 'mid', x: [0.5, 0.7], main: 'bench', wall: ['sign'] }] } } }).join('\n');
    expect(text).toMatch(/只能靠後牆/);
    expect(text).toMatch(/只能在室內/);
    expect(text).toMatch(/室外只有 facade/);
  });

  test('只掛牆的組不佔地面', () => {
    expect(check({ zones: { room: { sets: [{ row: 'back', x: [0.1, 0.3], wall: ['clock'] }, { row: 'back', x: [0.1, 0.3], main: 'fridge' }] } } })).toEqual([]);
  });

  test('每種家具都有撞名清單', () => {
    for (const [name, fx] of Object.entries(FIXTURES)) expect(fx.words.length, name).toBeGreaterThan(0);
  });
});
