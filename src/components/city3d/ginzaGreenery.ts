// 中央通り桂樹 + 四區植栽帶的 3D 外觀。移植自 Ginza 專案 web/decor.js、web/bed-zones.js，
// 改用色票 + 卡通著色。桂樹依 2019 實照：細直主幹、自約 2.4 m 起的直立橢圓樹冠（幼樹）。
// 每種零件一個 InstancedMesh，104 處花壇也只多十幾次繪製。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, type ColorKey } from '@/lib/city3d/model-dsl';
import { BED, bedPlants, type BedPlant, type TreeBed } from '@/lib/city3d/greenery';
import { toonMaterial } from './toon';

const CANOPY = { base: 2.4, top: 6.6, radius: 1.35, clusters: 30 } as const;
const POT_HEIGHT = 0.22;

interface Placed {
  x: number;
  z: number;
  heading: number;
  y?: number;
  color?: ColorKey;
}

function rosette(): THREE.BufferGeometry {
  // 銀座エキゾチック：向外張開的劍葉
  return mergeGeometries(Array.from({ length: 7 }, (_, i) => {
    const blade = new THREE.ConeGeometry(0.035, 0.5, 4).toNonIndexed();
    blade.translate(0, 0.25, 0);
    blade.rotateZ(0.35 + (i % 2) * 0.25);
    blade.rotateY((i * Math.PI * 2) / 7);
    return blade;
  }));
}

function sasa(): THREE.BufferGeometry {
  // SASA deco：數片披針形竹葉
  return mergeGeometries(Array.from({ length: 6 }, (_, i) => {
    const leaf = new THREE.SphereGeometry(0.11, 6, 4).toNonIndexed();
    leaf.scale(0.28, 0.06, 1);
    leaf.translate(0, 0, 0.1);
    leaf.rotateX(-0.45 - (i % 3) * 0.12);
    leaf.rotateY(i * 2.3);
    leaf.translate(0, 0.16 + (i % 3) * 0.1, 0);
    return leaf;
  }));
}

function fedge(): THREE.BufferGeometry {
  // 銀座植物園：長邊的活柳編籬（交叉細枝）
  const sticks: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) for (let k = 0; k < 7; k++) for (const lean of [-0.55, 0.55]) {
    const stick = new THREE.CylinderGeometry(0.01, 0.014, 0.42, 4).toNonIndexed();
    stick.rotateX(lean);
    stick.translate(side * (BED.width / 2 - 0.05), 0.33, ((k - 3) * (BED.length - 0.3)) / 6);
    sticks.push(stick);
  }
  return mergeGeometries(sticks);
}

export function buildGreenery(beds: readonly TreeBed[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'chuo-greenery';
  const dummy = new THREE.Object3D();
  const materials = new Map<string, THREE.MeshToonMaterial>();
  const material = (key: string) => {
    if (!materials.has(key)) materials.set(key, toonMaterial(key === 'vertex' ? {} : { color: PALETTE[key as ColorKey] }));
    return materials.get(key)!;
  };

  function part(points: readonly Placed[], geometry: THREE.BufferGeometry, color: ColorKey | 'vertex', at: [number, number, number], scale: [number, number, number] = [1, 1, 1], shadow = false) {
    if (!points.length) { geometry.dispose(); return; }
    const mesh = new THREE.InstancedMesh(geometry, material(color), points.length);
    points.forEach((p, i) => {
      const c = Math.cos(p.heading), s = Math.sin(p.heading);
      dummy.position.set(p.x + at[0] * c + at[2] * s, at[1] + (p.y ?? 0), p.z - at[0] * s + at[2] * c);
      dummy.rotation.set(0, p.heading, 0);
      dummy.scale.set(...scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (color === 'vertex') mesh.setColorAt(i, new THREE.Color(PALETTE[p.color ?? 'green']));
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // 低框花壇：石框 + 覆土
  for (const side of [-1, 1]) {
    part(beds, new THREE.BoxGeometry(0.08, 0.16, BED.length), 'light', [(side * (BED.width - 0.08)) / 2, 0.08, 0]);
    part(beds, new THREE.BoxGeometry(BED.width - 0.16, 0.16, 0.08), 'light', [0, 0.08, (side * (BED.length - 0.08)) / 2]);
  }
  part(beds, new THREE.BoxGeometry(BED.width - 0.16, 0.1, BED.length - 0.16), 'brown', [0, 0.05, 0]);

  // 桂樹：細主幹 + 直立橢圓樹冠（葉簇深淺兩色交錯）
  part(beds, new THREE.CylinderGeometry(0.06, 0.12, 5.6, 8), 'brown', [0, 2.8, 0], [1, 1, 1], true);
  const clusters: Placed[] = beds.flatMap((bed, t) => Array.from({ length: CANOPY.clusters }, (_, i) => {
    const h = (i + 0.5) / CANOPY.clusters, angle = i * 2.399963 + t * 0.7;
    const reach = CANOPY.radius * Math.sin(Math.PI * (0.12 + h * 0.8)) * (0.55 + (i % 5) * 0.11);
    return { x: bed.x + Math.cos(angle) * reach, z: bed.z + Math.sin(angle) * reach, heading: angle,
      y: CANOPY.base + h * (CANOPY.top - CANOPY.base), color: i % 3 === 0 ? 'dgreen' : 'green' };
  }));
  part(clusters, new THREE.IcosahedronGeometry(0.5, 0), 'vertex', [0, 0, 0], [1.1, 0.8, 1], true);

  // 植栽：依區分型態
  const plants = beds.flatMap(bedPlants);
  const placed = (list: BedPlant[], color: (p: BedPlant) => ColorKey, y: (p: BedPlant) => number = () => 0): Placed[] =>
    list.map((p) => ({ x: p.x, z: p.z, heading: p.heading, y: y(p), color: color(p) }));
  const low = plants.filter((p) => (p.kind === 'cover' || p.kind === 'grass' || p.kind === 'flower') && !p.potted);
  part(placed(low, (p) => p.leaf), new THREE.SphereGeometry(0.15, 8, 6), 'vertex', [0, 0.16, 0], [1, 0.65, 1.15]);
  const grass = plants.filter((p) => p.kind === 'grass');
  part(placed(grass, (p) => p.leaf), new THREE.ConeGeometry(0.08, 0.45, 5), 'vertex', [0, 0.3, 0]);
  part(placed(plants.filter((p) => p.kind === 'spike'), (p) => p.leaf), rosette(), 'vertex', [0, 0.1, 0]);
  part(placed(plants.filter((p) => p.kind === 'sasa'), (p) => p.leaf), sasa(), 'vertex', [0, 0.08, 0]);
  const pots = plants.filter((p) => p.potted);
  part(placed(pots, () => 'orange'), new THREE.CylinderGeometry(0.09, 0.07, POT_HEIGHT, 8), 'vertex', [0, 0.1 + POT_HEIGHT / 2, 0]);
  const flowers = plants.filter((p) => p.kind === 'flower');
  part(placed(flowers, (p) => p.flower, (p) => p.height + (p.potted ? POT_HEIGHT : 0)), new THREE.SphereGeometry(0.09, 8, 5), 'vertex', [0, 0.1, 0], [1.3, 0.45, 1.3]);
  part(placed(flowers, () => 'yellow', (p) => p.height + (p.potted ? POT_HEIGHT : 0)), new THREE.SphereGeometry(0.035, 6, 4), 'vertex', [0, 0.14, 0]);
  part(beds.filter((b) => b.zone === 1), fedge(), 'tan', [0, 0, 0]);
  return group;
}
