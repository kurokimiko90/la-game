// 地圖北緣與東緣的山（和南側的海對應）：北環路以北是 y < 0 的遠景，街區座標不用動（src/lib/city.ts 的 mountains）。
//
//   天空、雲 ─────────────────────────────── 主峰 + 觀景台
//   遠山（藍灰、積雪）                     ╱ 纜車
//   近山（綠）      瀑布 → 高山湖        ╱
//   山腳樹林 ─────────────────────── 山下站
//   ══════════════ 北環路 ══════════════════╗
//                                          ║ 東側：山一座座往南排，到海邊變矮
//
// 東北角的「主峰景點」位置固定（相對地圖右上角），不隨自動擴展改變形狀。
// 山用 3/4 正面畫（遠景、不可點）；樹冠、湖、路仍是俯視，和城市一致。
import type { CSSProperties } from 'react';
import type { City } from '@/lib/city';
import { scatter } from '@/lib/scatter';
import { Glow, SwayTufts, WaterShimmer } from '../Ambient';
import { Canopy } from './CityStreets';

interface Size {
  width: number;
  height: number;
}

interface PeakTone {
  light: string;
  dark: string;
  snow: boolean;
}

const BACK: PeakTone = { light: '#a9bfdc', dark: '#8fa6c6', snow: true };
const FRONT: PeakTone = { light: '#86b86c', dark: '#6a9a55', snow: false };
const EAST: PeakTone = { light: '#8fbf72', dark: '#71a15a', snow: false };
const MAIN: PeakTone = { light: '#b3c7e2', dark: '#94abcb', snow: true };

/** 一座山：左亮右暗（光源左上），山稜有一點鋸齒；snow 時山頂有積雪 */
function Peak({ x, apex, base, hw, tone, seed }: { x: number; apex: number; base: number; hw: number; tone: PeakTone; seed: number }) {
  const h = base - apex;
  const j = ((seed * 9.31) % 1) - 0.5;
  const left = `${x - hw},${base} ${x - hw * 0.55},${base - h * 0.45} ${x - hw * 0.35},${base - h * (0.55 + j * 0.1)} ${x - hw * 0.12},${apex + h * 0.12}`;
  const right = `${x + hw * 0.18},${apex + h * 0.18} ${x + hw * 0.42},${base - h * (0.5 - j * 0.1)} ${x + hw * 0.6},${base - h * 0.4} ${x + hw},${base}`;
  const ridge = `${x},${apex} ${x + hw * 0.05},${apex + h * 0.4} ${x - hw * 0.08},${apex + h * 0.7} ${x + hw * 0.1},${base}`;
  const s = 0.3; // 積雪到山高的幾成
  return (
    <g>
      <polygon points={`${left} ${x},${apex} ${right}`} fill={tone.light} />
      <polygon points={`${x},${apex} ${right} ${ridge.split(' ').reverse().join(' ')}`} fill={tone.dark} />
      {tone.snow && (
        <polygon
          points={`${x},${apex} ${x + hw * 0.26},${apex + h * s} ${x + hw * 0.1},${apex + h * s * 0.75} ${x},${apex + h * s * 0.95} ${x - hw * 0.1},${apex + h * s * 0.7} ${x - hw * 0.24},${apex + h * s}`}
          fill="#f7fbff"
          opacity={0.95}
        />
      )}
    </g>
  );
}

function Cloud({ x, y, k, r }: { x: number; y: number; k: number; r: number }) {
  const style = { '--drift': `${Math.round(60 + r * 80)}px`, animationDuration: `${(26 + r * 18).toFixed(1)}s`, animationDelay: `${(-r * 30).toFixed(1)}s` } as CSSProperties;
  return (
    <g className="amb amb-drift" style={style}>
      <g transform={`translate(${x} ${y}) scale(${k.toFixed(2)})`} fill="#ffffff" opacity={0.9}>
        <ellipse cx={0} cy={0} rx={150} ry={46} />
        <ellipse cx={-70} cy={-26} rx={70} ry={50} />
        <ellipse cx={40} cy={-40} rx={80} ry={60} />
      </g>
    </g>
  );
}

