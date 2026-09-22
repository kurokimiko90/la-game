// 自動擴展的街區地形：照場景 JSON 的 terrain（scripts/lib/district-kit.mjs 算好的幾何）畫出地面、後牆、車道、鐵軌、水池。
// 規範（docs/scene-standard.md）：不放文字、重複元素用 scatter 抖動、每個區域至少一個背景動態、不畫像單字物品的東西。
// 檯面（吧台、長桌…）由 Surfaces 畫，這裡不畫。
import type { ReactNode } from 'react';
import { scatter } from '@/lib/scatter';
import type { DistrictTerrain, TerrainZone } from '@/lib/types';
import { Glow, SwayTufts, WaterShimmer } from '../Ambient';

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);

const FLOOR: Record<TerrainZone['floor'], { fill: string; line: string }> = {
  tile: { fill: '#eceff1', line: '#cfd8dc' },
  wood: { fill: '#dcb98f', line: '#c49a6c' },
  carpet: { fill: '#c5cae9', line: '#9fa8da' },
  grass: { fill: '#b7d98b', line: '#a5cd73' },
  paving: { fill: '#e6e0d4', line: '#d7ccc8' },
  sand: { fill: '#f3dfb4', line: '#e6c98f' },
  concrete: { fill: '#d5dbdf', line: '#b0bec5' },
};
const WALL = { cap: '#8d6e63', face: '#fff3e0', base: '#bcaaa4' };

function Floor({ z }: { z: TerrainZone }) {
  const { fill, line } = FLOOR[z.floor];
  const top = z.wallBase ?? z.y0;
  const w = z.x1 - z.x0;
  const h = z.y1 - top;
  let pattern: ReactNode = null;
  if (z.floor === 'tile' || z.floor === 'paving') {
    const step = z.floor === 'tile' ? 90 : 70;
    pattern = (
      <g stroke={line} strokeWidth={2}>
        {range(Math.floor(w / step)).map((i) => <line key={`v${i}`} x1={z.x0 + (i + 1) * step} y1={top} x2={z.x0 + (i + 1) * step} y2={z.y1} />)}
        {range(Math.floor(h / step)).map((i) => <line key={`h${i}`} x1={z.x0} y1={top + (i + 1) * step} x2={z.x1} y2={top + (i + 1) * step} />)}
      </g>
    );
  } else if (z.floor === 'wood') {
    pattern = <g stroke={line} strokeWidth={2}>{range(Math.floor(h / 45)).map((i) => <line key={i} x1={z.x0} y1={top + (i + 1) * 45} x2={z.x1} y2={top + (i + 1) * 45} />)}</g>;
  } else if (z.floor === 'carpet') {
    pattern = <rect x={z.x0 + 40} y={top + 30} width={w - 80} height={h - 60} rx={20} fill="none" stroke={line} strokeWidth={10} />;
  } else if (z.floor === 'concrete') {
    pattern = <g stroke={line} strokeWidth={2}>{range(Math.floor(w / 220)).map((i) => <line key={i} x1={z.x0 + (i + 1) * 220} y1={top} x2={z.x0 + (i + 1) * 220} y2={z.y1} />)}</g>;
  } else {
    // 草地、沙地：抖動的色塊，不等距
    pattern = scatter(z.x0 + z.y0, Math.floor(w / 120), z.x0 + 40, z.x1 - 40, 0.9).map(({ x, r }, i) => (
      <ellipse key={i} cx={x} cy={top + 40 + ((r * 7.1) % 1) * (h - 80)} rx={z.floor === 'sand' ? 8 : 90 + r * 60} ry={z.floor === 'sand' ? 5 : 40 + r * 20} fill={line} opacity={0.6} />
    ));
  }
  return (
    <g>
      <rect x={z.x0} y={top} width={w} height={h} fill={fill} />
      {pattern}
    </g>
  );
}

/** 室內：後牆 + 兩側牆柱，牆上的燈會明暗變化（背景動態） */
function BackWall({ z }: { z: TerrainZone }) {
  if (!z.wallBase) return null;
  const w = z.x1 - z.x0;
  return (
    <g>
      <rect x={z.x0} y={z.y0} width={w} height={16} fill={WALL.cap} />
      <rect x={z.x0} y={z.y0 + 16} width={w} height={z.wallBase - z.y0 - 16} fill={WALL.face} />
      <rect x={z.x0} y={z.wallBase - 10} width={w} height={10} fill={WALL.base} />
      <rect x={z.x0} y={z.y0} width={14} height={z.y1 - z.y0} fill={WALL.cap} />
      <rect x={z.x1 - 14} y={z.y0} width={14} height={z.y1 - z.y0} fill={WALL.cap} />
      {[0.2, 0.5, 0.8].map((t, i) => (
        <Glow key={t} dur={4.5 + i * 0.7} phase={(z.x0 % 7) / 7 + i * 0.3}>
          <rect x={z.x0 + w * t - 14} y={z.y0 + 30} width={28} height={12} rx={4} fill="#fff59d" stroke="#e0e0e0" strokeWidth={2} />
        </Glow>
      ))}
    </g>
  );
}

