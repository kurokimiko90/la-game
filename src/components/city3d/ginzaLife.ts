// 車流與人流（InstancedMesh）。移植自 Ginza 專案 web/life.js（10-09 版：輪廓車身、會擺手腳的行人），
// 改成 la-game 畫風（色票 + 卡通著色）。
// hide(x, z) 為真的位置不畫：遊戲區裡不跑車和行人，免得和要找的「汽車」「計程車」「公車」混淆、穿過物品。
import * as THREE from 'three';
import { PALETTE } from '@/lib/city3d/model-dsl';
import type { Road } from './ginzaCity';
import { createPeopleMesh } from './ginzaPeople';
import { toonMaterial } from './toon';

const CAR_ROADS = new Set([
  'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
  'trunk_link', 'primary_link', 'secondary_link',
]);
const WALK_ROADS = new Set(['footway', 'pedestrian', 'path', 'steps', 'living_street']);
const CAR_COUNT = 170;
const PEOPLE_COUNT = 2200;
const BUSY_RADIUS = 450; // 銀座四丁目（原點）周圍人車較密集
const CAR_COLORS = [PALETTE.white, PALETTE.white, PALETTE.ink, PALETTE.blue, PALETTE.red, PALETTE.yellow, PALETTE.green, PALETTE.grey, PALETTE.indigo];

interface Segment extends Road { cum: number[]; length: number }
interface Network { segments: Segment[]; nodes: Map<string, { index: number; end: 0 | 1 }[]> }
interface Agent { seg: number; dir: 1 | -1; s: number; speed: number; lane: number; phase: number; scale: number }
interface Point { x: number; z: number; dx: number; dz: number }

const keyOf = (p: [number, number]) => `${p[0]},${p[1]}`;

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNetwork(roads: readonly Road[], kinds: Set<string>): Network {
  const segments = roads
    .filter((r) => kinds.has(r.kind) && r.points.length >= 2)
    .map((r) => {
      const cum = [0];
      for (let i = 1; i < r.points.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][1] - r.points[i - 1][1]));
      }
      return { ...r, cum, length: cum[cum.length - 1] };
    })
    .filter((s) => s.length > 3);
  const nodes: Network['nodes'] = new Map();
  segments.forEach((seg, index) => {
    for (const end of [0, 1] as const) {
      const key = keyOf(end ? seg.points[seg.points.length - 1] : seg.points[0]);
      const list = nodes.get(key);
      if (list) list.push({ index, end });
      else nodes.set(key, [{ index, end }]);
    }
  });
  return { segments, nodes };
}

function busyWeight(seg: Segment): number {
  const mid = seg.points[Math.floor(seg.points.length / 2)];
  return seg.length * (Math.hypot(mid[0], mid[1]) < BUSY_RADIUS ? 3 : 1);
}

function pickWeighted(segments: Segment[], rand: () => number): number {
  const total = segments.reduce((sum, s) => sum + busyWeight(s), 0);
  let t = rand() * total;
  for (let i = 0; i < segments.length; i++) {
    t -= busyWeight(segments[i]);
    if (t <= 0) return i;
  }
  return segments.length - 1;
}

function sample(seg: Segment, s: number, dir: number, out: Point): Point {
  const along = dir > 0 ? s : seg.length - s;
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < along) i++;
  const a = seg.points[i - 1], b = seg.points[i];
  const span = seg.cum[i] - seg.cum[i - 1] || 1;
  const t = (along - seg.cum[i - 1]) / span;
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  out.dx = ((b[0] - a[0]) / span) * dir;
  out.dz = ((b[1] - a[1]) / span) * dir;
  return out;
}

function advance(agent: Agent, network: Network, rand: () => number, distance: number) {
  agent.s += distance;
  let seg = network.segments[agent.seg];
  while (agent.s > seg.length) {
    agent.s -= seg.length;
    const endKey = keyOf(agent.dir > 0 ? seg.points[seg.points.length - 1] : seg.points[0]);
    const options = (network.nodes.get(endKey) ?? []).filter((o) => o.index !== agent.seg);
    if (options.length) {
      const next = options[Math.floor(rand() * options.length)];
      agent.seg = next.index;
      agent.dir = next.end === 0 ? 1 : -1;
    } else {
      agent.dir = agent.dir > 0 ? -1 : 1; // 死巷迴轉
    }
    seg = network.segments[agent.seg];
  }
}

interface Part { geometry?: THREE.BufferGeometry; size?: [number, number, number]; at?: [number, number, number]; color: string }

/** 合併多個零件為一個幾何，每個零件帶自己的頂點色。part 可為 {geometry} 或 {size, at}（方塊） */
function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geometries = parts.map(({ geometry, size, at, color }) => {
    const raw = geometry ?? new THREE.BoxGeometry(...size!).translate(...at!);
    const g = raw.index ? raw.toNonIndexed() : raw;
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrays = geometries.map((g) => g.attributes[name].array as Float32Array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  geometries.forEach((g) => g.dispose());
  return merged;
}

/** 側面輪廓 [z, y]（車頭朝 -z）沿 x 方向拉出寬度 */
function extrudeProfile(points: [number, number][], width: number, bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 1,
  });
  g.rotateY(-Math.PI / 2); // 輪廓 x → 世界 z，拉伸方向 → 世界 -x
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}

const CAR_BODY: [number, number][] = [[-2.2, 0.32], [-2.2, 0.74], [-1.2, 0.88], [-0.55, 1.36], [0.85, 1.4], [1.6, 0.95], [2.2, 0.9], [2.2, 0.32]];
const CAR_GLASS: [number, number][] = [[-1.16, 0.92], [-0.56, 1.375], [0.84, 1.415], [1.55, 0.98]];

