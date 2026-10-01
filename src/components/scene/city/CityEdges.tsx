// 地圖邊緣與空地：南側沙灘和海、北側與東側的山、西側林地、格線上還沒有街區的空地。
// 縮小看全圖時的方位地標：海邊的燈塔（光會明暗）、東側山頂的電波塔、東北角主峰的觀景台與纜車。
import type { City } from '@/lib/city';
import { scatter } from '@/lib/scatter';
import type { Rect } from '@/lib/town';
import { Glow, SwayTufts, WaterShimmer } from '../Ambient';
import { Canopy } from './CityStreets';
import { Mountains } from './Mountains';
import { WestScenery } from './WestScenery';

interface Size {
  width: number;
  height: number;
}

function Coast({ city, world }: { city: City; world: Size }) {
  const { sand, sea } = city.coast;
  const x0 = city.west.edge;
  const w = world.width - x0;
  const waves = scatter(733, Math.ceil(w / 260), x0, world.width, 0.5)
    .map(({ x, r }) => `Q${x + 65} ${sea - 22 - r * 16} ${x + 130} ${sea} T${x + 260} ${sea}`).join(' ');
  return (
    <g>
      <rect x={x0} y={sand} width={w} height={world.height - sand} fill="#f3dfb4" />
      {scatter(734, Math.ceil(w / 90), x0 + 20, world.width - 20, 0.9).map(({ x, r }, i) => <ellipse key={i} cx={x} cy={sand + 20 + r * (sea - sand - 40)} rx={8} ry={5} fill="#e6c98f" />)}
      <path d={`M${x0} ${sea} ${waves} L${world.width} ${world.height} L${x0} ${world.height} Z`} fill="#6ec1e4" />
      <rect x={x0} y={sea + 120} width={w} height={world.height - sea - 120} fill="#5ab0d8" opacity={0.6} />
      <path d={`M${x0} ${sea} ${waves}`} fill="none" stroke="#e1f5fe" strokeWidth={10} opacity={0.8} />
      <WaterShimmer seed={735} x0={x0 + 40} x1={world.width - 120} y0={sea + 50} y1={world.height - 40} count={Math.round(w / 280)} color="#b3e5fc" />
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
      <Mountains city={city} world={world} />
      <WestScenery city={city} />
      <Coast city={city} world={world} />
      <Lighthouse x={city.hills - 420} y={city.coast.sea + 230} />
    </g>
  );
}
