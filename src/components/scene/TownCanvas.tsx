'use client';

// 小鎮畫布：一張 2D 地圖，拖曳平移；滾輪 / 雙指 / 按鈕 / 鍵盤縮放（最小可以看到整個小鎮）。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, Maximize } from 'lucide-react';
import { DistrictLayer } from './DistrictLayer';
import { TownStrip } from './TownStrip';
import { TownMinimap } from './TownMinimap';
import { WorldBackground, worldSections } from './WorldBackground';
import { keyIntent, primaryButtonChange, wheelIntent, type ViewIntent } from '@/lib/controls';
import { clampView, centerOn, defaultScale, itemAtPoint, toScene, wholeView, zoomAt, type View, type Size } from '@/lib/geometry';
import { districtAt, districtBounds, type Rect, type Town } from '@/lib/town';
import type { Point } from '@/lib/types';

export interface SceneClick {
  /** 點到的物品（點在形狀上才算）；空白處或未解鎖的街區為 null */
  itemId: string | null;
  /** 點擊位置所在的街區（地圖外為 null） */
  sceneId: string | null;
  locked: boolean;
  /** 地圖座標 */
  scenePoint: Point;
  /** 相對於畫布容器左上角 */
  localPoint: Point;
}

export interface FocusRequest {
  x: number;
  y: number;
  key: number;
}

interface TownCanvasProps {
  town: Town;
  activeSceneId: string;
  lockedSceneIds: ReadonlySet<string>;
  /** 街區 id → 解鎖條件的前一個街區名稱 */
  unlockHints: ReadonlyMap<string, string>;
  foundIds: readonly string[];
  /** 記憶挑戰：目前街區未找到的物品隱形且不可點 */
  hideUnfound?: boolean;
  flashId?: string | null;
  hintZoneKey?: string | null;
  focus?: FocusRequest | null;
  /** 第一次顯示時置中的地圖座標 */
  initialFocus: Point;
  onSceneClick: (click: SceneClick) => void;
  onDistrict: (sceneId: string) => void;
  children?: ReactNode;
}

const DRAG_THRESHOLD = 8;
/** 點擊判定的容許誤差（螢幕像素） */
const HIT_SLOP_PX = 10;
const FOCUS_MS = 450;
/** 畫面外多遠還算「看得到」（動畫不暫停） */
const IDLE_MARGIN = 300;
const EMPTY: ReadonlySet<string> = new Set();

