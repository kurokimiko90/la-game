#!/usr/bin/env node
// 用真實 Chrome 渲染 public/svg/<scene>/*.svg 對照表 → docs/svg-preview/<scene>.png
//
//   node scripts/preview-sheet.mjs                 # 四個場景全部
//   node scripts/preview-sheet.mjs park street     # 指定場景
//
// 不要用 ImageMagick 看成品：它的 SVG 引擎會漏畫描邊，實測把正常的圖判成「壞掉」。
// 用本機 Google Chrome 渲染（playwright channel: 'chrome'，不用另外下載瀏覽器）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_DIR = path.join(ROOT, 'public', 'svg');
const OUT_DIR = path.join(ROOT, 'docs', 'svg-preview');

const STYLE = `body{margin:8px;font:13px sans-serif;display:grid;grid-template-columns:repeat(7,150px);
grid-auto-rows:min-content;align-content:start;gap:8px;background:#f5f5f5}
figure{margin:0;background:#b0bec5}div{height:130px;display:flex;align-items:center;justify-content:center;padding:6px}
div svg{max-width:100%;max-height:100%;width:auto;height:118px}figcaption{background:#fff;text-align:center;padding:3px}`;

function sceneHtml(scene) {
  const dir = path.join(SVG_DIR, scene);
  const cells = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort().map((f) =>
    `<figure><div>${fs.readFileSync(path.join(dir, f), 'utf8')}</div><figcaption>${path.basename(f, '.svg')}</figcaption></figure>`);
  return { html: `<style>${STYLE}</style>${cells.join('')}`, count: cells.length };
}

async function main() {
  const scenes = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(SVG_DIR).filter((d) => fs.statSync(path.join(SVG_DIR, d)).isDirectory());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 200 } });
    for (const scene of scenes) {
      const { html, count } = sceneHtml(scene);
      await page.setContent(html);
      const out = path.join(OUT_DIR, `${scene}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log(`${scene}: ${count} → ${path.relative(ROOT, out)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`失敗：${e.message}`);
  process.exit(1);
});