function Road({ z }: { z: TerrainZone }) {
  if (!z.road) return null;
  const { y0, y1 } = z.road;
  const mid = (y0 + y1) / 2;
  return (
    <g>
      <rect x={z.x0} y={y0 - 8} width={z.x1 - z.x0} height={8} fill="#b0bec5" />
      <rect x={z.x0} y={y0} width={z.x1 - z.x0} height={y1 - y0} fill="#90a4ae" />
      <rect x={z.x0} y={y1} width={z.x1 - z.x0} height={8} fill="#b0bec5" />
      {range(Math.floor((z.x1 - z.x0) / 160)).map((i) => <rect key={i} x={z.x0 + i * 160 + 30} y={mid - 4} width={90} height={8} fill="#ffffff" opacity={0.8} />)}
    </g>
  );
}

function Track({ z }: { z: TerrainZone }) {
  if (!z.track) return null;
  const { y0, y1 } = z.track;
  const w = z.x1 - z.x0;
  return (
    <g>
      <rect x={z.x0} y={y0} width={w} height={14} fill="#bdbdbd" />
      <rect x={z.x0} y={y0 + 14} width={w} height={y1 - y0 - 14} fill="#a1887f" />
      {range(Math.floor(w / 36)).map((i) => <rect key={i} x={z.x0 + 10 + i * 36} y={y1 - 90} width={18} height={80} fill="#6d4c41" />)}
      <rect x={z.x0} y={y1 - 80} width={w} height={6} fill="#cfd8dc" />
      <rect x={z.x0} y={y1 - 36} width={w} height={6} fill="#cfd8dc" />
    </g>
  );
}

function Pool({ z }: { z: TerrainZone }) {
  if (!z.pool) return null;
  const p = z.pool;
  return (
    <g>
      <rect x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} rx={60} fill="#8fd0ec" stroke="#bcaaa4" strokeWidth={12} />
      <WaterShimmer seed={p.x0 + p.y0} x0={p.x0 + 40} x1={p.x1 - 100} y0={p.y0 + 40} y1={p.y1 - 40} count={8} color="#c7ecf8" />
    </g>
  );
}

/** 室外：上緣兩個花台，草叢會動（背景動態）；草地另外散一些草叢 */
function OutdoorAmbient({ z }: { z: TerrainZone }) {
  if (z.indoor) return null;
  const w = z.x1 - z.x0;
  const planters = [z.x0 + w * 0.08, z.x0 + w * 0.62];
  const blocked = (x: number, y: number) => Boolean((z.road && y > z.road.y0 - 20) || (z.track && y > z.track.y0 - 20) || (z.pool && x > z.pool.x0 - 20));
  return (
    <g>
      {planters.map((x) => (
        <g key={x}>
          <rect x={x} y={z.y0 + 18} width={w * 0.28} height={30} rx={6} fill="#8d6e63" />
          <rect x={x + 6} y={z.y0 + 20} width={w * 0.28 - 12} height={18} rx={4} fill="#9ccc65" />
          <SwayTufts seed={Math.round(x)} x0={x + 14} x1={x + w * 0.28 - 14} y0={z.y0 + 32} y1={z.y0 + 36} count={6} color="#558b2f" />
        </g>
      ))}
      {z.floor === 'grass' && <SwayTufts seed={z.x0 + z.y0 + 7} x0={z.x0 + 30} x1={z.x1 - 30} y0={z.y0 + 80} y1={z.y1 - 30} count={10} color="#7cb342" skip={blocked} />}
    </g>
  );
}

export function GeneratedDistrict({ terrain }: { terrain: DistrictTerrain }) {
  const { x0, y0, x1, y1 } = terrain;
  return (
    <g>
      {/* 街區外圍的人行道，和相鄰街區、河岸步道接在一起 */}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#d7ccc8" />
      {terrain.zones.map((z) => (
        <g key={z.id}>
          <Floor z={z} />
          <BackWall z={z} />
          <Road z={z} />
          <Track z={z} />
          <Pool z={z} />
          <OutdoorAmbient z={z} />
        </g>
      ))}
    </g>
  );
}
