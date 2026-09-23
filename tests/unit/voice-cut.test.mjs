import { describe, expect, test } from 'vitest';
import {
  bestCut, cutAround, frameEnergy, padClip, renderClip, smooth, trimSegment, wavBuffer,
} from '../../scripts/lib/voice-cut.mjs';

const RATE = 1000; // 每格 10 個樣本，好算
const tone = (ms, amp = 8000) => Array.from({ length: (RATE * ms) / 1000 }, (_, i) => (i % 2 ? amp : -amp));
const hush = (ms) => new Array((RATE * ms) / 1000).fill(0);
const pcm = (...parts) => Int16Array.from(parts.flat());

describe('frameEnergy / smooth', () => {
  test('有聲音的格子大聲、靜音的格子是底值', () => {
    const db = frameEnergy(pcm(tone(50), hush(50)), RATE);
    expect(db).toHaveLength(10);
    expect(db[0]).toBeGreaterThan(-15);
    expect(db[9]).toBe(-90);
  });

  test('smooth 在功率域平均，邊界不越界', () => {
    const s = smooth(Float64Array.from([-90, 0, -90]), 1);
    expect(s[0]).toBeCloseTo(-3, 0);
    expect(s[1]).toBeCloseTo(-4.8, 0);
  });
});

describe('bestCut', () => {
  test('挑最安靜的格子', () => {
    const db = Float64Array.from([-20, -20, -60, -20, -20, -20, -20]);
    expect(bestCut(db, 4, 3, 0)).toBe(2);
  });

  test('一樣安靜時，離中心近的贏（不跑去下一個詞的塞音閉塞段）', () => {
    const db = Float64Array.from([-60, -20, -20, -20, -20, -20, -59, -20]);
    expect(bestCut(db, 5, 5, 0.5)).toBe(6);
  });

  test('範圍夾在陣列內', () => {
    expect(bestCut(Float64Array.from([-10, -50]), 5, 10)).toBe(1);
  });
});

describe('trimSegment', () => {
  test('去頭去尾的靜音並留一點餘裕', () => {
    const db = Float64Array.from([-90, -90, -90, -10, -10, -90, -90, -90, -90, -90]);
    expect(trimSegment(db, 0, 10, { padBefore: 1, padAfter: 2 })).toEqual({ from: 2, to: 7 });
  });
});

describe('cutAround', () => {
  // 三個詞：0–200ms、260–460ms、520–720ms，中間各 60ms 靜音（ChatGPT 念詞表大概就這麼快）
  const samples = pcm(tone(200), hush(60), tone(200), hush(60), tone(200), hush(100));
  const db = frameEnergy(samples, RATE);

  test('whisper 時間偏了也切在停頓裡', () => {
    const spans = [{ from: 0, to: 0.27 }, { from: 0.27, to: 0.5 }, { from: 0.5, to: 0.74 }];
    const segs = cutAround(db, spans);
    expect(segs[0].to).toBeLessThanOrEqual(26);
    expect(segs[1].from).toBeGreaterThanOrEqual(20);
    expect(segs[1].to).toBeLessThanOrEqual(52);
    expect(segs[2].from).toBeGreaterThanOrEqual(46);
  });

  test('沒對上的詞不切（null），旁邊的詞仍然切得出來', () => {
    const segs = cutAround(db, [{ from: 0, to: 0.2 }, null, { from: 0.52, to: 0.72 }]);
    expect(segs[1]).toBeNull();
    expect(segs[0].to).toBeLessThanOrEqual(26);
    expect(segs[2].from).toBeGreaterThanOrEqual(46);
  });
});

describe('renderClip / padClip / wavBuffer', () => {
  test('取出片段、峰值拉到 -2dB、頭尾淡出成 0，不改原樣本', () => {
    const samples = pcm(hush(20), tone(100, 1000), hush(20));
    const before = samples.slice();
    const clip = renderClip(samples, RATE, { from: 2, to: 12 });
    expect(clip).toHaveLength(100);
    expect(Math.max(...clip.map(Math.abs))).toBeGreaterThan(26000);
    expect(clip[0]).toBe(0);
    expect(clip[clip.length - 1]).toBe(0);
    expect(samples).toEqual(before);
  });

  test('padClip 前後補靜音', () => {
    const out = padClip(Int16Array.from([5, 5]), RATE, 3);
    expect(Array.from(out)).toEqual([0, 0, 0, 5, 5, 0, 0, 0]);
  });

  test('wavBuffer 是 16-bit 單聲道 WAV', () => {
    const buf = wavBuffer(Int16Array.from([1, -1]), 24000);
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.readUInt32LE(24)).toBe(24000);
    expect(buf.readUInt32LE(40)).toBe(4);
    expect(buf.readInt16LE(46)).toBe(-1);
  });
});
