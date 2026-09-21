// 平移縮放的座標換算與限制，以及記憶挑戰的「點在原位置附近」判定。
import type { Point, SceneItem } from './types';

export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 預設縮放時，畫面高度看到的地圖單位（物件大小和以前單一場景時差不多） */
export const VIEW_HEIGHT = 900;
/** 最多放大到預設的幾倍 */
export const MAX_ZOOM = 3;

export function defaultScale(container: Size): number {
  return container.height / VIEW_HEIGHT;
}

/** 整張地圖剛好放進畫面的縮放（「看整個小鎮」） */
export function fitScale(container: Size, world: Size): number {
  return Math.min(container.width / world.width, container.height / world.height);
}

// 內容比容器小就置中，否則不讓邊緣露出來
function clampAxis(t: number, containerLen: number, contentLen: number): number {
  if (contentLen <= containerLen) return (containerLen - contentLen) / 2;
  return Math.min(0, Math.max(containerLen - contentLen, t));
}

/** 縮放限制在「看見整張地圖」到「預設的 MAX_ZOOM 倍」；上下左右都不超出地圖 */
export function clampView(view: View, container: Size, world: Size): View {
  const base = defaultScale(container);
  const lo = Math.min(fitScale(container, world), base);
  const scale = Math.min(Math.max(view.scale, lo), base * MAX_ZOOM);
  return {
    scale,
    tx: clampAxis(view.tx, container.width, world.width * scale),
    ty: clampAxis(view.ty, container.height, world.height * scale),
  };
}

/** 以螢幕上的 anchor 為中心縮放（滾輪、雙指） */
export function zoomAt(view: View, anchor: Point, nextScale: number): View {
  const k = nextScale / view.scale;
  return { scale: nextScale, tx: anchor.x - (anchor.x - view.tx) * k, ty: anchor.y - (anchor.y - view.ty) * k };
}

export function toScene(view: View, p: Point): Point {
  return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale };
}

/** 讓場景上的某點置中 */
export function centerOn(view: View, target: Point, container: Size, scene: Size): View {
  return clampView({ scale: view.scale, tx: container.width / 2 - target.x * view.scale, ty: container.height / 2 - target.y * view.scale }, container, scene);
}

/** 記憶挑戰的容許誤差：物品外框向外擴張（至少 40 單位，小物件才點得到） */
export function isNearItem(item: Pick<SceneItem, 'x' | 'y' | 'w' | 'h'>, p: Point, minPad = 40): boolean {
  const pad = Math.max(minPad, Math.min(item.w, item.h) * 0.25);
  return p.x >= item.x - pad && p.x <= item.x + item.w + pad && p.y >= item.y - pad && p.y <= item.y + item.h + pad;
}

/** 物件的傾斜與鏡像：以底部中心為支點（給外層 <g> 的 transform 屬性）；正立不鏡像時回傳 undefined */
export function itemTransform(item: Pick<SceneItem, 'x' | 'y' | 'w' | 'h' | 'rotate' | 'flip'>): string | undefined {
  if (!item.rotate && !item.flip) return undefined;
  const cx = item.x + item.w / 2;
  const by = item.y + item.h;
  return `translate(${cx} ${by}) rotate(${item.rotate}) scale(${item.flip ? -1 : 1} 1) translate(${-cx} ${-by})`;
}
