// 找到物品時從物品中心噴出的彩色粒子（畫在地圖座標裡，TownCanvas 的 worldLayer）。
// 連擊越高，粒子越多、飛得越遠。
import type { CSSProperties } from 'react';

const COLORS = ['#ffb300', '#00897b', '#ef5350', '#42a5f5', '#ab47bc', '#ffee58'];
const BASE_BITS = 10;
const MAX_BITS = 22;

interface FoundBurstProps {
  x: number;
  y: number;
  /** 物品的大小（地圖座標），決定噴多遠 */
  size: number;
  combo: number;
}

export function FoundBurst({ x, y, size, combo }: FoundBurstProps) {
  const count = Math.min(MAX_BITS, BASE_BITS + Math.max(0, combo - 1) * 3);
  const reach = Math.max(80, size * 0.9) * (1 + Math.min(combo, 6) * 0.08);
  const bit = Math.max(9, size * 0.07);
  return (
    <g>
      <circle cx={x} cy={y} r={reach * 0.6} fill="none" stroke="#ffffff" strokeWidth={bit * 0.6} className="burst-ring" />
      {Array.from({ length: count }, (_, i) => {
        // 平均分布再加一點固定的錯位，看起來自然但每次一樣（不用亂數）
        const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.35;
        const dist = reach * (0.7 + ((i * 37) % 10) / 25);
        const style = {
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist - reach * 0.25}px`,
          '--rot': `${(i % 2 ? 1 : -1) * (90 + i * 20)}deg`,
          '--dur': `${0.65 + (i % 4) * 0.08}s`,
        } as CSSProperties;
        const color = COLORS[i % COLORS.length];
        return i % 3 === 0 ? (
          <path key={i} className="burst-bit" style={style} fill={color}
            d={starPath(x, y, bit * 1.3, bit * 0.55)} />
        ) : (
          <circle key={i} className="burst-bit" style={style} cx={x} cy={y} r={bit * (i % 2 ? 0.6 : 0.85)} fill={color} />
        );
      })}
    </g>
  );
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  });
  return `M${pts.join('L')}Z`;
}
