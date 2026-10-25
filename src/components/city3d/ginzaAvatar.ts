// 第三人稱的玩家小人（可愛 Q 版）：積木格式組成（色票 + 卡通著色 + 墨線），手腳、頭、眼睛、呆毛各自掛在關節上。
// 動畫：蹦跳步伐 + 壓扁伸展、跑步前傾、呼吸、隨機眨眼、呆毛彈簧、頭轉向注視的物品、找到時開心跳、跑步揚塵。
import * as THREE from 'three';
import type { Model3D } from '@/lib/city3d/model-dsl';
import { buildModel, outlineMaterial, toonMaterial } from './toon';

// 比例：頭比身體大、短手短腳；本地座標：腳底 y = 0，正面朝 +z
const NECK = 0.8;

const BODY: Model3D = {
  parts: [
    // 上衣：下寬上窄的鐘形，下襬一圈白邊，白色圓領
    { s: 'cyl', c: 'blue', r0: 0.24, r1: 0.17, h: 0.36, p: [0, 0.6, 0], seg: 24 },
    { s: 'cyl', c: 'white', r0: 0.245, r1: 0.24, h: 0.045, p: [0, 0.43, 0], seg: 24 },
    { s: 'sph', c: 'blue', p: [0, 0.78, 0], rad: 0.17, scale: [1, 0.42, 1] },
    { s: 'tor', c: 'white', p: [0, 0.8, 0], R: 0.12, t: 0.035, r: [90, 0, 0] },
    // 胸前小口袋
    { s: 'box', c: 'yellow', p: [0.09, 0.62, 0.2], size: [0.08, 0.07, 0.02], r: [-12, 0, 0] },
    // 短褲
    { s: 'cyl', c: 'indigo', r0: 0.23, r1: 0.24, h: 0.11, p: [0, 0.37, 0], seg: 24 },
  ],
};

// 頭的關節在脖子（y = 0）
const HEAD: Model3D = {
  parts: [
    { s: 'sph', c: 'skin', p: [0, 0.42, 0.02], rad: 0.42, scale: [1.08, 0.97, 0.98], seg: 32 },
    // 頭髮：後腦一整顆 + 三撮瀏海 + 兩側鬢角（蓋住耳朵）
    { s: 'sph', c: 'brown', p: [0, 0.52, -0.05], rad: 0.45, scale: [1.07, 0.88, 1], seg: 32 },
    { s: 'sph', c: 'brown', p: [-0.21, 0.66, 0.27], rad: 0.17, scale: [1.15, 0.7, 0.75], r: [0, 0, 12], seg: 20 },
    { s: 'sph', c: 'brown', p: [0.03, 0.69, 0.31], rad: 0.17, scale: [1.25, 0.66, 0.7], seg: 20 },
    { s: 'sph', c: 'brown', p: [0.24, 0.65, 0.26], rad: 0.16, scale: [1.1, 0.7, 0.75], r: [0, 0, -14], seg: 20 },
    { s: 'sph', c: 'brown', p: [-0.4, 0.42, 0.04], rad: 0.14, scale: [0.55, 1.35, 1], seg: 20 },
    { s: 'sph', c: 'brown', p: [0.4, 0.42, 0.04], rad: 0.14, scale: [0.55, 1.35, 1], seg: 20 },
  ],
};

// 五官（不打光、像貼紙一樣的平塗色）：腮紅、∪ 形微笑
const FACE: Model3D = {
  outline: false,
  parts: [
    { s: 'sph', c: 'pink', p: [-0.25, 0.3, 0.34], rad: 0.068, scale: [1.15, 0.6, 0.3] },
    { s: 'sph', c: 'pink', p: [0.25, 0.3, 0.34], rad: 0.068, scale: [1.15, 0.6, 0.3] },
    { s: 'tor', c: 'ink', p: [0, 0.29, 0.408], R: 0.038, t: 0.012, arc: Math.PI, r: [-8, 0, 180] },
  ],
};

