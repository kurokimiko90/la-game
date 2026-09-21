// 背景重複元素（樹叢、建築、窗戶、草叢）的位置：平均分格再用 seed 抖動，看起來不等距但每次都一樣。
import { createRng } from './rng';

export interface ScatterPoint {
  x: number;
  /** 0–1 的亂數，給呼叫端決定大小、顏色等變化 */
  r: number;
}

export function scatter(seed: number, count: number, x0: number, x1: number, jitter = 0.4): ScatterPoint[] {
  const rng = createRng(seed);
  const slot = (x1 - x0) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(x0 + slot * (i + 0.5) + (rng() - 0.5) * slot * jitter),
    r: rng(),
  }));
}
