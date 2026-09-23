import { describe, expect, it } from 'vitest';
import {
  buildZonePrompt, extractJson, parseOutline, planToManifest, planToSceneConfig, splitCount, validateElements, wordKey, zoneShortfall,
} from '../../scripts/lib/scene-plan.mjs';

const theme = { id: 'cafe', name: '咖啡館' };
const zones = [
  { id: 'door', name: '門口', indoor: false, floor: 'paving', feature: 'none' },
  { id: 'bar', name: '吧台', indoor: true, floor: 'wood', feature: 'counter' },
  { id: 'seats', name: '座位區', indoor: true, floor: 'carpet', feature: 'table' },
  { id: 'terrace', name: '露台', indoor: false, floor: 'grass', feature: 'water' },
];
const el = (over) => ({
  id: 'teacup', zh: '茶杯', en: 'teacup', ja: 'ティーカップ', reading: 'ティーカップ', category: '道具', size: 'small',
  spot: 'surface', desc: '白色圓弧茶杯，旁邊一個小把手，下面一個淺碟子。', loose: false, motion: null, cluster: null, ...over,
});
const freshUsed = () => ({ ids: new Set(['bench']), en: new Set([wordKey('bench')]), zh: new Set(['長椅']) });

describe('extractJson', () => {
  it('容許前後有文字和程式碼圍欄', () => {
    expect(extractJson('好的：\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('沒有 JSON 就丟錯', () => {
    expect(() => extractJson('抱歉')).toThrow('沒有 JSON');
  });
});

describe('parseOutline', () => {
  it('整理區域、修正不合法的值、避開已用的區域 id', () => {
    const raw = JSON.stringify({ zones: [
      { id: 'entrance', name: '入口', indoor: false, floor: 'paving', feature: 'road' },
      { id: 'Bad Id', name: '大廳', indoor: true, floor: 'grass', feature: 'track' },
      { id: 'c', name: '', indoor: true, floor: 'wood', feature: 'counter' },
      { id: 'dock', name: '碼頭', indoor: false, floor: 'sand', feature: 'water' },
    ] });
    const out = parseOutline(raw, { theme, usedZoneIds: ['entrance'] });
    expect(out.zones.map((z) => z.id)).toEqual(['cafe-entrance', 'zone-2', 'zone-3', 'dock']);
    expect(out.zones[1]).toMatchObject({ indoor: true, floor: 'tile', feature: 'none' });
    expect(out.zones[2].name).toBe('區域3');
  });
  it('區域不是 4 個就丟錯', () => {
    expect(() => parseOutline('{"zones":[]}', { theme })).toThrow('4 個');
  });
});

describe('validateElements', () => {
  it('合格的物品收下並記進 used；位置不合法退回地上；loose 只給小東西', () => {
    const used = freshUsed();
    const { ok, rejected } = validateElements([el(), el({ id: 'rug', zh: '地毯', en: 'rug', ja: 'ラグ', reading: 'ラグ', size: 'large', spot: 'water', loose: true })], { zone: zones[1], used });
    expect(rejected).toEqual([]);
    expect(ok[0]).toMatchObject({ zone: 'bar', spot: 'surface' });
    expect(ok[1]).toMatchObject({ spot: 'ground', loose: false });
    expect(used.en.has('teacup')).toBe(true);
  });

  it('限定位置時，其他位置一律退回地上', () => {
    const { ok } = validateElements([el({ spot: 'surface' })], { zone: zones[1], used: freshUsed(), spots: ['ground'] });
    expect(ok[0].spot).toBe('ground');
  });

  it.each([
    [{ id: 'Tea Cup' }, 'id 格式不對'],
    [{ id: 'bench' }, 'id 重複'],
    [{ en: 'benches', id: 'benches' }, '英文重複'],
    [{ zh: '長椅' }, '中文重複'],
    [{ reading: '茶杯' }, '讀音不是假名'],
    [{ category: '動物' }, '類別 動物 不在清單'],
    [{ desc: '上面寫著 CAFE 的杯子，畫得很清楚。' }, '描述有數字或英文字母'],
    [{ desc: '三個杯子疊在一起，每個都是白色的杯子。3' }, '描述有數字或英文字母'],
  ])('擋下不合格的物品 %o', (over, reason) => {
    const { ok, rejected } = validateElements([el(over)], { zone: zones[1], used: freshUsed() });
    expect(ok).toEqual([]);
    expect(rejected[0].reason).toBe(reason);
  });
});

describe('buildZonePrompt', () => {
  it('只列出這個區域能用的位置，並帶上要避開的單字', () => {
    const p = buildZonePrompt({ sceneName: '咖啡館', zone: zones[1], count: 18, avoidEn: ['bench', 'cup'], maxMotion: 3 });
    expect(p).toContain('wall（');
    expect(p).toContain('surface（放在吧台上）');
    expect(p).not.toContain('sky（');
    expect(p).toContain('bench, cup');
    expect(p).toContain('18 個');
    expect(p).toContain('至少 9 個是 ground');
    expect(p).not.toContain('已經有');
  });

  it('補元素：只給地上的位置，列出區域裡已經有的物品', () => {
    const p = buildZonePrompt({ sceneName: '咖啡館', zone: zones[1], count: 7, avoidEn: [], maxMotion: 1, spots: ['ground'], existing: [{ id: 'teacup', zh: '茶杯' }] });
    expect(p).toContain('spot：ground（地上）\n');
    expect(p).not.toContain('surface（');
    expect(p).not.toContain('至少');
    expect(p).toContain('已經有：茶杯（teacup）');
  });
});

describe('planToManifest / planToSceneConfig', () => {
  const plan = {
    id: 'cafe', name: '咖啡館', slot: { x: 3600, y: 0 }, colorIndex: 2, icon: 'espresso-machine', zones,
    elements: [
      el({ id: 'espresso-machine', zh: '咖啡機器', en: 'espresso machine', size: 'large', zone: 'bar', spot: 'wallbase', motion: 'wobble' }),
      el({ zone: 'bar', spot: 'surface', loose: true }),
      el({ id: 'table-lamp', zh: '檯燈', en: 'table lamp', zone: 'seats', spot: 'ground', cluster: 'armchair' }),
      el({ id: 'armchair', zh: '扶手椅', en: 'armchair', size: 'medium', zone: 'seats', spot: 'ground' }),
      el({ id: 'duck-boat', zh: '鴨子船', en: 'duck boat', zone: 'terrace', spot: 'water', motion: 'bob' }),
      el({ id: 'missing', zh: '不見了', en: 'missing', zone: 'door', spot: 'ground', motion: 'sway' }),
    ],
  };

  it('manifest 格式和手寫的一樣', () => {
    const m = planToManifest(plan);
    expect(m).toMatchObject({ sceneName: '語言小鎮・咖啡館', sceneSlug: 'la-cafe', propStyle: 'front-flat', zones: { door: '門口' } });
    expect(m.elements[1]).toMatchObject({ name: '茶杯', lane: 'b', sizeHint: 'small', ref: { scene: 'cafe', zone: 'bar', itemId: 'teacup', words: { en: 'teacup', ja: { text: 'ティーカップ', reading: 'ティーカップ' } } } });
  });

  it('只用有 SVG 的物件；群組、散落、動態、代表物件都整理好', () => {
    const cfg = planToSceneConfig(plan, ['espresso-machine', 'teacup', 'table-lamp', 'armchair', 'duck-boat']);
    expect(cfg.icon).toBe('espresso-machine');
    expect(cfg.place).toMatchObject({ 'espresso-machine': 'wallbase-bar', teacup: 'surface-bar', 'duck-boat': 'water-terrace' });
    expect(cfg.clusters).toEqual([['armchair', 'table-lamp']]);
    expect(cfg.loose).toEqual(['teacup']);
    expect(cfg.motion).toEqual({ 'espresso-machine': 'wobble' }); // 5 個物件 × 0.3 × 0.8 → 最多 1 個
    expect(Object.keys(cfg).sort()).toEqual(['bands', 'clusters', 'icon', 'loose', 'motion', 'name', 'noFlip', 'place', 'terrain', 'zones']);
    expect(JSON.stringify(cfg)).not.toContain('missing');
  });

  it('一個有 SVG 的物件都沒有就丟錯', () => {
    expect(() => planToSceneConfig(plan, [])).toThrow('沒有任何物件');
  });
});

describe('splitCount', () => {
  it('平均分，前面的多 1', () => {
    expect(splitCount(70, 4)).toEqual([18, 18, 17, 17]);
  });
});

describe('zoneShortfall', () => {
  it('每個區域補到平均數，只算有 SVG 的物件', () => {
    const plan = {
      zones,
      elements: [
        el({ id: 'a', zone: 'door' }), el({ id: 'b', zone: 'door' }), el({ id: 'c', zone: 'door' }),
        el({ id: 'd', zone: 'bar' }), el({ id: 'failed', zone: 'bar' }),
      ],
    };
    const out = zoneShortfall(plan, ['a', 'b', 'c', 'd'], 10);
    expect(out.map(({ zone, have, need }) => [zone.id, have, need])).toEqual([['door', 3, 0], ['bar', 1, 2], ['seats', 0, 2], ['terrace', 0, 2]]);
  });
});
