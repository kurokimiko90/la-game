// 小鎮地圖背景（3/4 俯視地面，地圖座標 3600×2600）。純裝飾、不可點擊，不放文字。
// 場景之間靠地形自然銜接：公園的步道通到商業街、湖水流進河、商店街南邊就是超市。
//
//   公園（左上）       │ 河（湖水往南流）│ 河邊東岸（右側，由北到南：橋 → 碼頭 → 露天座位 → 河岸步道）
//   商店建築 + 商業街  │                 │
//   超市（無屋頂剖面） │                 │
//
// ⚠️ 這裡的座標（道路、河、牆）要和 content/scene-config.json 的區域與地帶一致；改地圖時兩邊一起改。
// 規範（docs/scene-standard.md）：重複元素用 scatter 抖動、每個區域都有背景動態、不畫像單字物品的東西。
import { memo, type ReactNode } from 'react';
import { scatter } from '@/lib/scatter';
import type { Rect, Town } from '@/lib/town';
import { Glow, HangSwing, SwayTufts, WaterShimmer } from './Ambient';
import { Surfaces } from './Surfaces';
import { GeneratedDistrict } from './districts/GeneratedDistrict';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// 地形座標（和 scene-config.json 對應）
const PLAZA = { cx: 975, cy: 420, r: 260 };
const SAND = { x: 1360, y: 150, w: 540, h: 520 };
const LAKE = { cx: 2280, cy: 470, rx: 300, ry: 230 };
const SHOPS = { x0: 650, x1: 1950, roof: 760, facade: 880, base: 1130 };
const STREET = { x1: 2600, walkN: 1130, road: 1255, roadEnd: 1505, walkS: 1640 };
const MARKET = { x1: 2600, wall: 1700, wallFace: 1722, floor: 1895, south: 2575 };
// 手畫的核心範圍（前 4 個場景）；之後自動擴展的街區往南、往東加（districts/GeneratedDistrict.tsx）
const CORE = { w: 3600, h: 2600 };
const RIVER_TOP = 400;

const genKey = (sceneId: string) => `gen:${sceneId}`;

/** 背景分區：畫面外的分區暫停背景動畫（TownCanvas 算出哪些分區看得到）；河和東岸一路延伸到地圖南緣 */
export function worldSections(town: Town): Record<string, Rect> {
  const sections: Record<string, Rect> = {
    park: { x0: 0, y0: 0, x1: 2600, y1: 1130 },
    shops: { x0: 650, y0: 760, x1: 1950, y1: 1130 },
    street: { x0: 0, y0: 1130, x1: 2600, y1: 1640 },
    market: { x0: 0, y0: 1640, x1: 2600, y1: 2600 },
    river: { x0: 2600, y0: 0, x1: 2935, y1: town.height },
    east: { x0: 2935, y0: 0, x1: 3600, y1: town.height },
  };
  for (const d of town.districts) {
    const t = d.scene.terrain;
    if (t) sections[genKey(d.scene.id)] = { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 };
  }
  return sections;
}

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function Park() {
  const onPath = (x: number, y: number) => Math.abs(x - 330) < 60 || (y > 380 && y < 560 && x < 1400);
  const skip = (x: number, y: number) => onPath(x, y) || inEllipse(x, y, PLAZA.cx, PLAZA.cy, PLAZA.r + 20, PLAZA.r + 20)
    || inRect(x, y, SAND.x - 20, SAND.y - 20, SAND.x + SAND.w + 20, SAND.y + SAND.h + 20) || inEllipse(x, y, LAKE.cx, LAKE.cy, LAKE.rx + 40, LAKE.ry + 40);
  return (
    <g>
      {scatter(401, 9, 0, 2600, 0.8).map(({ x, r }) => (
        <ellipse key={x} cx={x} cy={200 + r * 700} rx={260 + r * 140} ry={130 + r * 60} fill={r > 0.5 ? '#bfdea4' : '#acd48a'} opacity={0.7} />
      ))}
      {/* 步道：入口往南接商業街、往東串起廣場、遊樂場、湖邊 */}
      <g fill="none" stroke="#eadfc6" strokeWidth={70} strokeLinecap="round" strokeLinejoin="round">
        <path d="M330 230 L330 1140" />
        <path d="M330 470 C520 470 560 440 720 430 M1230 430 L1360 430 M1900 430 C1950 430 1960 520 1990 700 C2050 840 2400 860 2620 800" />
      </g>
      <circle cx={PLAZA.cx} cy={PLAZA.cy} r={PLAZA.r} fill="#e6e0d4" stroke="#d7ccc8" strokeWidth={8} />
      <circle cx={PLAZA.cx} cy={PLAZA.cy} r={PLAZA.r * 0.55} fill="none" stroke="#d7ccc8" strokeWidth={4} />
      <rect x={SAND.x} y={SAND.y} width={SAND.w} height={SAND.h} rx={40} fill="#f3c9a8" stroke="#e0b590" strokeWidth={6} />
      {/* 湖，東邊有小溪流進河 */}
      <path d="M2540 430 C2610 425 2660 420 2720 410 L2720 530 C2660 520 2610 515 2540 510 Z" fill="#8fd0ec" />
      <ellipse cx={LAKE.cx} cy={LAKE.cy} rx={LAKE.rx} ry={LAKE.ry} fill="#8fd0ec" stroke="#7cc6e8" strokeWidth={12} />
      <WaterShimmer seed={402} x0={LAKE.cx - 220} x1={LAKE.cx + 160} y0={LAKE.cy - 150} y1={LAKE.cy + 150} count={9} color="#c7ecf8" />
      {/* 綠籬：公園和商店建築之間、南邊入口兩側 */}
      <g fill="#7cb342" stroke="#558b2f" strokeWidth={4}>
        <rect x={SHOPS.x0 - 10} y={712} width={SHOPS.x1 - SHOPS.x0 + 20} height={42} rx={20} />
        <rect x={10} y={1092} width={250} height={38} rx={18} />
        <rect x={400} y={1092} width={240} height={38} rx={18} />
        <rect x={1960} y={1092} width={620} height={38} rx={18} />
      </g>
      {scatter(403, 60, 20, 2580, 0.9).map(({ x, r }, i) => {
        const y = 240 + ((r * 13.7) % 1) * 860;
        return skip(x, y) ? null : <circle key={i} cx={x} cy={y} r={5} fill={r > 0.5 ? '#f48fb1' : '#fff176'} />;
      })}
      <SwayTufts seed={404} x0={20} x1={2580} y0={240} y1={1080} count={45} color="#7cb342" skip={skip} />
    </g>
  );
}