function instanced(geometry: THREE.BufferGeometry, count: number, shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, toonMaterial({ vertexColors: true }), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // 實例散布全城，用幾何本身的包圍球會誤判
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}

function spawn(network: Network, count: number, rand: () => number, make: () => Pick<Agent, 'speed' | 'lane' | 'phase' | 'scale'>): Agent[] {
  if (!network.segments.length) return [];
  return Array.from({ length: count }, () => {
    const seg = pickWeighted(network.segments, rand);
    return { seg, dir: rand() < 0.5 ? 1 : -1, s: rand() * network.segments[seg].length, ...make() };
  });
}

interface Fleet { network: Network; agents: Agent[]; meshes: THREE.InstancedMesh[] }

function createCars(roads: readonly Road[], rand: () => number): Fleet {
  const network = buildNetwork(roads, CAR_ROADS);
  const agents = spawn(network, CAR_COUNT, rand, () => ({ speed: 7 + rand() * 5, lane: 0.25 + rand() * 0.08, phase: 0, scale: 1 }));
  // 車身沿 -z 為車頭方向（與相機 yaw 慣例一致）
  const wheels = [[-0.78, -1.35], [0.78, -1.35], [-0.78, 1.38], [0.78, 1.38]].map(([x, z]): Part => ({
    geometry: new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateZ(Math.PI / 2).translate(x, 0.32, z), color: PALETTE.ink,
  }));
  const body = mergeParts([{ geometry: extrudeProfile(CAR_BODY, 1.72, 0.05), color: '#ffffff' }]);
  const details = mergeParts([
    ...wheels,
    { geometry: extrudeProfile(CAR_GLASS, 1.76), color: PALETTE.glass },
    { size: [1.74, 0.16, 0.12], at: [0, 0.42, -2.2], color: PALETTE.ink },
    { size: [1.74, 0.16, 0.12], at: [0, 0.42, 2.2], color: PALETTE.ink },
    { size: [0.36, 0.13, 0.05], at: [-0.58, 0.68, -2.25], color: PALETTE.white },
    { size: [0.36, 0.13, 0.05], at: [0.58, 0.68, -2.25], color: PALETTE.white },
    { size: [0.32, 0.12, 0.05], at: [-0.62, 0.8, 2.25], color: PALETTE.red },
    { size: [0.32, 0.12, 0.05], at: [0.62, 0.8, 2.25], color: PALETTE.red },
  ]);
  const bodyMesh = instanced(body, agents.length);
  const detailMesh = instanced(details, agents.length, false);
  const color = new THREE.Color();
  agents.forEach((_, i) => bodyMesh.setColorAt(i, color.set(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)])));
  return { network, agents, meshes: [bodyMesh, detailMesh] };
}

function createPeople(roads: readonly Road[], rand: () => number): Fleet & { setTime(t: number): void } {
  const network = buildNetwork(roads, WALK_ROADS);
  const agents = spawn(network, PEOPLE_COUNT, rand, () => ({
    speed: 1 + rand() * 0.6, lane: (rand() - 0.5) * 0.6, phase: rand() * Math.PI * 2, scale: 0.92 + rand() * 0.14,
  }));
  const walkers = createPeopleMesh(agents, rand);
  return { network, agents, meshes: [walkers.mesh], setTime: walkers.setTime };
}

export interface Life {
  group: THREE.Group;
  update(dt: number): void;
}

export function createLife(roads: readonly Road[], hide: (x: number, z: number) => boolean): Life {
  const rand = mulberry(20261009);
  const cars = createCars(roads, rand);
  const people = createPeople(roads, rand);
  const group = new THREE.Group();
  group.add(...cars.meshes, ...people.meshes);
  const dummy = new THREE.Object3D();
  const point: Point = { x: 0, z: 0, dx: 0, dz: 0 };
  let clock = 0;

  function place(fleet: Fleet, pose: (agent: Agent, seg: Segment) => void) {
    fleet.agents.forEach((agent, i) => {
      const seg = fleet.network.segments[agent.seg];
      sample(seg, agent.s, agent.dir, point);
      pose(agent, seg);
      if (hide(dummy.position.x, dummy.position.z)) dummy.scale.setScalar(0);
      dummy.updateMatrix();
      for (const mesh of fleet.meshes) mesh.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of fleet.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt: number) {
    clock += dt;
    people.setTime(clock);
    place(cars, (agent, seg) => {
      const offset = seg.width * agent.lane;
      dummy.position.set(point.x + point.dz * offset, 0, point.z - point.dx * offset);
      dummy.rotation.set(0, Math.atan2(-point.dx, -point.dz), 0);
      dummy.scale.setScalar(1);
    });
    place(people, (agent, seg) => {
      const offset = seg.width * agent.lane;
      const bob = Math.abs(Math.sin(clock * agent.speed * 5.6 + agent.phase)) * 0.03; // 與步伐同步
      dummy.position.set(point.x + point.dz * offset, bob, point.z - point.dx * offset);
      dummy.rotation.set(0, Math.atan2(-point.dx, -point.dz), 0);
      dummy.scale.setScalar(agent.scale);
    });
    for (const agent of cars.agents) advance(agent, cars.network, rand, agent.speed * dt);
    for (const agent of people.agents) advance(agent, people.network, rand, agent.speed * dt);
  }

  update(0);
  return { group, update };
}
