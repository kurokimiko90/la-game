// 銀座城市：OSM 建築擠出、道路地面、天空。移植自 Ginza 專案（web/city.js、web/sky.js），
// 配色改成 la-game 2D 小鎮的粉彩色、牆面用卡通著色，物件放上去才不會像兩種畫風拼貼。
// 2026-10-09 同步 Ginza 更新：加入道路帶狀面（buildRoads）；店面見 ginzaStreetscape.ts、車流人流見 ginzaLife.ts。
// 地圖資料 © OpenStreetMap contributors（ODbL 1.0），見 public/city3d/ginza/ATTRIBUTION.md。
import * as THREE from 'three';
import type { Bounds, CityBuilding, Ring } from '@/lib/city3d/collision';
import { toonMaterial } from './toon';
import type { ClockTowerData } from './ginzaClockTower';
import { PALETTE } from '@/lib/city3d/model-dsl';

export interface Road {
  kind: string;
  width: number;
  points: [number, number][];
}

export interface CityData {
  origin: [number, number];
  bounds: Bounds;
  buildings: CityBuilding[];
  clock?: ClockTowerData;
}

const FLOOR = 3.4;
const BAY = 2.6;
const WINDOW_TILE = 4;
/** 2D 小鎮房子的牆色 */
const WALLS = ['#cfd8dc', '#d7ccc8', '#ffe0b2', '#e0e0e0', '#bcaaa4', '#c5cae9', '#f5f5f5', '#b0bec5', '#ffccbc'];
const GROUND = { paving: '#e9e3d7', road: '#8f9ba3', walk: '#efe9dd', footprint: '#bdb5a8', lane: 'rgba(250,250,250,0.9)' };
const WALK_KINDS = new Set(['footway', 'steps', 'path', 'cycleway', 'pedestrian']);

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTextures(): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512, cell = size / WINDOW_TILE, rand = mulberry(7);
  const day = document.createElement('canvas');
  const night = document.createElement('canvas');
  day.width = day.height = night.width = night.height = size;
  const d = day.getContext('2d')!, n = night.getContext('2d')!;
  // 白天貼圖：牆的部分透明（露出牆色），只有窗是不透明的；夜間貼圖是窗光
  n.fillStyle = '#000000'; n.fillRect(0, 0, size, size);
  for (let i = 0; i < WINDOW_TILE; i++) {
    for (let j = 0; j < WINDOW_TILE; j++) {
      const x = i * cell + cell * 0.16, y = j * cell + cell * 0.22, w = cell * 0.68, h = cell * 0.58;
      // 2D 小鎮的窗：淺藍玻璃 + 墨色窗框
      d.fillStyle = '#37474f'; d.fillRect(x - 2, y - 2, w + 4, h + 4);
      d.fillStyle = '#b3e5fc'; d.fillRect(x, y, w, h);
      d.fillStyle = '#e1f5fe'; d.fillRect(x + w * 0.12, y + h * 0.12, w * 0.14, h * 0.76);
      d.fillStyle = '#eceff1'; d.fillRect(x - 4, y + h + 2, w + 8, 5);
      if (rand() < 0.6) {
        n.fillStyle = rand() < 0.7 ? '#ffe082' : '#e1f5fe';
        n.fillRect(x, y, w, h);
      }
    }
  }
  return [day, night].map((canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (BAY * WINDOW_TILE), 1 / (FLOOR * WINDOW_TILE));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }) as [THREE.CanvasTexture, THREE.CanvasTexture];
}

