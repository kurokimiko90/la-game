import { describe, expect, test } from 'vitest';
import { checkSitePlan } from '../../scripts/lib/site-plan.mjs';

const feature = { id: 'lotus-pond', kind: 'pond', x0: 100, y0: 100, x1: 300, y1: 250, items: ['lotus'] };
const fixture = (details = [feature]) => ({
  terrain: { zones: [{ id: 'water-garden', x0: 0, y0: 0, x1: 500, y1: 500, details }] },
  items: [{ id: 'lotus', zone: 'water-garden' }],
  placements: [{ id: 'lotus', x: 150, y: 130, w: 80, h: 60 }],
});

describe('real-world site constraints', () => {
  test('aquatic plant stays in its pond; paving placement is rejected', () => {
    expect(checkSitePlan(fixture())).toEqual([]);
    const input = fixture();
    input.placements[0].x = 340;
    expect(checkSitePlan(input)).toContain('lotus：底線必須位於 lotus-pond（pond）內');
  });

  test('assignment to an exhibit in a different zone is rejected', () => {
    const input = fixture([{ ...feature, kind: 'habitat' }]);
    input.items[0].zone = 'other-exhibit';
    expect(checkSitePlan(input)).toContain('lotus-pond：lotus 不在區域 water-garden');
  });

  test('targets cannot occupy the visitor route', () => {
    expect(checkSitePlan(fixture([{ ...feature, id: 'visitor-path', kind: 'path', items: [] }]))).toContain('lotus：擋住走道 visitor-path');
  });

  test('missing placements and unknown assigned objects fail', () => {
    const input = fixture();
    input.placements = [];
    expect(checkSitePlan(input)).toHaveLength(1);
    input.items = [];
    expect(checkSitePlan(input)).toContain('lotus-pond：lotus 不在區域 water-garden');
  });

  test('malformed, duplicated, and out-of-zone features fail', () => {
    const input = fixture([
      { ...feature, x0: NaN },
      { ...feature, x1: 800, kind: 'unknown' },
    ]);
    expect(checkSitePlan(input)).toEqual(expect.arrayContaining([
      'lotus-pond：範圍必須是有效矩形',
      '地形 id 缺少或重複：lotus-pond',
      'lotus-pond：未知地形 unknown',
      'lotus-pond：超出所屬區域 water-garden',
    ]));
  });

  test('existing districts without details remain valid', () => {
    expect(checkSitePlan({ ...fixture(), terrain: undefined })).toEqual([]);
    expect(checkSitePlan(fixture([]))).toEqual([]);
  });
});
