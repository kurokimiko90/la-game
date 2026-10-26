// 點到物件時的 Q 彈（先壓扁、再拉長、回彈），像動物森友會撿東西那一下。
// 用 Web Animations 直接動 .item-pop 那一層：不經過 React 重畫，也不會和物件本身的晃動動畫（.motion）搶 transform。

const POP_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.14, 0.84)', offset: 0.18 },
  { transform: 'scale(0.92, 1.12)', offset: 0.42 },
  { transform: 'scale(1.04, 0.97)', offset: 0.7 },
  { transform: 'scale(1, 1)' },
];
const POP_MS = 420;

export function popItem(target: Element | null): void {
  const layer = target?.querySelector<SVGGElement>(':scope > .item-pop');
  if (!layer || typeof layer.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  layer.animate(POP_KEYFRAMES, { duration: POP_MS, easing: 'ease-out' });
}
