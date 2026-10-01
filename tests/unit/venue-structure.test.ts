import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { VENUE_PLANS } from '../../src/components/scene/districts/VenueStructure';

const source = JSON.parse(fs.readFileSync(path.resolve('content/scene-config.json'), 'utf8')) as {
  scenes: Record<string, { terrain?: { zones: { id: string }[] } }>;
};
const handBuilt = new Set(['school', 'classroom', 'zoo', 'botanical-garden', 'home']);

describe('venue structures', () => {
  test('every generated venue and zone has an architectural treatment', () => {
    const generated = Object.entries(source.scenes).filter(([id, scene]) => scene.terrain && !handBuilt.has(id));
    expect(Object.keys(VENUE_PLANS).sort()).toEqual(generated.map(([id]) => id).sort());
    for (const [id, scene] of generated) {
      expect(Object.keys(VENUE_PLANS[id].zones).sort()).toEqual(scene.terrain!.zones.map((zone) => zone.id).sort());
      expect(Object.values(VENUE_PLANS[id].zones).every((motifs) => motifs.length > 0)).toBe(true);
    }
  });

  test('venue plans do not collapse into the same sequence of motifs', () => {
    const signatures = Object.values(VENUE_PLANS).map((plan) => Object.values(plan.zones).flat().join(','));
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
