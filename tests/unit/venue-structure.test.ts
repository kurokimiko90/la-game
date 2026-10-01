import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { VENUE_PLANS } from '../../src/components/scene/districts/VenueStructure';

const source = JSON.parse(fs.readFileSync(path.resolve('content/scene-config.json'), 'utf8')) as {
  scenes: Record<string, { terrain?: { zones: { id: string }[]; venue?: { zones: Record<string, string[]> } } }>;
};
const handBuilt = new Set(['school', 'classroom', 'zoo', 'botanical-garden', 'home']);

describe('venue structures', () => {
  // 手畫過的街區在 VENUE_PLANS；自動擴展的新街區由 codex 挑、存在 terrain.venue（src/lib/venue.ts）
  test('every generated venue and zone has an architectural treatment', () => {
    const generated = Object.entries(source.scenes).filter(([id, scene]) => scene.terrain && !handBuilt.has(id));
    for (const id of Object.keys(VENUE_PLANS)) expect(generated.map(([g]) => g)).toContain(id);
    for (const [id, scene] of generated) {
      const plan = VENUE_PLANS[id] ?? scene.terrain!.venue;
      expect(plan, `${id} 沒有場所結構`).toBeDefined();
      expect(Object.keys(plan!.zones).sort()).toEqual(scene.terrain!.zones.map((zone) => zone.id).sort());
      expect(Object.values(plan!.zones).every((motifs) => motifs.length > 0)).toBe(true);
    }
  });

  test('venue plans do not collapse into the same sequence of motifs', () => {
    const signatures = Object.values(VENUE_PLANS).map((plan) => Object.values(plan.zones).flat().join(','));
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
