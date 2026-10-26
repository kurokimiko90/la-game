// 一個場景物件：外層 <g> 負責傾斜與鏡像，巢狀 <svg> 的內層 <g> 負責動態（避開巢狀 svg 套 CSS transform 的相容問題）。
// body 是建置時白名單清洗過的純幾何 SVG（scripts/lib/svg-sanitize.mjs），點擊範圍 = 物件形狀。
// 複本（重複擺放）用 <use> 指向原物件的圖，不再複製一份 SVG 節點；data-copy-of 讓點擊對回原物件。
// 腳下的接地影（ITEM_SHADOW_ID 的放射漸層）讓物件站在地上而不是貼在地圖上；.item-pop 是點擊時 Q 彈的那一層。
import type { CSSProperties } from 'react';
import { itemTransform } from '@/lib/geometry';
import type { ItemCopy, SceneItem } from '@/lib/types';

export const ITEM_SHADOW_ID = 'item-contact-shadow';

const artId = (itemId: string) => `art-${itemId}`;

/** 接地影：中心深、邊緣淡的扁橢圓，壓在物件底邊 */
export const itemShadowDefs = (
  <defs>
    <radialGradient id={ITEM_SHADOW_ID}>
      <stop offset="0" stopColor="#3e2723" stopOpacity={0.4} />
      <stop offset="0.6" stopColor="#3e2723" stopOpacity={0.18} />
      <stop offset="1" stopColor="#3e2723" stopOpacity={0} />
    </radialGradient>
  </defs>
);

function ContactShadow({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  // 光從左上來：影子略偏右
  return <ellipse cx={x + w * 0.54} cy={y + h * 0.985} rx={w * 0.46} ry={Math.max(w * 0.1, 5)} fill={`url(#${ITEM_SHADOW_ID})`} pointerEvents="none" />;
}

interface SceneItemNodeProps {
  item: SceneItem;
  copy?: ItemCopy | null;
  className?: string;
  /** 記憶挑戰隱形的物件不畫影子（影子會洩漏位置） */
  shadow?: boolean;
}

export function SceneItemNode({ item, copy = null, className, shadow = true }: SceneItemNodeProps) {
  if (copy) {
    return (
      <g transform={itemTransform(copy)}>
        {shadow && <ContactShadow {...copy} />}
        <svg data-copy-of={item.id} x={copy.x} y={copy.y} width={copy.w} height={copy.h} viewBox={item.viewBox.join(' ')} overflow="visible" className={className}>
          <g className="item-pop"><use href={`#${artId(item.id)}`} /></g>
        </svg>
      </g>
    );
  }
  const m = item.motion;
  const motionStyle = m ? ({ '--dur': `${m.dur}s`, '--delay': `${m.delay}s`, '--amp': m.amp } as CSSProperties) : undefined;
  return (
    <g transform={itemTransform(item)}>
      {item.float ? (
        // 飄在空中的東西：地上的影子
        shadow && <ellipse cx={item.x + item.w / 2} cy={item.y + item.h + item.float} rx={item.w * 0.35} ry={item.w * 0.1} fill={`url(#${ITEM_SHADOW_ID})`} pointerEvents="none" />
      ) : shadow && <ContactShadow {...item} />}
      <svg
        data-item-id={item.id}
        x={item.x}
        y={item.y}
        width={item.w}
        height={item.h}
        viewBox={item.viewBox.join(' ')}
        overflow="visible"
        className={className}
      >
        <g className="item-pop">
          <g id={artId(item.id)} className={m ? `motion motion--${m.type}` : undefined} style={motionStyle} dangerouslySetInnerHTML={{ __html: item.body }} />
        </g>
      </svg>
    </g>
  );
}
