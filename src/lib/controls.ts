// 地圖的滾輪與鍵盤操作 → 平移 / 縮放意圖（純函式，畫布只負責套用）。

export type ViewIntent =
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'fit' }
  | { kind: 'none' };

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 = 像素、1 = 行、2 = 頁（WheelEvent.deltaMode） */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** 方向鍵一次平移的畫面像素 */
export const KEY_PAN_STEP = 160;
const KEY_ZOOM = 1.25;

const LINE_PX = 16;
const PAGE_PX = 400;
/** 一般滾輪：每像素的縮放量；一格（100px）約 20% */
const WHEEL_ZOOM_RATE = 0.002;
const WHEEL_MAX_PX = 100;
/** ctrl / ⌘ + 滾輪（觸控板捏合送來的就是 ctrl + 小幅度 deltaY）：較靈敏，但一次也不超過一格 */
const PINCH_ZOOM_RATE = 0.01;
const PINCH_MAX_PX = 20;

const clamp = (v: number, max: number) => Math.min(max, Math.max(-max, v));

/** 滾輪：上下 = 以游標為中心縮放；左右（觸控板橫滑）或 Shift + 滾輪 = 橫向平移 */
export function wheelIntent(e: WheelLike): ViewIntent {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) {
    return dy === 0 ? { kind: 'none' } : { kind: 'zoom', factor: Math.exp(-clamp(dy, PINCH_MAX_PX) * PINCH_ZOOM_RATE) };
  }
  if (e.shiftKey) {
    const h = dx !== 0 ? dx : dy;
    return h === 0 ? { kind: 'none' } : { kind: 'pan', dx: h, dy: 0 };
  }
  if (Math.abs(dx) > Math.abs(dy)) return { kind: 'pan', dx, dy: 0 };
  if (dy === 0) return { kind: 'none' };
  return { kind: 'zoom', factor: Math.exp(-clamp(dy, WHEEL_MAX_PX) * WHEEL_ZOOM_RATE) };
}

const PAN_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
};

/** 鍵盤：+ / = 放大、- 縮小、0 看整個小鎮、方向鍵 / WASD 平移（dx、dy 是視野要移動的方向） */
export function keyIntent(key: string): ViewIntent {
  if (key === '+' || key === '=') return { kind: 'zoom', factor: KEY_ZOOM };
  if (key === '-' || key === '_') return { kind: 'zoom', factor: 1 / KEY_ZOOM };
  if (key === '0') return { kind: 'fit' };
  const dir = PAN_KEYS[key.toLowerCase()];
  return dir ? { kind: 'pan', dx: dir[0] * KEY_PAN_STEP, dy: dir[1] * KEY_PAN_STEP } : { kind: 'none' };
}

/**
 * 滑鼠左鍵的按下 / 放開，從 buttons 判斷（bit 0 = 左鍵）。
 * 有些滑鼠或驅動會讓 Chrome 以為右鍵一直按著；依 Pointer Events 規格，這時按放左鍵只有 pointermove（和弦按鍵），
 * 不會有 pointerdown / pointerup，所以拖曳和點擊要靠 buttons 的變化判斷。
 */
export function primaryButtonChange(buttons: number, tracking: boolean): 'press' | 'release' | null {
  const primary = (buttons & 1) === 1;
  if (primary && !tracking) return 'press';
  if (!primary && tracking) return 'release';
  return null;
}
