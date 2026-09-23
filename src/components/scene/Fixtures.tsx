// 情境擺放的家具（scripts/lib/staging.mjs 算好位置）：書桌、層架、矮櫃、玻璃櫃、地毯、平台、花台、布告欄、建築門面。
// 3/4 俯視：levels 是檯面前緣 y（物件底線落在這裡），base 是正面落地的 y；x0 / x1 就是家具的左右邊，不再外擴。
// 純背景、不可點，不能長得像單字物品（規範 §0-4；撞名由 staging.mjs 的 validateStage 擋下）。
import type { ReactNode } from 'react';
import type { Surface } from '@/lib/types';
import { Glow, SwayTufts } from './Ambient';

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);

interface TopProps {
  x0: number;
  x1: number;
  level: number;
  depth: number;
  front: number;
  top: string;
  face: string;
  stroke: string;
}

/** 檯面頂（深度 depth）+ 正面（從 level 往下 front 高） */
function Slab({ x0, x1, level, depth, front, top, face, stroke }: TopProps) {
  return (
    <g>
      <rect x={x0} y={level - depth} width={x1 - x0} height={depth} fill={top} stroke={stroke} strokeWidth={3} />
      <rect x={x0} y={level} width={x1 - x0} height={front} fill={face} stroke={stroke} strokeWidth={3} />
    </g>
  );
}

const WOOD = { top: '#d7b48a', face: '#c49a6c', stroke: '#6d4c41' };

function Desk({ s }: { s: Surface }) {
  const level = s.levels[0];
  const apron = 20;
  return (
    <g>
      {[s.x0 + 8, s.x1 - 20].map((x) => <rect key={x} x={x} y={level + apron} width={12} height={s.base - level - apron} fill={WOOD.stroke} />)}
      <Slab x0={s.x0} x1={s.x1} level={level} depth={50} front={apron} {...WOOD} />
    </g>
  );
}

function Counter({ s }: { s: Surface }) {
  const level = s.levels[0];
  return (
    <g>
      <Slab x0={s.x0} x1={s.x1} level={level} depth={50} front={s.base - level} top="#a1887f" face="#bcaaa4" stroke="#6d4c41" />
      {range(Math.floor((s.x1 - s.x0) / 70)).map((k) => (
        <line key={k} x1={s.x0 + (k + 1) * 70} y1={level + 6} x2={s.x0 + (k + 1) * 70} y2={s.base - 6} stroke="#a1887f" strokeWidth={2} />
      ))}
    </g>
  );
}

function Cabinet({ s }: { s: Surface }) {
  const level = s.levels[0];
  const h = s.base - level;
  const n = Math.max(2, Math.round((s.x1 - s.x0) / 120));
  const w = (s.x1 - s.x0) / n;
  return (
    <g>
      <Slab x0={s.x0} x1={s.x1} level={level} depth={38} front={h} {...WOOD} />
      {range(n).map((k) => <rect key={k} x={s.x0 + k * w + 8} y={level + 8} width={w - 16} height={h - 16} rx={4} fill="none" stroke={WOOD.stroke} strokeWidth={2} opacity={0.5} />)}
    </g>
  );
}

function Display({ s }: { s: Surface }) {
  const level = s.levels[0];
  return (
    <g>
      <Slab x0={s.x0} x1={s.x1} level={level} depth={45} front={s.base - level} top="#b3e5fc" face="#e1f5fe" stroke="#78909c" />
      <rect x={s.x0 + 10} y={level + 10} width={s.x1 - s.x0 - 20} height={s.base - level - 34} fill="#b3e5fc" opacity={0.5} />
      <rect x={s.x0} y={s.base - 16} width={s.x1 - s.x0} height={16} fill="#78909c" />
    </g>
  );
}

/** 靠牆的開放層架：側板 + 每層一塊板子 + 淺色背板 */
function Shelf({ s }: { s: Surface }) {
  const levels = [...s.levels].sort((a, b) => b - a);
  const top = levels.at(-1)! - 80;
  return (
    <g>
      <rect x={s.x0} y={top} width={s.x1 - s.x0} height={s.base - top} fill="#efe0cc" stroke={WOOD.stroke} strokeWidth={3} />
      {levels.map((y) => <rect key={y} x={s.x0} y={y - 4} width={s.x1 - s.x0} height={12} fill={WOOD.face} stroke={WOOD.stroke} strokeWidth={2} />)}
      <rect x={s.x0} y={top} width={s.x1 - s.x0} height={12} fill={WOOD.face} stroke={WOOD.stroke} strokeWidth={2} />
      {[s.x0, s.x1 - 14].map((x) => <rect key={x} x={x} y={top} width={14} height={s.base - top} fill={WOOD.face} stroke={WOOD.stroke} strokeWidth={2} />)}
    </g>
  );
}

