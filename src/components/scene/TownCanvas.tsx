'use client';

// 小鎮畫布：一張 2D 地圖，上下左右拖曳平移、雙指 / ⌘＋捲動 / 按鈕縮放（最小可以看到整個小鎮）。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, Maximize } from 'lucide-react';
import { DistrictLayer } from './DistrictLayer';
import { TownStrip } from './TownStrip';
import { TownMinimap } from './TownMinimap';
import { WorldBackground, worldSections } from './WorldBackground';
import { clampView, centerOn, defaultScale, fitScale, toScene, zoomAt, type View, type Size } from '@/lib/geometry';
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

  // 觸控板雙指 / 滾輪：平移（上下左右）；ctrl/⌘ + 滾輪（含觸控板捏合）= 縮放。需要 passive:false 才能擋掉頁面捲動
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), localPoint(e));
      else applyView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyView, zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
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

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g.mode === 'pan') {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      applyView({ ...g.startView, tx: g.startView.tx + dx, ty: g.startView.ty + dy });
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      const zoomed = zoomAt(g.startView, g.start, g.startView.scale * (dist(a, b) / g.startDist));
      applyView({ ...zoomed, tx: zoomed.tx + m.x - g.start.x, ty: zoomed.ty + m.y - g.start.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
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
    const id = Date.now();
    setRipples((r) => [...r, { ...sp, id }]);
    window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600);
    onSceneClick({ itemId: target?.getAttribute('data-item-id') ?? null, sceneId, locked, scenePoint: sp, localPoint: lp });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = viewRef.current;
    const step = 160;
    const moves: Record<string, Partial<View>> = {
      ArrowLeft: { tx: v.tx + step }, ArrowRight: { tx: v.tx - step }, ArrowUp: { ty: v.ty + step }, ArrowDown: { ty: v.ty - step },
    };
    if (moves[e.key]) { e.preventDefault(); applyView({ ...v, ...moves[e.key] }); }
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    if (e.key === '-') zoomBy(0.8);
  };

  const showWholeTown = useCallback(() => {
    const s = sizeRef.current;
    if (s) applyView({ scale: fitScale(s, townSize), tx: 0, ty: 0 });
  }, [applyView, townSize]);

  const found = useMemo(() => new Set(foundIds), [foundIds]);
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
      className="relative h-full w-full overflow-hidden touch-none select-none outline-none bg-[#cfe3b4]"
      tabIndex={0}
      aria-label="小鎮：拖曳移動、雙指或 ⌘＋捲動縮放、方向鍵平移"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
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
        <ZoomButton label="放大" onClick={() => zoomBy(1.3)}><Plus size={18} /></ZoomButton>
        <ZoomButton label="縮小" onClick={() => zoomBy(1 / 1.3)}><Minus size={18} /></ZoomButton>
        <ZoomButton label="看整個小鎮" onClick={showWholeTown}><Maximize size={18} /></ZoomButton>
      </div>

      <TownStrip town={town} activeSceneId={activeSceneId} lockedSceneIds={lockedSceneIds} hintZoneKey={hintZoneKey} onDistrict={onDistrict} onJumpTo={jumpTo} />
      {size && <TownMinimap town={town} view={view} size={size} activeSceneId={activeSceneId} lockedSceneIds={lockedSceneIds} onJumpTo={jumpTo} />}
      {children}
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-md ring-1 ring-black/5 hover:bg-white">
      {children}
    </button>
  );
}