// 眼睛：關節在眼睛中心（眨眼時縮 y）；直立黑色橢圓 + 大小兩顆高光
const EYE: Model3D = {
  outline: false,
  parts: [
    { s: 'sph', c: 'ink', p: [0, 0, 0], rad: 0.078, scale: [0.78, 1.22, 0.4], seg: 20 },
    { s: 'sph', c: 'white', p: [-0.02, 0.036, 0.03], rad: 0.025 },
    { s: 'sph', c: 'white', p: [0.022, -0.034, 0.03], rad: 0.011 },
  ],
};

// 開心時的 ^ ^ 眼
const HAPPY_EYE: Model3D = {
  outline: false,
  parts: [{ s: 'tor', c: 'ink', p: [0, -0.02, 0], R: 0.05, t: 0.014, arc: Math.PI }],
};

// 呆毛：關節在髮根，往上翹再往前彎
const SPROUT: Model3D = {
  parts: [
    { s: 'sph', c: 'brown', p: [0, 0.07, 0], rad: 0.05, scale: [0.5, 1.6, 0.5], r: [-10, 0, 0] },
    { s: 'sph', c: 'brown', p: [0, 0.15, 0.05], rad: 0.04, scale: [0.5, 1.2, 0.5], r: [-55, 0, 0] },
  ],
};

// 關節在頂端（y = 0），肢體往下長
const LEG: Model3D = {
  parts: [
    { s: 'cyl', c: 'skin', r0: 0.06, r1: 0.07, h: 0.24, p: [0, -0.12, 0] },
    { s: 'sph', c: 'red', p: [0, -0.29, 0.035], rad: 0.1, scale: [1, 0.72, 1.35] },
    { s: 'box', c: 'white', p: [0, -0.345, 0.04], size: [0.17, 0.03, 0.25], round: 0.012 },
  ],
};

const ARM: Model3D = {
  parts: [
    { s: 'sph', c: 'blue', p: [0, -0.02, 0], rad: 0.085 },
    { s: 'cyl', c: 'skin', r0: 0.048, r1: 0.055, h: 0.17, p: [0, -0.13, 0] },
    { s: 'sph', c: 'skin', p: [0, -0.24, 0.01], rad: 0.072 },
  ],
};

const HIP = 0.36;
const SHOULDER = 0.73;
const STRIDE = 8.5;
const SWING = 0.65;
const EYE_Y = 0.42;
const EYE_X = 0.155;
const EYE_Z = 0.385;
const CHEER_TIME = 0.95;
const PUFFS = 10;
const PUFF_LIFE = 0.55;

export interface Avatar {
  group: THREE.Group;
  /** 揚塵等世界座標特效，要另外加進場景 */
  effects: THREE.Group;
  /** speed：目前移動速度（m/s），決定擺手腳的快慢與幅度 */
  update(dt: number, speed: number): void;
  /** 擋住後面的物品時變半透明（0–1，平滑過渡） */
  fadeTo(opacity: number): void;
  /** 頭轉向世界座標的點（null = 看前方） */
  lookAt(point: THREE.Vector3 | null): void;
  /** 找到東西：原地開心跳一下、舉手、^ ^ 眼 */
  cheer(): void;
}

