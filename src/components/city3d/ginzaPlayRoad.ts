// 遊戲區的車道：ginzaCity 的道路帶狀面在遊戲區不畫（人行道另鋪地磚），只剩整張城市的地面貼圖，
// 近看車道虛線會糊成白色污漬。這裡只在遊戲區補一層清楚的柏油與虛線，壓在人行道地磚（y 0.03）底下。
import * as THREE from 'three';
import { isMajorRoad, type Road } from '@/lib/city3d/road-layout';
import { toonMaterial } from './toon';

const WALK_KINDS = new Set(['footway', 'steps', 'path', 'cycleway', 'pedestrian']);
const ASPHALT = '#a2a8ad';
const DASH = 3;
const GAP = 5;

type Inside = (x: number, z: number) => boolean;

function pushQuad(buf: number[], ax: number, az: number, bx: number, bz: number, half: number, ext: number, y: number) {
  const length = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / length, dz = (bz - az) / length;
  const sx = ax - dx * ext, sz = az - dz * ext, ex = bx + dx * ext, ez = bz + dz * ext;
  const nx = -dz * half, nz = dx * half;
  const quad = [[sx + nx, sz + nz], [ex + nx, ez + nz], [ex - nx, ez - nz], [sx - nx, sz - nz]];
  for (const k of [0, 1, 2, 0, 2, 3]) buf.push(quad[k][0], y, quad[k][1]);
}

function flat(positions: number[], color: string, offset: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, toonMaterial({ color, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildPlayRoad(roads: readonly Road[], inside: Inside): THREE.Group {
  const asphalt: number[] = [], dashes: number[] = [];
  for (const road of roads) {
    if (road.crossing || WALK_KINDS.has(road.kind)) continue;
    let carry = 0;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01) continue;
      if (inside((ax + bx) / 2, (az + bz) / 2)) {
        pushQuad(asphalt, ax, az, bx, bz, road.width / 2, road.width / 2, 0.008);
        if (isMajorRoad(road)) {
          for (let s = carry; s < length; s += DASH + GAP) {
            const e = Math.min(length, s + DASH);
            const t0 = s / length, t1 = e / length;
            pushQuad(dashes, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 0.075, 0, 0.014);
          }
        }
      }
      carry = (((carry - length) % (DASH + GAP)) + DASH + GAP) % (DASH + GAP);
    }
  }
  const group = new THREE.Group();
  group.add(flat(asphalt, ASPHALT, -1), flat(dashes, '#fafafa', -2));
  return group;
}
