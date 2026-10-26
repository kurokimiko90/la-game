// 物件掛在哪裡：擺在 wall-* 地帶的是掛在牆上（時鐘、黑板），sky-* 的是在空中（直升機）。
// 這兩種不在地上畫接地影（src/components/scene/SceneItemNode.tsx）。

/** @param {string | undefined} band @returns {'wall' | 'air' | undefined} */
export function mountOf(band) {
  if (!band) return undefined;
  if (band.startsWith('wall-')) return 'wall';
  if (band.startsWith('sky-')) return 'air';
  return undefined;
}
