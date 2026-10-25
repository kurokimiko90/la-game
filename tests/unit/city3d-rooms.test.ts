import { describe, expect, it } from 'vitest';
import { createCollider, type CityBuilding } from '@/lib/city3d/collision';
import { carveRooms, ringArea, roomAt, type StreetRoom } from '@/lib/city3d/rooms';
import type { StreetFrame } from '@/lib/city3d/street-frame';

// 街道沿 +x，v 往 +z：u = x、v = z
const frame: StreetFrame = { origin: [0, 0], dir: [1, 0] };
const block: CityBuilding = { id: 'b', height: 20, outers: [[[0, 10], [40, 10], [40, 30], [0, 30]]] };
const room: StreetRoom = { id: 'shop', u0: 5, u1: 15, v0: 10, v1: 18, height: 4, door: [9, 11] };

describe('carveRooms', () => {
  const carved = carveRooms([block], frame, [room]);
  const ground = carved.find((b) => b.id === 'b')!;
  const upper = carved.find((b) => b.id === 'b~shop')!;

  it('keeps total ground area minus the room', () => {
    const area = ground.outers.reduce((s, r) => s + ringArea(r), 0);
    expect(area).toBeCloseTo(40 * 20 - 10 * 8);
  });

  it('puts the floors above the room on a raised base', () => {
    expect(ringArea(upper.outers[0])).toBeCloseTo(80);
    expect(upper.base).toBe(4);
    expect(upper.height).toBe(20);
  });

  it('lets the player walk into the room but not through the rest', () => {
    const collider = createCollider(carved, [-100, -100, 100, 100]);
    expect(collider.blocked(10, 14)).toBe(false);
    expect(collider.blocked(20, 14)).toBe(true);
    expect(collider.blocked(10, 20)).toBe(true);
  });

  it('leaves buildings away from rooms untouched', () => {
    const far: CityBuilding = { id: 'far', height: 10, outers: [[[100, 100], [110, 100], [110, 110], [100, 110]]] };
    expect(carveRooms([far], frame, [room])).toEqual([far]);
  });
});

describe('roomAt', () => {
  it('finds the room in street coordinates', () => {
    expect(roomAt([room], frame, 10, 12)?.id).toBe('shop');
    expect(roomAt([room], frame, 10, 9)).toBeNull();
  });
});

describe('roomAt margin', () => {
  it('excludes the strip next to the walls', () => {
    expect(roomAt([room], frame, 10, 10.2, 0.45)).toBeNull();
    expect(roomAt([room], frame, 10, 11, 0.45)?.id).toBe('shop');
  });
});
