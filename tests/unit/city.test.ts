import { describe, expect, test } from 'vitest';
import { buildCity, colX, CORE, rowY, SLOT, STREET } from '@/lib/city';
import type { Rect } from '@/lib/town';

const core: Rect = { x0: 0, y0: 0, x1: CORE.w, y1: CORE.h };
const slot = (i: number, j: number): Rect => ({ x0: colX(i), y0: rowY(j), x1: colX(i) + SLOT.w, y1: rowY(j) + SLOT.h });
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('buildCity', () => {
  const districts = [core, slot(1, 0), slot(1, 1), slot(0, 2), slot(1, 2)];
  const city = buildCity(districts);

  test('街道不壓到任何街區', () => {
    for (const s of city.streets) for (const d of districts) expect(overlaps(s, d), `${s.id}`).toBe(false);
  });

  test('每個街區至少一面臨街', () => {
    const touches = (d: Rect, s: Rect) => (s.x0 === d.x1 || s.x1 === d.x0 || s.y0 === d.y1 || s.y1 === d.y0) && overlaps({ x0: d.x0 - 1, y0: d.y0 - 1, x1: d.x1 + 1, y1: d.y1 + 1 }, s);
    for (const d of districts.slice(1)) expect(city.streets.some((s) => touches(d, s))).toBe(true);
  });

  test('核心南邊：路 + 站前廣場，河上有橋', () => {
    expect(city.streets.find((s) => s.kind === 'plaza')).toMatchObject({ y0: CORE.h + STREET, y1: rowY(2) });
    expect(city.bridges.length).toBeGreaterThanOrEqual(2);
  });

  test('圓環在車站東北的路口', () => {
    expect(city.roundabout).toEqual({ x0: colX(1) - STREET, x1: colX(1), y0: rowY(2) - STREET, y1: rowY(2) });
  });

  test('環路和邊緣在內側範圍外', () => {
    expect(city.inner).toEqual({ w: colX(1) + SLOT.w, h: rowY(2) + SLOT.h });
    expect(city.coast.sand).toBe(city.inner.h + STREET);
    expect(city.hills).toBe(city.inner.w + STREET);
  });

  test('沒有街區的格子是空地', () => {
    const c = buildCity([core, slot(1, 0), slot(1, 2)]);
    expect(c.vacant).toEqual([slot(0, 2), slot(1, 1)]);
  });
});
