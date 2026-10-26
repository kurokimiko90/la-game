// 一個場景物件：外層 <g> 負責傾斜與鏡像，巢狀 <svg> 的內層 <g> 負責動態（避開巢狀 svg 套 CSS transform 的相容問題）。
// body 是建置時白名單清洗過的純幾何 SVG（scripts/lib/svg-sanitize.mjs），點擊範圍 = 物件形狀。
import type { CSSProperties } from 'react';
import { itemTransform } from '@/lib/geometry';
import type { SceneItem } from '@/lib/types';

/** 物品的一次性反應：找到（彈一下）、跟讀念對（歡呼跳）、差一點（搖一搖） */
export type ReactionKind = 'pop' | 'cheer' | 'wiggle';

export interface ItemReaction {
  itemId: string;
  sceneId: string;
  kind: ReactionKind;
  key: number;
}

export function SceneItemNode({ item, className, reaction }: { item: SceneItem; className?: string; reaction?: ItemReaction | null }) {
  const m = item.motion;
  const motionStyle = m ? ({ '--dur': `${m.dur}s`, '--delay': `${m.delay}s`, '--amp': m.amp } as CSSProperties) : undefined;
  return (
    <g transform={itemTransform(item)}>
      {item.float ? (
        // 飄在空中的東西：地上的影子
        <ellipse cx={item.x + item.w / 2} cy={item.y + item.h + item.float} rx={item.w * 0.35} ry={item.w * 0.1} fill="#263238" opacity={0.15} pointerEvents="none" />
      ) : null}
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
        {/* key 換了就重新掛載，動畫才會重播 */}
        <g key={reaction?.key ?? 'rest'} className={reaction ? `item-react item-react--${reaction.kind}` : undefined}>
          <g className={m ? `motion motion--${m.type}` : undefined} style={motionStyle} dangerouslySetInnerHTML={{ __html: item.body }} />
        </g>
      </svg>
    </g>
  );
}
