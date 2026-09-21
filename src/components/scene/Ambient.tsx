// 背景動態元件（規範 docs/scene-standard.md §3.3）：各場景背景挑來組合。
// 全部純裝飾、不可點，而且不能長得像單字物品（例如不畫鳥）。CSS 在 globals.css 的 .amb-*，
// 相位用 scatter 的亂數錯開，每次載入都一樣。
import type { CSSProperties, ReactNode } from 'react';
import { scatter } from '@/lib/scatter';

const timing = (dur: number, r: number): CSSProperties => ({ animationDuration: `${dur}s`, animationDelay: `${(-r * dur).toFixed(2)}s` });

interface AreaProps {
  seed: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  count: number;
  color: string;
  /** 排除某些位置（例如沙坑、步道） */
  skip?: (x: number, y: number) => boolean;
  /** 沿 y 分布（直的河） */
  vertical?: boolean;
}

export function WaterShimmer({ seed, x0, x1, y0, y1, count, color, skip, vertical = false }: AreaProps) {
  const points = vertical
    ? scatter(seed, count, y0, y1, 0.9).map(({ x: y, r }) => ({ x: Math.round(x0 + r * (x1 - x0 - 60)), y, r }))
    : scatter(seed, count, x0, x1, 0.9).map(({ x, r }) => ({ x, y: Math.round(y0 + r * (y1 - y0)), r }));
  return (
    <g stroke={color} strokeWidth={4} strokeLinecap="round">
      {points.map(({ x, y, r }, i) => {
        if (skip?.(x, y)) return null;
        const len = 50 + Math.round(r * 60);
        return <line key={i} className="amb amb-shimmer" style={timing(4 + r * 3, r)} x1={x} y1={y} x2={x + len} y2={y} />;
      })}
    </g>
  );
}

export function SwayTufts({ seed, x0, x1, y0, y1, count, color, skip }: AreaProps) {
  return (
    <g fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
      {scatter(seed, count, x0, x1, 0.9).map(({ x, r }, i) => {
        const y = Math.round(y0 + ((r * 7.3) % 1) * (y1 - y0));
        if (skip?.(x, y)) return null;
        const s = 0.8 + r * 0.6;
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${s.toFixed(2)})`}>
            <polyline className="amb amb-sway" style={timing(3 + r * 2, r)} points="-8,0 -10,-14 -4,0 0,-18 4,0 10,-13 8,0" />
          </g>
        );
      })}
    </g>
  );
}

/** 明暗變化（太陽、燈光、窗戶） */
export function Glow({ dur = 4, phase = 0, children }: { dur?: number; phase?: number; children: ReactNode }) {
  return <g className="amb amb-glow" style={timing(dur, phase)}>{children}</g>;
}

/** 吊著的東西小幅擺動，支點在上緣中間 */
export function HangSwing({ dur = 3.5, phase = 0, children }: { dur?: number; phase?: number; children: ReactNode }) {
  return <g className="amb amb-swing" style={timing(dur, phase)}>{children}</g>;
}
