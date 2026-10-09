// 3D 銀座的場景引擎（命令式 three.js，React 只負責 UI）：城市、物件、行走、點選、提示光柱。
// 遊戲規則不在這裡：點到什麼就回報 onPick，由 GameScreen3D 呼叫 src/lib/stages.ts。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCollider, type Collider } from '@/lib/city3d/collision';
import { inZone, poseOf, toWorld, type StreetFrame, type StreetSpot } from '@/lib/city3d/street-frame';
import type { Model3D } from '@/lib/city3d/model-dsl';
import type { StreetSet } from '@/data/city3d/ginza-street';
import { buildCity, type CityData, type Road } from './ginzaCity';
import { createLife, type Life } from './ginzaLife';
import { buildStreetscape } from './ginzaStreetscape';
import { buildClockTower, CLOCK_UPDATE_MS, WAKO_CLOCK } from './ginzaClockTower';
import { buildModel, OUTLINE, outlineMaterial, toonMaterial, type BuiltModel } from './toon';

export type ViewMode = 'walk' | 'bird';

export interface PickEvent {
  /** 看得見、被點到的物品 */
  itemId: string | null;
  /** 射線經過附近的物品（含隱形的），記憶挑戰用；由近到遠 */
  nearIds: string[];
  /** 相對容器的點擊位置（px），給單字卡定位 */
  point: { x: number; y: number };
}

export interface CityWorldOptions {
  container: HTMLElement;
  set: StreetSet;
  models: Record<string, Model3D>;
  fixtures: Record<string, Model3D>;
  onPick: (e: PickEvent) => void;
}

interface ItemNode {
  mesh: THREE.Mesh;
  outline: THREE.Mesh | null;
  outlineMat: THREE.ShaderMaterial | null;
  center: THREE.Vector3;
  radius: number;
}

const EYE = 1.6;
const RADIUS = 0.35;
const WALK = 4;
const RUN = 9;
const LOOK = 0.0035;
const CLICK_SLOP = 6;
const LINE = 0.0028;
const LINE_BOLD = 0.0055;
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

