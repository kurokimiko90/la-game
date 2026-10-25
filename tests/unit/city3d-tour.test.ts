import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SHOT_TIME, TURN_TIME, WALK_SPEED, WALK_V, dwellOf, jumpTo, lookTarget, pathLength, planTour, pointAlong,
  shotIndex, startTour, stepTour, tourPose, type TourStop,
} from '@/lib/city3d/guided-tour';
import type { StreetRoom } from '@/lib/city3d/rooms';
import { carveRooms } from '@/lib/city3d/rooms';
import { createCollider, type Bounds, type CityBuilding } from '@/lib/city3d/collision';
import { footprintBox, hitsFootprint, type Footprint } from '@/lib/city3d/footprint';
import { poseOf, toWorld } from '@/lib/city3d/street-frame';
import { buildModel } from '@/components/city3d/toon';
import { buildRoom } from '@/components/city3d/ginzaRooms';
import { GINZA_STREET } from '@/data/city3d/ginza-street';
import { GINZA_TOUR } from '@/data/city3d/ginza-tour';
import { STREET_FIXTURES, STREET_MODELS } from '@/data/city3d/street-models';
import street from '@/data/scenes/street.json';

const round = (path: [number, number][]) => path.map(([u, v]) => [Math.round(u * 1e6) / 1e6, Math.round(v * 1e6) / 1e6]);
const room: StreetRoom = { id: 'r', u0: 10, u1: 20, v0: 16.8, v1: 25, height: 4, door: [12, 14] };

describe('planTour', () => {
  it('walks along the sidewalk line between outdoor stops', () => {
    const stops = planTour([
      { id: 'a', zone: 'z', stand: { u: 0, v: 13.3 }, items: ['x'] },
      { id: 'b', zone: 'z', stand: { u: 8, v: 14 }, items: ['y'] },
    ], []);
    expect(stops[0].path).toEqual([[0, 13.3]]);
    expect(stops[1].path).toEqual([[0, 13.3], [8, WALK_V], [8, 14]]);
  });

  it('goes in and out of rooms through the door', () => {
    const stops = planTour([
      { id: 'a', zone: 'z', stand: { u: 0, v: 13.3 }, items: [] },
      { id: 'b', zone: 'z', stand: { u: 18, v: 22 }, items: [] },
      { id: 'c', zone: 'z', stand: { u: 30, v: 13.3 }, items: [] },
    ], [room]);
    expect(round(stops[1].path)).toEqual([[0, 13.3], [13, WALK_V], [13, 15.6], [13, 18], [18, 18], [18, 22]]);
    expect(round(stops[2].path)).toEqual([[18, 22], [18, 18], [13, 18], [13, 15.6], [13, WALK_V], [30, 13.3]]);
  });

  it('moves straight between stops in the same room', () => {
    const stops = planTour([
      { id: 'a', zone: 'z', stand: { u: 12, v: 20 }, items: [] },
      { id: 'b', zone: 'z', stand: { u: 18, v: 22 }, items: [] },
    ], [room]);
    expect(stops[1].path).toEqual([[12, 20], [18, 22]]);
  });
});

describe('pointAlong', () => {
  it('interpolates along segments', () => {
    const p = [[0, 0], [10, 0], [10, 10]] as [number, number][];
    expect(pathLength(p)).toBe(20);
    expect(pointAlong(p, 15)).toEqual({ position: [10, 5], dir: [0, 1] });
    expect(pointAlong(p, 99).position).toEqual([10, 10]);
  });
});