const BUILDINGS = [
  { w: 220, roof: '#b0bec5', wall: '#cfd8dc' }, { w: 200, roof: '#ffcc80', wall: '#ffe0b2' },
  { w: 240, roof: '#bcaaa4', wall: '#d7ccc8' }, { w: 210, roof: '#9fa8da', wall: '#c5cae9' },
  { w: 230, roof: '#ffab91', wall: '#ffccbc' }, { w: 200, roof: '#aed581', wall: '#dcedc8' },
];

function Shops() {
  const out: ReactNode[] = [];
  for (let x = SHOPS.x0, i = 0; x < SHOPS.x1; i++) {
    const b = BUILDINGS[i % BUILDINGS.length];
    const w = Math.min(b.w, SHOPS.x1 - x);
    const cafe = x >= 1300;
    const wall = cafe ? '#d7ccc8' : b.wall;
    out.push(
      <g key={x}>
        <rect x={x} y={SHOPS.roof} width={w} height={SHOPS.facade - SHOPS.roof} fill={cafe ? '#a1887f' : b.roof} stroke="#78909c" strokeWidth={3} />
        <rect x={x} y={SHOPS.facade} width={w} height={SHOPS.base - SHOPS.facade} fill={wall} stroke="#78909c" strokeWidth={3} />
        {range(Math.floor((w - 30) / 60)).map((col) => {
          const wx = x + 25 + col * 60;
          const lit = (i * 5 + col * 3) % 7 === 0;
          return (
            <g key={col}>
              <rect x={wx} y={SHOPS.facade + 22} width={36} height={40} fill="#e3f2fd" stroke="#90a4ae" strokeWidth={2} />
              {lit && <Glow dur={5 + (col % 3)} phase={((i + col) % 7) / 7}><rect x={wx + 2} y={SHOPS.facade + 24} width={32} height={36} fill="#fff59d" /></Glow>}
            </g>
          );
        })}
        <rect x={x + w / 2 - 22} y={SHOPS.base - 70} width={44} height={70} fill="#8d6e63" stroke="#5d4037" strokeWidth={2} />
      </g>,
    );
    x += w;
  }
  return <g>{out}</g>;
}