const ease = (k: number, dt: number) => 1 - Math.exp(-dt * k);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createAvatar(): Avatar {
  const material = toonMaterial({ vertexColors: true, transparent: true });
  const ink = outlineMaterial();
  ink.transparent = true;
  // 只寫深度的前置殼：在所有不透明物件之後、半透明小人之前畫，半透明時只看得到最外層，
  // 不會透出衣服裡的頭髮、手臂後面的身體
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  // 五官不打光：卡通明暗會把黑眼珠壓成灰色
  const flat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
  const part = (model: Model3D, prepass = true) => {
    const built = buildModel(model);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(built.geometry, model.outline === false ? flat : material);
    mesh.castShadow = true;
    if (prepass) {
      const pre = new THREE.Mesh(built.geometry, depthOnly);
      pre.renderOrder = 10;
      g.add(pre);
    }
    g.add(mesh);
    if (built.outline) g.add(new THREE.Mesh(built.outline, ink));
    return g;
  };
  const joint = (model: Model3D, x: number, y: number, z = 0, prepass = true) => {
    const g = part(model, prepass);
    g.position.set(x, y, z);
    return g;
  };

  const body = part(BODY);
  const head = joint(HEAD, 0, NECK);
  const eyes = [joint(EYE, -EYE_X, EYE_Y, EYE_Z, false), joint(EYE, EYE_X, EYE_Y, EYE_Z, false)];
  const happy = [joint(HAPPY_EYE, -EYE_X, EYE_Y, EYE_Z + 0.02, false), joint(HAPPY_EYE, EYE_X, EYE_Y, EYE_Z + 0.02, false)];
  for (const h of happy) h.visible = false;
  const sprout = joint(SPROUT, 0.02, 0.86, 0.04);
  head.add(part(FACE, false), ...eyes, ...happy, sprout);
  const legs = [joint(LEG, -0.1, HIP), joint(LEG, 0.1, HIP)];
  const arms = [joint(ARM, -0.24, SHOULDER), joint(ARM, 0.24, SHOULDER)];
  const rig = new THREE.Group();
  rig.add(body, head, ...legs, ...arms);
  const group = new THREE.Group();
  group.add(rig);

  // 揚塵：小圓球池，從腳邊冒出、變大、淡掉
  const effects = new THREE.Group();
  const puffGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const puffs = Array.from({ length: PUFFS }, () => {
    const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#fafafa', transparent: true, depthWrite: false }));
    mesh.visible = false;
    effects.add(mesh);
    return { mesh, age: PUFF_LIFE, vx: 0, vz: 0 };
  });
  let nextPuff = 0;

  let phase = 0;
  let idle = 0;
  let amount = 0;
  let lean = 0;
  let opacity = 1;
  let wanted = 1;
  let blinkIn = 2 + Math.random() * 2;
  let blinkT = -1;
  let cheerT = -1;
  let lookPoint: THREE.Vector3 | null = null;
  let headYaw = 0;
  let headPitch = 0;
  let lastFacing = 0;
  let lastLift = 0;
  // 呆毛彈簧：角度與角速度（前後、左右）
  const spring = { x: 0, vx: 0, z: 0, vz: 0 };
  const local = new THREE.Vector3();

  const spawnPuff = (side: number) => {
    const p = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % PUFFS;
    const yaw = group.rotation.y;
    // 腳後跟、往後上方飄
    local.set(side * 0.1, 0.06, -0.12).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(group.position);
    p.mesh.position.copy(local);
    p.vx = -Math.sin(yaw) * 0.6 + (Math.random() - 0.5) * 0.3;
    p.vz = -Math.cos(yaw) * 0.6 + (Math.random() - 0.5) * 0.3;
    p.age = 0;
    p.mesh.visible = true;
  };

  const updatePuffs = (dt: number) => {
    for (const p of puffs) {
      if (p.age >= PUFF_LIFE) continue;
      p.age += dt;
      const k = Math.min(p.age / PUFF_LIFE, 1);
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.position.y += dt * 0.35;
      p.mesh.scale.setScalar(0.6 + k * 1.6);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k) * opacity;
      if (k >= 1) p.mesh.visible = false;
    }
  };

  const updateBlink = (dt: number) => {
    blinkIn -= dt;
    if (blinkIn <= 0 && blinkT < 0) {
      blinkT = 0;
      // 偶爾連眨兩下
      blinkIn = Math.random() < 0.2 ? 0.25 : 2.2 + Math.random() * 2.8;
    }
    let open = 1;
    if (blinkT >= 0) {
      blinkT += dt;
      open = Math.abs(Math.cos((blinkT / 0.16) * Math.PI)) * 0.9 + 0.1;
      if (blinkT >= 0.16) blinkT = -1;
    }
    for (const e of eyes) e.scale.y = open;
  };

  const updateHead = (dt: number) => {
    let wantYaw = 0, wantPitch = 0;
    if (lookPoint) {
      local.copy(lookPoint);
      group.worldToLocal(local);
      local.y -= NECK + 0.42;
      wantYaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1, 1);
      wantPitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.35, 0.45);
      // 在背後就別硬轉
      if (local.z < -0.2) wantYaw = 0;
    }
    headYaw += (wantYaw - headYaw) * ease(7, dt);
    headPitch += (wantPitch - headPitch) * ease(7, dt);
  };

  const updateSpring = (dt: number, lift: number, turn: number) => {
    // 身體上下加速度推前後、轉身推左右；彈簧 + 阻尼
    const accel = (lift - lastLift) / Math.max(dt, 1e-3);
    lastLift = lift;
    spring.vx += (-spring.x * 90 - spring.vx * 7 + accel * 3) * dt;
    spring.vz += (-spring.z * 90 - spring.vz * 7 - turn * 6) * dt;
    spring.x = THREE.MathUtils.clamp(spring.x + spring.vx * dt, -0.7, 0.7);
    spring.z = THREE.MathUtils.clamp(spring.z + spring.vz * dt, -0.7, 0.7);
    sprout.rotation.set(spring.x - 0.1 * amount, 0, spring.z);
  };

  return {
    group,
    effects,
    update(dt, speed) {
      const target = Math.min(speed / 4, 1.3);
      amount += (target - amount) * ease(10, dt);
      const before = Math.floor(phase / Math.PI);
      phase += dt * STRIDE * Math.max(Math.sqrt(speed / 4), 0.6);
      // 每一步落地：跑步時從那隻腳後面冒一團灰
      if (Math.floor(phase / Math.PI) !== before && speed > 5) spawnPuff(Math.floor(phase / Math.PI) % 2 ? 1 : -1);
      const s = Math.sin(phase) * SWING * amount;
      legs[0].rotation.x = s;
      legs[1].rotation.x = -s;
      idle += dt;
      const still = 1 - Math.min(amount, 1);

      // 蹦跳步伐 + 落地壓扁、騰空拉長；站著時慢慢呼吸
      const bounce = Math.abs(Math.cos(phase));
      let lift = bounce * 0.08 * amount;
      const squash = (bounce - 0.5) * 0.09 * Math.min(amount, 1) + Math.sin(idle * 2.4) * 0.012 * still;
      rig.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
      lean += (THREE.MathUtils.clamp((speed - 4) / 6, 0, 1) * 0.22 - lean) * ease(6, dt);
      rig.rotation.x = lean;

      let armUp = 0;
      if (cheerT >= 0) {
        cheerT += dt;
        const k = Math.min(cheerT / CHEER_TIME, 1);
        lift += Math.sin(Math.min(k * 1.6, 1) * Math.PI) * 0.32;
        armUp = Math.sin(k * Math.PI);
        if (k >= 1) cheerT = -1;
      }
      for (const h of happy) h.visible = cheerT >= 0;
      for (const e of eyes) e.visible = cheerT < 0;
      rig.position.y = lift;
      arms[0].rotation.set(-s * 0.8 - armUp * 2.7, 0, -0.22 - armUp * 0.35);
      arms[1].rotation.set(s * 0.8 - armUp * 2.7, 0, 0.22 + armUp * 0.35);

      updateHead(dt);
      head.rotation.set(
        headPitch + Math.sin(idle * 2) * 0.03 * still + 0.06 * amount - armUp * 0.15,
        headYaw,
        Math.sin(phase) * 0.08 * amount + Math.sin(idle * 0.9) * 0.04 * still,
      );
      updateBlink(dt);
      const turn = wrap(group.rotation.y - lastFacing) / Math.max(dt, 1e-3);
      lastFacing = group.rotation.y;
      updateSpring(dt, lift, turn);
      updatePuffs(dt);

      opacity += (wanted - opacity) * ease(10, dt);
      material.opacity = flat.opacity = opacity;
      // 描邊殼在半透明時會疊出一圈深色，淡到一半就不畫
      ink.visible = opacity > 0.6;
    },
    fadeTo(o) {
      wanted = o;
    },
    lookAt(point) {
      lookPoint = point;
    },
    cheer() {
      cheerT = 0;
    },
  };
}
