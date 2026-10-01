// 西側環路外的林地：北邊接山腳，南邊接海岸。只畫俯視背景，不放可點物品。
import type { City } from '@/lib/city';
import { scatter } from '@/lib/scatter';
import { SwayTufts } from '../Ambient';
import { Canopy } from './CityStreets';

export function WestScenery({ city }: { city: City }) {
  const x0 = city.west.edge;
  const x1 = city.west.foot;
  const y0 = city.mountains.foot;
  const y1 = city.coast.sand;
  const width = x1 - x0;
  const height = y1 - y0;
  const mid = x0 + width * 0.52;
  const bends = Math.ceil(height / 760);
  const trail = `M${mid} ${y0} ${Array.from({ length: bends }, (_, i) => {
    const start = y0 + i * 760;
    const end = Math.min(y1, start + 760);
    return `Q${mid + (i % 2 === 0 ? -width * 0.28 : width * 0.28)} ${(start + end) / 2} ${mid} ${end}`;
  }).join(' ')}`;

  return (
    <g>
      <rect x={x0} y={y0} width={width} height={height} fill="#a5cd73" />
      {scatter(941, Math.max(3, Math.round(height / 580)), y0 + 250, y1 - 180, 0.75).map(({ x: y, r }, i) => (
        <ellipse key={i} cx={x0 + width * (0.3 + r * 0.4)} cy={y} rx={width * (0.36 + r * 0.18)} ry={210 + r * 150}
          fill={i % 2 === 0 ? '#87b95e' : '#b4d88a'} opacity={0.8} />
      ))}
      <path d={trail} fill="none" stroke="#d4c9a6" strokeWidth={58} strokeLinecap="round" opacity={0.75} />
      <path d={trail} fill="none" stroke="#e9dfbf" strokeWidth={42} strokeLinecap="round" opacity={0.9} />
      {scatter(942, Math.max(24, Math.round(height / 70)), y0 + 100, y1 - 100, 0.9).map(({ x: y, r }, i) => (
        <Canopy key={i} x={x0 + 95 + ((r * 11.7) % 1) * (width - 190)} y={y} r={50 + r * 26} tone={i} />
      ))}
      <SwayTufts seed={943} x0={x0 + 35} x1={x1 - 35} y0={y0 + 50} y1={y1 - 50}
        count={Math.round(height / 140)} color="#5c913a" />
    </g>
  );
}
