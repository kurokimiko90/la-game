// 櫥窗後的店內縱深（interior mapping）：每個店面分節只有一片玻璃四邊形，片段著色器沿視線求交
// 虛擬房間（後牆／側牆／地板／天花板）與兩層陳列剖面，得到隨視角變化的室內透視，不增加建築幾何。
// 移植自 Ginza 專案 web/shop-interiors.js（2026-10-11 版）。la-game 的改動：
// - 圖集畫完後每個像素換成最接近的色票顏色，和卡通著色的物件同一套顏色（色塊化）
// - 固定白天：不移植夜間點燈；玻璃反光用 la-game 天空色
// 這只是遠景裝飾，遊戲區的店內是真的房間（ginzaRooms.ts）。
import * as THREE from 'three';
import { curveGLSL } from '@/lib/city3d/curvature';
import { PALETTE } from '@/lib/city3d/model-dsl';
import { INTERIOR_TYPES, type InteriorType, type ShopRoom } from '@/lib/city3d/shop-types';
// 原樣移植的 JS 繪製模組（allowJs，型別推斷為寬鬆）
import { ROOM, CELL, SURFACES, LAYER_DEPTHS, surface, rng } from './shop-paint/kit.js';
import { fashion, jewelry, cosmetics, bookstore, gallery, goods } from './shop-paint/retail.js';
import { sweets, cafe, dining, convenience, service, salon } from './shop-paint/food.js';

type Painter = Record<string, (s: unknown, rand: () => number) => void>;
const PAINTERS: Record<InteriorType, Painter> = {
  fashion, jewelry, sweets, cafe, dining, cosmetics, books: bookstore, gallery, convenience, goods, service, salon,
};
const SURFACE_NAMES = SURFACES as string[];
const ROOM_SIZE = ROOM as { width: number; height: number; depth: number };
const CELL_SIZE = CELL as [number, number];
const DEPTHS = LAYER_DEPTHS as { front: number; mid: number };

// 室內光色：便利店／銀行偏冷白，餐飲與珠寶偏暖
const TINTS: Record<InteriorType, string> = {
  fashion: '#fff4e4', jewelry: '#ffe9c8', sweets: '#fff1dc', cafe: '#ffe0b8', dining: '#ffd49e', cosmetics: '#fffaf6',
  books: '#fff0d8', gallery: '#fbfbff', convenience: '#f2f8ff', goods: '#fff0dc', service: '#f4f8ff', salon: '#fff3e2',
};

const SWATCHES = Object.values(PALETTE).map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255] as const;
});

/** 每個像素換成最接近的色票顏色（透明處不動） */
function snapToPalette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const cache = new Map<number, number>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let bestD = Infinity;
      best = 0;
      SWATCHES.forEach(([r, g, b], k) => {
        // 人眼對綠色較敏感的加權距離
        const d = 2 * (px[i] - r) ** 2 + 4 * (px[i + 1] - g) ** 2 + 3 * (px[i + 2] - b) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      });
      cache.set(key, best);
    }
    const [r, g, b] = SWATCHES[best];
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
}

function paintAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_SIZE[0] * SURFACE_NAMES.length;
  canvas.height = CELL_SIZE[1] * INTERIOR_TYPES.length;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  INTERIOR_TYPES.forEach((type, row) => {
    SURFACE_NAMES.forEach((kind, col) => {
      const ox = col * CELL_SIZE[0], oy = row * CELL_SIZE[1];
      ctx.save();
      ctx.beginPath(); ctx.rect(ox, oy, CELL_SIZE[0], CELL_SIZE[1]); ctx.clip();
      PAINTERS[type][kind](surface(ctx, ox, oy, kind), rng(row * 97 + col * 13 + 5));
      ctx.restore();
    });
  });
  snapToPalette(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const VERTEX = /* glsl */`
  attribute vec4 aRoom;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying vec4 vRoom;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    vRoom = aRoom;
    vec4 mvPosition = viewMatrix * world;
    ${curveGLSL('mvPosition')}
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAGMENT = /* glsl */`
  uniform sampler2D uAtlas;
  uniform vec3 uSky;
  uniform vec3 uTint[${INTERIOR_TYPES.length}];
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying vec4 vRoom;
  #include <fog_pars_fragment>
  const vec3 ROOM = vec3(${ROOM_SIZE.width.toFixed(2)}, ${ROOM_SIZE.height.toFixed(2)}, ${ROOM_SIZE.depth.toFixed(2)});
  const vec2 GRID = vec2(${SURFACE_NAMES.length}.0, ${INTERIOR_TYPES.length}.0);

  vec4 cell(float type, float col, vec2 uv) {
    uv = clamp(uv, vec2(0.004), vec2(0.996));
    return texture2D(uAtlas, (vec2(col, GRID.y - 1.0 - type) + uv) / GRID);
  }
  // 窄店取中段；較寬的店按約 5.5m 重複陳列單元，避免家具被拉長或壓扁
  float across(float x, float width) {
    if (width < ROOM.x * 1.5) return (x - width * 0.5) / max(width, ROOM.x) + 0.5;
    float unit = width / floor(width / ROOM.x + 0.5);
    return fract(x / unit);
  }
  float safe(float v) { return abs(v) < 1e-4 ? (v < 0.0 ? -1e-4 : 1e-4) : v; }

  vec3 layer(vec3 color, vec3 p, vec3 dir, float depth, float tHit, float type, float col, float width) {
    float t = depth / dir.z;
    if (t >= tHit) return color;
    vec3 q = p + dir * t;
    if (q.x < 0.0 || q.x > width || q.y < 0.0 || q.y > ROOM.y) return color;
    vec4 s = cell(type, col, vec2(across(q.x, width), q.y / ROOM.y));
    return mix(color, s.rgb * mix(1.0, 0.9, depth / ROOM.z), s.a);
  }

  void main() {
    float width = vRoom.x, type = vRoom.y;
    vec3 n = normalize(vNormalW);
    vec3 tangent = vec3(n.z, 0.0, -n.x);
    vec3 d = normalize(vWorld - cameraPosition);
    vec3 dir = vec3(dot(d, tangent), d.y, -dot(d, n));
    vec3 p = vec3(vUv.x, vUv.y * ROOM.y, 0.0);
    if (vRoom.z > 0.5) { p.x = width - p.x; dir.x = -dir.x; }
    float facing = max(dir.z, 0.02);
    dir.z = facing;
    float tx = (dir.x > 0.0 ? width - p.x : -p.x) / safe(dir.x);
    float ty = (dir.y > 0.0 ? ROOM.y - p.y : -p.y) / safe(dir.y);
    float tz = ROOM.z / dir.z;
    float tHit = min(min(tx, ty), tz);
    vec3 h = p + dir * tHit;

    vec3 color; float edge;
    if (tHit == tz) {
      color = cell(type, 0.0, vec2(across(h.x, width), h.y / ROOM.y)).rgb;
      edge = min(min(h.x, width - h.x), min(h.y, ROOM.y - h.y));
    } else if (tHit == tx) {
      color = cell(type, 1.0, vec2(h.z / ROOM.z, h.y / ROOM.y)).rgb * 0.88;
      edge = min(min(h.y, ROOM.y - h.y), ROOM.z - h.z);
    } else {
      bool floorHit = dir.y < 0.0;
      color = cell(type, floorHit ? 2.0 : 3.0, vec2(across(h.x, width), h.z / ROOM.z)).rgb * (floorHit ? 0.92 : 1.0);
      edge = min(min(h.x, width - h.x), ROOM.z - h.z);
    }
    // 卡通畫風：房間角落只壓暗一點，不做寫實的深陰影
    color *= mix(0.75, 1.0, smoothstep(0.0, 0.45, edge)) * mix(1.0, 0.88, h.z / ROOM.z);
    color = layer(color, p, dir, ${DEPTHS.mid.toFixed(2)}, tHit, type, 5.0, width);
    color = layer(color, p, dir, ${DEPTHS.front.toFixed(2)}, tHit, type, 4.0, width);

    color *= uTint[int(type + 0.5)];
    float fresnel = 0.05 + 0.5 * pow(1.0 - facing, 4.0);
    color = mix(color, uSky, fresnel);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createInteriorMaterial(sky: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uAtlas: { value: paintAtlas() },
      uSky: { value: new THREE.Color(sky) },
      uTint: { value: INTERIOR_TYPES.map((type) => new THREE.Color(TINTS[type])) },
    }]),
    vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: true,
  });
}

/** 分節玻璃四邊形；corners 依 [左下, 右下, 右上, 左上]，u 沿牆面切線方向 */
export function createInteriorBuffer() {
  const position: number[] = [], normal: number[] = [], uv: number[] = [], room: number[] = [];
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  return {
    /** room.from / to：分節在整間店內的位置（公尺）；mirror：左右翻轉陳列，鄰街不會一模一樣 */
    add(corners: THREE.Vector3[], n: THREE.Vector3, { type, width, from, to }: ShopRoom, mirror: boolean) {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = corners[i];
        position.push(p.x, p.y, p.z);
        normal.push(n.x, n.y, n.z);
        uv.push(UV[i][0] ? to : from, UV[i][1]);
        room.push(width, INTERIOR_TYPES.indexOf(type), mirror ? 1 : 0, 0);
      }
    },
    finish(material: THREE.Material): THREE.Mesh {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setAttribute('aRoom', new THREE.Float32BufferAttribute(room, 4));
      geometry.computeBoundingSphere();
      return new THREE.Mesh(geometry, material);
    },
  };
}
