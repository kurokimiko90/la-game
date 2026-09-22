import { describe, expect, it } from 'vitest';
import { inline, upsertScene } from '../../scripts/lib/config-writer.mjs';

const BASE = `{
  "world": {"width": 3600, "height": 2600},
  "order": ["park"],
  "scenes": {
    "park": {
      "name": "公園",
      "zones": {"entrance": [0, 0, 650, 1130]},
      "place": {"kite": "sky"}
    }
  }
}
`;
const cfg = { name: '車站', zones: { plaza: [0, 2600, 1300, 3250] }, bands: { ground: { top: 1 }, 'wall-hall': { levels: [2780] } }, place: { poster: 'wall-hall' }, loose: [] };

describe('inline', () => {
  it('單行、冒號和逗號後有空格、括號內不留空格', () => {
    expect(inline({ a: [1, 2], b: { c: 'x' }, d: [] })).toBe('{"a": [1, 2], "b": {"c": "x"}, "d": []}');
  });
});

describe('upsertScene', () => {
  it('插入新場景、更新 world 與 order，既有場景的文字不動', () => {
    const out = upsertScene(BASE, 'station', cfg, { world: { width: 3600, height: 3900 }, order: ['park', 'station'] });
    const json = JSON.parse(out);
    expect(json.world).toEqual({ width: 3600, height: 3900 });
    expect(json.order).toEqual(['park', 'station']);
    expect(json.scenes.station).toEqual(cfg);
    expect(out).toContain('    "park": {\n      "name": "公園",\n      "zones": {"entrance": [0, 0, 650, 1130]},\n      "place": {"kite": "sky"}\n    },');
    expect(out).toContain('      "bands": {\n        "ground": {"top": 1},\n        "wall-hall": {"levels": [2780]}\n      },');
  });

  it('場景已存在就整塊換掉', () => {
    const once = upsertScene(BASE, 'station', cfg, { world: { width: 3600, height: 3900 }, order: ['park', 'station'] });
    const twice = upsertScene(once, 'station', { ...cfg, name: '新車站' }, { world: { width: 3600, height: 3900 }, order: ['park', 'station'] });
    expect(JSON.parse(twice).scenes.station.name).toBe('新車站');
    expect(twice.match(/"station": \{/g)).toHaveLength(1);
  });

  it('可以取代手寫的場景（大括號配對略過字串）', () => {
    const out = upsertScene(BASE, 'park', { name: '有{括號}的公園' }, { world: { width: 3600, height: 2600 }, order: ['park'] });
    expect(JSON.parse(out).scenes.park).toEqual({ name: '有{括號}的公園' });
  });
});
