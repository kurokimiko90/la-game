// 戶外街景：自動擴展街區的地塊之間的大街（town.streets，由 scripts/lib/town-plan.mjs 算好），
// 以及超市搬進室內區後，原本超市位置的「超市門面 + 停車場」（面向商業街，門口就是進入室內的地方）。
// 規範（docs/scene-standard.md）：不放文字、重複元素用 scatter 抖動、每個分區至少一個背景動態、不畫像單字物品的東西。
import { scatter } from '@/lib/scatter';
import { Glow, SwayTufts } from '../Ambient';

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
const WALK = 30; // 大街兩側人行道

/** 一條大街：人行道 + 車道 + 分向線，人行道上有會動的花台 */
function Avenue({ r }: { r: number[] }) {
  const [x0, y0, x1, y1] = r;
  const w = x1 - x0;
  const mid = (y0 + y1) / 2;
  const planters = scatter(x0 + y0, Math.max(1, Math.floor(w / 900)), x0 + 120, x1 - 280, 0.8);
  return (
    <g>
      <rect x={x0} y={y0} width={w} height={WALK} fill="#e0e0e0" />
      <rect x={x0} y={y1 - WALK} width={w} height={WALK} fill="#e0e0e0" />
      <rect x={x0} y={y0 + WALK} width={w} height={y1 - y0 - 2 * WALK} fill="#90a4ae" />
      <rect x={x0} y={y0 + WALK} width={w} height={6} fill="#b0bec5" />
      <rect x={x0} y={y1 - WALK - 6} width={w} height={6} fill="#b0bec5" />
      {range(Math.floor(w / 160)).map((i) => <rect key={i} x={x0 + i * 160 + 30} y={mid - 4} width={90} height={8} fill="#ffffff" opacity={0.8} />)}
      {planters.map(({ x }) => (
        <g key={x}>
          <rect x={x} y={y1 - WALK + 2} width={160} height={24} rx={6} fill="#8d6e63" />
          <rect x={x + 6} y={y1 - WALK + 4} width={148} height={14} rx={4} fill="#9ccc65" />
          <SwayTufts seed={Math.round(x)} x0={x + 14} x1={x + 146} y0={y1 - WALK + 12} y1={y1 - WALK + 14} count={4} color="#558b2f" />
        </g>
      ))}
    </g>
  );
}

export function TownStreets({ streets }: { streets: readonly number[][] }) {
  return <g>{streets.map((r) => <Avenue key={r.join(',')} r={r} />)}</g>;
}

/**
 * 超市門面：北邊接商業街的人行道，前面是停車場，南側是超市建築（玻璃自動門、招牌色帶、會亮的窗）。
 * 超市的室內（貨架、收銀台）在室內區。
 */
export function SupermarketFront({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  const w = x1 - x0;
  const lotBottom = y0 + (y1 - y0) * 0.62;
  const stall = 130;
  const door = { x: x0 + w * 0.2, w: 200 };
  return (
    <g>
      {/* 停車場 */}
      <rect x={x0} y={y0} width={w} height={lotBottom - y0} fill="#b0bec5" />
      <g stroke="#ffffff" strokeWidth={5} opacity={0.85}>
        {range(Math.floor((w - 200) / stall)).map((i) => (
          <g key={i}>
            <line x1={x0 + 100 + i * stall} y1={y0 + 60} x2={x0 + 100 + i * stall} y2={y0 + 230} />
            <line x1={x0 + 100 + i * stall} y1={lotBottom - 230} x2={x0 + 100 + i * stall} y2={lotBottom - 60} />
          </g>
        ))}
      </g>
      <rect x={x0} y={(y0 + lotBottom) / 2 - 20} width={w} height={40} fill="#cfd8dc" />
      {/* 停車場邊的草帶（會動） */}
      <rect x={x0} y={lotBottom - 26} width={w} height={26} fill="#9ccc65" />
      <SwayTufts seed={x0 + y0} x0={x0 + 30} x1={x1 - 30} y0={lotBottom - 14} y1={lotBottom - 8} count={Math.floor(w / 160)} color="#558b2f" />
      {/* 超市建築：屋簷 + 招牌色帶 + 外牆 + 窗 + 自動門 */}
      <rect x={x0 + 20} y={lotBottom} width={w - 40} height={y1 - lotBottom} fill="#fff3e0" stroke="#8d6e63" strokeWidth={4} />
      <rect x={x0 + 10} y={lotBottom} width={w - 20} height={26} fill="#8d6e63" />
      {['#90caf9', '#a5d6a7', '#b3e5fc', '#ffcc80'].map((c, i) => (
        <rect key={c} x={x0 + 20 + (i * (w - 40)) / 4} y={lotBottom + 26} width={(w - 40) / 4} height={30} fill={c} />
      ))}
      {range(Math.floor((w - 360) / 170)).map((i) => {
        const wx = door.x + door.w + 80 + i * 170;
        return wx + 110 < x1 - 40 && (
          <Glow key={i} dur={5 + (i % 3)} phase={(i * 0.29) % 1}>
            <rect x={wx} y={lotBottom + 80} width={110} height={(y1 - lotBottom) * 0.42} rx={6} fill="#e3f2fd" stroke="#90a4ae" strokeWidth={3} />
          </Glow>
        );
      })}
      <rect x={door.x - 10} y={lotBottom + 66} width={door.w + 20} height={y1 - lotBottom - 66} fill="#90a4ae" />
      <rect x={door.x} y={lotBottom + 74} width={door.w / 2 - 3} height={y1 - lotBottom - 80} fill="#b3e5fc" stroke="#78909c" strokeWidth={2} />
      <rect x={door.x + door.w / 2 + 3} y={lotBottom + 74} width={door.w / 2 - 3} height={y1 - lotBottom - 80} fill="#b3e5fc" stroke="#78909c" strokeWidth={2} />
    </g>
  );
}
