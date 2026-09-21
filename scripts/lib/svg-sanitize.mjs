// 物件 SVG 白名單清洗：遊戲會把 SVG 內文直接內嵌進場景（點擊範圍 = 物件形狀），
// 所以只放行純幾何標籤與屬性，其餘一律擋下（fail fast，不默默丟掉）。

const ALLOWED_TAGS = new Set(['g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
const ALLOWED_ATTRS = new Set([
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'd',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'fill-rule',
]);
const DANGEROUS_VALUE = /url\s*\(|javascript:|expression\s*\(|[<>]/i;

const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
const ATTR_RE = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(raw, where) {
  const attrs = [];
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? '';
    if (DANGEROUS_VALUE.test(value)) throw new Error(`${where}: 屬性 ${name} 值不安全`);
    attrs.push([name, value]);
  }
  return attrs;
}

function parseViewBox(value, where) {
  const nums = String(value || '').trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) {
    throw new Error(`${where}: viewBox 無效（${value}）`);
  }
  return nums;
}

/**
 * @param {string} text 完整 <svg>…</svg>
 * @param {string} where 錯誤訊息用的來源標記
 * @returns {{ viewBox: number[], body: string }}
 */
export function sanitizeSvg(text, where = 'svg') {
  const src = String(text || '').trim();
  let viewBox = null;
  let depth = 0;
  let sawRoot = false;
  const out = [];
  let last = 0;

  for (const m of src.matchAll(TAG_RE)) {
    const between = src.slice(last, m.index);
    if (between.trim()) throw new Error(`${where}: 不允許文字內容（${between.trim().slice(0, 20)}）`);
    last = m.index + m[0].length;

    const [, closing, rawName, rawAttrs, selfClosing] = m;
    const name = rawName.toLowerCase();

    if (name === 'svg') {
      if (closing) { depth--; continue; }
      if (sawRoot) throw new Error(`${where}: 不允許巢狀 <svg>`);
      sawRoot = true;
      depth++;
      const vb = parseAttrs(rawAttrs, where).find(([k]) => k === 'viewbox');
      viewBox = parseViewBox(vb && vb[1], where);
      continue;
    }
    if (!sawRoot) throw new Error(`${where}: 第一個標籤必須是 <svg>`);
    if (!ALLOWED_TAGS.has(name)) throw new Error(`${where}: 不允許的標籤 <${name}>`);
    if (closing) { out.push(`</${name}>`); continue; }

    const attrs = parseAttrs(rawAttrs, where)
      .filter(([k]) => ALLOWED_ATTRS.has(k))
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    out.push(`<${name}${attrs ? ` ${attrs}` : ''}${selfClosing ? '/' : ''}>`);
  }
  if (src.slice(last).trim()) throw new Error(`${where}: 結尾有多餘內容`);
  if (!sawRoot || depth !== 0) throw new Error(`${where}: <svg> 未正確閉合`);
  if (!out.length) throw new Error(`${where}: 沒有任何圖形`);
  return { viewBox, body: out.join('') };
}
