// 地圖上的檯面（蔬果台、冷藏櫃、收銀台、吧台、餐桌、碼頭），3/4 俯視：上方是檯面頂、下方是正面。
// 位置來自 scene-config 的地帶（有 look 的那些）：levels = 檯面前緣 y（物件底線），base = 正面落地的 y。
// 不畫成任何單字物品的樣子（規範 §0-4）。
import type { ReactNode } from 'react';
import type { Surface } from '@/lib/types';
import { FIXTURE_LOOKS } from './Fixtures';

const DEPTH = 55; // 檯面頂的深度
const PAD = 24; // 檯面比物件可放範圍左右多出的寬度

interface BoxProps {
  x0: number;
  x1: number;
  level: number;
  base: number;
  top: string;
  front: string;
  stroke: string;
  children?: ReactNode;
}

function Box({ x0, x1, level, base, top, front, stroke, children }: BoxProps) {
  return (
    <g>
      <rect x={x0} y={level} width={x1 - x0} height={base - level} fill={front} stroke={stroke} strokeWidth={3} />
      <rect x={x0} y={level - DEPTH} width={x1 - x0} height={DEPTH} fill={top} stroke={stroke} strokeWidth={3} />
      {children}
    </g>
  );
}

function Stand({ s }: { s: Surface }) {
  // 階梯式蔬果台：後層高、前層低
  const levels = [...s.levels].sort((a, b) => a - b);
  const [x0, x1] = [s.x0 - PAD, s.x1 + PAD];
  return (
    <g>
      {levels.map((y) => (
        <Box key={y} x0={x0} x1={x1} level={y} base={s.base} top="#c8a27a" front="#d7b48a" stroke="#6d4c41">
          {Array.from({ length: Math.floor((x1 - x0) / 110) }, (_, k) => (
            <line key={k} x1={x0 + (k + 1) * 110} y1={y} x2={x0 + (k + 1) * 110} y2={s.base} stroke="#8d6e63" strokeWidth={2} opacity={0.5} />
          ))}
        </Box>
      ))}
    </g>
  );
}

function Chiller({ s }: { s: Surface }) {
  const y = s.levels[0];
  const [x0, x1] = [s.x0 - PAD, s.x1 + PAD];
  return (
    <Box x0={x0} x1={x1} level={y} base={s.base} top="#b3e5fc" front="#eceff1" stroke="#78909c">
      <rect x={x0 + 10} y={y - DEPTH + 10} width={x1 - x0 - 20} height={DEPTH - 20} fill="#e1f5fe" />
      <rect x={x0} y={s.base - 14} width={x1 - x0} height={14} fill="#78909c" />
    </Box>
  );
}

function Checkout({ s }: { s: Surface }) {
  const y = s.levels[0];
  const [x0, x1] = [s.x0 - PAD, s.x1 + PAD];
  return (
    <Box x0={x0} x1={x1} level={y} base={s.base} top="#90a4ae" front="#b0bec5" stroke="#546e7a">
      <rect x={x0 + 12} y={y - DEPTH + 14} width={(x1 - x0) * 0.35} height={DEPTH - 28} fill="#37474f" />
      <rect x={x0} y={s.base - 12} width={x1 - x0} height={12} fill="#546e7a" />
    </Box>
  );
}

function CafeCounter({ s }: { s: Surface }) {
  const y = s.levels[0];
  const [x0, x1] = [s.x0 - PAD, s.x1 + PAD];
  return (
    <Box x0={x0} x1={x1} level={y} base={s.base} top="#a1887f" front="#bcaaa4" stroke="#6d4c41">
      {Array.from({ length: Math.floor((x1 - x0) / 60) }, (_, k) => (
        <line key={k} x1={x0 + (k + 1) * 60} y1={y} x2={x0 + (k + 1) * 60} y2={s.base} stroke="#a1887f" strokeWidth={2} />
      ))}
    </Box>
  );
}

function ClothTable({ s }: { s: Surface }) {
  const y = s.levels[0];
  const [x0, x1] = [s.x0 - PAD, s.x1 + PAD];
  const legH = 16;
  return (
    <g>
      {[0.03, 0.97].map((f) => <rect key={f} x={x0 + (x1 - x0) * f - 5} y={s.base - legH} width={10} height={legH} fill="#6d4c41" />)}
      <Box x0={x0} x1={x1} level={y} base={s.base - legH} top="#fffde7" front="#fff8e1" stroke="#bcaaa4">
        <rect x={x0} y={s.base - legH - 10} width={x1 - x0} height={10} fill="#e57373" opacity={0.7} />
      </Box>
    </g>
  );
}

function Jetty({ s }: { s: Surface }) {
  // 從河岸伸進水裡的木棧道，右端接岸
  const y = s.levels[0];
  const [x0, x1] = [s.x0 - PAD, s.x1 + 40];
  return (
    <g>
      {[x0 + 12, x0 + (x1 - x0) / 2].map((px) => <rect key={px} x={px} y={s.base} width={12} height={30} fill="#6d4c41" />)}
      <Box x0={x0} x1={x1} level={y} base={s.base} top="#c8a27a" front="#a1887f" stroke="#6d4c41">
        {Array.from({ length: Math.floor((x1 - x0) / 28) }, (_, k) => (
          <line key={k} x1={x0 + (k + 1) * 28} y1={y - DEPTH} x2={x0 + (k + 1) * 28} y2={y} stroke="#a1887f" strokeWidth={2} />
        ))}
      </Box>
    </g>
  );
}

const LOOKS: Record<string, (props: { s: Surface }) => ReactNode> = {
  stand: Stand,
  chiller: Chiller,
  checkout: Checkout,
  'cafe-counter': CafeCounter,
  table: ClothTable,
  jetty: Jetty,
  // 情境擺放的家具（Fixtures.tsx）；桌布長桌沿用 ClothTable，但家具的 x0 / x1 已經是外緣，不再外擴
  ...FIXTURE_LOOKS,
  'cloth-table': ({ s }) => <ClothTable s={{ ...s, x0: s.x0 + PAD, x1: s.x1 - PAD }} />,
};

export function Surfaces({ surfaces }: { surfaces: readonly Surface[] }) {
  return (
    <>
      {surfaces.map((s) => {
        const Look = LOOKS[s.look];
        // 同一區可以有好幾件同款家具（情境擺放），key 要帶位置
        return Look ? <Look key={`${s.look}-${s.zone}-${s.x0}-${s.levels[0]}`} s={s} /> : null;
      })}
    </>
  );
}
