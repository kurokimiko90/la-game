// 接地影的判斷：疊在別的物件上的東西（柱子上的鐘、桌上的花瓶擺在另一個物件上）不畫地上的影子，否則影子會飄在半空中。
// 規則：自己的底邊中心落在另一個物件外框的「中間高度」（不靠近對方底邊），而且水平在對方範圍內。

export interface ShadowBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 對方底邊往上這個比例內算「並排站在地上」，不算疊放 */
const GROUND_BAND = 0.15;

export function restingOnOthers(boxes: readonly ShadowBox[]): Set<string> {
  const out = new Set<string>();
  for (const a of boxes) {
    const cx = a.x + a.w / 2;
    const bottom = a.y + a.h;
    const onTop = boxes.some((b) => b !== a
      && cx > b.x && cx < b.x + b.w
      && bottom > b.y && bottom < b.y + b.h * (1 - GROUND_BAND));
    if (onTop) out.add(a.key);
  }
  return out;
}
