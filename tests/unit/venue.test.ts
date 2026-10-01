import { describe, expect, it } from 'vitest';
import { MOTIFS, WALL_STYLES, buildVenuePrompt, parseVenue } from '@/lib/venue';

const zones = [
  { id: 'pool-entrance', name: '泳池入口', indoor: false },
  { id: 'changing-room', name: '更衣室', indoor: true },
];

describe('buildVenuePrompt', () => {
  it('列出區域與可選的牆面、圖案', () => {
    const p = buildVenuePrompt('游泳池', zones);
    expect(p).toContain('pool-entrance（泳池入口，室外）');
    expect(p).toContain(WALL_STYLES.join('、'));
    expect(p).toContain(MOTIFS.join('、'));
  });
});

describe('parseVenue', () => {
  it('合法的照收', () => {
    const raw = '{"accent":"#7fa8c9","wall":"clinical","zones":{"pool-entrance":["arrival"],"changing-room":["wash","service"]}}';
    expect(parseVenue(raw, zones)).toEqual({ accent: '#7fa8c9', wall: 'clinical', zones: { 'pool-entrance': ['arrival'], 'changing-room': ['wash', 'service'] } });
  });
  it('不合法的換成預設：顏色、牆面、不認得的圖案；缺的區域補上（室外 arrival、室內 service）', () => {
    const raw = 'x {"accent":"blue","wall":"marble","zones":{"pool-entrance":["lava"]}}';
    expect(parseVenue(raw, zones)).toEqual({ accent: '#9aa7b0', wall: 'glass', zones: { 'pool-entrance': ['arrival'], 'changing-room': ['service'] } });
  });
  it('解析不了：全部用預設', () => {
    expect(parseVenue('沒有 JSON', zones).zones).toEqual({ 'pool-entrance': ['arrival'], 'changing-room': ['service'] });
  });
});
