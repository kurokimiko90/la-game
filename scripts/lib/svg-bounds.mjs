// 物件 SVG 內容的上緣：很多物件圖上方有留白（例如長桌的桌面在 viewBox 高度的 21% 處），
// 情境擺放要把東西放在「主體上面」時，要知道圖實際從哪裡開始，不然東西會浮在空中。
// 只看清洗過的白名單形狀（rect / circle / ellipse / line / polygon / polyline / 絕對座標的 path），
// 有 transform 或相對座標 path 的元素略過（估不準寧可不算）。純函式。

const ELEMENT_RE = /<(rect|circle|ellipse|line|polygon|polyline|path)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g;
const nums = (s) => (String(s).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);

function attrs(text) {
  const out = {};
  for (const [, k, v] of text.matchAll(ATTR_RE)) out[k] = v;
  return out;
}

// path 的 y 座標（只處理大寫的絕對座標指令）
function pathYs(d) {
  if (/[a-y]/.test(d.replace(/e-?\d/gi, ''))) return [];
  const ys = [];
  for (const [, cmd, args] of d.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/g)) {
    const n = nums(args);
    if (cmd === 'V') ys.push(...n);
    else if (cmd === 'A') for (let i = 6; i < n.length; i += 7) ys.push(n[i]);
    else if (cmd !== 'H' && cmd !== 'Z') for (let i = 1; i < n.length; i += 2) ys.push(n[i]);
  }
  return ys;
}

function topOf(tag, a) {
  const n = (k) => Number(a[k] ?? 0);
  switch (tag) {
    case 'rect': return [n('y')];
    case 'circle': return [n('cy') - n('r')];
    case 'ellipse': return [n('cy') - n('ry')];
    case 'line': return [n('y1'), n('y2')];
    case 'polygon':
    case 'polyline': return nums(a.points).filter((_, i) => i % 2 === 1);
    case 'path': return pathYs(a.d ?? '');
    default: return [];
  }
}

/**
 * @param {string} body 清洗過的 SVG 內容
 * @param {number[]} viewBox [x, y, w, h]
 * @returns {number} 內容上緣在 viewBox 高度的比例（0 = 最上面）；估不出來回傳 0
 */
export function contentTop(body, viewBox) {
  const [, vy, , vh] = viewBox;
  let top = Infinity;
  for (const [, tag, rest] of String(body).matchAll(ELEMENT_RE)) {
    const a = attrs(rest);
    if (a.transform || a.opacity === '0') continue;
    for (const y of topOf(tag, a)) if (Number.isFinite(y)) top = Math.min(top, y);
  }
  if (!Number.isFinite(top)) return 0;
  return Math.min(1, Math.max(0, (top - vy) / vh));
}
