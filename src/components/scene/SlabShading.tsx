// 家具的立體感（檯面、櫃子共用）：檯面後緣的亮邊、前緣的亮唇、正面下半的暗部、落地處往前的投影。
// 只疊半透明的白 / 深棕，不改各家具自己的顏色。光從左上方來（和物件的接地影一致）。

const SHADE = '#3e2723';

interface SlabShadingProps {
  x0: number;
  x1: number;
  /** 檯面頂的上緣 y */
  top: number;
  /** 檯面前緣 y（正面的上緣） */
  level: number;
  /** 正面的下緣 y */
  bottom: number;
  /** 落地的 y（有腳的桌子比 bottom 低）；投影畫在這裡 */
  ground?: number;
  /** 疊在一起的多層檯面只讓最前面那層投影，不然影子會疊深 */
  castShadow?: boolean;
}

export function SlabShading({ x0, x1, top, level, bottom, ground = bottom, castShadow = true }: SlabShadingProps) {
  const w = x1 - x0;
  const faceH = bottom - level;
  return (
    <g pointerEvents="none">
      {castShadow && <rect x={x0 + 4} y={ground - 4} width={w + 4} height={26} rx={12} fill="url(#city-shade-down)" />}
      <rect x={x0 + 3} y={top + 3} width={w - 6} height={5} fill="#ffffff" opacity={0.35} />
      <rect x={x0 + 3} y={level - 7} width={w - 6} height={6} fill="#ffffff" opacity={0.28} />
      {faceH > 12 && <rect x={x0 + 2} y={level + faceH * 0.55} width={w - 4} height={faceH * 0.45 - 2} fill={SHADE} opacity={0.1} />}
    </g>
  );
}