function Rug({ s }: { s: Surface }) {
  const y0 = s.levels[0];
  return (
    <g>
      <rect x={s.x0} y={y0} width={s.x1 - s.x0} height={s.base - y0} rx={26} fill="#ffccbc" stroke="#bf8f7f" strokeWidth={3} />
      <rect x={s.x0 + 16} y={y0 + 12} width={s.x1 - s.x0 - 32} height={s.base - y0 - 24} rx={18} fill="none" stroke="#e8a898" strokeWidth={6} strokeDasharray="4 10" />
    </g>
  );
}

function Platform({ s }: { s: Surface }) {
  const level = s.levels[0];
  return (
    <g>
      <Slab x0={s.x0} x1={s.x1} level={level} depth={70} front={s.base - level} top="#c8a27a" face="#a1887f" stroke="#6d4c41" />
      {range(Math.floor((s.x1 - s.x0) / 30)).map((k) => (
        <line key={k} x1={s.x0 + (k + 1) * 30} y1={level - 70} x2={s.x0 + (k + 1) * 30} y2={level} stroke="#a1887f" strokeWidth={2} />
      ))}
    </g>
  );
}

/** 長條磚砌花台，土上的草叢會動（背景動態） */
function Planter({ s }: { s: Surface }) {
  const level = s.levels[0];
  return (
    <g>
      <Slab x0={s.x0} x1={s.x1} level={level} depth={40} front={s.base - level} top="#795548" face="#bf7a5a" stroke="#6d4c41" />
      {range(Math.floor((s.x1 - s.x0) / 40)).map((k) => (
        <line key={k} x1={s.x0 + (k + 1) * 40} y1={level} x2={s.x0 + (k + 1) * 40} y2={s.base} stroke="#8d5a45" strokeWidth={2} />
      ))}
      <SwayTufts seed={Math.round(s.x0)} x0={s.x0 + 14} x1={s.x1 - 14} y0={level - 30} y1={level - 8} count={Math.floor((s.x1 - s.x0) / 45)} color="#689f38" />
    </g>
  );
}

function Board({ s }: { s: Surface }) {
  const y0 = s.levels[0];
  return (
    <g>
      <rect x={s.x0} y={y0} width={s.x1 - s.x0} height={s.base - y0} rx={6} fill="#e3c08f" stroke="#8d6e63" strokeWidth={8} />
      <rect x={s.x0 + 14} y={y0 + 14} width={s.x1 - s.x0 - 28} height={s.base - y0 - 28} fill="none" stroke="#d4ab76" strokeWidth={2} />
    </g>
  );
}

/** 建築門面：屋簷 + 牆 + 一排窗（窗會亮暗，背景動態）；door 時中間是玻璃自動門 */
function Facade({ s, door }: { s: Surface; door: boolean }) {
  const y0 = s.levels[0];
  const w = s.x1 - s.x0;
  const doorW = Math.min(150, w * 0.6);
  const cx = (s.x0 + s.x1) / 2;
  const winY = y0 + 36;
  const winH = Math.max(30, (s.base - y0) * 0.32);
  const n = door ? 0 : Math.max(1, Math.floor(w / 110));
  return (
    <g>
      <rect x={s.x0} y={y0} width={w} height={s.base - y0} fill="#eceff1" stroke="#90a4ae" strokeWidth={3} />
      <rect x={s.x0 - 4} y={y0} width={w + 8} height={16} fill="#78909c" />
      <rect x={s.x0} y={s.base - 12} width={w} height={12} fill="#b0bec5" />
      {range(n).map((k) => (
        <Glow key={k} dur={5 + (k % 3)} phase={(k * 0.37) % 1}>
          <rect x={s.x0 + (k + 0.5) * (w / n) - 36} y={winY} width={72} height={winH} rx={4} fill="#bbdefb" stroke="#90a4ae" strokeWidth={3} />
        </Glow>
      ))}
      {door && (
        <g>
          <rect x={cx - doorW / 2 - 8} y={y0 + 26} width={doorW + 16} height={s.base - y0 - 26} fill="#90a4ae" />
          <rect x={cx - doorW / 2} y={y0 + 34} width={doorW / 2 - 2} height={s.base - y0 - 46} fill="#b3e5fc" stroke="#78909c" strokeWidth={2} />
          <rect x={cx + 2} y={y0 + 34} width={doorW / 2 - 2} height={s.base - y0 - 46} fill="#b3e5fc" stroke="#78909c" strokeWidth={2} />
        </g>
      )}
    </g>
  );
}

export const FIXTURE_LOOKS: Record<string, (props: { s: Surface }) => ReactNode> = {
  desk: Desk,
  counter: Counter,
  cabinet: Cabinet,
  display: Display,
  shelf: Shelf,
  rug: Rug,
  platform: Platform,
  planter: Planter,
  board: Board,
  facade: ({ s }) => <Facade s={s} door={false} />,
  'facade-door': ({ s }) => <Facade s={s} door />,
};