async function loadJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 回應 ${res.status}`);
  return res.json() as Promise<T>;
}

/** 鏡頭朝 (dx, dz) 方向看時的 yaw（three.js 鏡頭看向本地 -z） */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export class CityWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight('#fff8e7', 2.4);
  private collider: Collider;
  private life: Life;
  private items = new Map<string, ItemNode>();
  private pickables: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private beacon: THREE.Mesh;
  private mode: ViewMode = 'walk';
  private player = new THREE.Vector2();
  private yaw = 0;
  private pitch = -0.12;
  private turnTo: { yaw: number; pitch: number } | null = null;
  private keys = new Set<string>();
  private press: { x: number; y: number; id: number; moved: boolean } | null = null;
  private found = new Set<string>();
  private hideUnfound = false;
  private hoverId: string | null = null;
  private flash: { id: string; until: number } | null = null;
  private raf = 0;
  private cleanups: (() => void)[] = [];

  static async create(opts: CityWorldOptions): Promise<CityWorld> {
    const [city, roads] = await Promise.all([
      loadJSON<CityData>('/city3d/ginza/city.json'),
      loadJSON<Road[]>('/city3d/ginza/roads.json'),
    ]);
    return new CityWorld(opts, city, roads);
  }

  private constructor(private opts: CityWorldOptions, city: CityData, roads: Road[]) {
    const { container, set } = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 6000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 900;
    this.controls.enabled = false;

    this.scene.fog = new THREE.Fog('#e1f5fe', 220, 1400);
    this.addLights();
    const inPlay = (x: number, z: number) => inZone(set.frame, set.playZone, x, z);
    const built = buildCity(city, roads, this.renderer, inPlay);
    this.life = createLife(roads, inPlay);
    this.scene.add(built.sky, built.buildings, built.ground, buildStreetscape(city.buildings, roads, inPlay), this.life.group);
    const wako = city.buildings.find((b) => b.id === WAKO_CLOCK.buildingId);
    const tower = buildClockTower(city.clock ?? (wako ? { ...WAKO_CLOCK, base: wako.height } : undefined));
    this.scene.add(tower.group);
    const clockTimer = window.setInterval(() => tower.update(), CLOCK_UPDATE_MS);
    this.cleanups.push(() => window.clearInterval(clockTimer));
    this.listen(document, 'visibilitychange', () => {
      if (!document.hidden) tower.update();
    });
    this.collider = createCollider(city.buildings, city.bounds);

    this.addFixtures(set);
    this.addItems(set);
    this.beacon = this.createBeacon();
    this.scene.add(this.beacon);

    const [sx, sz] = toWorld(set.frame, set.spawn.u, set.spawn.v);
    this.player.set(sx, sz);
    this.yaw = yawToward(set.frame.dir[0], set.frame.dir[1]);

    this.bindInput();
    this.resize();
    this.loop();
  }

  private addLights() {
    const hemi = new THREE.HemisphereLight('#ffffff', '#b0a594', 1.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    // 2D 小鎮沒有濃重的陰影：大樓影子只把地面壓暗一點
    this.sun.shadow.intensity = 0.4;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -70;
    cam.right = cam.top = 70;
    cam.near = 1;
    cam.far = 400;
    this.scene.add(hemi, this.sun, this.sun.target);
  }

  private place(frame: StreetFrame, spot: StreetSpot, obj: THREE.Object3D) {
    const pose = poseOf(frame, spot);
    obj.position.set(pose.x, pose.y, pose.z);
    obj.rotation.y = pose.yaw;
  }

  private addFixtures(set: StreetSet) {
    const material = toonMaterial({ vertexColors: true });
    const ink = outlineMaterial();
    const cache = new Map<string, BuiltModel>();
    for (const spot of set.fixtures) {
      const model = this.opts.fixtures[spot.model];
      if (!model) continue;
      const built = cache.get(spot.model) ?? buildModel(model);
      cache.set(spot.model, built);
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(built.geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      if (built.outline) group.add(new THREE.Mesh(built.outline, ink));
      this.place(set.frame, spot, group);
      this.scene.add(group);
    }
  }

  private addItems(set: StreetSet) {
    const material = toonMaterial({ vertexColors: true });
    for (const spot of set.items) {
      const model = this.opts.models[spot.id];
      if (!model) continue;
      const built = buildModel(model);
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(built.geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.itemId = spot.id;
      group.add(mesh);
      let outline: THREE.Mesh | null = null;
      let outlineMat: THREE.ShaderMaterial | null = null;
      if (built.outline) {
        outlineMat = outlineMaterial();
        outline = new THREE.Mesh(built.outline, outlineMat);
        group.add(outline);
      }
      this.place(set.frame, spot, group);
      this.scene.add(group);
      group.updateMatrixWorld(true);
      const sphere = built.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
      this.items.set(spot.id, { mesh, outline, outlineMat, center: sphere.center, radius: Math.max(sphere.radius, 0.25) });
      this.pickables.push(mesh);
    }
  }

  private createBeacon(): THREE.Mesh {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 26, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffb300', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    );
    beacon.visible = false;
    return beacon;
  }

  // ── 對外 API ──

  setMode(mode: ViewMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.turnTo = null;
    // 鳥瞰離地遠：near 拉大，地面、人行道地磚才不會和底下的外圍平面搶深度（z-fighting）
    this.camera.near = mode === 'bird' ? 1 : 0.1;
    this.camera.updateProjectionMatrix();
    if (mode === 'bird') {
      this.controls.enabled = true;
      this.controls.target.set(this.player.x, 0, this.player.y);
      this.camera.position.set(this.player.x + Math.sin(this.yaw) * 40, 45, this.player.y + Math.cos(this.yaw) * 40);
    } else {
      this.controls.enabled = false;
      const spot = this.collider.nearestFree(this.controls.target.x, this.controls.target.z, RADIUS);
      if (spot) this.player.set(spot[0], spot[1]);
    }
  }

  /** 已找到的物品描綠框；記憶挑戰時沒找到的物品隱形 */
  setFound(ids: readonly string[], hideUnfound: boolean) {
    this.found = new Set(ids);
    this.hideUnfound = hideUnfound;
    this.applyVisibility();
  }

  private applyVisibility() {
    for (const [id, node] of this.items) {
      const visible = !this.hideUnfound || this.found.has(id) || this.flash?.id === id;
      node.mesh.visible = visible;
      if (node.outline) node.outline.visible = visible;
    }
  }

  flashItem(id: string, ms = 2700) {
    this.flash = { id, until: performance.now() + ms };
    this.applyVisibility();
  }

  /** 把視線轉向物品（漫遊）或把鏡頭移過去（鳥瞰） */
  focusItem(id: string) {
    const node = this.items.get(id);
    if (node) this.focusPoint(node.center);
  }

  focusPoint(p: THREE.Vector3) {
    if (this.mode === 'bird') {
      this.controls.target.copy(p);
      return;
    }
    const dx = p.x - this.player.x, dz = p.z - this.player.y;
    this.turnTo = { yaw: yawToward(dx, dz), pitch: THREE.MathUtils.clamp(Math.atan2(p.y - EYE, Math.hypot(dx, dz)), -0.9, 0.6) };
  }

  /** 預覽／截圖用：站到街道座標 (u, v)，看向 (lookU, lookV) 的物品高度 */
  viewFrom(u: number, v: number, lookU: number, lookV: number, lookY = 1) {
    const { frame } = this.opts.set;
    const [x, z] = toWorld(frame, u, v);
    const [tx, tz] = toWorld(frame, lookU, lookV);
    this.setMode('walk');
    this.player.set(x, z);
    this.yaw = yawToward(tx - x, tz - z);
    this.pitch = Math.atan2(lookY - EYE, Math.hypot(tx - x, tz - z));
    this.turnTo = null;
  }

  /** 一群物品的地面中心（提示時標出區域） */
  centerOf(ids: readonly string[]): THREE.Vector3 | null {
    const nodes = ids.map((id) => this.items.get(id)).filter((n): n is ItemNode => !!n);
    if (nodes.length === 0) return null;
    const c = new THREE.Vector3();
    for (const n of nodes) c.add(n.center);
    return c.divideScalar(nodes.length).setY(0);
  }

  showBeacon(p: THREE.Vector3 | null) {
    this.beacon.visible = !!p;
    if (p) this.beacon.position.set(p.x, 13, p.z);
  }

  setKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const off of this.cleanups) off();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── 輸入 ──

  private listen<T extends Event>(target: EventTarget, type: string, fn: (e: T) => void) {
    const handler = fn as EventListener;
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private bindInput() {
    const canvas = this.renderer.domElement;
    this.listen<KeyboardEvent>(window, 'keydown', (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      if (MOVE_KEYS[e.code] || e.code.startsWith('Shift')) {
        this.keys.add(e.code);
        if (MOVE_KEYS[e.code]) e.preventDefault();
      }
    });
    this.listen<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
    this.listen(window, 'blur', () => this.keys.clear());
    this.listen<PointerEvent>(canvas, 'pointerdown', (e) => {
      this.press = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      this.turnTo = null;
    });
    this.listen<PointerEvent>(window, 'pointermove', (e) => this.onPointerMove(e, canvas));
    this.listen<PointerEvent>(window, 'pointerup', (e) => {
      const press = this.press;
      this.press = null;
      if (press && e.pointerId === press.id && !press.moved && e.target === canvas) this.pick(e);
    });
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.opts.container);
    this.cleanups.push(() => observer.disconnect());
  }

  private onPointerMove(e: PointerEvent, canvas: HTMLCanvasElement) {
    const press = this.press;
    if (press && e.pointerId === press.id) {
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (!press.moved && Math.hypot(dx, dy) > CLICK_SLOP) press.moved = true;
      if (press.moved && this.mode === 'walk') {
        // 拖曳 = 抓住場景轉：往右拖，視線往左
        this.yaw += dx * LOOK;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * LOOK, -1.2, 1.0);
        press.x = e.clientX;
        press.y = e.clientY;
      }
      return;
    }
    if (e.target !== canvas) return;
    this.rayFrom(e);
    this.hoverId = this.hitItem();
    canvas.style.cursor = this.hoverId ? 'pointer' : this.mode === 'walk' ? 'grab' : 'default';
  }

  private rayFrom(e: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    this.raycaster.setFromCamera(new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1), this.camera);
    return { x, y };
  }

  private hitItem(): string | null {
    const hit = this.raycaster.intersectObjects(this.pickables.filter((m) => m.visible), false)[0];
    return (hit?.object.userData.itemId as string | undefined) ?? null;
  }

  private pick(e: PointerEvent) {
    const point = this.rayFrom(e);
    const ray = this.raycaster.ray;
    const nearIds = [...this.items.entries()]
      .map(([id, n]) => ({ id, d: ray.distanceToPoint(n.center), r: n.radius * 1.3 + 0.3, along: n.center.clone().sub(ray.origin).dot(ray.direction) }))
      .filter((n) => n.along > 0 && n.d < n.r)
      .sort((a, b) => a.along - b.along)
      .map((n) => n.id);
    this.opts.onPick({ itemId: this.hitItem(), nearIds, point });
  }

  // ── 每一幀 ──

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private updateWalk(dt: number) {
    let ix = 0, iz = 0;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir) { ix += dir[0]; iz += dir[1]; }
    }
    if (ix || iz) {
      this.turnTo = null;
      const len = Math.hypot(ix, iz);
      const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? RUN : WALK) * dt;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = ((ix * cos - iz * sin) / len) * speed;
      const dz = ((-ix * sin - iz * cos) / len) * speed;
      const [x, z] = this.collider.move(this.player.x, this.player.y, dx, dz, RADIUS);
      this.player.set(x, z);
    }
    if (this.turnTo) {
      const k = 1 - Math.exp(-dt * 6);
      const dyaw = Math.atan2(Math.sin(this.turnTo.yaw - this.yaw), Math.cos(this.turnTo.yaw - this.yaw));
      this.yaw += dyaw * k;
      this.pitch += (this.turnTo.pitch - this.pitch) * k;
      if (Math.abs(dyaw) < 0.002) this.turnTo = null;
    }
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.position.set(this.player.x, EYE, this.player.y);
  }

  private updateHighlights(now: number) {
    if (this.flash && now >= this.flash.until) {
      this.flash = null;
      this.applyVisibility();
    }
    const flashOn = !!this.flash && Math.floor(now / 220) % 2 === 0;
    for (const [id, node] of this.items) {
      if (!node.outlineMat) continue;
      const color = this.flash?.id === id
        ? (flashOn ? OUTLINE.hover : OUTLINE.ink)
        : id === this.hoverId ? OUTLINE.hover : this.found.has(id) ? OUTLINE.found : OUTLINE.ink;
      (node.outlineMat.uniforms.color.value as THREE.Color).set(color);
      node.outlineMat.uniforms.width.value = color === OUTLINE.ink ? LINE : LINE_BOLD;
    }
    if (this.beacon.visible) (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(now / 250) * 0.08;
  }

  private loop() {
    let last = performance.now();
    const focus = new THREE.Vector3();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this.mode === 'walk') {
        this.updateWalk(dt);
        focus.set(this.player.x, 0, this.player.y);
      } else {
        this.controls.update();
        focus.copy(this.controls.target);
      }
      this.sun.position.set(focus.x - 60, 120, focus.z + 40);
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.life.update(dt);
      this.updateHighlights(now);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
}
