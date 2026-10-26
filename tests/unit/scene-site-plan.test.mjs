import { describe, expect, test } from 'vitest';
import { applySceneSitePlan } from '../../scripts/lib/scene-site-plan.mjs';

const zone = (id, indoor = false) => ({ id, indoor, x0: 0, y0: 0, x1: 1000, y1: 600 });

describe('automatic district site plans', () => {
  test('adds a platform edge but no generic queue or seating blocks (stages draw the real furniture)', () => {
    const config = { scenes: { station: { terrain: { zones: [zone('ticket-hall', true), zone('platform')] } } } };
    const planned = applySceneSitePlan(config);
    const [hall, platform] = planned.scenes.station.terrain.zones;
    expect(planned.scenes.station.terrain.sharedShell).toBe(true);
    expect(planned.scenes.station.terrain.structure).toBe('station');
    expect(hall.details).toEqual([]);
    expect(platform.details.map((feature) => feature.id)).toContain('platform-platform-walk');
  });

  test('keeps hand-authored scene and zone details intact', () => {
    const custom = [{ id: 'lion-habitat', kind: 'habitat', x0: 0, y0: 0, x1: 500, y1: 500 }];
    const config = { scenes: {
      zoo: { terrain: { zones: [zone('lion-yard')] } },
      home: { terrain: { zones: [{ ...zone('front-yard'), details: custom }] } },
    } };
    const planned = applySceneSitePlan(config);
    expect(planned.scenes.zoo.terrain.zones[0].details).toBeUndefined();
    expect(planned.scenes.zoo.terrain.sharedShell).toBeUndefined();
    expect(planned.scenes.home.terrain.zones[0].details).toBe(custom);
  });
});
