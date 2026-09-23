// 地圖邊緣與空地：南側沙灘和海（河在這裡出海）、東側丘陵與樹林、格線上還沒有街區的空地。
// 縮小看全圖時的方位地標：海邊的燈塔（光會明暗）、丘陵上的電波塔（紅燈閃）。都用俯視畫法，不像可點的物品。
import type { City } from '@/lib/city';
import { scatter } from '@/lib/scatter';
import type { Rect } from '@/lib/town';
import { Glow, SwayTufts, WaterShimmer } from '../Ambient';
import { Canopy } from './CityStreets';

interface Size {
  width: number;
  height: number;
}

function Coast({ city, world }: { city: City; world: Size }) {
  const { sand, sea } = city.coast;
  const w = world.width;
  const waves = scatter(733, Math.ceil(w / 260), 0, w, 0.5)
    .map(({ x, r }) => `Q${x + 65} ${sea - 22 - r * 16} ${x + 130} ${sea} T${x + 260} ${sea}`).join(' ');
  return (
    <g>
      <rect x={0} y={sand} width={w} height={world.height - sand} fill="#f3dfb4" />
      {scatter(734, Math.ceil(w / 90), 20, w - 20, 0.9).map(({ x, r }, i) => <ellipse key={i} cx={x} cy={sand + 20 + r * (sea - sand - 40)} rx={8} ry={5} fill="#e6c98f" />)}
      <path d={`M0 ${sea} ${waves} L${w} ${world.height} L0 ${world.height} Z`} fill="#6ec1e4" />
      <rect x={0} y={sea + 120} width={w} height={world.height - sea - 120} fill="#5ab0d8" opacity={0.6} />
      <path d={`M0 ${sea} ${waves}`} fill="none" stroke="#e1f5fe" strokeWidth={10} opacity={0.8} />
      <WaterShimmer seed={735} x0={40} x1={w - 120} y0={sea + 50} y1={world.height - 40} count={Math.round(w / 280)} color="#b3e5fc" />
    </g>
  );
}

/** 燈塔：防波堤盡頭的圓塔（俯視），光束會明暗 */
function Lighthouse({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 340} y={y - 16} width={340} height={32} rx={14} fill="#bdbdbd" stroke="#9e9e9e" strokeWidth={4} />
      <ellipse cx={x + 16} cy={y + 20} rx={46} ry={38} fill="#01579b" opacity={0.2} />
      <circle cx={x} cy={y} r={46} fill="#fafafa" stroke="#e53935" strokeWidth={12} />
      <circle cx={x} cy={y} r={20} fill="#e53935" />
      <Glow dur={2.6}>
        <path d={`M${x} ${y} L${x + 220} ${y - 70} L${x + 220} ${y + 70} Z`} fill="#fff59d" opacity={0.45} />
        <circle cx={x} cy={y} r={10} fill="#fff59d" />
      </Glow>
    </g>
  );
}

/** 電波塔：丘陵上的格子鐵塔（俯視），頂端紅燈閃 */
function RadioTower({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y} L${x + 90} ${y + 60}`} stroke="#33691e" strokeWidth={16} opacity={0.25} strokeLinecap="round" />
      <rect x={x - 34} y={y - 34} width={68} height={68} fill="none" stroke="#e53935" strokeWidth={8} />
      <path d={`M${x - 34} ${y - 34} L${x + 34} ${y + 34} M${x + 34} ${y - 34} L${x - 34} ${y + 34}`} stroke="#fafafa" strokeWidth={6} />
      <Glow dur={1.6}><circle cx={x} cy={y} r={12} fill="#ff1744" /></Glow>
    </g>
  );
}

function Hills({ city, world }: { city: City; world: Size }) {
  const x0 = city.hills;
  const w = world.width - x0;
  const h = city.coast.sand;
  const hills = scatter(812, Math.max(2, Math.round(h / 1300)), 300, h - 300, 0.8);
  return (
    <g>
      <rect x={x0} y={0} width={w} height={h} fill="#a5cd73" />
      {hills.map(({ x: y, r }, i) => {
        const cx = x0 + w * (0.35 + r * 0.35);
        return (
          <g key={i}>
            {[1, 0.72, 0.44].map((k, j) => <ellipse key={j} cx={cx} cy={y} rx={w * 0.55 * k} ry={420 * k} fill={['#9ccc65', '#8bc34a', '#7cb342'][j]} stroke="#689f38" strokeWidth={3} />)}
          </g>
        );
      })}
      {scatter(813, Math.round(h / 120), 40, h - 40, 0.9).map(({ x: y, r }, i) => <Canopy key={i} x={x0 + 60 + ((r * 9.7) % 1) * (w - 120)} y={y} r={26 + r * 16} tone={i} />)}
      <SwayTufts seed={814} x0={x0 + 30} x1={world.width - 30} y0={40} y1={h - 40} count={Math.round(h / 200)} color="#558b2f" />
      {hills[0] && <RadioTower x={x0 + w * (0.35 + hills[0].r * 0.35)} y={hills[0].x} />}
    </g>
  );
}

/** 空地：格線上還沒蓋的街區，先是一片小樹林 */
function Woods({ r }: { r: Rect }) {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  return (
    <g>
      <rect x={r.x0} y={r.y0} width={w} height={h} fill="#aed581" />
      {scatter(r.x0 + r.y0, Math.round(w / 90), r.x0 + 50, r.x1 - 50, 0.9).map(({ x, r: k }, i) => <Canopy key={i} x={x} y={r.y0 + 60 + ((k * 7.3) % 1) * (h - 120)} r={30 + k * 20} tone={i} />)}
      <SwayTufts seed={r.x0 + 3} x0={r.x0 + 30} x1={r.x1 - 30} y0={r.y0 + 40} y1={r.y1 - 30} count={12} color="#7cb342" />
    </g>
  );
}

export function CityEdges({ city, world }: { city: City; world: Size }) {
  return (
    <g>
      {city.vacant.map((r) => <Woods key={`${r.x0},${r.y0}`} r={r} />)}
      <Hills city={city} world={world} />
      <Coast city={city} world={world} />
      <Lighthouse x={city.hills - 420} y={city.coast.sea + 230} />
    </g>
  );
}
