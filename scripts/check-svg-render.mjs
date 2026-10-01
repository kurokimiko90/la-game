#!/usr/bin/env node
// 用本機 Chrome 把物件 SVG 畫到 canvas，量不透明面積和顏色數，標出畫壞的（空白、剪影、渲染失敗）。
// 判斷規則在 scripts/lib/svg-render-check.mjs；auto-expand 整合後會叫它，結果寫進待人工審清單。
//
//   node scripts/check-svg-render.mjs <scene> [itemId ...]     # 印 JSON：[{ id, coverage, colors, error, flag }]
//   node scripts/check-svg-render.mjs <scene> --out=<file>     # 寫進檔案（auto-expand 用，stderr 的警告不會混進 JSON）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { flagRender } from './lib/svg-render-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 160;

/** 在瀏覽器裡跑：畫一張 SVG，回傳不透明比例和主要顏色數（4-bit 量化、占不透明像素 1% 以上才算） */
async function measure({ svg, size }) {
  try {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
    ctx.drawImage(img, 0, 0, (img.naturalWidth || size) * scale, (img.naturalHeight || size) * scale);
    URL.revokeObjectURL(url);
    const { data } = ctx.getImageData(0, 0, size, size);
    const counts = new Map();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 24) continue;
      opaque += 1;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const colors = [...counts.values()].filter((n) => n >= opaque * 0.01).length;
    return { coverage: opaque / (size * size), colors, error: null };
  } catch (e) {
    return { coverage: 0, colors: 0, error: String(e?.message ?? e).slice(0, 80) };
  }
}

/** 清洗後的 SVG 是給內嵌用的，沒有 xmlns；當成圖片載入要補上，尺寸照 viewBox */
export function asImage(svg) {
  const [, , w, h] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100').trim().split(/[\s,]+/).map(Number);
  return svg.replace(/^<svg\b(?![^>]*xmlns=)/, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`);
}

export async function checkScene(scene, ids = []) {
  const dir = path.join(ROOT, 'public', 'svg', scene);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).filter((f) => !ids.length || ids.includes(path.basename(f, '.svg'))).sort();
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const results = [];
    for (const f of files) {
      const r = await page.evaluate(measure, { svg: asImage(fs.readFileSync(path.join(dir, f), 'utf8')), size: SIZE });
      results.push({ id: path.basename(f, '.svg'), ...r, coverage: Number(r.coverage.toFixed(3)), flag: flagRender(r) });
    }
    return results;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = args.find((a) => a.startsWith('--out='))?.slice('--out='.length);
  const [scene, ...ids] = args.filter((a) => !a.startsWith('--'));
  if (!scene) {
    console.error('用法：node scripts/check-svg-render.mjs <scene> [itemId ...]');
    process.exit(1);
  }
  const json = JSON.stringify(await checkScene(scene, ids), null, 2);
  if (out) fs.writeFileSync(out, `${json}\n`);
  else console.log(json);
}
