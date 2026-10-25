// 一樓店面櫥窗與遮陽棚。移植自 Ginza 專案 web/streetscape.js，改成 la-game 畫風（色票 + 卡通著色）。
// 2026-10-11 版同步：牆面按約 5.5 m 分節，每節是「框架（門、竪框、簷板）＋玻璃後的店內縱深」，業態取鄰近 OSM 店家分類。
// 不移植 OSM 店名招牌：la-game 的背景不放文字（場景要給多語言共用）。
// skip(x, z) 為真的分節不加店面（遊戲區裡真的店內房間）；plain(x, z) 為真的牆面不加遮陽棚：
// 遊戲區要讓「遮陽棚」只指向要找的那一個物品。
import * as THREE from 'three';
import { pointInRing, type CityBuilding } from '@/lib/city3d/collision';
import { PALETTE } from '@/lib/city3d/model-dsl';
import { toonMaterial } from './toon';
import { createStreetFrontFilter } from '@/lib/city3d/street-front';
import type { Road } from './ginzaCity';
import { interiorTypeFor, nearestShopCategory, shopBays, shopRooms, type ShopSign } from '@/lib/city3d/shop-types';
import { createInteriorBuffer, createInteriorMaterial } from './ginzaShopInteriors';

const SHOP_BOTTOM = 0.1;
const SHOP_TOP = 3.6;
const VARIANTS = 8;
const WALL_OFFSET = 0.06;   // 貼在外牆外側，避免 z-fighting
const FRAMES = [PALETTE.tan, PALETTE.brown, PALETTE.white, PALETTE.green, PALETTE.blue, PALETTE.ink, PALETTE.red, PALETTE.cream];
const AWNINGS = [PALETTE.green, PALETTE.red, PALETTE.blue, PALETTE.yellow, PALETTE.orange, PALETTE.indigo];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return (h >>> 0) / 4294967295;
}

/** 8 種店面框架：門框、竪框、簷板不透明；玻璃處挖空（alpha 0），交給店內縱深顯示 */
function storefrontTexture(): THREE.CanvasTexture {
  const w = 256, rowH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = rowH * VARIANTS;
  const d = canvas.getContext('2d')!;
  for (let v = 0; v < VARIANTS; v++) {
    const y0 = v * rowH;
    d.fillStyle = FRAMES[v]; d.fillRect(0, y0, w, rowH);
    const panes = 2 + (v % 3);
    const doorX = v % 2 ? 190 : 13, doorW = 36;
    // 玻璃區避開入口，門框與竪框保持節奏
    const glassX0 = v % 2 ? 6 : doorX + doorW + 12, glassX1 = v % 2 ? doorX - 12 : w - 6;
    const paneW = (glassX1 - glassX0) / panes;
    for (let i = 0; i < panes; i++) d.clearRect(glassX0 + i * paneW + 3, y0 + 22, paneW - 6, rowH - 28);
    d.fillStyle = PALETTE.ink; d.fillRect(doorX - 9, y0 + 22, doorW + 18, 106);
    d.clearRect(doorX, y0 + 27, doorW, 97);
    d.fillStyle = PALETTE.yellow; d.fillRect(doorX + doorW - 7, y0 + 67, 3, 26); // 門把
    d.fillStyle = PALETTE.grey; d.fillRect(0, y0 + 124, w, 4);
    d.fillStyle = PALETTE.ink; d.fillRect(0, y0, w, 20); // 上方簷板
  }
  const tex = new THREE.CanvasTexture(canvas);
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

export function buildStreetscape(
  buildings: readonly CityBuilding[], roads: readonly Road[], signs: readonly ShopSign[],
  skip: (x: number, z: number) => boolean, plain: (x: number, z: number) => boolean,
): THREE.Group {
  const fronts = newBuffer(), awnings = newBuffer(), dividers = newBuffer();
  const interiors = createInteriorBuffer();
  const shopSigns = signs.filter((s) => s.kind !== 'crown' && s.cat);
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
        if (pointInRing(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
        if (!facesStreet(mx, mz, nx, nz)) continue;
        if ((-(q[1] - p[1])) * nx + (q[0] - p[0]) * nz < 0) [p, q] = [q, p];
        const off = (pt: [number, number], y: number, extra = 0) =>
          new THREE.Vector3(pt[0] + nx * (WALL_OFFSET + extra), y, pt[1] + nz * (WALL_OFFSET + extra));
        const normal = new THREE.Vector3(nx, 0, nz);
        const r = hash(`${b.id}-${k}`);
        const at = (t: number): [number, number] => [p[0] + (q[0] - p[0]) * t / length, p[1] + (q[1] - p[1]) * t / length];
        const bays = shopBays(length, `${b.id}-${k}`);
        // 沒有店家點位的分節沿用整面牆抽樣的業態，同一店面不會被切成不同業態的小隔間
        const wallType = interiorTypeFor(null, `${b.id}-${k}`);
        const rooms = shopRooms(bays, bays.map((bay) => {
          const [cx, cz] = at((bay.start + bay.end) / 2);
          const category = nearestShopCategory(shopSigns, cx, cz, nx, nz);
          return category ? interiorTypeFor(category, '') : wallType;
        }));
        const mirror = hash(`m${b.id}-${k}`) > 0.5;
        bays.forEach((bay, index) => {
          const a = at(bay.start), c = at(bay.end), m = at((bay.start + bay.end) / 2);
          if ([a, c, m].some(([x, z]) => skip(x + nx * 0.5, z + nz * 0.5))) return;
          const v0 = (bay.variant + 0.03) / VARIANTS, v1 = (bay.variant + 0.97) / VARIANTS;
          pushQuad(fronts, [off(a, SHOP_BOTTOM, 0.015), off(c, SHOP_BOTTOM, 0.015), off(c, SHOP_TOP, 0.015), off(a, SHOP_TOP, 0.015)], normal,
            [[0, 1 - v1], [1, 1 - v1], [1, 1 - v0], [0, 1 - v0]]);
          interiors.add([off(a, SHOP_BOTTOM), off(c, SHOP_BOTTOM), off(c, SHOP_TOP), off(a, SHOP_TOP)], normal, rooms[index], mirror);
          // 分節之間的石材分隔條，往外凸一點
          const a1 = at(Math.min(bay.end, bay.start + 0.12));
          pushQuad(dividers, [off(a, SHOP_BOTTOM, 0.04), off(a1, SHOP_BOTTOM, 0.04), off(a1, SHOP_TOP, 0.04), off(a, SHOP_TOP, 0.04)], normal,
            [[0, 0], [1, 0], [1, 1], [0, 1]]);
        });
        if (r > 0.68 && length < 24 && !plain(mx, mz)) {
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
    interiors.finish(createInteriorMaterial(PALETTE.glass)),
    meshFrom(fronts, toonMaterial({ map: storefrontTexture(), alphaTest: 0.5 })),
    meshFrom(dividers, toonMaterial({ color: PALETTE.light })),
    meshFrom(awnings, toonMaterial({ vertexColors: true, side: THREE.DoubleSide }), true),
  );
  return group;
}
