// 物件 SVG 渲染後的機械檢查（scripts/check-svg-render.mjs 用 Chrome 量出 coverage / colors）。
// 抓得到「畫壞了」：空白、只剩剪影、渲染失敗；抓不到「畫得不像」，那要人看或交給能看圖的 LLM。

/** 不透明像素占畫布的比例低於這個就當作幾乎空白 */
export const MIN_COVERAGE = 0.03;

/**
 * @param {{ coverage: number, colors: number, error: string | null }} r
 * @returns {string | null} 問題描述；沒問題回 null
 */
export function flagRender({ coverage, colors, error }) {
  if (error) return `渲染失敗：${error}`;
  if (coverage < MIN_COVERAGE) return `幾乎空白（只占 ${(coverage * 100).toFixed(1)}%）`;
  if (colors <= 1) return `只有 ${colors} 種顏色（像剪影）`;
  return null;
}
