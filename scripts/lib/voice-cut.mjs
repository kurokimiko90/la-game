// 從「一個場景的單字連續朗讀」切出每個單字（純函式，樣本是 16-bit 單聲道 Int16Array）。
//
// ChatGPT 念單字表很快：詞與詞之間只停 60–250ms，單靠靜音門檻切不準。
// 所以先由 whisper 給每個詞的大概時間（voice-take.alignItems），這裡只在那附近找最安靜的一格下刀，
// 再去頭去尾的靜音。刀位還是可能偏，build-voice 會再逐段用 whisper 驗收。

export const FRAME_MS = 10;
const SILENT_DB = -90;

const toDb = (power) => (power > 0 ? 10 * Math.log10(power) : SILENT_DB);
const frameOf = (sec) => Math.round((sec * 1000) / FRAME_MS);

/** 每 frameMs 一格的能量（dBFS） */
export function frameEnergy(samples, rate, frameMs = FRAME_MS) {
  const size = Math.round((rate * frameMs) / 1000);
  const n = Math.floor(samples.length / size);
  return Float64Array.from({ length: n }, (_, f) => {
    let sum = 0;
    for (let i = f * size; i < (f + 1) * size; i++) sum += (samples[i] / 32768) ** 2;
    return Math.max(SILENT_DB, toDb(sum / size));
  });
}

/** 前後 radius 格平均（在功率域平均，再轉回 dB） */
export function smooth(db, radius = 1) {
  return Float64Array.from(db, (_, t) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, t - radius); k <= Math.min(db.length - 1, t + radius); k++) {
      sum += 10 ** (db[k] / 10);
      count++;
    }
    return Math.max(SILENT_DB, toDb(sum / count));
  });
}

/**
 * 在 center 附近 ±radius 格裡挑刀位：越安靜越好，離 center 越遠扣越多（每格 slope dB）。
 * 距離扣分是為了不跑去下一個詞裡的塞音閉塞段（Kite 的 k、t 前也有 50–80ms 的靜音）。
 */
export function bestCut(db, center, radius, slope = 0.5) {
  const a = Math.max(0, center - radius);
  const b = Math.min(db.length - 1, center + radius);
  let best = Math.max(0, Math.min(db.length - 1, center));
  let bestCost = Infinity;
  for (let t = a; t <= b; t++) {
    const cost = db[t] + slope * Math.abs(t - center);
    if (cost < bestCost) { bestCost = cost; best = t; }
  }
  return best;
}

/** 段落內去頭去尾的靜音：留下高於（段落峰值 − rangeDb）的部分，前後各留 pad 格 */
export function trimSegment(db, from, to, { rangeDb = 35, padBefore = 3, padAfter = 6 } = {}) {
  const part = db.slice(from, to);
  const peak = Math.max(...part);
  const threshold = peak - rangeDb;
  const first = part.findIndex((x) => x > threshold);
  let last = part.length - 1;
  while (last > first && part[last] <= threshold) last--;
  return { from: Math.max(from, from + first - padBefore), to: Math.min(to, from + last + 1 + padAfter) };
}

/**
 * 每個對上的詞切一段（frame）。spans：{ from, to }（秒，whisper 給的）或 null（沒對上，不切）。
 * 相鄰兩個詞都對上時共用一刀，找它們 whisper 邊界附近最安靜的點；
 * 旁邊的詞沒對上（漏念或聽不出來）就只在自己的詞頭 / 詞尾附近找。
 */
export function cutAround(db, spans, { radius = 0.3, edge = 0.25 } = {}) {
  const s = smooth(db, 2);
  const r = frameOf(radius);
  const e = frameOf(edge);
  const boundary = (a, b) => bestCut(s, frameOf((a.to + b.from) / 2), r);
  return spans.map((sp, i) => {
    if (!sp) return null;
    const prev = spans[i - 1];
    const next = spans[i + 1];
    const start = prev ? boundary(prev, sp) : bestCut(s, frameOf(sp.from) - Math.round(e / 2), e);
    const end = next ? boundary(sp, next) : bestCut(s, frameOf(sp.to) + Math.round(e / 2), e);
    return end - start < 5 ? null : trimSegment(db, start, end + 1);
  });
}

/** 取出一段並加淡入淡出、把峰值拉到 peakDb（回傳新陣列，不改原樣本） */
export function renderClip(samples, rate, { from, to }, { fadeInMs = 8, fadeOutMs = 25, peakDb = -2 } = {}) {
  const size = (rate * FRAME_MS) / 1000;
  const part = samples.slice(Math.round(from * size), Math.round(to * size));
  let peak = 1;
  for (const x of part) peak = Math.max(peak, Math.abs(x));
  const gain = (32767 * 10 ** (peakDb / 20)) / peak;
  const fadeIn = Math.max(1, Math.round((rate * fadeInMs) / 1000));
  const fadeOut = Math.max(1, Math.round((rate * fadeOutMs) / 1000));
  return Int16Array.from(part, (x, i) => {
    const edge = Math.min(1, i / fadeIn, (part.length - 1 - i) / fadeOut);
    return Math.max(-32768, Math.min(32767, Math.round(x * gain * edge)));
  });
}

/** 前後補 padMs 靜音（whisper 對太短、貼邊的音檔容易聽錯） */
export function padClip(clip, rate, padMs = 300) {
  const pad = Math.round((rate * padMs) / 1000);
  const out = new Int16Array(clip.length + pad * 2);
  out.set(clip, pad);
  return out;
}

/** 16-bit PCM 單聲道 WAV */
export function wavBuffer(samples, rate) {
  const header = Buffer.alloc(44);
  const bytes = samples.length * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, bytes)]);
}
