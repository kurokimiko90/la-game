#!/usr/bin/env node
// 小鎮地圖預覽圖（背景 + 檯面 + 物件，和遊戲裡一模一樣）
//   → docs/scene-preview/town.png（整張地圖）與 docs/scene-preview/<scene>.png（各街區裁切）
// 擺放調整完先看這些圖再鎖定（docs/scene-standard.md §5）。
//
//   npm run dev                                   # 先開 dev server
//   npm run content:scene-preview
//   PREVIEW_URL=http://localhost:3210 npm run content:scene-preview
//
// 用本機 Chrome 渲染（理由同 preview-sheet.mjs）；動畫關掉，截到的是物件的原位置。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'scene-preview');
const BASE = process.env.PREVIEW_URL || 'http://localhost:3000';
const PAD = 40;

function districtBounds(scene) {
  const zs = scene.zones;
  return { x0: Math.min(...zs.map((z) => z.x0)), y0: Math.min(...zs.map((z) => z.y0)), x1: Math.max(...zs.map((z) => z.x1)), y1: Math.max(...zs.map((z) => z.y1)) };
}

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'scene-config.json'), 'utf8'));
  const { width: W, height: H } = config.world;
  try {
    await fetch(BASE);
  } catch {
    throw new Error(`連不到 ${BASE}，先跑 npm run dev（或設定 PREVIEW_URL）`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    // 視窗接近地圖大小，「看整個小鎮」時縮放接近 1:1
    const page = await browser.newPage({ viewport: { width: W, height: H + 110 }, reducedMotion: 'reduce' });
    await page.goto(`${BASE}/`);
    await page.getByLabel('測試用：解鎖全部場景與關卡').check();
    await page.goto(`${BASE}/scene/${config.order[0]}`);
    await page.getByRole('button', { name: /自由探索/ }).click();
    await page.getByRole('button', { name: '看整個小鎮' }).click();
    await page.addStyleTag({ content: '[data-ui="overlay"]{display:none!important}' });
    await page.waitForTimeout(600);
    const box = await page.locator('[aria-label^="小鎮"]').boundingBox();
    if (!box) throw new Error('找不到畫布');
    // 和 geometry.ts 的 fitScale / clampView 一致：縮到剛好放進畫面，置中
    const scale = Math.min(box.width / W, box.height / H);
    const ox = box.x + (box.width - W * scale) / 2;
    const oy = box.y + (box.height - H * scale) / 2;
    const town = path.join(OUT_DIR, 'town.png');
    await page.screenshot({ path: town, clip: { x: ox, y: oy, width: W * scale, height: H * scale } });
    console.log(`town → ${path.relative(ROOT, town)}`);

    for (const sceneId of config.order) {
      const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'scenes', `${sceneId}.json`), 'utf8'));
      const b = districtBounds(scene);
      const x0 = Math.max(0, b.x0 - PAD);
      const y0 = Math.max(0, b.y0 - PAD);
      const out = path.join(OUT_DIR, `${sceneId}.png`);
      await page.screenshot({
        path: out,
        clip: { x: ox + x0 * scale, y: oy + y0 * scale, width: (Math.min(W, b.x1 + PAD) - x0) * scale, height: (Math.min(H, b.y1 + PAD) - y0) * scale },
      });
      console.log(`${sceneId} → ${path.relative(ROOT, out)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`失敗：${e.message}`);
  process.exit(1);
});
