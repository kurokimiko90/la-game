// 回饋音效：用 Web Audio 即時合成（不用音檔）。連擊越高，找到的音越高。
// 瀏覽器要求使用者互動後才能出聲；第一次呼叫時才建立 AudioContext。

export type SfxKind = 'found' | 'wrong' | 'request' | 'complete' | 'great' | 'close';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function play(notes: readonly Note[]): void {
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? 'triangle';
    osc.frequency.value = n.freq;
    const start = t0 + n.at;
    const peak = n.gain ?? 0.14;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + n.dur + 0.02);
  }
}

// 大調五聲音階：連擊往上爬，聽起來不會刺耳
const PENTA = [0, 2, 4, 7, 9];
const semitone = (base: number, steps: number) => base * 2 ** (steps / 12);
function scaleStep(i: number): number {
  return PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length);
}

export function playSfx(kind: SfxKind, combo = 1): void {
  if (!enabled) return;
  const base = 523.25; // C5
  switch (kind) {
    case 'found': {
      const step = scaleStep(Math.min(Math.max(combo - 1, 0), 9));
      play([
        { freq: semitone(base, step), at: 0, dur: 0.12 },
        { freq: semitone(base, step + 7), at: 0.07, dur: 0.22 },
      ]);
      return;
    }
    case 'wrong':
      play([{ freq: 220, at: 0, dur: 0.12, type: 'sine', gain: 0.08 }, { freq: 196, at: 0.08, dur: 0.14, type: 'sine', gain: 0.07 }]);
      return;
    case 'request':
      play([0, 4, 7, 12].map((s, i) => ({ freq: semitone(base, s), at: i * 0.08, dur: 0.25 })));
      return;
    case 'complete':
      play([0, 4, 7, 12, 16, 19, 24].map((s, i) => ({ freq: semitone(base, s), at: i * 0.075, dur: i === 6 ? 0.6 : 0.2 })));
      return;
    case 'great':
      play([{ freq: semitone(base, 7), at: 0, dur: 0.1 }, { freq: semitone(base, 12), at: 0.08, dur: 0.1 }, { freq: semitone(base, 16), at: 0.16, dur: 0.3 }]);
      return;
    case 'close':
      play([{ freq: semitone(base, 4), at: 0, dur: 0.14, type: 'sine' }, { freq: semitone(base, 2), at: 0.1, dur: 0.2, type: 'sine' }]);
      return;
  }
}
