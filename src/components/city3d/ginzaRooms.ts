// 店內：地板、內牆、天花板、玻璃店面（門口留空）與暖色燈。房間範圍見 src/lib/city3d/rooms.ts。
import * as THREE from 'three';
import { PALETTE, type ColorKey } from '@/lib/city3d/model-dsl';
import type { Footprint } from '@/lib/city3d/footprint';
import { toWorld, type StreetFrame } from '@/lib/city3d/street-frame';
import type { RoomStyle, StreetRoom } from '@/lib/city3d/rooms';
import { outlineMaterial, toonMaterial } from './toon';

const WALL = 0.12;
const SILL = 0.35;
const GLASS_TOP = 2.7;
const POST = 0.24;
const SHELF_DEPTH = 0.4;
const GOODS: ColorKey[] = ['red', 'blue', 'yellow', 'green', 'pink', 'orange', 'indigo', 'white', 'purple'];

/** 固定種子的亂數：每次載入陳列都一樣 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** 店面要擋路的部分（門口以外），本地座標同房間：x 沿街、z 往室內 */
function frontSolids(room: StreetRoom): [number, number][] {
  return [[room.u0, room.door[0]], [room.door[1], room.u1]];
}

function footprint(frame: StreetFrame, yaw: number, u: number, v: number, halfW: number, halfD: number): Footprint {
  const [x, z] = toWorld(frame, u, v);
  return { x, z, yaw, minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD };
}