function Street() {
  const planters = [[60, 220], [420, 580], [2010, 2170], [2390, 2550]];
  return (
    <g>
      <rect x={0} y={STREET.walkN} width={STREET.x1} height={STREET.road - STREET.walkN} fill="#e0e0e0" />
      <rect x={0} y={STREET.roadEnd} width={STREET.x1} height={STREET.walkS - STREET.roadEnd} fill="#e0e0e0" />
      {range(Math.ceil(STREET.x1 / 80)).map((i) => (
        <g key={i} stroke="#cfd8dc" strokeWidth={2}>
          <line x1={i * 80} y1={STREET.walkN} x2={i * 80} y2={STREET.road} />
          <line x1={i * 80} y1={STREET.roadEnd} x2={i * 80} y2={STREET.walkS} />
        </g>
      ))}
      <rect x={0} y={STREET.road - 8} width={STREET.x1} height={8} fill="#b0bec5" />
      <rect x={0} y={STREET.road} width={STREET.x1} height={STREET.roadEnd - STREET.road} fill="#90a4ae" />
      <rect x={0} y={STREET.roadEnd - 4} width={STREET.x1} height={8} fill="#b0bec5" />
      {range(Math.ceil(STREET.x1 / 160)).map((i) => <rect key={i} x={i * 160 + 30} y={1376} width={90} height={8} fill="#ffffff" opacity={0.8} />)}
      {/* 人行道的花台（草叢會動） */}
      {planters.map(([x0, x1]) => (
        <g key={x0}>
          <rect x={x0} y={1596} width={x1 - x0} height={34} rx={6} fill="#8d6e63" />
          <rect x={x0 + 6} y={1598} width={x1 - x0 - 12} height={22} rx={4} fill="#9ccc65" />
          <SwayTufts seed={x0} x0={x0 + 14} x1={x1 - 14} y0={1614} y1={1618} count={5} color="#558b2f" />
        </g>
      ))}
    </g>
  );
}

