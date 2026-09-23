// 路網：街區之間的街道、路口斑馬線、地標圓環、河上的橋、站前廣場、背景車流、街區投影。幾何來自 src/lib/city.ts。
// 背景用「俯視」畫法（行道樹是圓形樹冠、車是俯視車頂、斑馬線平貼路面），和直立的可點物品一眼分得開（docs/city-plan.md §2）。
import type { CSSProperties, ReactNode } from 'react';
import { SIDEWALK, type City, type Street } from '@/lib/city';
import { scatter } from '@/lib/scatter';
import type { Rect } from '@/lib/town';
import { Glow } from '../Ambient';

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
const C = { walk: '#e3ddd3', walkLine: '#d2c9bc', curb: '#b0bec5', road: '#8d9ca6', lane: '#f5f5f5', plaza: '#ece4d6' };
const CAR_COLORS = ['#ef5350', '#42a5f5', '#ffca28', '#66bb6a', '#ab47bc', '#eceff1', '#ff7043'];
const DRIVE_SPEED = 140; // 地圖單位 / 秒

export const cityShadowDefs = (
  <defs>
    <linearGradient id="city-shade-down" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#3e2723" stopOpacity={0.22} />
      <stop offset="1" stopColor="#3e2723" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="city-shade-right" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#3e2723" stopOpacity={0.16} />
      <stop offset="1" stopColor="#3e2723" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="city-shade-left" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stopColor="#3e2723" stopOpacity={0.16} />
      <stop offset="1" stopColor="#3e2723" stopOpacity={0} />
    </linearGradient>
  </defs>
);

/**
 * 俯視的樹冠：幾團重疊的圓 + 投影，沒有深色外框、顏色貼近地面——讀起來是背景的綠，不會像一顆可以點的球。
 */
const LOBES = [[0, 0, 1], [-0.55, 0.2, 0.7], [0.5, 0.25, 0.72], [0.1, -0.5, 0.66]] as const;

export function Canopy({ x, y, r, tone = 0 }: { x: number; y: number; r: number; tone?: number }) {
  const fill = ['#8fc46f', '#86bd68', '#97c978'][tone % 3];
  const lobes = LOBES.slice(0, 2 + (tone % 3));
  return (
    <g>
      {lobes.map(([dx, dy, k], i) => <circle key={`s${i}`} cx={x + (dx + 0.3) * r} cy={y + (dy + 0.4) * r} r={k * r} fill="#33691e" opacity={0.12} />)}
      {lobes.map(([dx, dy, k], i) => <circle key={i} cx={x + dx * r} cy={y + dy * r} r={k * r} fill={fill} />)}
      <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.4} fill="#b5dc8f" opacity={0.6} />
    </g>
  );
}

const near = (x: number, y: number, rects: readonly Rect[], pad: number) => rects.some((r) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad);

function StreetBase({ s, avoid }: { s: Street; avoid: readonly Rect[] }) {
  const h = s.dir === 'h';
  const len = h ? s.x1 - s.x0 : s.y1 - s.y0;
  const w = h ? s.y1 - s.y0 : s.x1 - s.x0;
  // 在「街道自己的座標」畫（沿街 = u，橫跨 = v），直的街轉 90°
  const tf = h ? `translate(${s.x0} ${s.y0})` : `translate(${s.x1} ${s.y0}) rotate(90)`;
  const seed = s.x0 * 7 + s.y0 * 13;
  const trees = [SIDEWALK / 2, w - SIDEWALK / 2].flatMap((v, side) => scatter(seed + side, Math.floor(len / 230), 60, len - 60, 0.7).map(({ x: u, r }) => ({ u, v, r })));
  const toWorld = (u: number, v: number) => (h ? { x: s.x0 + u, y: s.y0 + v } : { x: s.x1 - v, y: s.y0 + u });
  return (
    <g>
      <g transform={tf}>
        <rect width={len} height={w} fill={C.walk} />
        <g stroke={C.walkLine} strokeWidth={2}>
          {range(Math.floor(len / 70)).map((i) => <line key={i} x1={(i + 1) * 70} y1={0} x2={(i + 1) * 70} y2={SIDEWALK} />)}
          {range(Math.floor(len / 70)).map((i) => <line key={`s${i}`} x1={(i + 1) * 70} y1={w - SIDEWALK} x2={(i + 1) * 70} y2={w} />)}
        </g>
        <rect y={SIDEWALK - 6} width={len} height={w - 2 * SIDEWALK + 12} fill={C.curb} />
        <rect y={SIDEWALK} width={len} height={w - 2 * SIDEWALK} fill={C.road} />
        {range(Math.floor(len / 150)).map((i) => <rect key={i} x={i * 150 + 30} y={w / 2 - 4} width={80} height={8} rx={3} fill={C.lane} opacity={0.85} />)}
      </g>
      {trees.map(({ u, v, r }, i) => {
        const p = toWorld(u, v);
        return near(p.x, p.y, avoid, 70) ? null : <Canopy key={i} x={p.x} y={p.y} r={30 + r * 8} tone={i} />;
      })}
    </g>
  );
}