interface Gesture {
  mode: 'pan' | 'pinch';
  startView: View;
  start: Point;
  startDist: number;
  moved: boolean;
  target: EventTarget | null;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const intersects = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function TownCanvas({
  town, activeSceneId, lockedSceneIds, unlockHints, foundIds, hideUnfound = false, flashId = null, hintZoneKey = null, focus,
  initialFocus, onSceneClick, onDistrict, children,
}: TownCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [animating, setAnimating] = useState(false);
  const [ripples, setRipples] = useState<Array<Point & { id: number }>>([]);
  const viewRef = useRef(view);
  const sizeRef = useRef<Size | null>(null);
  const initialFocusRef = useRef(initialFocus);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const townSize = useMemo(() => ({ width: town.width, height: town.height }), [town.width, town.height]);
  // 北邊的街區先畫：跨街區交界時，南邊（比較靠前）的物件蓋在上面
  const districts = useMemo(() => [...town.districts].sort((a, b) => districtBounds(a).y0 - districtBounds(b).y0), [town]);

  const applyView = useCallback((next: View) => {
    const s = sizeRef.current;
    const clamped = s ? clampView(next, s, townSize) : next;
    viewRef.current = clamped;
    setView(clamped);
  }, [townSize]);

  // 容器尺寸：第一次量到時用預設縮放、以 initialFocus 為中心；之後維持畫面中心
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (next.width === 0 || next.height === 0) return;
      const prev = sizeRef.current;
      const v = viewRef.current;
      const center = prev ? toScene(v, { x: prev.width / 2, y: prev.height / 2 }) : initialFocusRef.current;
      const scale = prev ? v.scale : defaultScale(next);
      sizeRef.current = next;
      setSize(next);
      applyView({ scale, tx: next.width / 2 - center.x * scale, ty: next.height / 2 - center.y * scale });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyView]);

  // 外部要求把某點置中（提示、揭曉、切換街區）
  useEffect(() => {
    if (!focus || !sizeRef.current) return undefined;
    setAnimating(true);
    applyView(centerOn(viewRef.current, focus, sizeRef.current, townSize));
    const t = window.setTimeout(() => setAnimating(false), FOCUS_MS);
    return () => window.clearTimeout(t);
  }, [focus, applyView, townSize]);

  const localPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const zoomBy = useCallback((factor: number, anchor?: Point) => {
    const s = sizeRef.current;
    if (!s) return;
    const a = anchor ?? { x: s.width / 2, y: s.height / 2 };
    applyView(zoomAt(viewRef.current, a, viewRef.current.scale * factor));
  }, [applyView]);

  const jumpTo = useCallback((p: Point) => {
    const s = sizeRef.current;
    if (s) applyView(centerOn(viewRef.current, p, s, townSize));
  }, [applyView, townSize]);

  const showWholeTown = useCallback(() => {
    const s = sizeRef.current;
    if (s) applyView(wholeView(s, townSize));
  }, [applyView, townSize]);

  const applyIntent = useCallback((intent: ViewIntent, anchor?: Point) => {
    const v = viewRef.current;
    if (intent.kind === 'zoom') zoomBy(intent.factor, anchor);
    else if (intent.kind === 'pan') applyView({ ...v, tx: v.tx - intent.dx, ty: v.ty - intent.dy });
    else if (intent.kind === 'fit') showWholeTown();
  }, [applyView, zoomBy, showWholeTown]);

  // 滾輪 = 以游標為中心縮放；觸控板橫滑 / Shift + 滾輪 = 橫向平移。需要 passive:false 才能擋掉頁面捲動
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      // 面板（選關、結算、按鈕）上的滾輪留給面板自己捲動
      if (e.target instanceof Element && e.target.closest('[data-ui]')) return;
      e.preventDefault();
      applyIntent(wheelIntent(e), localPoint(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyIntent]);

  // 鍵盤快捷鍵整頁有效（不用先點地圖）；輸入框、單選群組裡的按鍵與 ctrl/⌘/alt 組合鍵留給瀏覽器
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isKeyOwnedByTarget(e.target)) return;
      const intent = keyIntent(e.key);
      if (intent.kind === 'none') return;
      e.preventDefault();
      applyIntent(intent);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyIntent]);

  const startPointer = (e: React.PointerEvent) => {
    containerRef.current?.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { mode: 'pan', startView: viewRef.current, start: p, startDist: 0, moved: false, target: e.target };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', startView: viewRef.current, start: mid(a, b), startDist: dist(a, b), moved: true, target: null };
    }
  };

  // 滑鼠只認左鍵（右鍵、中鍵不拖曳）
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startPointer(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // 別的鍵卡著時，左鍵的按下 / 放開只會以 pointermove 出現（見 primaryButtonChange）
    if (e.pointerType === 'mouse') {
      const change = primaryButtonChange(e.buttons, pointers.current.has(e.pointerId));
      if (change === 'press') return startPointer(e);
      if (change === 'release') return endPointer(e);
    }
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g.mode === 'pan') {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!g.moved) containerRef.current?.setAttribute('data-dragging', '');
      g.moved = true;
      applyView({ ...g.startView, tx: g.startView.tx + dx, ty: g.startView.ty + dy });
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      const zoomed = zoomAt(g.startView, g.start, g.startView.scale * (dist(a, b) / g.startDist));
      applyView({ ...zoomed, tx: zoomed.tx + m.x - g.start.x, ty: zoomed.ty + m.y - g.start.y });
    }
  };

  const found = useMemo(() => new Set(foundIds), [foundIds]);

  // 點在形狀的空隙（繩圈、筷子之間）也算點到：外框外擴 HIT_SLOP_PX 個螢幕像素；記憶挑戰隱形的物品不算
  const nearbyItemId = (sceneId: string, sp: Point): string | null => {
    const scene = districts.find((d) => d.scene.id === sceneId)?.scene;
    if (!scene) return null;
    const hidden = (itemId: string) => hideUnfound && sceneId === activeSceneId && !found.has(itemId);
    return itemAtPoint(scene.items.filter((it) => !hidden(it.id)), sp, HIT_SLOP_PX / viewRef.current.scale)?.id ?? null;
  };

  const endPointer = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) containerRef.current?.removeAttribute('data-dragging');
    if (pointers.current.size > 0) {
      // 雙指放開一指：剩下的那指接續平移，但不當成點擊
      const [rest] = [...pointers.current.values()];
      gesture.current = { mode: 'pan', startView: viewRef.current, start: rest, startDist: 0, moved: true, target: null };
      return;
    }
    gesture.current = null;
    if (!g || g.moved || e.type === 'pointercancel') return;

    const lp = localPoint(e);
    const sp = toScene(viewRef.current, lp);
    const sceneId = districtAt(town, sp)?.scene.id ?? null;
    const locked = sceneId !== null && lockedSceneIds.has(sceneId);
    const target = !locked && g.target instanceof Element ? g.target.closest('[data-item-id]') : null;
    const itemId = target?.getAttribute('data-item-id') ?? (locked || !sceneId ? null : nearbyItemId(sceneId, sp));
    const id = Date.now();
    setRipples((r) => [...r, { ...sp, id }]);
    window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600);
    onSceneClick({ itemId, sceneId, locked, scenePoint: sp, localPoint: lp });
  };

  const sections = useMemo(() => worldSections(town), [town]);
  const visible: Rect | null = size ? {
    x0: -view.tx / view.scale - IDLE_MARGIN,
    y0: -view.ty / view.scale - IDLE_MARGIN,
    x1: (size.width - view.tx) / view.scale + IDLE_MARGIN,
    y1: (size.height - view.ty) / view.scale + IDLE_MARGIN,
  } : null;
  const activeSections = visible ? Object.entries(sections).filter(([, r]) => intersects(r, visible)).map(([k]) => k).join(',') : '';

  return (
    <div
      ref={containerRef}
      className="town-canvas relative h-full w-full overflow-hidden touch-none select-none outline-none bg-[#cfe3b4]"
      tabIndex={0}
      aria-label="小鎮：拖曳移動、滾輪或雙指縮放、方向鍵或 WASD 平移、＋－縮放、0 看整個小鎮"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {size && (
        <svg width={size.width} height={size.height} className="block">
          <g
            style={{
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              transformOrigin: '0 0',
              transition: animating ? `transform ${FOCUS_MS}ms ease` : undefined,
            }}
          >
            <g pointerEvents="none"><WorldBackground town={town} activeSections={activeSections} /></g>
            {districts.map((d) => {
              const active = d.scene.id === activeSceneId;
              return (
                <DistrictLayer
                  key={d.scene.id}
                  district={d}
                  idle={!visible || !intersects(districtBounds(d), visible)}
                  locked={lockedSceneIds.has(d.scene.id)}
                  unlockHint={unlockHints.get(d.scene.id) ?? null}
                  found={active ? found : EMPTY}
                  hideUnfound={active && hideUnfound}
                  flashId={active ? flashId : null}
                  hintZoneKey={active ? hintZoneKey : null}
                />
              );
            })}
            {ripples.map((r) => (
              <circle key={r.id} cx={r.x} cy={r.y} r={36} fill="none" stroke="#ffffff" strokeWidth={6} className="click-ripple" pointerEvents="none" />
            ))}
          </g>
        </svg>
      )}

      <div data-ui="overlay" className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <ZoomButton label="放大" shortcut="滾輪上 / +" onClick={() => zoomBy(1.3)}><Plus size={18} /></ZoomButton>
        <ZoomButton label="縮小" shortcut="滾輪下 / −" onClick={() => zoomBy(1 / 1.3)}><Minus size={18} /></ZoomButton>
        <ZoomButton label="看整個小鎮" shortcut="0" onClick={showWholeTown}><Maximize size={18} /></ZoomButton>
      </div>

      <TownStrip town={town} activeSceneId={activeSceneId} lockedSceneIds={lockedSceneIds} hintZoneKey={hintZoneKey} onDistrict={onDistrict} onJumpTo={jumpTo} />
      {size && <TownMinimap town={town} view={view} size={size} activeSceneId={activeSceneId} lockedSceneIds={lockedSceneIds} onJumpTo={jumpTo} />}
      {children}
    </div>
  );
}

/** 焦點在輸入框、下拉選單或單選 / 分頁群組時，按鍵歸它們（例如語言切換的方向鍵） */
function isKeyOwnedByTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.closest('[role="radiogroup"],[role="tablist"],[role="listbox"],[role="menu"],[role="slider"]') !== null;
}

function ZoomButton({ label, shortcut, onClick, children }: { label: string; shortcut: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={`${label}（${shortcut}）`} onClick={onClick}
      className="grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-md ring-1 ring-black/5 hover:bg-white">
      {children}
    </button>
  );
}
