import type { SiteFeature } from '@/lib/types';
import { SwayTufts, WaterShimmer } from '../Ambient';
import { Surfaces } from '../Surfaces';

const GROUND = { grass: '#acc889', sand: '#dfcb9f', rock: '#c1ced0', mulch: '#bba081' };

/** 地面用俯視輪廓，家具用低對比色；可找的物品由 DistrictLayer 獨立繪製。 */
export function SiteFeatures({ features }: { features: readonly SiteFeature[] }) {
  return <g data-site-features="" pointerEvents="none">{features.map((f) => {
    const { x0: x, y0: y } = f;
    const w = f.x1 - x;
    const h = f.y1 - y;
    const fill = GROUND[f.surface ?? 'grass'];
    const common = { x, y, width: w, height: h };
    let shape;
    switch (f.kind) {
      case 'path':
        shape = <rect {...common} rx={Math.min(w, h) / 3} fill="#eee3cf" stroke="#d6c9ae" strokeWidth={3} />;
        break;
      case 'walkway':
        shape = <rect {...common} rx={Math.min(w, h) / 3} fill="#eee3cf" opacity={.86} stroke="#d6c9ae" strokeWidth={3} />;
        break;
      case 'queue':
        shape = <g>
          <rect {...common} rx={Math.min(w, h) / 4} fill="#dfe8e4" opacity={.65} />
          {Array.from({ length: Math.max(1, Math.floor(w / 150)) }, (_, i) => (
            <g key={i} fill="#9fb3ad" opacity={.8}>
              <circle cx={x + 45 + i * 150} cy={y + h * .28} r={7} />
              <circle cx={x + 45 + i * 150} cy={y + h * .72} r={7} />
              <rect x={x + 40 + i * 150} y={y + h * .28} width={10} height={h * .44} rx={4} />
            </g>
          ))}
        </g>;
      case 'habitat':
        shape = <>
          <rect {...common} rx={32} fill={fill} stroke="#829178" strokeWidth={12} />
          <rect x={x + 10} y={y + 10} width={w - 20} height={h - 20} rx={25} fill="none" stroke="#d1d8c5" strokeWidth={3} />
          <path d={`M${x + 24} ${f.y1 - 8}H${f.x1 - 24}`} stroke="#607561" strokeWidth={7} strokeDasharray="3 22" />
        </>;
        break;
      case 'bed':
        shape = <>
          <rect {...common} rx={Math.min(w, h) / 5} fill={f.surface === 'sand' ? '#e2cd9e' : '#b59778'} stroke="#cfb896" strokeWidth={12} />
          <rect x={x + 14} y={y + 14} width={w - 28} height={h - 28} rx={Math.min(w, h) / 6} fill="none" stroke="#a68b6f" strokeWidth={2} strokeDasharray="3 13" />
        </>;
        break;
      case 'pond':
        shape = <>
          <rect {...common} rx={Math.min(w, h) / 3} fill="#90c9d1" stroke="#bbc8bd" strokeWidth={12} />
          <defs><clipPath id={`pond-${f.id}-${x}-${y}`}><rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={Math.min(w, h) / 3} /></clipPath></defs>
          <g clipPath={`url(#pond-${f.id}-${x}-${y})`}>
            <WaterShimmer seed={Math.round(x + y)} x0={x + 25} x1={f.x1 - 55} y0={y + 25} y1={f.y1 - 25} count={4} color="#d1edf0" />
          </g>
        </>;
        break;
      case 'canopy':
        shape = <g fill="#71966c" opacity={0.75}>
          <ellipse cx={x + w * .48} cy={y + h * .55} rx={w * .48} ry={h * .42} />
          <ellipse cx={x + w * .32} cy={y + h * .35} rx={w * .30} ry={h * .32} fill="#8baa79" />
          <ellipse cx={x + w * .7} cy={y + h * .4} rx={w * .3} ry={h * .34} />
          <SwayTufts seed={Math.round(x)} x0={x + 15} x1={f.x1 - 15} y0={y + h * .65} y1={y + h * .8} count={4} color="#6c9367" />
        </g>;
        break;
      case 'seating':
        shape = <g fill="#b7a184" stroke="#9c866e" strokeWidth={3} opacity={.52}>
          {[.27, .73].map((t) => (
            <g key={t} transform={`translate(${x + w * t} ${y + h * .5})`}>
              <rect x={-70} y={-14} width={140} height={28} rx={7} />
              <path d="M-52 16V34M52 16V34" strokeWidth={6} />
              <path d="M-62 -20H62" strokeWidth={7} />
            </g>
          ))}
        </g>;
        break;
      case 'shelter':
        shape = <>
          <rect x={x + 9} y={y + 15} width={w} height={h - 15} rx={8} fill="#52715b" opacity={.18} />
          <rect {...common} rx={8} fill="#c5b496" stroke="#a5967a" strokeWidth={3} />
          <path d={`M${x} ${y + h / 2}H${f.x1}`} stroke="#ded1b6" strokeWidth={5} />
        </>;
        break;
      case 'court':
        shape = <>
          <rect {...common} rx={10} fill="#bdcfb8" stroke="#e5eadb" strokeWidth={5} />
          <rect x={x + 24} y={y + 24} width={w - 48} height={h - 48} fill="none" stroke="#edf0df" strokeWidth={4} />
          <path d={`M${x + w / 2} ${y + 24}V${f.y1 - 24}`} stroke="#edf0df" strokeWidth={4} />
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={55} ry={h * .16} fill="none" stroke="#edf0df" strokeWidth={4} />
        </>;
        break;
      default: {
        const shelf = f.kind === 'shelf';
        shape = <Surfaces surfaces={[{
          look: shelf ? 'shelf' : f.kind === 'plinth' ? 'platform' : 'desk', zone: f.id,
          x0: x, x1: f.x1, levels: shelf ? [f.y1, f.y1 - 95] : [f.y1],
          base: f.y1 + (shelf ? 55 : f.kind === 'plinth' ? 22 : 80),
        }]} />;
      }
    }
    return <g key={f.id} data-site-id={f.id}>{shape}</g>;
  })}</g>;
}
