import { describe, expect, it } from 'vitest';
import { mountOf } from '../../scripts/lib/mount.mjs';

describe('mountOf', () => {
  it('wall-* 地帶是掛在牆上', () => expect(mountOf('wall-lobby')).toBe('wall'));
  it('sky-* 地帶是在空中', () => expect(mountOf('sky-entrance')).toBe('air'));
  it('wallbase、backwall、ground、沒有指定都在地上', () => {
    expect(mountOf('wallbase-lobby')).toBeUndefined();
    expect(mountOf('backwall')).toBeUndefined();
    expect(mountOf('ground')).toBeUndefined();
    expect(mountOf(undefined)).toBeUndefined();
  });
});
