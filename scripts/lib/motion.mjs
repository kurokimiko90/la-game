// 物件動態：預設類型 + 每個物件的參數（週期、相位、幅度）。
// 參數在 build 時用 sceneId/itemId 當 seed 算好，每次結果相同；CSS 動畫在 src/app/globals.css 的 .motion--*。
// 規範見 docs/scene-standard.md §3。
import { createRng } from './layout.mjs';

/** dur：一個週期的秒數範圍 */
export const MOTION_PRESETS = {
  sway: { dur: [3, 5] }, // 左右擺（植物、布料），支點在底部
  bob: { dur: [2.5, 4] }, // 上下浮（水上、空中）
  drift: { dur: [5, 7] }, // 8 字形飄（風箏）
  wobble: { dur: [6, 10] }, // 靜止一陣子後抖一下（手機、球、車）
};

/** 會動的物件不能超過場景物件的比例：動得太多，「會動」就變成找東西的線索 */
export const MAX_MOTION_RATIO = 0.3;

const round2 = (n) => Math.round(n * 100) / 100;

/** @returns {{ type: string, dur: number, delay: number, amp: number }} */
export function motionParams(sceneId, itemId, type) {
  const preset = MOTION_PRESETS[type];
  if (!preset) throw new Error(`${sceneId}/${itemId}：未知的動態類型 ${type}（可用：${Object.keys(MOTION_PRESETS).join(', ')}）`);
  const rng = createRng(`motion:${sceneId}/${itemId}`);
  const [lo, hi] = preset.dur;
  const dur = round2(lo + rng() * (hi - lo));
  return { type, dur, delay: round2(-rng() * dur * 0.99), amp: round2(0.8 + rng() * 0.4) };
}

export function checkMotionBudget(motion, itemCount) {
  const count = Object.keys(motion).length;
  const max = Math.floor(itemCount * MAX_MOTION_RATIO);
  if (count > max) throw new Error(`會動的物件有 ${count} 個，超過上限 ${max}（物件數 ${itemCount} × ${MAX_MOTION_RATIO}）`);
}