/** 北側：天空 → 遠山 → 近山 → 山腳樹林，一路接到北環路 */
function NorthRange({ city, world }: { city: City; world: Size }) {
  const { top, foot } = city.mountains;
  const x0 = city.west.edge;
  const w = world.width - x0;
  const sky = top + 520;
  return (
    <g>
      <defs>
        <linearGradient id="mtn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd3f0" />
          <stop offset="1" stopColor="#e3f4fb" />
        </linearGradient>
      </defs>
      <rect x={x0} y={top} width={w} height={sky - top + 400} fill="url(#mtn-sky)" />
      <rect x={x0} y={sky + 300} width={w} height={foot - sky - 300} fill="#a5cd73" />
      {scatter(901, Math.round(w / 1600), x0 + 200, world.width - 400, 0.9).map(({ x, r }, i) => <Cloud key={i} x={x} y={top + 110 + r * 160} k={0.7 + r * 0.6} r={r} />)}
      {scatter(902, Math.round(w / 1150), x0 - 200, world.width + 200, 0.85).map(({ x, r }, i) => (
        <Peak key={`b${i}`} x={x} apex={top + 200 + r * 170} base={foot - 380} hw={700 + r * 300} tone={BACK} seed={r + i} />
      ))}
      {scatter(903, Math.round(w / 900), x0 - 200, world.width + 200, 0.85).map(({ x, r }, i) => (
        <Peak key={`f${i}`} x={x} apex={top + 470 + r * 160} base={foot - 230} hw={480 + r * 240} tone={FRONT} seed={r * 3 + i} />
      ))}
      {/* 山腳：起伏的草坡 + 樹林 */}
      <path
        d={`M${x0} ${foot - 290} ${scatter(904, Math.round(w / 700), x0, world.width, 0.6).map(({ x, r }) => `Q${x - 180} ${foot - 360 - r * 60} ${x} ${foot - 300}`).join(' ')} L${world.width} ${foot - 300} L${world.width} ${foot} L${x0} ${foot} Z`}
        fill="#9ccc65"
      />
      {scatter(905, Math.round(w / 110), x0 + 30, world.width - 30, 0.9).map(({ x, r }, i) => <Canopy key={i} x={x} y={foot - 250 + ((r * 7.3) % 1) * 170} r={26 + r * 16} tone={i} />)}
      <SwayTufts seed={906} x0={x0 + 40} x1={world.width - 40} y0={foot - 120} y1={foot - 30} count={Math.round(w / 500)} color="#558b2f" />
    </g>
  );
}

/** 瀑布：山崖上流下來（虛線往下流），落進高山湖 */
function Waterfall({ x, top, lakeY }: { x: number; top: number; lakeY: number }) {
  const flow = (i: number): CSSProperties => ({ animationDuration: `${1.2 + (i % 3) * 0.25}s` });
  return (
    <g>
      <polygon points={`${x - 330},${lakeY - 40} ${x - 250},${top + 60} ${x - 90},${top} ${x + 120},${top + 30} ${x + 260},${top + 120} ${x + 320},${lakeY - 40}`} fill="#8d8a80" />
      <polygon points={`${x + 120},${top + 30} ${x + 260},${top + 120} ${x + 320},${lakeY - 40} ${x + 90},${lakeY - 40}`} fill="#76736a" />
      <ellipse cx={x} cy={lakeY} rx={440} ry={120} fill="#7cc6e8" stroke="#a1887f" strokeWidth={10} />
      <rect x={x - 70} y={top + 10} width={140} height={lakeY - top - 40} rx={30} fill="#b3e5fc" />
      <g stroke="#ffffff" strokeWidth={10} strokeLinecap="round" strokeDasharray="60 60" opacity={0.85}>
        {[-45, -15, 15, 45].map((dx, i) => <line key={dx} className="amb amb-flow" style={flow(i)} x1={x + dx} y1={top + 20} x2={x + dx} y2={lakeY - 30} />)}
      </g>
      <Glow dur={2.2}>
        <ellipse cx={x} cy={lakeY - 20} rx={140} ry={40} fill="#ffffff" opacity={0.8} />
      </Glow>
      <WaterShimmer seed={911} x0={x - 330} x1={x + 280} y0={lakeY - 50} y1={lakeY + 70} count={7} color="#e1f5fe" />
    </g>
  );
}

/** 纜車：山下站到主峰觀景台，兩條纜線、車廂一上一下 */
function CableCar({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dur = 36;
  const cabins = [0, 1, 2].flatMap((i) => [
    { key: `u${i}`, sx: from.x, sy: from.y, vx: dx, vy: dy, off: -14, phase: i / 3, color: '#e53935' },
    { key: `d${i}`, sx: to.x, sy: to.y, vx: -dx, vy: -dy, off: 14, phase: i / 3 + 0.16, color: '#fbc02d' },
  ]);
  return (
    <g>
      <g stroke="#455a64" strokeWidth={4}>
        <line x1={from.x} y1={from.y - 14} x2={to.x} y2={to.y - 14} />
        <line x1={from.x} y1={from.y + 14} x2={to.x} y2={to.y + 14} />
      </g>
      {[0.33, 0.66].map((t) => {
        const px = from.x + dx * t;
        const py = from.y + dy * t;
        return <path key={t} d={`M${px - 30} ${py + 150} L${px} ${py - 20} L${px + 30} ${py + 150}`} fill="none" stroke="#78909c" strokeWidth={10} />;
      })}
      {cabins.map((c) => {
        const style = { '--dx': `${c.vx}px`, '--dy': `${c.vy}px`, animationDuration: `${dur}s`, animationDelay: `${(-c.phase * dur).toFixed(1)}s` } as CSSProperties;
        return (
          <g key={c.key} className="amb amb-drive" style={style}>
            <g transform={`translate(${c.sx} ${c.sy + c.off})`}>
              <line x1={0} y1={0} x2={0} y2={26} stroke="#37474f" strokeWidth={4} />
              <rect x={-26} y={24} width={52} height={40} rx={10} fill={c.color} stroke="#37474f" strokeWidth={3} />
              <rect x={-18} y={30} width={36} height={14} rx={3} fill="#e1f5fe" />
            </g>
          </g>
        );
      })}
      {[from, to].map((p, i) => (
        <g key={i}>
          <rect x={p.x - 70} y={p.y - 30} width={140} height={90} rx={8} fill="#eceff1" stroke="#90a4ae" strokeWidth={4} />
          <path d={`M${p.x - 86} ${p.y - 26} L${p.x} ${p.y - 76} L${p.x + 86} ${p.y - 26} Z`} fill="#c62828" />
        </g>
      ))}
    </g>
  );
}

/** 主峰頂的觀景台（白色圓頂，燈會明暗） */
function Observatory({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 60} y={y - 10} width={120} height={50} fill="#eceff1" stroke="#90a4ae" strokeWidth={4} />
      <path d={`M${x - 60} ${y - 10} A60 60 0 0 1 ${x + 60} ${y - 10} Z`} fill="#fafafa" stroke="#90a4ae" strokeWidth={4} />
      <rect x={x - 8} y={y - 64} width={16} height={40} fill="#90a4ae" />
      <Glow dur={3}><circle cx={x + 30} cy={y + 14} r={9} fill="#ffd54f" /></Glow>
    </g>
  );
}