/** 路口：清掉車道線、四角留人行道、四個方向畫斑馬線（平貼路面） */
function Crossing({ r }: { r: Rect }) {
  const inner = { x0: r.x0 + SIDEWALK, y0: r.y0 + SIDEWALK, x1: r.x1 - SIDEWALK, y1: r.y1 - SIDEWALK };
  const stripes = (x0: number, y0: number, x1: number, y1: number, vertical: boolean) => {
    const span = vertical ? x1 - x0 : y1 - y0;
    return range(Math.floor(span / 26)).map((i) => vertical
      ? <rect key={`${x0},${y0},${i}`} x={x0 + 6 + i * 26} y={y0} width={14} height={y1 - y0} fill="#fafafa" opacity={0.9} />
      : <rect key={`${x0},${y0},${i}`} x={x0} y={y0 + 6 + i * 26} width={x1 - x0} height={14} fill="#fafafa" opacity={0.9} />);
  };
  return (
    <g>
      <rect x={r.x0} y={inner.y0} width={r.x1 - r.x0} height={inner.y1 - inner.y0} fill={C.road} />
      <rect x={inner.x0} y={r.y0} width={inner.x1 - inner.x0} height={r.y1 - r.y0} fill={C.road} />
      {stripes(inner.x0 - 60, inner.y0, inner.x0 - 14, inner.y1, false)}
      {stripes(inner.x1 + 14, inner.y0, inner.x1 + 60, inner.y1, false)}
      {stripes(inner.x0, inner.y0 - 60, inner.x1, inner.y0 - 14, true)}
      {stripes(inner.x0, inner.y1 + 14, inner.x1, inner.y1 + 60, true)}
    </g>
  );
}

/** 地標圓環：中央島上有一座紀念碑（俯視的方尖碑），燈會明暗 */
function Roundabout({ r }: { r: Rect }) {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={62} fill="none" stroke="#fafafa" strokeWidth={4} strokeDasharray="18 14" opacity={0.8} />
      <circle cx={cx} cy={cy} r={44} fill="#8bc34a" stroke="#bdbdbd" strokeWidth={8} />
      <ellipse cx={cx + 10} cy={cy + 12} rx={20} ry={16} fill="#33691e" opacity={0.25} />
      <rect x={cx - 16} y={cy - 16} width={32} height={32} fill="#e0e0e0" stroke="#9e9e9e" strokeWidth={3} />
      <path d={`M${cx - 16} ${cy - 16} L${cx + 16} ${cy + 16} M${cx + 16} ${cy - 16} L${cx - 16} ${cy + 16}`} stroke="#9e9e9e" strokeWidth={2} />
      <Glow dur={3.2}><circle cx={cx} cy={cy} r={6} fill="#fff176" /></Glow>
    </g>
  );
}

/** 橋：街道蓋在河上，兩側欄杆 + 橋下的影子 */
function Bridge({ r }: { r: Rect }) {
  return (
    <g>
      <rect x={r.x0} y={r.y1} width={r.x1 - r.x0} height={18} fill="#01579b" opacity={0.18} />
      {[r.y0 + 6, r.y1 - 12].map((y) => <rect key={y} x={r.x0} y={y} width={r.x1 - r.x0} height={8} rx={3} fill="#a1887f" stroke="#6d4c41" strokeWidth={2} />)}
    </g>
  );
}