describe('tour state machine', () => {
  const stops: TourStop[] = planTour([
    { id: 'a', zone: 'z', stand: { u: 0, v: 13.3 }, items: ['x', 'y'] },
    { id: 'b', zone: 'z', stand: { u: 13, v: 13.3 }, items: ['w'] },
  ], []);

  it('starts by teleporting to the first stop', () => {
    const t = startTour(stops);
    expect(t).toMatchObject({ index: 0, phase: 'turning', cut: true });
    expect(tourPose(t, stops).position).toEqual([0, 13.3]);
  });

  it('turns, looks at each item, then walks to the next stop', () => {
    let t = stepTour(startTour(stops), stops, TURN_TIME + 0.01);
    expect(t.phase).toBe('looking');
    expect(lookTarget(t, stops)).toBe('x');
    t = stepTour(t, stops, SHOT_TIME);
    expect(shotIndex(t, stops[0])).toBe(1);
    expect(lookTarget(t, stops)).toBe('y');
    t = stepTour(t, stops, dwellOf(stops[0]));
    expect(t).toMatchObject({ index: 1, phase: 'walking', cut: false });
    expect(lookTarget(t, stops)).toBeNull();
    t = stepTour(t, stops, 1);
    expect(tourPose(t, stops).position[0]).toBeCloseTo(WALK_SPEED);
    expect(tourPose(t, stops).dir).toEqual([1, 0]);
  });

  it('finishes after the last stop and does not advance while paused', () => {
    const paused = { ...jumpTo(stops, 1), paused: true };
    expect(stepTour(paused, stops, 10)).toBe(paused);
    let t = stepTour(jumpTo(stops, 1), stops, TURN_TIME + 0.01);
    t = stepTour(t, stops, SHOT_TIME + 0.01);
    expect(t.finished).toBe(true);
    expect(stepTour(t, stops, 1)).toBe(t);
  });

  it('clamps jumps to the stop range', () => {
    expect(jumpTo(stops, -3).index).toBe(0);
    expect(jumpTo(stops, 9).index).toBe(1);
  });
});

describe('GINZA_TOUR', () => {
  const set = GINZA_STREET;
  const stops = planTour(GINZA_TOUR, set.rooms);

  it('covers every street item exactly once, in its own zone', () => {
    const ids = GINZA_TOUR.flatMap((s) => s.items);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(street.items.map((it) => it.id).sort());
    const zoneOf = new Map(street.items.map((it) => [it.id, it.zone]));
    for (const stop of GINZA_TOUR) for (const id of stop.items) expect(zoneOf.get(id), `${stop.id}/${id}`).toBe(stop.zone);
  });

  it('keeps every path clear of buildings, items, fixtures and room walls', () => {
    const city = JSON.parse(readFileSync(path.join(process.cwd(), 'public/city3d/ginza/city.json'), 'utf8')) as { buildings: CityBuilding[]; bounds: Bounds };
    const collider = createCollider(carveRooms(city.buildings, set.frame, set.rooms), city.bounds);
    const blockers: { foot: Footprint; name: string }[] = [];
    const add = (spot: (typeof set.items)[number] | (typeof set.fixtures)[number], name: string, model = STREET_MODELS[name] ?? STREET_FIXTURES[name]) => {
      if (!model) return;
      const pose = poseOf(set.frame, spot);
      const box = footprintBox(buildModel(model).geometry.attributes.position.array, pose.y);
      if (box) blockers.push({ foot: { ...box, x: pose.x, z: pose.z, yaw: pose.yaw }, name });
    };
    for (const it of set.items) add(it, it.id);
    for (const fx of set.fixtures) add(fx, fx.model);
    for (const r of set.rooms) for (const foot of buildRoom(set.frame, r, r.style).blockers) blockers.push({ foot, name: `${r.id} wall` });

    for (const stop of stops) {
      const len = pathLength(stop.path);
      for (let d = 0; d <= len; d += 0.15) {
        const [u, v] = pointAlong(stop.path, d).position;
        const [x, z] = toWorld(set.frame, u, v);
        const where = `${stop.id} @ u ${u.toFixed(1)}, v ${v.toFixed(1)}`;
        expect(collider.blockedCircle(x, z, 0.35), `${where} 撞到建築`).toBe(false);
        const hit = blockers.find((b) => hitsFootprint(b.foot, x, z, 0.35));
        expect(hit?.name, `${where} 撞到物件`).toBeUndefined();
      }
    }
  });
});
