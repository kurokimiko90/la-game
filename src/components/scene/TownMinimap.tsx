// 左下角的小地圖：整張小鎮的街區分布（未解鎖為灰色）+ 目前看到的範圍，點一下跳過去。
import { buildCity, districtRects, EDGE, STREET } from '@/lib/city';
import type { Size, View } from '@/lib/geometry';
import type { Town } from '@/lib/town';
import type { Point } from '@/lib/types';

const WIDTH = 150;
const COLORS: Record<string, string> = { park: '#9ccc65', street: '#b0bec5', riverside: '#81d4fa', supermarket: '#ffcc80' };
const FALLBACK = '#e0e0e0';

interface TownMinimapProps {
  town: Town;
  view: View;
  size: Size;
  activeSceneId: string;
  lockedSceneIds: ReadonlySet<string>;
  onJumpTo: (p: Point) => void;
}

export function TownMinimap({ town, view, size, activeSceneId, lockedSceneIds, onJumpTo }: TownMinimapProps) {
  const left = EDGE.west;
  const top = EDGE.north;
  const height = (WIDTH * (town.height + top)) / (town.width + left);
  const city = buildCity(districtRects(town));
  const k = WIDTH / (town.width + left);
  const vx = Math.max(-left, -view.tx / view.scale);
  const vy = Math.max(-top, -view.ty / view.scale);
  const vw = Math.min(town.width, (size.width - view.tx) / view.scale) - vx;
  const vh = Math.min(town.height, (size.height - view.ty) / view.scale) - vy;

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJumpTo({ x: (e.clientX - r.left) / k - left, y: (e.clientY - r.top) / k - top });
  };

  return (
    <div data-ui="overlay" className="absolute bottom-3 left-3 z-40 overflow-hidden rounded-xl bg-white/85 p-1 shadow ring-1 ring-black/5" onPointerDown={(e) => e.stopPropagation()}>
      <svg width={WIDTH} height={height} viewBox={`${-left} ${-top} ${town.width + left} ${town.height + top}`} role="img" aria-label="小地圖：點一下移過去" onClick={onClick} className="block cursor-pointer">
        <rect x={-left} y={-top} width={town.width + left} height={town.height + top} fill="#dcedc8" />
        <rect x={-left} y={-top} width={town.width + left} height={city.mountains.foot + top} fill="#a5c9a0" />
        <rect x={-left} y={city.mountains.foot} width={left - STREET} height={city.coast.sand - city.mountains.foot} fill="#a5cd73" />
        <rect x={-left} y={city.coast.sea} width={town.width + left} height={town.height - city.coast.sea} fill="#81d4fa" />
        {city.streets.map((st) => <rect key={st.id} x={st.x0} y={st.y0} width={st.x1 - st.x0} height={st.y1 - st.y0} fill="#ffffff" />)}
        {town.districts.flatMap((d) => d.scene.zones.map((z) => (
          <rect key={`${d.scene.id}-${z.id}`} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0}
            fill={lockedSceneIds.has(d.scene.id) ? '#cfd8dc' : COLORS[d.scene.id] ?? d.scene.terrain?.color ?? FALLBACK}
            stroke={d.scene.id === activeSceneId ? '#00796b' : '#ffffff'} strokeWidth={d.scene.id === activeSceneId ? 40 : 20} />
        )))}
        <rect x={vx} y={vy} width={Math.max(0, vw)} height={Math.max(0, vh)} fill="none" stroke="#263238" strokeWidth={36} />
      </svg>
    </div>
  );
}