function toShape(ring: Ring, holes: Ring[] = []): THREE.Shape {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

interface Buffers { position: number[]; normal: number[]; uv: number[]; color: number[] }
const emptyBuffers = (): Buffers => ({ position: [], normal: [], uv: [], color: [] });

/** ExtrudeGeometry 沿 z 擠出；轉成 y 朝上，牆和屋頂分開收集 */
function appendGeometry(geometry: THREE.ExtrudeGeometry, base: number, color: THREE.Color, walls: Buffers, roofs: Buffers, bayScale: number) {
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const uv = geometry.attributes.uv.array;
  for (const group of geometry.groups) {
    const isWall = group.materialIndex === 1;
    const target = isWall ? walls : roofs;
    for (let v = group.start; v < group.start + group.count; v++) {
      const p = v * 3;
      target.position.push(pos[p], base + pos[p + 2], -pos[p + 1]);
      target.normal.push(nor[p], nor[p + 2], -nor[p + 1]);
      target.uv.push(uv[v * 2] * (isWall ? bayScale : 1), isWall ? pos[p + 2] : uv[v * 2 + 1]);
      target.color.push(color.r, color.g, color.b);
    }
  }
}

function toMesh(buffers: Buffers, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBuildings(buildings: readonly CityBuilding[]) {
  const [dayMap, nightMap] = windowTextures();
  const walls = emptyBuffers(), roofs = emptyBuffers();
  const trims = emptyBuffers();
  const trimColor = new THREE.Color(PALETTE.cream);
  const color = new THREE.Color();
  for (const b of buildings) {
    const tone = b.tone ?? 0.5;
    color.set(WALLS[Math.floor(tone * WALLS.length) % WALLS.length]);
    const depth = Math.max(1, b.height - (b.base ?? 0));
    b.outers.forEach((outer, i) => {
      const geometry = new THREE.ExtrudeGeometry(toShape(outer, i === 0 ? b.holes : []), {
        depth, bevelEnabled: false, curveSegments: 1,
      });
      appendGeometry(geometry, b.base ?? 0, color, walls, roofs, tone < 0.33 ? 0.72 : tone < 0.66 ? 1 : 1.24);
      geometry.dispose();
      // 中央 320 m 街區增加屋簷與腰線，合併成一個 mesh，不逐棟增加繪製次數。
      if (outer.some(([x, z]) => Math.hypot(x, z) < 320)) {
        for (let k = 0; k < outer.length; k++) {
          const a = outer[k], q = outer[(k + 1) % outer.length];
          const length = Math.hypot(q[0] - a[0], q[1] - a[1]);
          if (length < 1) continue;
          const levels = [b.height - 0.4];
          if (depth > 14) levels.push((b.base ?? 0) + 4.1);
          for (const y of levels) {
            const indexedTrim = new THREE.BoxGeometry(length + 0.3, 0.32, 0.5);
            const trim = indexedTrim.toNonIndexed();
            indexedTrim.dispose();
            trim.rotateY(-Math.atan2(q[1] - a[1], q[0] - a[0]));
            trim.translate((a[0] + q[0]) / 2, y, (a[1] + q[1]) / 2);
            for (const key of ['position', 'normal', 'uv'] as const) {
              for (const value of trim.attributes[key].array) trims[key].push(value);
            }
            for (let v = 0; v < trim.attributes.position.count; v++) trims.color.push(trimColor.r, trimColor.g, trimColor.b);
            trim.dispose();
          }
        }
      }
    });
  }
  const wallMaterial = toonMaterial({ vertexColors: true, map: dayMap, emissive: '#ffffff', emissiveMap: nightMap, emissiveIntensity: 0 });
  // 預設是「貼圖 × 牆色」，窗玻璃會被牆色染色；改成窗（貼圖不透明處）直接蓋過牆色
  wallMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_MAP
  vec4 windowTexel = texture2D( map, vMapUv );
  diffuseColor.rgb = mix( diffuseColor.rgb, windowTexel.rgb, windowTexel.a );
#endif`);
  };
  const roofMaterial = toonMaterial({ color: '#b0bec5' });
  const group = new THREE.Group();
  const trimMesh = toMesh(trims, toonMaterial({ vertexColors: true }));
  trimMesh.name = 'building-cornices';
  group.add(toMesh(walls, wallMaterial), toMesh(roofs, roofMaterial), trimMesh);
  return { group, wallMaterial };
}

function trace(ctx: CanvasRenderingContext2D, points: [number, number][], px: (p: [number, number]) => [number, number]) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p))));
}

function groundTexture(roads: readonly Road[], buildings: readonly CityBuilding[], bounds: Bounds, pixels: number) {
  const [minX, minZ, maxX, maxZ] = bounds;
  const scale = pixels / Math.max(maxX - minX, maxZ - minZ);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * scale);
  canvas.height = Math.ceil((maxZ - minZ) * scale);
  const ctx = canvas.getContext('2d')!;
  const px = ([x, z]: [number, number]): [number, number] => [(x - minX) * scale, (z - minZ) * scale];
  ctx.fillStyle = GROUND.paving;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order = [...roads].sort((a, b) => a.width - b.width);
  for (const road of order) {
    ctx.strokeStyle = WALK_KINDS.has(road.kind) ? GROUND.walk : GROUND.road;
    ctx.lineWidth = Math.max(1.5, road.width * scale);
    trace(ctx, road.points, px);
    ctx.stroke();
  }
  ctx.setLineDash([3 * scale, 5 * scale]);
  ctx.strokeStyle = GROUND.lane;
  ctx.lineWidth = Math.max(1, 0.2 * scale);
  for (const road of order.filter((r) => r.width >= 11)) {
    trace(ctx, road.points, px);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = GROUND.footprint;
  for (const b of buildings) {
    for (const ring of b.outers) {
      trace(ctx, ring, px);
      ctx.closePath();
      ctx.fill();
    }
  }
  return canvas;
}

