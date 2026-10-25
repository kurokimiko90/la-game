// 3D 銀座的場景引擎（命令式 three.js，React 只負責 UI）：城市、物件、第三人稱行走、點選、提示光柱。
// 遊戲規則不在這裡：點到什麼就回報 onPick，由 GameScreen3D 呼叫 src/lib/stages.ts。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCollider, type Collider } from '@/lib/city3d/collision';
import { inZone, poseOf, toWorld, type StreetFrame, type StreetSpot } from '@/lib/city3d/street-frame';
import type { Model3D } from '@/lib/city3d/model-dsl';
import type { StreetSet } from '@/data/city3d/ginza-street';
import { buildCity, type CityData, type Road } from './ginzaCity';
import { buildGreenery } from './ginzaGreenery';
import { fitCentralRoads } from '@/lib/city3d/road-layout';
import { planGreenery } from '@/lib/city3d/greenery';
import { createLife, type Life } from './ginzaLife';
import { buildStreetscape } from './ginzaStreetscape';
import { buildPlayRoad } from './ginzaPlayRoad';
import { buildClockTower, CLOCK_UPDATE_MS, WAKO_CLOCK } from './ginzaClockTower';
import { buildModel, OUTLINE, outlineMaterial, toonMaterial, type BuiltModel } from './toon';
import { createAvatar, type Avatar } from './ginzaAvatar';
import { footprintBox, hitsFootprint, type Footprint } from '@/lib/city3d/footprint';
import { carveRooms, roomAt } from '@/lib/city3d/rooms';
import { buildRoom } from './ginzaRooms';
import { bendY, curveAmount, unbendY } from '@/lib/city3d/curvature';
import { subdivide, type SubdivideOptions } from './subdivide';
import {
  WALK_SPEED as TOUR_SPEED, jumpTo, lookTarget, planTour, shotIndex, startTour, stepTour, tourPose, tourProgress,
  type TourState, type TourStop, type TourStopDef,
} from '@/lib/city3d/guided-tour';

export type ViewMode = 'walk' | 'bird';

export interface PickEvent {
  /** 看得見、被點到的物品 */
  itemId: string | null;
  /** 射線經過附近的物品（含隱形的），記憶挑戰用；由近到遠 */
  nearIds: string[];
  /** 相對容器的點擊位置（px），給單字卡定位 */
  point: { x: number; y: number };
}

/** 導覽狀態回報：站點／階段／念到的物品改變時，以及步行中約每 0.15 秒（進度條）；結束時回報 null */
export interface TourEvent {
  state: TourState;
  stop: TourStop;
  total: number;
  /** 正在念的物品（步行、轉身時為 null） */
  itemId: string | null;
  /** 本站第幾個物品（-1 = 還沒開始念） */
  shot: number;
  /** 0–1 */
  progress: number;
  /** 步行剩餘公尺 */
  remaining: number;
}

export type TourCommand = 'pause' | 'prev' | 'next' | 'restart';

export interface CityWorldOptions {
  container: HTMLElement;
  set: StreetSet;
  models: Record<string, Model3D>;
  fixtures: Record<string, Model3D>;
  onPick: (e: PickEvent) => void;
  /** 聽讀導覽的站點（街道座標） */
  tour?: readonly TourStopDef[];
  onTour?: (e: TourEvent | null) => void;
}

interface ItemNode {
  mesh: THREE.Mesh;
  outline: THREE.Mesh | null;
  outlineMat: THREE.ShaderMaterial | null;
  center: THREE.Vector3;
  radius: number;
  /** 被點到／導覽念到時彈一下：開始時間（ms），-1 = 沒在彈 */
  bounceAt: number;
}

