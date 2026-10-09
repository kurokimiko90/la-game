// 和光鐘樓：沿用 Ginza web/signage.js 的位置與示意輪廓，改用 la-game 色票、卡通著色與墨線。
// 鐘面只畫刻度，不畫文字；四面共用真實東京時間，更新排程由 CityWorld 管理。
import * as THREE from 'three';
import { cyl, sph, cone, tor, PALETTE, type Part } from '@/lib/city3d/model-dsl';
import { buildModel, outlineMaterial, toonMaterial } from './toon';

export interface ClockTowerData {
  x: number;
  z: number;
  base: number;
  face?: [number, number];
}

/** 原版 Ginza 的和光屋頂位置；base 以目前地圖中的和光建築高度為準。 */
export const WAKO_CLOCK = { buildingId: 'w103509469', x: -40.98, z: -36.27, face: [-41.39, -2.46] as [number, number] };
export const CLOCK_UPDATE_MS = 30_000;

/** 東京固定 UTC+9；UTC getters 確保不受玩家電腦所在時區影響。角度從 12 點順時針算。 */
export function tokyoHandAngles(now: Date): { hour: number; minute: number } {
  const tokyo = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const minutes = tokyo.getUTCMinutes() + tokyo.getUTCSeconds() / 60;
  return {
    hour: ((tokyo.getUTCHours() % 12 + minutes / 60) / 12) * Math.PI * 2,
    minute: (minutes / 60) * Math.PI * 2,
  };
}

export function buildClockTower(clock?: ClockTowerData) {
  const group = new THREE.Group();
  group.name = 'wako-clock-tower';
  const hands: { hour: THREE.Group; minute: THREE.Group }[] = [];
  const update = (now = new Date()) => {
    const angles = tokyoHandAngles(now);
    for (const hand of hands) {
      hand.hour.rotation.z = -angles.hour;
      hand.minute.rotation.z = -angles.minute;
    }
  };
  if (!clock) return { group, update };
  group.position.set(clock.x, clock.base, clock.z);

  const material = toonMaterial({ vertexColors: true });
  const ink = outlineMaterial();
  const [fx, fz] = clock.face ?? [0, 0];
  const towardCrossing = Math.atan2(fx - clock.x, fz - clock.z);
  const addModel = (parent: THREE.Group, parts: Part[], outline = true) => {
    const built = buildModel({ parts, outline });
    const mesh = new THREE.Mesh(built.geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (built.outline) parent.add(new THREE.Mesh(built.outline, ink));
  };
  const towerParts: Part[] = [
    cyl(3.7, 7, 0, 0, 0, 'cream', { top: 3.3, seg: 32 }),
    cyl(3.45, 0.4, 0, 6.9, 0, 'tan', { seg: 32 }),
    cyl(3.85, 0.35, 0, 0.125, 0, 'cream', { seg: 32 }),
    cyl(3.7, 0.3, 0, 7.25, 0, 'tan', { seg: 32 }),
    cyl(2.8, 2.6, 0, 7.3, 0, 'cream', { top: 2.4, seg: 24 }),
    // 半球圓頂的下半部藏在燈籠基座裡；上半部保留和光的輪廓。
    sph(2.45, 0, 9.9, 0, 'dgreen'),
    cone(0.25, 2.4, 0, 12.1, 0, 'dgreen', { seg: 8 }),
    sph(0.32, 0, 14.6, 0, 'tan'),
  ];
  for (let i = 0; i < 12; i++) {
    const a = towardCrossing + (i / 12) * Math.PI * 2;
    towerParts.push(cyl(0.19, 5.6, Math.sin(a) * 3.4, 0.7, Math.cos(a) * 3.4, 'cream', { top: 0.14, seg: 8 }));
  }
  addModel(group, towerParts);

  const faceGeometry = new THREE.CircleGeometry(1.35, 48);
  const faceMaterial = toonMaterial({ color: PALETTE.cream });
  const handMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.ink });
  const hourGeometry = new THREE.BoxGeometry(0.12, 0.64, 0.035).translate(0, 0.26, 0.06);
  const minuteGeometry = new THREE.BoxGeometry(0.075, 0.94, 0.035).translate(0, 0.41, 0.1);
  const hubGeometry = new THREE.SphereGeometry(0.095, 12, 8);
  const rim = buildModel({ parts: [tor(1.45, 0.14, 0, 0, 0.05, 'tan')] });

  // 四面共用鐘面幾何與材質；墨色刻度合併成一個 mesh，避免逐刻度 draw call。
  const dialParts: Part[] = [tor(1.32, 0.055, 0, 0, 0.015, 'ink')];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    const length = major ? 0.21 : 0.09;
    const radius = 1.22 - length / 2;
    dialParts.push({
      s: 'box', size: [major ? 0.065 : 0.028, length, 0.025], c: 'ink',
      p: [Math.sin(a) * radius, Math.cos(a) * radius, 0.035], r: [0, 0, -i * 6],
    });
  }
  const dial = buildModel({ parts: dialParts, outline: false });
  for (let i = 0; i < 4; i++) {
    const a = towardCrossing + (i * Math.PI) / 2;
    const face = new THREE.Group();
    face.name = `clock-face-${i}`;
    // 鐘面在裝飾柱外側，避免柱子穿過刻度和指針。
    face.position.set(Math.sin(a) * 3.65, 4.6, Math.cos(a) * 3.65);
    face.rotation.y = a;
    face.add(new THREE.Mesh(faceGeometry, faceMaterial), new THREE.Mesh(dial.geometry, material));
    face.add(new THREE.Mesh(rim.geometry, material), new THREE.Mesh(rim.outline!, ink));
    const hour = new THREE.Group(), minute = new THREE.Group();
    hour.name = 'hour-hand'; minute.name = 'minute-hand';
    hour.add(new THREE.Mesh(hourGeometry, handMaterial));
    minute.add(new THREE.Mesh(minuteGeometry, handMaterial));
    const hub = new THREE.Mesh(hubGeometry, handMaterial);
    hub.position.z = 0.12;
    face.add(hour, minute, hub);
    hands.push({ hour, minute });
    group.add(face);
  }
  update();
  return { group, update };
}
