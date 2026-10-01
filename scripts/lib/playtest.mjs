// 自動試玩（不用 LLM）：用遊戲本身的點擊判定（src/lib/geometry.ts 的 itemAtPoint：範圍重疊時小的優先）
// 和預設縮放，算每個物件「點得到的比例」與「手機上的大小」，標出玩家找到了也點不到、或小到看不清的物件。
import { defaultScale, itemAtPoint } from '../../src/lib/geometry.ts';

/** 手機直向視窗（iPhone 14 / 15 一類） */
export const PHONE = { width: 390, height: 844 };
/** 點得到的部分低於這個比例就標記 */
export const MIN_CLICKABLE = 0.3;
/** 手機預設縮放下，物件短邊低於這麼多 px 就標記（觸控目標的下限） */
export const MIN_PHONE_PX = 24;
const GRID = 9;

/** 物件範圍內取 GRID×GRID 個點，遊戲會判定點到它的比例 */
export function clickableShare(item, items) {
  let hit = 0;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const p = { x: item.x + ((i + 0.5) / GRID) * item.w, y: item.y + ((j + 0.5) / GRID) * item.h };
      if (itemAtPoint(items, p, 0) === item) hit += 1;
    }
  }
  return hit / (GRID * GRID);
}

/**
 * @param {{ items: Array<{ id: string, x: number, y: number, w: number, h: number }> }} scene src/data/scenes/<id>.json
 * @returns {{ flagged: Array<{ id: string, flag: string }>, stats: { items: number, minClickable: number, minPhonePx: number } }}
 */
export function playtestScene({ items }) {
  const scale = defaultScale(PHONE);
  const flagged = [];
  let minClickable = 1;
  let minPhonePx = Infinity;
  for (const it of items) {
    const share = clickableShare(it, items);
    const px = Math.min(it.w, it.h) * scale;
    minClickable = Math.min(minClickable, share);
    minPhonePx = Math.min(minPhonePx, px);
    if (share === 0) flagged.push({ id: it.id, flag: '點不到（被其他物件完全蓋住）' });
    else if (share < MIN_CLICKABLE) flagged.push({ id: it.id, flag: `大部分被擋住（只點得到 ${Math.round(share * 100)}%）` });
    else if (px < MIN_PHONE_PX) flagged.push({ id: it.id, flag: `手機上太小（約 ${Math.round(px)}px）` });
  }
  return { flagged, stats: { items: items.length, minClickable: Number(minClickable.toFixed(2)), minPhonePx: Math.round(minPhonePx) } };
}