/** 鏡頭看向小人的高度 */
const AIM = 1.1;
/** 小人頭頂高度 */
const AVATAR_TOP = 1.75;
/** 鏡頭注視點在小人前方多遠（公尺，預設距離時） */
const LOOK_AHEAD = 3;
const RADIUS = 0.35;
/** 第三人稱鏡頭：距離（可滾輪縮放）、仰角範圍 */
const CAM_DIST = 9.5;
/** 垂直視角：太廣角兩側大樓會被拉歪；窄一點、鏡頭稍高，像在看一座模型小鎮 */
const FOV = 42;
const CAM_MIN = 2.5;
const CAM_MAX = 22;
const PITCH_MIN = 0.1;
const PITCH_MAX = 1.3;
/** 點地面走過去：最遠距離、到了的判定 */
const TAP_WALK_MAX = 60;
const ARRIVE = 0.25;
/** 室內鏡頭離天花板的距離 */
const CEILING_GAP = 0.4;
/** 室內鏡頭離牆的距離 */
const ROOM_MARGIN = 0.45;
/** 鳥瞰鏡頭：在小人背後多遠、多高（公尺） */
const BIRD_BACK = 45;
const BIRD_HEIGHT = 110;
const WALK = 4;
const RUN = 9;
const LOOK = 0.0035;
const CLICK_SLOP = 6;
const BOUNCE_MS = 650;
/** 導覽步行中回報進度的間隔（秒） */
const TOUR_REPORT = 0.15;
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
  private sun = new THREE.DirectionalLight('#ffeed4', 2.5);
  private collider: Collider;
  private life: Life;
  private items = new Map<string, ItemNode>();
  /** 擋路的物件佔地；itemId 有值的在隱形時（記憶挑戰）不擋，免得撞到就知道位置 */
  private blockers: { foot: Footprint; itemId: string | null }[] = [];
  /** 這一幀鏡頭實際離小人多遠（被牆擋住會比 dist 短） */
  private camDist = CAM_DIST;
  /** 會擋在鏡頭和小人之間的物件（號誌、電線桿等），擋到時暫時隱藏 */
  private occluders: { group: THREE.Group; center: THREE.Vector3; radius: number }[] = [];
  private pickables: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private beacon: THREE.Mesh;
  private mode: ViewMode = 'walk';
  private player = new THREE.Vector2();
  private avatar: Avatar;
  private facing = 0;
  /** 鏡頭水平方向（同 three.js 鏡頭 yaw）、仰角、距離 */
  private yaw = 0;
  private pitch = 0.5;
  private dist = CAM_DIST;
  private turnTo: { yaw: number } | null = null;
  private walkTo: THREE.Vector2 | null = null;
  private tapToWalk = true;
  private marker: THREE.Mesh;
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private keys = new Set<string>();
  private press: { x: number; y: number; id: number; moved: boolean } | null = null;
  private found = new Set<string>();
  private hideUnfound = false;
  private hoverId: string | null = null;
  private flash: { id: string; until: number } | null = null;
  private sky: THREE.Mesh;
  private tourStops: TourStop[];
  private tour: TourState | null = null;
  private tourKey = '';
  private tourReportAt = 0;
  private raf = 0;
  private cleanups: (() => void)[] = [];

  static async create(opts: CityWorldOptions): Promise<CityWorld> {
    const [city, roads] = await Promise.all([
      loadJSON<CityData>('/city3d/ginza/city.json'),
      loadJSON<Road[]>('/city3d/ginza/roads.json'),
    ]);
    // 店內的位置要先從大樓一樓挖空，碰撞、地面、建築都用挖過的版本
    const buildings = carveRooms(city.buildings, opts.set.frame, opts.set.rooms);
    return new CityWorld(opts, { ...city, buildings }, fitCentralRoads(roads));
  }

  private constructor(private opts: CityWorldOptions, city: CityData, roads: Road[]) {
    const { container, set } = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 白牆、人行道在日光 + 天光下會爆成純白；Neutral 只壓高光，色票顏色幾乎不變
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 6000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 900;
    this.controls.enabled = false;

    this.scene.fog = new THREE.Fog('#dff4ff', 180, 1000);
    this.addLights();
    const inPlay = (x: number, z: number) => inZone(set.frame, set.playZone, x, z);
    const built = buildCity(city, roads, this.renderer, inPlay);
    this.life = createLife(roads, inPlay);
    this.scene.add(buildPlayRoad(roads, inPlay));
    this.sky = built.sky;
    this.scene.add(built.sky, built.buildings, built.ground, buildStreetscape(city.buildings, roads, city.signs ?? [], (x, z) => !!roomAt(set.rooms, set.frame, x, z, -1), inPlay), this.life.group);
    const wako = city.buildings.find((b) => b.id === WAKO_CLOCK.buildingId);
    const tower = buildClockTower(city.clock ?? (wako ? { ...WAKO_CLOCK, base: wako.height } : undefined));
    this.scene.add(tower.group);
    const clockTimer = window.setInterval(() => tower.update(), CLOCK_UPDATE_MS);
    this.cleanups.push(() => window.clearInterval(clockTimer));
    this.listen(document, 'visibilitychange', () => {
      if (!document.hidden) tower.update();
    });
    // 中央通り桂樹與植栽帶：遊戲區以外才放（區內人行道擺的是要找的物品）
    const beds = planGreenery(city, roads, inPlay);
    this.scene.add(buildGreenery(beds));
    this.collider = createCollider(city.buildings, city.bounds, beds);
    this.tourStops = planTour(opts.tour ?? [], set.rooms);

    this.addRooms(set);
    this.addFixtures(set);
    this.subdivideLarge(set);
    this.addItems(set);
    this.beacon = this.createBeacon();
    this.scene.add(this.beacon);
    this.avatar = createAvatar();
    this.marker = this.createMarker();
    this.scene.add(this.avatar.group, this.avatar.effects, this.marker);

    const [sx, sz] = toWorld(set.frame, set.spawn.u, set.spawn.v);
    this.player.set(sx, sz);
    this.yaw = yawToward(set.frame.dir[0], set.frame.dir[1]);
    this.facing = Math.atan2(set.frame.dir[0], set.frame.dir[1]);

    this.bindInput();
    this.resize();
    this.loop();
    // 開發時給截圖腳本用（看動畫、表情）
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __city3d?: CityWorld }).__city3d = this;
  }

  private addLights() {
    // 天光偏藍、地面反光偏暖：陰面帶一點藍，向陽面暖黃（繪本／動森式的晴天）
    const hemi = new THREE.HemisphereLight('#d8eeff', '#dcc6a6', 1.25);
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

  private place(frame: StreetFrame, spot: StreetSpot, obj: THREE.Object3D, geometry: THREE.BufferGeometry, itemId: string | null) {
    const pose = poseOf(frame, spot);
    obj.position.set(pose.x, pose.y, pose.z);
    obj.rotation.y = pose.yaw;
    const box = footprintBox(geometry.attributes.position.array, pose.y);
    if (box) this.blockers.push({ foot: { ...box, x: pose.x, z: pose.z, yaw: pose.yaw }, itemId });
  }

  /**
   * 滾筒世界要在頂點上彎：地面、牆、路面、人行道地磚先切細（遊戲區附近 2 m，越遠越粗）。
   * 疊在一起的薄層（路面 0.8 cm、地磚 1.6 cm）切法要接近，否則彎出來的高低差會比層距大，下層會透上來。
   */
  private subdivideLarge(set: StreetSet) {
    const { u0, u1 } = set.playZone;
    const opts: SubdivideOptions = { center: toWorld(set.frame, (u0 + u1) / 2, 0), near: 2, radius: 60, growth: 0.6 };
    this.scene.updateMatrixWorld(true);
    const targets: THREE.Mesh[] = [];
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh || Array.isArray(obj.material)) return;
      // 天空不彎（fog: false 的只有天空）
      if ((obj.material as THREE.Material & { fog?: boolean }).fog === false) return;
      const geo = obj.geometry as THREE.BufferGeometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      if (geo.boundingSphere!.radius > 2) targets.push(obj);
    });
    for (const mesh of targets) {
      const next = subdivide(mesh.geometry, mesh.matrixWorld, opts);
      if (next === mesh.geometry) continue;
      mesh.geometry.dispose();
      mesh.geometry = next;
    }
  }

  private addRooms(set: StreetSet) {
    for (const room of set.rooms) {
      const built = buildRoom(set.frame, room, room.style);
      this.scene.add(built.group);
      for (const foot of built.blockers) this.blockers.push({ foot, itemId: null });
    }
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
      this.place(set.frame, spot, group, built.geometry, null);
      this.scene.add(group);
      this.trackOccluder(group, built.geometry, mesh);
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
      this.place(set.frame, spot, group, built.geometry, spot.id);
      this.scene.add(group);
      group.updateMatrixWorld(true);
      const sphere = built.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
      this.items.set(spot.id, { mesh, outline, outlineMat, center: sphere.center, radius: Math.max(sphere.radius, 0.25), bounceAt: -1 });
      this.trackOccluder(group, built.geometry, mesh);
      this.pickables.push(mesh);
    }
  }

  private trackOccluder(group: THREE.Group, geometry: THREE.BufferGeometry, mesh: THREE.Mesh) {
    group.updateMatrixWorld(true);
    const sphere = geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
    // 高的東西才會擋視線；地上的小物件不用管
    if (sphere.center.y + sphere.radius > 1.6) this.occluders.push({ group, center: sphere.center, radius: sphere.radius * 0.8 });
  }

  /** 鏡頭到小人這條線穿過的物件先藏起來（只看離鏡頭近的那一段） */
  private hideOccluders(all = false) {
    const cam = this.camera.position;
    const aim = new THREE.Vector3(this.player.x, AIM, this.player.y);
    const line = new THREE.Line3(cam, aim);
    const closest = new THREE.Vector3();
    const reach = cam.distanceTo(aim) - 0.8;
    for (const o of this.occluders) {
      if (all) { o.group.visible = true; continue; }
      line.closestPointToPoint(o.center, true, closest);
      o.group.visible = !(closest.distanceTo(o.center) < o.radius && cam.distanceTo(closest) < reach);
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

  private createMarker(): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 32),
      new THREE.MeshBasicMaterial({ color: OUTLINE.hover, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    return marker;
  }

  // ── 對外 API ──

  setMode(mode: ViewMode) {
    if (mode === this.mode) return;
    if (mode === 'bird') this.endTour();
    this.mode = mode;
    this.turnTo = null;
    // 鳥瞰離地遠：near 拉大，地面、人行道地磚才不會和底下的外圍平面搶深度（z-fighting）
    this.camera.near = mode === 'bird' ? 1 : 0.1;
    this.camera.updateProjectionMatrix();
    if (mode === 'bird') {
      this.hideOccluders(true);
      this.controls.enabled = true;
      this.controls.target.set(this.player.x, 0, this.player.y);
      // 從屋頂以上往下看：背後 40 m、高 45 m 會塞進對街大樓（銀座樓高 30–60 m）
      this.camera.position.set(this.player.x + Math.sin(this.yaw) * BIRD_BACK, BIRD_HEIGHT, this.player.y + Math.cos(this.yaw) * BIRD_BACK);
    } else {
      this.controls.enabled = false;
      this.walkTo = null;
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

  /** 點地面走過去（記憶挑戰要關掉：點空地 = 作答） */
  setTapToWalk(on: boolean) {
    this.tapToWalk = on;
    if (!on) this.walkTo = null;
  }

  /** 把鏡頭轉到小人背後看向物品（漫遊）或把鏡頭移過去（鳥瞰） */
  focusItem(id: string) {
    const node = this.items.get(id);
    if (node) this.focusPoint(node.center);
  }

  focusPoint(p: THREE.Vector3) {
    if (this.mode === 'bird') {
      this.controls.target.copy(p);
      return;
    }
    this.turnTo = { yaw: yawToward(p.x - this.player.x, p.z - this.player.y) };
  }

  /** 預覽／截圖用：站到街道座標 (u, v)，看向 (lookU, lookV) 的物品高度 */
  viewFrom(u: number, v: number, lookU: number, lookV: number) {
    const { frame } = this.opts.set;
    const [x, z] = toWorld(frame, u, v);
    const [tx, tz] = toWorld(frame, lookU, lookV);
    this.setMode('walk');
    this.player.set(x, z);
    this.yaw = yawToward(tx - x, tz - z);
    this.facing = Math.atan2(tx - x, tz - z);
    this.turnTo = null;
    this.walkTo = null;
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

  /** 物品彈一下（壓扁 → 拉長 → 回彈），點到或導覽念到時 */
  bounceItem(id: string) {
    const node = this.items.get(id);
    if (node) node.bounceAt = performance.now();
  }

  /** 小人開心跳一下（找到物品時） */
  cheer() {
    this.avatar.cheer();
  }

  /** 開始聽讀導覽（只在街道漫遊時有效） */
  startTour() {
    if (this.tourStops.length === 0) return;
    this.setMode('walk');
    this.walkTo = null;
    this.setTour(startTour(this.tourStops));
  }

  tourCommand(cmd: TourCommand) {
    const tour = this.tour;
    if (!tour) return;
    if (cmd === 'pause') this.setTour({ ...tour, paused: !tour.paused });
    else if (cmd === 'prev') this.setTour(jumpTo(this.tourStops, tour.index - 1));
    else if (cmd === 'restart') this.setTour(startTour(this.tourStops));
    else if (tour.finished) this.setTour(startTour(this.tourStops));
    // 步行中按「下一站」= 直接抵達這一站
    else this.setTour(jumpTo(this.tourStops, tour.phase === 'walking' ? tour.index : tour.index + 1));
  }

  endTour() {
    if (!this.tour) return;
    this.tour = null;
    this.tourKey = '';
    this.turnTo = null;
    this.opts.onTour?.(null);
  }

  private setTour(tour: TourState) {
    this.tour = tour;
    this.tourKey = '';
    this.reportTour(0, true);
  }

  private reportTour(remaining: number, force = false) {
    const tour = this.tour;
    if (!tour) return;
    const stop = this.tourStops[tour.index];
    const shot = shotIndex(tour, stop);
    const key = `${tour.index}:${tour.phase}:${shot}:${tour.paused}:${tour.finished}`;
    const now = performance.now() / 1000;
    const tick = tour.phase !== 'turning' && !tour.paused && now - this.tourReportAt > TOUR_REPORT;
    if (!force && key === this.tourKey && !tick) return;
    this.tourKey = key;
    this.tourReportAt = now;
    this.opts.onTour?.({
      state: tour, stop, total: this.tourStops.length, shot, remaining,
      itemId: tour.phase === 'looking' ? lookTarget(tour, this.tourStops) : null,
      progress: tourProgress(tour, this.tourStops),
    });
  }

  /** 物品中心在畫面上的位置（相對容器 px），給單字卡定位 */
  screenPointOf(id: string): { x: number; y: number } | null {
    const node = this.items.get(id);
    if (!node) return null;
    const p = this.bent(node.center).project(this.camera);
    if (p.z > 1) return null;
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
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
      if (e.code === 'Escape') this.endTour();
      if (MOVE_KEYS[e.code] || e.code.startsWith('Shift')) {
        this.keys.add(e.code);
        if (MOVE_KEYS[e.code]) e.preventDefault();
      }
    });
    this.listen<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
    this.listen<WheelEvent>(canvas, 'wheel', (e) => {
      if (this.mode !== 'walk') return;
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.0015), CAM_MIN, CAM_MAX);
    });
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
        // 拖曳 = 繞著小人轉鏡頭：往右拖，場景跟著往右；往下拖，鏡頭壓低
        this.yaw += dx * LOOK;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * LOOK, PITCH_MIN, PITCH_MAX);
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

  /**
   * 畫面上的射線在「彎曲前」世界裡是一條往上翹的曲線（見 lib/city3d/curvature.ts），切成折線來點選。
   * 不彎時（鳥瞰）就是原本的直線。
   */
  private rayPolyline(ray: THREE.Ray, max = 140, steps = 28): THREE.Vector3[] {
    const cam = this.camera.position;
    const k = curveAmount(cam.y);
    if (k === 0) return [ray.origin.clone(), ray.at(max, new THREE.Vector3())];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      // 近處切細一點（點選物品多在 20 m 內）
      const p = ray.at(max * (i / steps) ** 2, new THREE.Vector3());
      p.y = unbendY(p.y, p.x - cam.x, p.z - cam.z, k);
      pts.push(p);
    }
    return pts;
  }

  /** 彎曲後畫面上看到的位置（世界座標），給「射線經過附近」的判定與單字卡定位 */
  private bent(p: THREE.Vector3): THREE.Vector3 {
    const cam = this.camera.position;
    const k = curveAmount(cam.y);
    return p.clone().setY(bendY(p.y, p.x - cam.x, p.z - cam.z, k));
  }

  private hitItem(): string | null {
    const visible = this.pickables.filter((m) => m.visible);
    const pts = this.rayPolyline(this.raycaster.ray);
    const caster = new THREE.Raycaster();
    const seg = new THREE.Vector3();
    for (let i = 1; i < pts.length; i++) {
      seg.subVectors(pts[i], pts[i - 1]);
      const len = seg.length();
      caster.set(pts[i - 1], seg.divideScalar(len));
      caster.far = len;
      const hit = caster.intersectObjects(visible, false)[0];
      if (hit) return (hit.object.userData.itemId as string | undefined) ?? null;
    }
    return null;
  }

  private pick(e: PointerEvent) {
    const point = this.rayFrom(e);
    const ray = this.raycaster.ray;
    const nearIds = [...this.items.entries()]
      .map(([id, n]) => ({ id, c: this.bent(n.center), r: n.radius * 1.3 + 0.3 }))
      .map(({ id, c, r }) => ({ id, d: ray.distanceToPoint(c), r, along: c.sub(ray.origin).dot(ray.direction) }))
      .filter((n) => n.along > 0 && n.d < n.r)
      .sort((a, b) => a.along - b.along)
      .map((n) => n.id);
    const itemId = this.hitItem();
    if (itemId) this.bounceItem(itemId);
    if (!itemId && this.mode === 'walk' && this.tapToWalk) {
      // 導覽中點地面 = 自己接手走
      this.endTour();
      this.walkToward(ray);
    }
    this.opts.onPick({ itemId, nearIds, point });
  }

  private walkToward(ray: THREE.Ray) {
    const pts = this.rayPolyline(ray);
    let hit: THREE.Vector3 | null = null;
    for (let i = 1; i < pts.length && !hit; i++) hit = this.ground.intersectLine(new THREE.Line3(pts[i - 1], pts[i]), new THREE.Vector3());
    if (!hit || Math.hypot(hit.x - this.player.x, hit.z - this.player.y) > TAP_WALK_MAX) return;
    const spot = this.collider.nearestFree(hit.x, hit.z, RADIUS, 3);
    if (!spot) return;
    this.walkTo = new THREE.Vector2(spot[0], spot[1]);
    this.marker.position.set(spot[0], 0.03, spot[1]);
  }

  // ── 每一幀 ──

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 鍵盤／方向鍵：相對鏡頭方向；沒按鍵時走向點過的地面 */
  private moveInput(dt: number): [number, number] {
    let ix = 0, iz = 0;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir) { ix += dir[0]; iz += dir[1]; }
    }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (ix || iz) {
      this.turnTo = null;
      this.walkTo = null;
      const len = Math.hypot(ix, iz);
      const speed = (run ? RUN : WALK) * dt;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      return [((ix * cos - iz * sin) / len) * speed, ((-ix * sin - iz * cos) / len) * speed];
    }
    if (!this.walkTo) return [0, 0];
    const dx = this.walkTo.x - this.player.x, dz = this.walkTo.y - this.player.y;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE) {
      this.walkTo = null;
      return [0, 0];
    }
    const step = Math.min(d, (d > 12 ? RUN : WALK) * dt);
    return [(dx / d) * step, (dz / d) * step];
  }

  private blockedByObject(x: number, z: number): boolean {
    return this.blockers.some(({ foot, itemId }) =>
      (!itemId || this.items.get(itemId)?.mesh.visible) && hitsFootprint(foot, x, z, RADIUS));
  }

  /** 建築碰撞之外再擋物件：整步不行就沿 x 或 z 滑過去 */
  private step(dx: number, dz: number): [number, number] {
    const { x: px, y: pz } = this.player;
    const tries: [number, number][] = [[dx, dz], [dx, 0], [0, dz]];
    // 已經卡在物件裡（例如傳送過來）就讓它走出去
    const stuck = this.blockedByObject(px, pz);
    for (const [tx, tz] of tries) {
      if (!tx && !tz) continue;
      const [x, z] = this.collider.move(px, pz, tx, tz, RADIUS);
      if (stuck || !this.blockedByObject(x, z)) return [x, z];
    }
    return [px, pz];
  }

  private updateWalk(dt: number) {
    // 導覽中按方向鍵 = 自己接手走
    if (this.tour && [...this.keys].some((code) => MOVE_KEYS[code])) this.endTour();
    const speed = this.tour ? this.driveTour(dt, this.tour) : this.walkByInput(dt);
    if (this.turnTo) {
      const k = 1 - Math.exp(-dt * 6);
      const dyaw = Math.atan2(Math.sin(this.turnTo.yaw - this.yaw), Math.cos(this.turnTo.yaw - this.yaw));
      this.yaw += dyaw * k;
      if (Math.abs(dyaw) < 0.002) this.turnTo = null;
    }
    this.avatar.group.position.set(this.player.x, 0, this.player.y);
    this.avatar.group.rotation.y = this.facing;
    // 頭轉向導覽正在念的物品，或滑鼠指著的物品
    const lookId = (this.tour?.phase === 'looking' ? lookTarget(this.tour, this.tourStops) : null) ?? this.hoverId;
    this.avatar.lookAt(lookId ? this.items.get(lookId)?.center ?? null : null);
    this.avatar.update(dt, speed);
    this.marker.visible = !!this.walkTo;
    this.placeCamera();
    this.hideOccluders();
    // 室內鏡頭被牆逼得很近時，小人會塞滿畫面，一樣淡掉
    // 導覽在室內停下時鏡頭被天花板壓低，小人一定擋在物品前面
    const tourIndoors = !!this.tour && this.tour.phase !== 'walking' && !!roomAt(this.opts.set.rooms, this.opts.set.frame, this.player.x, this.player.y);
    this.avatar.fadeTo(tourIndoors || this.camDist < 1.6 || this.avatarCoversItem() ? 0.45 : 1);
  }

  /** 導覽：位置照路線走（路線已在測試中確認不撞牆和物件），朝向前進方向或正在念的物品；回傳速度給走路動畫 */
  private driveTour(dt: number, prev: TourState): number {
    const { frame } = this.opts.set;
    const tour = stepTour(prev, this.tourStops, dt);
    this.tour = tour;
    const pose = tourPose(tour, this.tourStops);
    const [x, z] = toWorld(frame, pose.position[0], pose.position[1]);
    this.player.set(x, z);
    let want: [number, number] | null = null;
    if (pose.dir) {
      const [ox, oz] = toWorld(frame, 0, 0);
      const [ex, ez] = toWorld(frame, pose.dir[0], pose.dir[1]);
      want = [ex - ox, ez - oz];
    } else {
      const node = this.items.get(lookTarget(tour, this.tourStops) ?? '');
      if (node) want = [node.center.x - x, node.center.z - z];
    }
    if (want) {
      const face = Math.atan2(want[0], want[1]);
      const k = tour.cut ? 1 : 1 - Math.exp(-dt * 8);
      this.facing += Math.atan2(Math.sin(face - this.facing), Math.cos(face - this.facing)) * k;
      // 拖曳中讓玩家自己轉鏡頭
      if (!this.press?.moved) {
        const yaw = yawToward(want[0], want[1]);
        if (tour.cut) this.yaw = yaw;
        else this.turnTo = { yaw };
      }
    }
    if (tour.cut && tour.phase === 'looking') this.tour = { ...tour, cut: false };
    this.reportTour(pose.remaining);
    return pose.dir && !tour.paused ? TOUR_SPEED : 0;
  }

  /** 鍵盤／點地面走路；回傳速度給走路動畫 */
  private walkByInput(dt: number): number {
    const [dx, dz] = this.moveInput(dt);
    let speed = 0;
    if (dx || dz) {
      const [x, z] = this.step(dx, dz);
      const moved = Math.hypot(x - this.player.x, z - this.player.y);
      // 被牆擋住走不動：放棄點地面的目標
      if (this.walkTo && moved < Math.hypot(dx, dz) * 0.2) this.walkTo = null;
      this.player.set(x, z);
      speed = moved / Math.max(dt, 1e-3);
      const want = Math.atan2(dx, dz);
      this.facing += Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)) * (1 - Math.exp(-dt * 12));
    }
    return speed;
  }

  /** 畫面上小人是否蓋住它背後的物品（近距離站在吧台前時，頭會擋住杯子） */
  private avatarCoversItem(): boolean {
    this.camera.updateMatrixWorld();
    const p = new THREE.Vector3();
    const project = (x: number, y: number, z: number) => p.set(x, y, z).project(this.camera).clone();
    const head = project(this.player.x, AVATAR_TOP, this.player.y);
    const feet = project(this.player.x, 0, this.player.y);
    const half = Math.abs(head.y - feet.y) * 0.25;
    const toAvatar = this.camera.position.distanceTo(p.set(this.player.x, AIM, this.player.y));
    for (const node of this.items.values()) {
      if (!node.mesh.visible) continue;
      const d = this.camera.position.distanceTo(node.center);
      if (d <= toAvatar || d > toAvatar + 5) continue;
      const s = project(node.center.x, node.center.y, node.center.z);
      if (s.y <= head.y + 0.02 && s.y >= feet.y && Math.abs(s.x - head.x) < half) return true;
    }
    return false;
  }

  /** 鏡頭在小人背後上方；中間隔著建築就拉近，不穿牆 */
  private placeCamera() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const flat = Math.cos(this.pitch);
    let dist = this.dist;
    // 室內：鏡頭壓在天花板下，也不穿出店面（招牌帶會擋住視線）
    const room = roomAt(this.opts.set.rooms, this.opts.set.frame, this.player.x, this.player.y);
    if (room) dist = Math.min(dist, (room.height - CEILING_GAP - AIM) / Math.sin(this.pitch));
    for (let t = room ? 0.25 : 1; t <= dist; t += 0.25) {
      const x = this.player.x - fx * flat * t, z = this.player.y - fz * flat * t;
      if (room && !roomAt([room], this.opts.set.frame, x, z, ROOM_MARGIN)) {
        dist = Math.max(t - 0.25, 0.3);
        break;
      }
      if (this.collider.blocked(x, z)) {
        dist = Math.max(t - 0.6, 1);
        break;
      }
    }
    this.camDist = dist;
    this.camera.position.set(
      this.player.x - fx * flat * dist,
      AIM + Math.sin(this.pitch) * dist,
      this.player.y - fz * flat * dist,
    );
    // 看向小人前方一點：小人落在畫面下方，不擋住正前方要點的物品
    const ahead = LOOK_AHEAD * Math.min(dist / CAM_DIST, 1.5);
    this.camera.lookAt(this.player.x + fx * ahead, AIM, this.player.y + fz * ahead);
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
    for (const node of this.items.values()) {
      if (node.bounceAt < 0) continue;
      const t = (now - node.bounceAt) / BOUNCE_MS;
      const group = node.mesh.parent!;
      if (t >= 1) {
        node.bounceAt = -1;
        group.scale.set(1, 1, 1);
        continue;
      }
      // 衰減的彈簧：先拉長再壓扁，體積大致不變（腳底不動，模型原點在底部）
      const y = 1 + Math.sin(t * Math.PI * 3) * 0.16 * (1 - t);
      const xz = 1 / Math.sqrt(y);
      group.scale.set(xz, y, xz);
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
      (this.sky.material as THREE.ShaderMaterial).uniforms.time.value += dt;
      this.avatar.group.visible = this.mode === 'walk';
      this.updateHighlights(now);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
}
