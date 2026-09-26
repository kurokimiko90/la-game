import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { placeScene } from '../../scripts/lib/placement.mjs';

const el = (id, zone, spot = 'ground') => ({ id, zone, en: id, zh: id, spot, size: 'small' });
const PLAN = {
  id: 'clinic', name: '診所',
  zones: [{ id: 'room', name: '診間', indoor: true, floor: 'tile', feature: 'none' }],
  elements: [el('desk-lamp', 'room'), el('cup', 'room'), el('pen', 'room'), el('sofa', 'room')],
};
const AVAILABLE = PLAN.elements.map((e) => e.id);
const TERRAIN = { zones: [{ id: 'room', x0: 0, y0: 0, x1: 1300, y1: 650, indoor: true, floor: 'tile', wallBase: 180 }] };
const answer = (sets) => JSON.stringify({ zones: { room: { sets } } });
const BLOCKED = (ids) => new Error(`layout 失敗：\n失敗：clinic/room：試了 20 次仍有物件被擋太多：${ids.map((id) => `${id}（露出 10%，被 x 擋住）`).join('、')}`);

let dir;
let stageFile;
let logs;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-'));
  stageFile = path.join(dir, 'clinic.json');
  logs = [];
});
const readStage = () => JSON.parse(fs.readFileSync(stageFile, 'utf8'));
const run = (over) => placeScene({ plan: PLAN, available: AVAILABLE, terrain: TERRAIN, stageFile, log: (m) => logs.push(m), ...over });

describe('placeScene', () => {
  test('新街區：規劃情境、寫檔、--reset 擺放', async () => {
    const calls = [];
    const r = await run({ mode: 'new', ask: async () => answer([{ row: 'mid', x: [0.1, 0.5], fixture: 'desk', on: ['cup', 'pen'] }]), layout: (args) => calls.push(args) });
    expect(r.staged).toBe(true);
    expect(readStage().zones.room.sets[0].on).toEqual(['cup', 'pen']);
    expect(calls).toEqual([['--reset']]);
  });

  test('被擋住的物品拿出情境再試，情境其他部分保留', async () => {
    const calls = [];
    const layout = (args) => {
      calls.push(args);
      if (calls.length === 1) throw BLOCKED(['pen']);
    };
    await run({ mode: 'new', ask: async () => answer([{ row: 'mid', x: [0.1, 0.5], fixture: 'desk', on: ['cup', 'pen'] }]), layout });
    expect(calls).toHaveLength(2);
    expect(readStage().zones.room.sets[0].on).toEqual(['cup']);
  });

  test('擋住的原因不是物品（或試太多輪）：刪掉情境、整個自動排列', async () => {
    const calls = [];
    const layout = (args) => {
      calls.push(args);
      if (calls.length === 1) throw new Error('layout 失敗：其他錯誤');
    };
    const r = await run({ mode: 'new', ask: async () => answer([{ row: 'mid', x: [0.1, 0.5], main: 'sofa' }]), layout });
    expect(r.staged).toBe(false);
    expect(fs.existsSync(stageFile)).toBe(false);
    expect(calls).toEqual([['--reset'], ['--reset']]);
  });

  test('codex 兩次都答不好：不用情境，照樣 --reset 擺放', async () => {
    const calls = [];
    const r = await run({ mode: 'restage', ask: async () => '沒有 JSON', layout: (args) => calls.push(args) });
    expect(r.staged).toBe(false);
    expect(calls).toEqual([['--reset']]);
    expect(logs.join('\n')).toContain('情境規劃沒做成');
  });

  test('重排：舊的情境檔丟掉重新規劃', async () => {
    fs.writeFileSync(stageFile, JSON.stringify({ zones: { room: { sets: [{ row: 'back', x: [0.1, 0.3], main: 'sofa' }] } } }));
    await run({ mode: 'restage', ask: async () => answer([{ row: 'mid', x: [0.6, 0.9], fixture: 'desk', on: ['cup'] }]), layout: () => {} });
    expect(readStage().zones.room.sets).toEqual([{ row: 'mid', x: [0.6, 0.9], fixture: 'desk', on: ['cup'] }]);
  });

  test('補元素：舊情境不動，新物品開新的組；不 --reset', async () => {
    const old = { row: 'mid', x: [0.1, 0.5], fixture: 'desk', on: ['cup'] };
    fs.writeFileSync(stageFile, JSON.stringify({ zones: { room: { sets: [old] } } }));
    let prompt = '';
    const calls = [];
    await run({
      mode: 'topUp',
      ask: async (p) => { prompt = p; return answer([{ row: 'mid', x: [0.6, 0.9], main: 'sofa', front: ['pen'] }]); },
      layout: (args) => calls.push(args),
    });
    expect(prompt).not.toContain('- cup');
    expect(readStage().zones.room.sets).toEqual([old, { row: 'mid', x: [0.6, 0.9], main: 'sofa', front: ['pen'] }]);
    expect(calls).toEqual([[]]);
  });

  test('補元素排不下：還原舊情境（不刪），新物品自動排列', async () => {
    const oldStage = { zones: { room: { sets: [{ row: 'mid', x: [0.1, 0.5], fixture: 'desk', on: ['cup'] }] } } };
    fs.writeFileSync(stageFile, JSON.stringify(oldStage));
    const calls = [];
    const layout = (args) => {
      calls.push(args);
      if (calls.length === 1) throw new Error('layout 失敗：其他錯誤');
    };
    await run({ mode: 'topUp', ask: async () => answer([{ row: 'mid', x: [0.6, 0.9], main: 'sofa' }]), layout });
    expect(readStage()).toEqual(oldStage);
    expect(calls).toEqual([[], []]);
  });

  test('補元素但街區沒有情境檔（手畫的、或規劃失敗過）：不問 codex，直接擺', async () => {
    let asked = false;
    const calls = [];
    const r = await run({ mode: 'topUp', ask: async () => { asked = true; return ''; }, layout: (args) => calls.push(args) });
    expect(asked).toBe(false);
    expect(r.staged).toBe(false);
    expect(calls).toEqual([[]]);
  });
});
