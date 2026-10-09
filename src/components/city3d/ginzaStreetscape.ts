// 一樓店面櫥窗與遮陽棚。移植自 Ginza 專案 web/streetscape.js，改成 la-game 畫風（色票 + 卡通著色）。
// 不移植 OSM 店名招牌：la-game 的背景不放文字（場景要給多語言共用）。
// skip(x, z) 為真的牆面不加店面：遊戲區要讓「櫥窗」「遮陽棚」只指向要找的那一個物品。
import * as THREE from 'three';
import { pointInRing, type CityBuilding } from '@/lib/city3d/collision';
import { PALETTE } from '@/lib/city3d/model-dsl';
import { toonMaterial } from './toon';
import { createStreetFrontFilter } from '@/lib/city3d/street-front';
import type { Road } from './ginzaCity';

const SHOP_BOTTOM = 0.1;
const SHOP_TOP = 3.6;
const PANEL_M = 6;          // 店面圖樣每 6 m 重複一次
const VARIANTS = 8;
const WALL_OFFSET = 0.06;   // 貼在外牆外側，避免 z-fighting
const FRAMES = [PALETTE.tan, PALETTE.brown, PALETTE.white, PALETTE.green, PALETTE.blue, PALETTE.ink, PALETTE.red, PALETTE.cream];
const GOODS = [PALETTE.red, PALETTE.yellow, PALETTE.green, PALETTE.blue, PALETTE.orange, PALETTE.pink, PALETTE.purple, PALETTE.indigo];
const AWNINGS = [PALETTE.green, PALETTE.red, PALETTE.blue, PALETTE.yellow, PALETTE.orange, PALETTE.indigo];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return (h >>> 0) / 4294967295;
}

/** 8 種店面：色框 + 淺藍玻璃 + 色塊商品（和 2D 商店的櫥窗同一套畫法） */
function storefrontTexture(): THREE.CanvasTexture {
  const w = 1024, rowH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = rowH * VARIANTS;
  const d = canvas.getContext('2d')!;
  for (let v = 0; v < VARIANTS; v++) {
    const y0 = v * rowH;
    d.fillStyle = FRAMES[v]; d.fillRect(0, y0, w, rowH);
    d.fillStyle = PALETTE.ink; d.fillRect(0, y0, w, 18); // 上方簷板
    const panes = 3 + (v % 3);
    const paneW = w / panes;
    for (let i = 0; i < panes; i++) {
      const x = i * paneW + 10, y = y0 + 28, pw = paneW - 20, ph = rowH - 36;
      d.fillStyle = PALETTE.ink; d.fillRect(x - 3, y - 3, pw + 6, ph + 6);
      d.fillStyle = PALETTE.glass; d.fillRect(x, y, pw, ph);
      for (let k = 0; k < 4; k++) {
        const r = hash(`${v}-${i}-${k}`);
        d.fillStyle = GOODS[Math.floor(r * GOODS.length)];
        d.fillRect(x + pw * (0.1 + k * 0.22), y + ph * (0.45 + r * 0.2), pw * 0.13, ph * (0.5 - r * 0.2));
      }
      d.fillStyle = 'rgba(255,255,255,0.6)'; d.fillRect(x + pw * 0.06, y + 6, pw * 0.05, ph - 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

interface Buffer { position: number[]; normal: number[]; uv: number[]; color: number[] }
const newBuffer = (): Buffer => ({ position: [], normal: [], uv: [], color: [] });

function pushQuad(buf: Buffer, corners: THREE.Vector3[], normal: THREE.Vector3, uvs: [number, number][], color?: THREE.Color) {
  const [a, b, c, d] = corners;
  for (const [p, uv] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]] as [THREE.Vector3, [number, number]][]) {
    buf.position.push(p.x, p.y, p.z);
    buf.normal.push(normal.x, normal.y, normal.z);
    buf.uv.push(uv[0], uv[1]);
    if (color) buf.color.push(color.r, color.g, color.b);
  }
}

function meshFrom(buf: Buffer, material: THREE.Material, castShadow = false): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  if (buf.color.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildStreetscape(buildings: readonly CityBuilding[], roads: readonly Road[], skip: (x: number, z: number) => boolean): THREE.Group {
  const fronts = newBuffer(), awnings = newBuffer();
  const awningColor = new THREE.Color();
  const facesStreet = createStreetFrontFilter(buildings, roads);
  for (const b of buildings) {
    if ((b.base ?? 0) >= 2 || b.height < SHOP_TOP + 1) continue;
    for (const ring of b.outers) {
      for (let k = 0; k < ring.length; k++) {
        let p = ring[k], q = ring[(k + 1) % ring.length];
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (length < 2.5) continue;
        let nx = (q[1] - p[1]) / length, nz = -(q[0] - p[0]) / length;
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        if (skip(mx, mz)) continue;
        if (pointInRing(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
        if (!facesStreet(mx, mz, nx, nz)) continue;
        if ((-(q[1] - p[1])) * nx + (q[0] - p[0]) * nz < 0) [p, q] = [q, p];
        const off = (pt: [number, number], y: number, extra = 0) =>
          new THREE.Vector3(pt[0] + nx * (WALL_OFFSET + extra), y, pt[1] + nz * (WALL_OFFSET + extra));
        const normal = new THREE.Vector3(nx, 0, nz);
        const r = hash(`${b.id}-${k}`);
        const v = Math.floor(r * VARIANTS);
        const v0 = (v + 0.03) / VARIANTS, v1 = (v + 0.97) / VARIANTS;
        const u1 = length / PANEL_M;
        pushQuad(fronts, [off(p, SHOP_BOTTOM), off(q, SHOP_BOTTOM), off(q, SHOP_TOP), off(p, SHOP_TOP)], normal,
          [[0, 1 - v1], [u1, 1 - v1], [u1, 1 - v0], [0, 1 - v0]]);
        if (r > 0.68 && length < 24) {
          awningColor.set(AWNINGS[Math.floor(hash(`a${b.id}${k}`) * AWNINGS.length)]);
          const slope = new THREE.Vector3(nx * 0.5, 0.85, nz * 0.5).normalize();
          pushQuad(awnings, [off(p, SHOP_TOP - 0.55, 1.3), off(q, SHOP_TOP - 0.55, 1.3), off(q, SHOP_TOP), off(p, SHOP_TOP)], slope,
            [[0, 0], [1, 0], [1, 1], [0, 1]], awningColor);
        }
      }
    }
  }
  const group = new THREE.Group();
  group.add(
    meshFrom(fronts, toonMaterial({ map: storefrontTexture() })),
    meshFrom(awnings, toonMaterial({ vertexColors: true, side: THREE.DoubleSide }), true),
  );
  return group;
}
