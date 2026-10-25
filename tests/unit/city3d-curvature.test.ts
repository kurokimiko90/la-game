import { describe, expect, it } from 'vitest';
import { CURVE_K, bendY, curveAmount, curveGLSL, unbendY } from '@/lib/city3d/curvature';

describe('curvature', () => {
  it('bends fully near the ground and not at all from bird view / sun height', () => {
    expect(curveAmount(5)).toBe(CURVE_K);
    expect(curveAmount(110)).toBe(0);
    expect(curveAmount(120)).toBe(0);
    expect(curveAmount(32.5)).toBeCloseTo(CURVE_K / 2);
  });

  it('drops farther things more and unbend is the exact inverse', () => {
    expect(bendY(0, 30, 0, CURVE_K)).toBeCloseTo(-0.9);
    expect(bendY(0, 60, -80, CURVE_K)).toBeCloseTo(-10);
    expect(unbendY(bendY(1.7, -20, 37, CURVE_K), -20, 37, CURVE_K)).toBeCloseTo(1.7);
  });

  it('emits GLSL with the same constants', () => {
    expect(curveGLSL('mv')).toContain(CURVE_K.toFixed(4));
    expect(curveGLSL('mv')).toContain('mv.xyz -=');
  });
});