function buildGround(roads: readonly Road[], buildings: readonly CityBuilding[], bounds: Bounds, renderer: THREE.WebGLRenderer) {
  const pixels = Math.min(4096, renderer.capabilities.maxTextureSize);
  const texture = new THREE.CanvasTexture(groundTexture(roads, buildings, bounds, pixels));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const [minX, minZ, maxX, maxZ] = bounds;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), toonMaterial({ map: texture }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  ground.receiveShadow = true;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshBasicMaterial({ color: '#d7ccc8' }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.6;
  const group = new THREE.Group();
  group.add(outer, ground);
  return group;
}

const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;
const SKY_FRAGMENT = `
uniform vec3 top; uniform vec3 horizon;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0);
  #include <colorspace_fragment>
}`;

/** 2D 小鎮的晴天：淡藍天空、淺色地平線 */
function buildSky() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(5000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color('#81d4fa') }, horizon: { value: new THREE.Color('#e1f5fe') } },
      vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

function pushRibbon(buf: number[], points: [number, number][], width: number, y: number, skip: (x: number, z: number) => boolean, extend = true) {
  const half = width / 2;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.01 || skip((ax + bx) / 2, (az + bz) / 2)) continue;
    const dx = (bx - ax) / length, dz = (bz - az) / length;
    const ext = extend ? half : 0;
    const sx = ax - dx * ext, sz = az - dz * ext, ex = bx + dx * ext, ez = bz + dz * ext;
    const nx = -dz * half, nz = dx * half;
    const quad = [[sx + nx, sz + nz], [ex + nx, ez + nz], [ex - nx, ez - nz], [sx - nx, sz - nz]];
    for (const k of [0, 1, 2, 0, 2, 3]) buf.push(quad[k][0], y, quad[k][1]);
  }
}

function pushDashes(buf: number[], points: [number, number][], y: number, skip: (x: number, z: number) => boolean) {
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const length = Math.hypot(bx - ax, bz - az);
    for (let s = carry; s < length; s += 8) {
      const e = Math.min(length, s + 3);
      const t0 = s / length, t1 = e / length;
      pushRibbon(buf, [[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]], 0.15, y, skip, false);
    }
    carry = (carry - length) % 8;
    if (carry < 0) carry += 8;
  }
}

function flatMesh(positions: number[], color: string, offset: number): THREE.Mesh {
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

/**
 * 道路與人行道的實體帶狀面（近看比地面貼圖清楚）。移植自 Ginza web/city.js 的 buildRoads。
 * skip(x, z) 的路段不畫：遊戲區那段已經自己鋪了人行道地磚（fx-sidewalk），斑馬線、水溝蓋也貼地放。
 */
function buildRoads(roads: readonly Road[], skip: (x: number, z: number) => boolean): THREE.Group {
  const asphalt: number[] = [], walkway: number[] = [], lines: number[] = [];
  for (const road of roads) {
    const walk = WALK_KINDS.has(road.kind);
    if (walk) pushRibbon(walkway, road.points, Math.max(1.6, road.width), 0.02, skip);
    else pushRibbon(asphalt, road.points, road.width, 0.03, skip);
    if (road.width >= 11 && !walk) pushDashes(lines, road.points, 0.04, skip);
  }
  const group = new THREE.Group();
  group.add(flatMesh(walkway, GROUND.walk, -1), flatMesh(asphalt, GROUND.road, -2), flatMesh(lines, '#fafafa', -3));
  return group;
}

export function buildCity(city: CityData, roads: readonly Road[], renderer: THREE.WebGLRenderer, skipRoad: (x: number, z: number) => boolean) {
  const { group: buildings, wallMaterial } = buildBuildings(city.buildings);
  const ground = buildGround(roads, city.buildings, city.bounds, renderer);
  ground.add(buildRoads(roads, skipRoad));
  return { buildings, ground, sky: buildSky(), wallMaterial };
}