/** 東北角的固定景點：主峰（最高、積雪）+ 觀景台 + 纜車；主峰西邊是瀑布和高山湖 */
function Summit({ city, world }: { city: City; world: Size }) {
  const { top, foot } = city.mountains;
  const w = world.width;
  const peak = { x: w - 900, y: top + 90 };
  return (
    <g>
      <Peak x={peak.x} apex={peak.y} base={foot - 200} hw={1250} tone={MAIN} seed={0.37} />
      <Waterfall x={w - 3300} top={top + 520} lakeY={foot - 170} />
      <Observatory x={peak.x} y={peak.y + 60} />
      <CableCar from={{ x: w - 2150, y: foot - 150 }} to={{ x: peak.x - 110, y: peak.y + 110 }} />
    </g>
  );
}

/** 電波塔：東側山頂的紅白鐵塔，頂端紅燈閃 */
function RadioTower({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x - 26} ${y} L${x} ${y - 190} L${x + 26} ${y} M${x - 18} ${y - 60} L${x + 18} ${y - 60} M${x - 10} ${y - 120} L${x + 10} ${y - 120}`} fill="none" stroke="#e53935" strokeWidth={8} />
      <Glow dur={1.6}><circle cx={x} cy={y - 196} r={12} fill="#ff1744" /></Glow>
    </g>
  );
}

/** 東側：山一座座往南排（南邊的在前面），靠海的變矮 */
function EastRange({ city, world }: { city: City; world: Size }) {
  const x0 = city.hills;
  const w = world.width - x0;
  const y0 = city.mountains.foot;
  const y1 = city.coast.sand;
  const count = Math.max(2, Math.round((y1 - y0) / 520));
  const peaks = scatter(921, count, y0 + 380, y1 - 60, 0.5).map(({ x: base, r }, i) => {
    const low = (base - y0) / (y1 - y0) > 0.8;
    return { base, apex: base - (low ? 300 : 460 + r * 140), x: x0 + w * (0.45 + (r - 0.5) * 0.3), hw: low ? 340 : 400 + r * 80, r, i };
  });
  const tower = peaks[Math.min(1, peaks.length - 1)];
  return (
    <g>
      <rect x={x0} y={y0} width={w} height={y1 - y0} fill="#a5cd73" />
      {peaks.map((p) => (
        <g key={p.i}>
          <Peak x={p.x} apex={p.apex} base={p.base} hw={p.hw} tone={EAST} seed={p.r + p.i} />
          {scatter(930 + p.i, 7, p.x - p.hw + 40, p.x + p.hw - 40, 0.8).map(({ x, r }, k) => <Canopy key={k} x={x} y={p.base - 10 + r * 40} r={24 + r * 12} tone={k + p.i} />)}
          {p === tower && <RadioTower x={p.x} y={p.apex + 30} />}
        </g>
      ))}
      <SwayTufts seed={814} x0={x0 + 30} x1={world.width - 30} y0={y0 + 40} y1={y1 - 40} count={Math.round((y1 - y0) / 220)} color="#558b2f" />
    </g>
  );
}

export function Mountains({ city, world }: { city: City; world: Size }) {
  const { top } = city.mountains;
  return (
    <g>
      <defs>
        <clipPath id="mtn-clip"><rect x={city.west.edge} y={top} width={world.width - city.west.edge} height={world.height - top} /></clipPath>
      </defs>
      <g clipPath="url(#mtn-clip)">
        <EastRange city={city} world={world} />
        <NorthRange city={city} world={world} />
        <Summit city={city} world={world} />
      </g>
    </g>
  );
}
