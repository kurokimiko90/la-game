#!/usr/bin/env node
// 單一街區高解析預覽（看擺放細節用；整張地圖的縮圖太小看不清楚）
//   npm run dev
//   node scripts/preview-district.mjs <scene> [<scene> …] [--out=dir] [--width=2400]
// 解鎖全部 → 自由探索 → 直接把畫布 transform 設成剛好框住這個街區。動畫關掉，截到的是物件原位置。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.PREVIEW_URL || 'http://localhost:3220';
const PAD = 30;

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const scenes = args.filter((a) => !a.startsWith('--'));
const outDir = path.resolve(opt('out', path.join(ROOT, 'docs', 'scene-preview')));
const width = Number(opt('width', 2400));

function bounds(sceneId) {
  const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'scenes', `${sceneId}.json`), 'utf8'));
  const zs = scene.zones;
  return { x0: Math.min(...zs.map((z) => z.x0)) - PAD, y0: Math.min(...zs.map((z) => z.y0)) - PAD, x1: Math.max(...zs.map((z) => z.x1)) + PAD, y1: Math.max(...zs.map((z) => z.y1)) + PAD };
}

async function main() {
  if (!scenes.length) throw new Error('要指定場景 id');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const first = bounds(scenes[0]);
    const height = Math.round((width * (first.y1 - first.y0)) / (first.x1 - first.x0));
    const page = await browser.newPage({ viewport: { width, height: height + 120 }, reducedMotion: 'reduce' });
    await page.goto(`${BASE}/`);
    await page.getByLabel('測試用：解鎖全部場景與關卡').check();
    for (const sceneId of scenes) {
      const b = bounds(sceneId);
      await page.goto(`${BASE}/scene/${sceneId}`);
      await page.getByRole('button', { name: /自由探索/ }).click();
      await page.addStyleTag({ content: '[data-ui="overlay"]{display:none!important}' });
      await page.waitForTimeout(500);
      const canvas = page.locator('[aria-label^="小鎮"]');
      const box = await canvas.boundingBox();
      const s = Math.min(box.width / (b.x1 - b.x0), box.height / (b.y1 - b.y0));
      await canvas.evaluate((el, { tx, ty, s }) => {
        const t = [...el.querySelectorAll('*')].find((n) => n.style?.transform?.includes('scale('));
        t.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }, { tx: -b.x0 * s, ty: -b.y0 * s, s });
      await page.waitForTimeout(700);
      const out = path.join(outDir, `${sceneId}.png`);
      await page.screenshot({ path: out, clip: { x: box.x, y: box.y, width: Math.min(box.width, (b.x1 - b.x0) * s), height: Math.min(box.height, (b.y1 - b.y0) * s) } });
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