export function buildRoom(frame: StreetFrame, room: StreetRoom, style: RoomStyle) {
  const group = new THREE.Group();
  const [ox, oz] = toWorld(frame, 0, 0);
  group.position.set(ox, 0, oz);
  // 本地 x = 沿街方向、本地 z = 離馬路方向
  const yaw = Math.atan2(-frame.dir[1], frame.dir[0]);
  group.rotation.y = yaw;

  const ink = outlineMaterial();
  const solid = (c: ColorKey) => toonMaterial({ color: PALETTE[c] });
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, line = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    if (line) {
      const edge = new THREE.Mesh(mesh.geometry, ink);
      edge.position.copy(mesh.position);
      group.add(edge);
    }
    return mesh;
  };

  const W = room.u1 - room.u0, D = room.v1 - room.v0, H = room.height;
  const cu = (room.u0 + room.u1) / 2, cv = (room.v0 + room.v1) / 2;
  const wall = solid(style.wall), accent = solid(style.accent);
  add(W, 0.04, D, cu, 0, cv, solid(style.floor));
  add(W, WALL, D, cu, H - WALL, cv, solid('cream'));
  add(W, H, WALL, cu, 0, room.v1 - WALL / 2, wall);
  add(WALL, H, D, room.u0 + WALL / 2, 0, cv, wall);
  add(WALL, H, D, room.u1 - WALL / 2, 0, cv, wall);
  // 踢腳板
  add(W - 0.3, 0.12, 0.04, cu, 0, room.v1 - WALL - 0.02, accent);

  // 店面：窗台 + 玻璃 + 立柱，門口上方和整排招牌帶連起來
  const glass = toonMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.28, depthWrite: false });
  const front = room.v0;
  for (const [a, b] of frontSolids(room)) {
    const w = b - a;
    if (w <= 0) continue;
    add(w, SILL, 0.3, (a + b) / 2, 0, front, accent, true);
    const pane = add(w, GLASS_TOP - SILL, 0.04, (a + b) / 2, SILL, front, glass);
    pane.receiveShadow = false;
    for (const x of [a + POST / 2, b - POST / 2]) add(POST, GLASS_TOP, 0.3, x, 0, front, accent, true);
  }
  add(W, H - GLASS_TOP, 0.4, cu, GLASS_TOP, front, accent, true);
  // 招牌帶的室內那一面和牆同色
  add(W - 2 * WALL, H - GLASS_TOP, 0.02, cu, GLASS_TOP, front + 0.21, wall);
  add(room.door[1] - room.door[0] + 0.2, 0.04, 1.2, (room.door[0] + room.door[1]) / 2, 0, front - 0.6, solid('grey'));

  // 腰板：牆下段換成強調色，房間不會只是一片白
  const WAIN = 0.9;
  add(W - 2 * WALL, WAIN, 0.03, cu, 0, room.v1 - WALL - 0.015, solid(style.floor));
  add(0.03, WAIN, D - WALL, room.u0 + WALL + 0.015, 0, cv, solid(style.floor));
  add(0.03, WAIN, D - WALL, room.u1 - WALL - 0.015, 0, cv, solid(style.floor));
  add(W - 2 * WALL, 0.05, 0.06, cu, WAIN, room.v1 - WALL - 0.03, accent);

  // 側牆的畫框（純色塊，背景不放文字）
  const rand = seeded(room.id.length * 7919 + Math.round(room.u0 * 13));
  for (const [x, sign] of [[room.u0 + WALL, 1], [room.u1 - WALL, -1]] as const) {
    for (const z of [cv - D * 0.18, cv + D * 0.18]) {
      add(0.05, 0.9, 0.7, x + sign * 0.03, 1.5, z, solid('ink'));
      add(0.05, 0.74, 0.54, x + sign * 0.05, 1.58, z, solid(GOODS[Math.floor(rand() * GOODS.length)]));
    }
  }

  if (style.rug) {
    const { u, v, w, d, color } = style.rug;
    add(w, 0.02, d, u, 0.04, v, solid(color));
    add(w - 0.3, 0.021, d - 0.3, u, 0.04, v, solid('cream'));
    add(w - 0.5, 0.022, d - 0.5, u, 0.04, v, solid(color));
  }

  const blockers: Footprint[] = [];
  if (style.shelf) {
    const { u0, u1, bottom } = style.shelf;
    const sw = u1 - u0, su = (u0 + u1) / 2;
    const sz = room.v1 - WALL - SHELF_DEPTH / 2;
    const top = bottom > 0.5 ? bottom + 1.2 : 2.4;
    const wood = solid(style.floor === 'brown' ? 'tan' : 'brown');
    const levels = bottom > 0.5 ? [bottom, bottom + 0.6, bottom + 1.2] : [0.1, 0.75, 1.4, 2.05];
    if (bottom <= 0.5) {
      add(sw, top, 0.05, su, 0, room.v1 - WALL - 0.03, wood);
      blockers.push(footprint(frame, yaw, su, sz, sw / 2, SHELF_DEPTH / 2));
    }
    for (const x of [u0, u1]) add(0.06, top - (bottom > 0.5 ? bottom : 0), SHELF_DEPTH, x, bottom > 0.5 ? bottom : 0, sz, wood, true);
    for (const y of levels) {
      add(sw, 0.05, SHELF_DEPTH, su, y, sz, wood, true);
      if (y === levels[levels.length - 1] && bottom > 0.5) break;
      // 層板上的商品：高低不一的色塊
      for (let x = u0 + 0.25; x < u1 - 0.25; x += 0.3 + rand() * 0.25) {
        if (rand() < 0.18) continue;
        const h = 0.18 + rand() * 0.3;
        add(0.2, h, 0.22, x, y + 0.05, sz + 0.02, solid(GOODS[Math.floor(rand() * GOODS.length)]), true);
      }
    }
  }

  // 天花板燈：吊燈 + 點光源。光源放低一點，天花板不會出現一圈過曝
  const lamps = Math.max(1, Math.round(W / 6));
  for (let i = 0; i < lamps; i++) {
    const x = room.u0 + (W * (i + 0.5)) / lamps;
    add(0.3, 0.05, 0.3, x, H - WALL - 0.05, cv, solid('ink'));
    // 吊燈要比室內鏡頭高（鏡頭最高到天花板下 CEILING_GAP），不然會擋住畫面
    add(0.03, 0.3, 0.03, x, H - WALL - 0.3, cv, solid('ink'));
    add(0.5, 0.16, 0.5, x, H - WALL - 0.46, cv, solid(style.accent), true);
    const light = new THREE.PointLight('#fff3e0', 2.2, 11, 1.2);
    light.position.set(x, H - 1.6, cv);
    group.add(light);
  }

  for (const [a, b] of frontSolids(room)) {
    if (b > a) blockers.push(footprint(frame, yaw, (a + b) / 2, front, (b - a) / 2, 0.15));
  }
  return { group, blockers };
}
