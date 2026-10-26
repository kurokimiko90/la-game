// 室內區（地圖南邊，y ≥ town.outdoorHeight）：所有建築的室內剖面集中在這裡。
// 這裡畫走廊地面、和戶外街景之間的牆，以及每棟建築的外殼：屋頂色帶（小地圖的顏色）、外牆、房間之間的門、面向走廊的出入口。
// 房間本身（地板、後牆）由 GeneratedDistrict / 超市畫，這裡畫在它們上面。不放文字（建築名稱在頂部導覽列和小地圖）。
import { districtParts, type Town } from '@/lib/town';
import type { Zone } from '@/lib/types';
import { Glow } from '../Ambient';

const WALL = '#6d4c41';
const ROOF_H = 34;
const DOOR = { w: 70, top: 250, h: 150 }; // 房間之間的門（距房間上緣）
const ENTRY_W = 160; // 面向走廊的出入口

/** 走廊地面 + 和戶外之間的圍牆（牆上的燈會明暗變化：背景動態） */
export function IndoorGround({ town }: { town: Town }) {
  const y0 = town.outdoorHeight;
  const w = town.width;
  const lamps = Array.from({ length: Math.floor(w / 700) }, (_, i) => 350 + i * 700);
  return (
    <g>
      <rect x={0} y={y0} width={w} height={town.height - y0} fill="#e8e1d5" />
      <g stroke="#dcd3c4" strokeWidth={2}>
        {Array.from({ length: Math.floor((town.height - y0) / 120) }, (_, i) => <line key={i} x1={0} y1={y0 + (i + 1) * 120} x2={w} y2={y0 + (i + 1) * 120} />)}
      </g>
      <rect x={0} y={y0} width={w} height={22} fill="#8d6e63" />
      {lamps.map((x, i) => (
        <Glow key={x} dur={5 + (i % 3)} phase={(i * 0.31) % 1}>
          <rect x={x} y={y0 + 30} width={34} height={14} rx={5} fill="#fff59d" stroke="#e0e0e0" strokeWidth={2} />
        </Glow>
      ))}
    </g>
  );
}

// 相鄰的房間（右邊界接左邊界、上下重疊）之間開一扇門
function doorsBetween(zones: readonly Zone[]) {
  const doors: { x: number; y: number }[] = [];
  for (const a of zones) {
    for (const b of zones) {
      if (a !== b && a.x1 === b.x0 && a.y0 < b.y1 && b.y0 < a.y1) doors.push({ x: a.x1, y: Math.max(a.y0, b.y0) + DOOR.top });
    }
  }
  return doors;
}

/** 一棟建築的外殼：屋頂色帶、外牆、房間之間的門、左下角面向走廊的出入口 */
function Shell({ zones, color }: { zones: readonly Zone[]; color: string }) {
  const x0 = Math.min(...zones.map((z) => z.x0));
  const y0 = Math.min(...zones.map((z) => z.y0));
  const x1 = Math.max(...zones.map((z) => z.x1));
  const y1 = Math.max(...zones.map((z) => z.y1));
  const first = zones.reduce((a, b) => (b.x0 < a.x0 ? b : a));
  return (
    <g>
      <rect x={x0 - 12} y={y0 - ROOF_H} width={x1 - x0 + 24} height={ROOF_H} rx={6} fill={color} stroke={WALL} strokeWidth={4} />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={WALL} strokeWidth={10} />
      {doorsBetween(zones).map((d) => (
        <rect key={`${d.x},${d.y}`} x={d.x - DOOR.w / 2} y={d.y} width={DOOR.w} height={DOOR.h} rx={6} fill="#efe6d8" stroke={WALL} strokeWidth={3} />
      ))}
      <rect x={first.x0 + 120} y={y1 - 8} width={ENTRY_W} height={16} fill="#efe6d8" />
    </g>
  );
}

/** 所有街區的室內部分各畫一個外殼 */
export function IndoorShells({ town, colors }: { town: Town; colors: Readonly<Record<string, string>> }) {
  return (
    <g>
      {town.districts.flatMap((d) => districtParts(d).filter((p) => p.indoor).map((p) => (
        <Shell key={d.scene.id} zones={p.zones} color={colors[d.scene.id] ?? d.scene.terrain?.color ?? '#bcaaa4'} />
      )))}
    </g>
  );
}
