// 會走路的行人（一個 InstancedMesh，手腳擺動在 shader 裡算）。移植自 Ginza 專案 web/people.js，
// 改成 la-game 畫風：卡通著色、衣服用色票。每位行人的上衣／褲子／膚色／髮色是 instance attribute。
import * as THREE from 'three';
import { PALETTE } from '@/lib/city3d/model-dsl';
import { toonGradient } from './toon';

const PART = { skin: 0, top: 1, bottom: 2, hair: 3, shoes: 4 };
const LIMB = { none: 0, leftLeg: 1, rightLeg: 2, leftArm: 3, rightArm: 4 };
const HIP = 0.88;
const SHOULDER = 1.42;

const TOPS = [PALETTE.red, PALETTE.blue, PALETTE.green, PALETTE.yellow, PALETTE.orange, PALETTE.white, PALETTE.pink, PALETTE.indigo, PALETTE.tan, PALETTE.purple];
const BOTTOMS = [PALETTE.ink, PALETTE.indigo, PALETTE.brown, PALETTE.grey, PALETTE.tan, '#455a64'];
const SKINS = ['#f5d0b0', '#e8b896', '#d29e7a', '#fbe0c8', '#c99772'];
const HAIRS = ['#3e2723', '#3e2723', '#5d4037', '#212121', PALETTE.brown, '#9e9e9e', PALETTE.tan];

interface Piece { geometry: THREE.BufferGeometry; part: number; limb: number; pivot: number }

function parts(): Piece[] {
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 2, 6);
  const list: Piece[] = [];
  const add = (geometry: THREE.BufferGeometry, part: number, limb = LIMB.none, pivot = 0) => list.push({ geometry, part, limb, pivot });
  for (const [side, limb] of [[-1, LIMB.leftLeg], [1, LIMB.rightLeg]]) {
    add(capsule(0.072, 0.7).translate(side * 0.095, 0.48, 0), PART.bottom, limb, HIP);
    add(new THREE.BoxGeometry(0.11, 0.07, 0.25).translate(side * 0.095, 0.04, -0.04), PART.shoes, limb, HIP);
  }
  for (const [side, limb] of [[-1, LIMB.leftArm], [1, LIMB.rightArm]]) {
    add(capsule(0.052, 0.48).translate(side * 0.235, 1.12, 0), PART.top, limb, SHOULDER);
    add(new THREE.SphereGeometry(0.048, 6, 4).translate(side * 0.235, 0.83, 0), PART.skin, limb, SHOULDER);
  }
  add(capsule(0.165, 0.36).scale(1, 1, 0.6).translate(0, 1.16, 0), PART.top);
  add(new THREE.CylinderGeometry(0.17, 0.15, 0.2, 8).scale(1, 1, 0.65).translate(0, 0.86, 0), PART.bottom); // 腰部
  add(new THREE.CylinderGeometry(0.048, 0.052, 0.1, 6).translate(0, 1.47, 0), PART.skin);
  add(new THREE.SphereGeometry(0.105, 10, 8).scale(0.95, 1.12, 1).translate(0, 1.6, 0), PART.skin);
  add(new THREE.SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.97, 1.1, 1.04).translate(0, 1.62, 0.012), PART.hair);
  return list;
}

function buildGeometry(): THREE.BufferGeometry {
  const pieces = parts().map((p) => ({ ...p, geometry: p.geometry.index ? p.geometry.toNonIndexed() : p.geometry }));
  const count = pieces.reduce((n, p) => n + p.geometry.attributes.position.count, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
  const aPart = new Float32Array(count), aLimb = new Float32Array(count), aPivot = new Float32Array(count);
  let v = 0;
  for (const p of pieces) {
    const n = p.geometry.attributes.position.count;
    position.set(p.geometry.attributes.position.array as Float32Array, v * 3);
    normal.set(p.geometry.attributes.normal.array as Float32Array, v * 3);
    aPart.fill(p.part, v, v + n);
    aLimb.fill(p.limb, v, v + n);
    aPivot.fill(p.pivot, v, v + n);
    v += n;
    p.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('aPart', new THREE.BufferAttribute(aPart, 1));
  geometry.setAttribute('aLimb', new THREE.BufferAttribute(aLimb, 1));
  geometry.setAttribute('aPivot', new THREE.BufferAttribute(aPivot, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX_HEADER = `
attribute float aPart; attribute float aLimb; attribute float aPivot;
attribute float iPhase; attribute float iFreq;
attribute vec3 iTop; attribute vec3 iBottom; attribute vec3 iSkin; attribute vec3 iHair;
uniform float uTime;
varying vec3 vPartColor;
float limbAngle() {
  float s = sin(uTime * iFreq + iPhase);
  if (aLimb < 0.5) return 0.0;
  if (aLimb < 1.5) return s * 0.42;
  if (aLimb < 2.5) return -s * 0.42;
  if (aLimb < 3.5) return -s * 0.32;
  return s * 0.32;
}
vec3 swingPoint(vec3 p, float a) {
  float c = cos(a), s = sin(a), y = p.y - aPivot;
  return vec3(p.x, aPivot + y * c - p.z * s, y * s + p.z * c);
}
vec3 swingDir(vec3 n, float a) {
  float c = cos(a), s = sin(a);
  return vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
}`;

function createMaterial() {
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
  const uniforms = { uTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEADER}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = swingDir(objectNormal, limbAngle());')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = swingPoint(transformed, limbAngle());
vPartColor = aPart < 0.5 ? iSkin : aPart < 1.5 ? iTop : aPart < 2.5 ? iBottom : aPart < 3.5 ? iHair : vec3(0.08);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPartColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPartColor;');
  };
  material.customProgramCacheKey = () => 'la-game-walker';
  return { material, uniforms };
}

function colorAttribute(count: number, palette: readonly string[], rand: () => number): THREE.InstancedBufferAttribute {
  const array = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    color.set(palette[Math.floor(rand() * palette.length)]);
    array.set([color.r, color.g, color.b], i * 3);
  }
  return new THREE.InstancedBufferAttribute(array, 3);
}

export interface Walkers {
  mesh: THREE.InstancedMesh;
  setTime(t: number): void;
}

/** agents：每位行人的速度與步伐相位（步頻 = speed × 5.6，和 ginzaLife 的上下晃動同步） */
export function createPeopleMesh(agents: readonly { speed: number; phase: number }[], rand: () => number): Walkers {
  const geometry = buildGeometry();
  const count = agents.length;
  geometry.setAttribute('iPhase', new THREE.InstancedBufferAttribute(Float32Array.from(agents, (a) => a.phase), 1));
  geometry.setAttribute('iFreq', new THREE.InstancedBufferAttribute(Float32Array.from(agents, (a) => a.speed * 5.6), 1));
  geometry.setAttribute('iTop', colorAttribute(count, TOPS, rand));
  geometry.setAttribute('iBottom', colorAttribute(count, BOTTOMS, rand));
  geometry.setAttribute('iSkin', colorAttribute(count, SKINS, rand));
  geometry.setAttribute('iHair', colorAttribute(count, HAIRS, rand));
  const { material, uniforms } = createMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, setTime(t) { uniforms.uTime.value = t; } };
}