function Supermarket({ town }: { town: Town }) {
  const market = town.districts.find((d) => d.scene.id === 'supermarket')?.scene;
  const signColors = ['#90caf9', '#a5d6a7', '#b3e5fc', '#ffcc80'];
  return (
    <g>
      <rect x={0} y={STREET.walkS} width={MARKET.x1} height={MARKET.wall - STREET.walkS} fill="#d7ccc8" />
      <rect x={0} y={MARKET.wall} width={MARKET.x1} height={MARKET.wallFace - MARKET.wall} fill="#8d6e63" />
      <rect x={0} y={MARKET.wallFace} width={MARKET.x1} height={MARKET.floor - MARKET.wallFace} fill="#fff8e1" />
      <rect x={0} y={MARKET.floor - 15} width={MARKET.x1} height={15} fill="#bcaaa4" />
      <rect x={0} y={MARKET.floor} width={MARKET.x1} height={MARKET.south - MARKET.floor} fill="#eceff1" />
      <g stroke="#cfd8dc" strokeWidth={2}>
        {range(Math.ceil(MARKET.x1 / 90)).map((i) => <line key={`v${i}`} x1={i * 90} y1={MARKET.floor} x2={i * 90} y2={MARKET.south} />)}
        {range(Math.ceil((MARKET.south - MARKET.floor) / 90)).map((i) => <line key={`h${i}`} x1={0} y1={MARKET.floor + i * 90} x2={MARKET.x1} y2={MARKET.floor + i * 90} />)}
      </g>
      <rect x={0} y={MARKET.wall} width={22} height={CORE.h - MARKET.wall} fill="#8d6e63" />
      <rect x={MARKET.x1 - 22} y={MARKET.wall} width={22} height={CORE.h - MARKET.wall} fill="#8d6e63" />
      <rect x={0} y={MARKET.south} width={MARKET.x1} height={CORE.h - MARKET.south} fill="#8d6e63" />
      {/* 後牆上的區域吊牌與壁燈 */}
      {market?.zones.map((z, i) => {
        const cx = (z.x0 + z.x1) / 2;
        return (
          <g key={z.id}>
            <HangSwing dur={4 + i * 0.4} phase={i * 0.23}>
              <line x1={cx - 140} y1={MARKET.wallFace} x2={cx - 140} y2={MARKET.wallFace + 20} stroke="#90a4ae" strokeWidth={3} />
              <line x1={cx + 140} y1={MARKET.wallFace} x2={cx + 140} y2={MARKET.wallFace + 20} stroke="#90a4ae" strokeWidth={3} />
              <rect x={z.x0 + 80} y={MARKET.wallFace + 18} width={z.x1 - z.x0 - 160} height={46} rx={10} fill={signColors[i % signColors.length]} />
              <circle cx={cx} cy={MARKET.wallFace + 41} r={13} fill="#ffffff" opacity={0.8} />
            </HangSwing>
            {[z.x0 + 60, z.x1 - 80].map((lx) => (
              <Glow key={lx} dur={5} phase={((i + lx) % 5) / 5}><rect x={lx} y={MARKET.wallFace + 95} width={24} height={14} rx={4} fill="#fff59d" stroke="#e0e0e0" strokeWidth={2} /></Glow>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function River({ height }: { height: number }) {
  const west = `M2700 ${RIVER_TOP} C2690 800 2712 1200 2690 1600 C2674 2000 2700 2300 2694 ${height}`;
  const eastEdge = `M2932 ${height} C2940 2250 2918 1900 2930 1500 C2942 1100 2915 750 2922 ${RIVER_TOP}`;
  return (
    <g>
      {/* 西岸步道（商業街、超市的東邊） */}
      <rect x={2600} y={0} width={110} height={height} fill="#d7ccc8" />
      <path d={`${west} L${eastEdge.slice(1)} Z`} fill="#7cc6e8" />
      <path d="M2700 330 C2760 300 2860 300 2922 330 L2922 400 L2700 400 Z" fill="#7cc6e8" />
      <path d={west} fill="none" stroke="#bcaaa4" strokeWidth={12} />
      <path d={eastEdge} fill="none" stroke="#bcaaa4" strokeWidth={12} />
      <WaterShimmer seed={501} x0={2715} x1={2905} y0={420} y1={height - 20} count={Math.round(22 * height / CORE.h)} color="#b3e5fc" vertical />
    </g>
  );
}

function EastBank({ height }: { height: number }) {
  // 北邊延續公園的草地，往南過渡成河岸步道的鋪面（一路到地圖南緣）；步道上有幾個花台
  const edge = `M2935 760 C3150 690 3350 820 ${CORE.w} 730`;
  const planters = [[3060, 1180], [3380, 1480], [3100, 2150], [3420, 2420]];
  return (
    <g>
      <path d={`${edge} L${CORE.w} ${height} L2935 ${height} Z`} fill="#e7dccb" />
      <path d={edge} fill="none" stroke="#d7ccc8" strokeWidth={10} />
      <g stroke="#d7ccc8" strokeWidth={2}>
        {range(16).map((i) => <line key={i} x1={2960 + i * 45} y1={840} x2={2960 + i * 45 - 40} y2={height} />)}
      </g>
      <path d="M2920 585 C3120 560 3350 640 3560 600" fill="none" stroke="#eadfc6" strokeWidth={60} strokeLinecap="round" />
      <SwayTufts seed={502} x0={2990} x1={3580} y0={240} y1={680} count={14} color="#7cb342" />
      {planters.map(([x, y]) => (
        <g key={x}>
          <rect x={x} y={y} width={130} height={34} rx={6} fill="#8d6e63" />
          <rect x={x + 6} y={y + 2} width={118} height={22} rx={4} fill="#9ccc65" />
          <SwayTufts seed={x + y} x0={x + 14} x1={x + 116} y0={y + 18} y1={y + 22} count={4} color="#558b2f" />
        </g>
      ))}
    </g>
  );
}

interface WorldBackgroundProps {
  town: Town;
  /** 看得到的分區（逗號分隔的 SECTIONS key；用字串讓 memo 只在分區變動時重畫） */
  activeSections: string;
}

function WorldBackgroundImpl({ town, activeSections }: WorldBackgroundProps) {
  const active = new Set(activeSections.split(','));
  const section = (key: string, node: ReactNode) => <g className={active.has(key) ? undefined : 'district--idle'}>{node}</g>;
  return (
    <>
      <rect width={town.width} height={town.height} fill="#b7d98b" />
      {section('park', <Park />)}
      {section('shops', <Shops />)}
      {section('street', <Street />)}
      {section('market', <Supermarket town={town} />)}
      {section('river', <River height={town.height} />)}
      {section('east', <EastBank height={town.height} />)}
      {town.districts.map((d) => d.scene.terrain && <g key={d.scene.id}>{section(genKey(d.scene.id), <GeneratedDistrict terrain={d.scene.terrain} />)}</g>)}
      {town.districts.map((d) => <Surfaces key={d.scene.id} surfaces={d.scene.surfaces} />)}
    </>
  );
}

export const WorldBackground = memo(WorldBackgroundImpl);