/** 站前廣場：鋪面 + 兩排樹 + 中央圓形花圃 */
function Plaza({ s }: { s: Street }) {
  const cx = (s.x0 + s.x1) / 2;
  const cy = (s.y0 + s.y1) / 2;
  return (
    <g>
      <rect x={s.x0} y={s.y0} width={s.x1 - s.x0} height={s.y1 - s.y0} fill={C.plaza} />
      <g stroke="#ddd3c3" strokeWidth={2}>
        {range(Math.floor((s.x1 - s.x0) / 80)).map((i) => <line key={i} x1={s.x0 + (i + 1) * 80} y1={s.y0} x2={s.x0 + (i + 1) * 80} y2={s.y1} />)}
      </g>
      <circle cx={cx} cy={cy} r={80} fill="#aed581" stroke="#bcaaa4" strokeWidth={10} />
      <circle cx={cx} cy={cy} r={40} fill="#c5e1a5" />
      {scatter(911, 14, s.x0 + 80, s.x1 - 80, 0.6).map(({ x, r }, i) => (Math.abs(x - cx) < 160 ? null : <Canopy key={i} x={x} y={i % 2 ? s.y0 + 60 : s.y1 - 60} r={24 + r * 6} tone={i} />))}
    </g>
  );
}

/** 背景車流：俯視的小車沿車道開過去（外觀和直立的 car / taxi 物品完全不同）；「減少動態」時不畫（globals.css） */
function Traffic({ s }: { s: Street }) {
  const h = s.dir === 'h';
  const len = h ? s.x1 - s.x0 : s.y1 - s.y0;
  const mid = h ? (s.y0 + s.y1) / 2 : (s.x0 + s.x1) / 2;
  const cars = scatter(s.x0 + s.y0 + 5, Math.max(2, Math.round(len / 1800)), 0, 1, 0.8);
  return (
    <g>
      {cars.map(({ x: phase, r }, i) => {
        const forward = i % 2 === 0;
        const lane = mid + (forward ? 34 : -34);
        const dist = len + 200;
        const style = {
          '--dx': h ? `${forward ? dist : -dist}px` : '0px',
          '--dy': h ? '0px' : `${forward ? dist : -dist}px`,
          animationDuration: `${(dist / DRIVE_SPEED).toFixed(1)}s`,
          animationDelay: `${(-phase * dist / DRIVE_SPEED).toFixed(1)}s`,
        } as CSSProperties;
        const start = forward ? -100 : len + 100;
        const [x, y] = h ? [s.x0 + start, lane] : [lane, s.y0 + start];
        const angle = h ? (forward ? 0 : 180) : (forward ? 90 : 270);
        return (
          <g key={i} className="amb amb-drive" style={style}>
            <g transform={`translate(${x} ${y}) rotate(${angle})`}>
              <rect x={-40} y={-19} width={80} height={38} rx={11} fill={CAR_COLORS[(i + Math.round(r * 7)) % CAR_COLORS.length]} stroke="#37474f" strokeWidth={3} />
              <rect x={6} y={-14} width={16} height={28} rx={4} fill="#b3e5fc" opacity={0.9} />
              <rect x={-26} y={-13} width={28} height={26} rx={5} fill="#000000" opacity={0.12} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** 街區的投影（光源左上）：落在南邊、東邊的街道上 */
export function DistrictShadows({ rects }: { rects: readonly Rect[] }) {
  return (
    <g pointerEvents="none">
      {rects.map((r) => (
        <g key={`${r.x0},${r.y0}`}>
          <rect x={r.x0 + 24} y={r.y1} width={r.x1 - r.x0} height={34} fill="url(#city-shade-down)" />
          <rect x={r.x1} y={r.y0 + 24} width={30} height={r.y1 - r.y0} fill="url(#city-shade-right)" />
        </g>
      ))}
    </g>
  );
}

export function CityStreets({ city, section }: { city: City; section: (key: string, node: ReactNode) => ReactNode }) {
  const avoid = [...city.crossings, ...city.bridges];
  const roads = city.streets.filter((s) => s.kind !== 'plaza');
  return (
    <g>
      {city.streets.filter((s) => s.kind === 'plaza').map((s) => <Plaza key={s.id} s={s} />)}
      {roads.map((s) => <StreetBase key={s.id} s={s} avoid={avoid} />)}
      {city.crossings.map((r) => <Crossing key={`${r.x0},${r.y0}`} r={r} />)}
      {city.roundabout && <Roundabout r={city.roundabout} />}
      {city.bridges.map((r) => <Bridge key={`${r.x0},${r.y0}`} r={r} />)}
      {roads.map((s) => <g key={s.id}>{section(streetKey(s.id), <Traffic s={s} />)}</g>)}
    </g>
  );
}

export const streetKey = (id: string) => `st:${id}`;
