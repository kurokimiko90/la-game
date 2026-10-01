#!/usr/bin/env node
// 場景品質檢查：渲染檢查 + 自動試玩 + 看圖驗收，結果進待人工審清單（.auto-expand/review-queue.json）。
// auto-expand 整合完會叫它；也可以手動跑。看圖驗收要 miko-ws runtime 在跑（codex 附圖）。
//
//   node --no-warnings scripts/review-scene.mjs <scene>                # 全部（構圖審查要試玩伺服器在跑，沒跑就跳過）
//   node --no-warnings scripts/review-scene.mjs <scene> --no-vision    # 不叫 LLM（只做渲染檢查 + 自動試玩）
//   node --no-warnings scripts/review-scene.mjs <scene> --no-layout    # 不做構圖審查（auto-expand commit 前，伺服器還是舊版）
//   node --no-warnings scripts/review-scene.mjs <scene> --layout-only  # 只做構圖審查（reload-play 換上新版後）
//   REVIEW_URL=http://localhost:3220（預設）
//
// 詳細結果：.auto-expand/review/<scene>.json；對照表圖：.auto-expand/review/<scene>-<n>.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { asImage, checkScene } from './check-svg-render.mjs';
import { playtestScene } from './lib/playtest.mjs';
import { buildVisualPrompt, chunkItems, parseVisual } from './lib/visual-review.mjs';
import { buildLayoutPrompt, parseLayout } from './lib/layout-review.mjs';
import { codexText } from './lib/miko.mjs';
import { parsePlayStats, strugglingItems } from '../src/lib/playstats.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(ROOT, '.auto-expand');
const OUT_DIR = path.join(STATE_DIR, 'review');
const QUEUE = path.join(STATE_DIR, 'review-queue.json');
const PLAY_STATS = path.join(STATE_DIR, 'play-stats.json');
const BASE = process.env.REVIEW_URL || 'http://localhost:3220';
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** 物件清單（英文、中文、描述）：描述從 manifest 來（規劃或手寫的都在那裡） */
function sceneItems(sceneId) {
  const scene = readJson(path.join(ROOT, 'src', 'data', 'scenes', `${sceneId}.json`));
  const manifestFile = path.join(ROOT, 'content', 'svg-manifests', `${sceneId}.json`);
  const desc = new Map(fs.existsSync(manifestFile) ? readJson(manifestFile).elements.map((e) => [e.ref.itemId, e.desc]) : []);
  return {
    scene,
    items: scene.items.map((it) => ({ id: it.id, en: it.words.en, zh: it.words['zh-TW'], desc: desc.get(it.id) ?? '' })),
  };
}

const SHEET_STYLE = `body{margin:0;padding:8px;background:#eceff1;display:grid;grid-template-columns:repeat(5,190px);gap:8px;font:bold 20px sans-serif}
figure{margin:0;position:relative;background:#fff;height:190px;display:flex;align-items:center;justify-content:center;border-radius:6px}
figure b{position:absolute;left:6px;top:4px;color:#d32f2f}img{max-width:160px;max-height:160px}`;

/** 一組物件畫成一張編號對照表（格子裡只有編號，不寫單字，免得 LLM 照字回答） */
async function renderSheet(page, sceneId, chunk, file) {
  const cells = chunk.map((it) => {
    const svg = fs.readFileSync(path.join(ROOT, 'public', 'svg', sceneId, `${it.id}.svg`), 'utf8');
    return `<figure><b>${it.n}</b><img src="data:image/svg+xml;base64,${Buffer.from(asImage(svg)).toString('base64')}"></figure>`;
  });
  await page.setContent(`<style>${SHEET_STYLE}</style>${cells.join('')}`);
  await page.waitForLoadState('load');
  const body = await page.locator('body').boundingBox();
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: body.width, height: body.height } });
}

async function visionReview(sceneId, sceneName, items) {
  const chunks = chunkItems(items);
  const browser = await chromium.launch({ channel: 'chrome' });
  const files = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    for (const [k, chunk] of chunks.entries()) {
      const file = path.join(OUT_DIR, `${sceneId}-${k + 1}.png`);
      await renderSheet(page, sceneId, chunk, file);
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  const flagged = [];
  const similar = [];
  for (const [k, chunk] of chunks.entries()) {
    try {
      const r = parseVisual(await codexText(buildVisualPrompt(sceneName, chunk), { images: [files[k]] }), chunk);
      flagged.push(...r.flagged);
      similar.push(...r.similar);
    } catch (e) {
      console.error(`看圖第 ${k + 1} 張沒做成：${e.message.split('\n')[0]}`);
    }
  }
  return { flagged, similar, sheets: files.map((f) => path.relative(ROOT, f)) };
}

// ── 構圖審查：在試玩伺服器上把每個區域縮放、拖到畫面中間截圖 ─────────────

/** 畫布目前的 translate / scale（TownCanvas 的 transform）與畫布在頁面上的位置 */
async function readView(page) {
  const box = await page.locator('[aria-label^="小鎮"]').boundingBox();
  const v = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[style*="scale("]')].find((e) => e.style.transform.startsWith('translate('));
    const m = el?.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/);
    return m ? { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) } : null;
  });
  if (!box || !v) throw new Error('找不到小鎮畫布');
  return { ...v, box };
}

/** 縮放到區域剛好放得進畫面（滾輪，以畫面中心為錨點），再拖曳讓區域置中，回傳截圖範圍 */
async function frameZone(page, zone) {
  const zw = zone.x1 - zone.x0;
  const zh = zone.y1 - zone.y0;
  for (let i = 0; i < 20; i++) {
    const { s, box } = await readView(page);
    const target = Math.min(box.width / zw, box.height / zh) * 0.92;
    if (s <= target && s >= target / 1.3) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, s > target ? 100 : -100);
    await page.waitForTimeout(120);
  }
  let v = await readView(page);
  const mx = v.box.x + v.box.width / 2;
  const my = v.box.y + v.box.height / 2;
  const cx = v.box.x + v.tx + ((zone.x0 + zone.x1) / 2) * v.s;
  const cy = v.box.y + v.ty + ((zone.y0 + zone.y1) / 2) * v.s;
  await page.mouse.move(mx, my);
  await page.mouse.down();
  await page.mouse.move(mx + (mx - cx), my + (my - cy), { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  v = await readView(page);
  const x0 = Math.max(v.box.x, v.box.x + v.tx + zone.x0 * v.s);
  const y0 = Math.max(v.box.y, v.box.y + v.ty + zone.y0 * v.s);
  const x1 = Math.min(v.box.x + v.box.width, v.box.x + v.tx + zone.x1 * v.s);
  const y1 = Math.min(v.box.y + v.box.height, v.box.y + v.ty + zone.y1 * v.s);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

async function serverUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function layoutReview(sceneId, scene, items) {
  if (!(await serverUp())) return { skipped: `試玩伺服器（${BASE}）沒在跑` };
  const browser = await chromium.launch({ channel: 'chrome' });
  const files = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(`${BASE}/`);
    await page.getByLabel('測試用：解鎖全部場景與關卡').check();
    await page.goto(`${BASE}/scene/${sceneId}`);
    await page.getByRole('button', { name: /自由探索/ }).click();
    await page.addStyleTag({ content: '[data-ui="overlay"]{display:none!important}' });
    await page.waitForTimeout(500);
    for (const zone of scene.zones) {
      const file = path.join(OUT_DIR, `${sceneId}-zone-${zone.id}.png`);
      await page.screenshot({ path: file, clip: await frameZone(page, zone) });
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  const byId = new Map(items.map((it) => [it.id, it]));
  const zones = scene.zones.map((z) => ({ id: z.id, name: z.name, items: scene.items.filter((it) => it.zone === z.id).map((it) => byId.get(it.id)) }));
  const result = parseLayout(await codexText(buildLayoutPrompt(scene.name, zones), { images: files }), zones);
  return { ...result, shots: files.map((f) => path.relative(ROOT, f)) };
}

/** 構圖審查的結果寫進待人工審清單（同一個街區的其他檢查結果保留） */
function queueLayout(sceneId, layout) {
  const queue = fs.existsSync(QUEUE) ? readJson(QUEUE) : {};
  const entry = queue[sceneId] ?? { at: new Date().toISOString(), flagged: [], similar: [] };
  fs.writeFileSync(QUEUE, `${JSON.stringify({ ...queue, [sceneId]: { ...entry, layout: { score: layout.score, issues: layout.issues } } }, null, 2)}\n`);
}

export async function reviewLayoutOnly(sceneId) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { scene, items } = sceneItems(sceneId);
  const layout = await layoutReview(sceneId, scene, items);
  if (!layout.skipped) queueLayout(sceneId, layout);
  return layout;
}

export async function reviewScene(sceneId, { vision = true, layout: withLayout = true } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { scene, items } = sceneItems(sceneId);
  const render = (await checkScene(sceneId)).filter((r) => r.flag).map(({ id, flag }) => ({ id, flag }));
  const playtest = playtestScene(scene);
  const visual = vision ? await visionReview(sceneId, scene.name, items) : null;
  let layout = null;
  if (vision && withLayout) {
    try {
      layout = await layoutReview(sceneId, scene, items);
    } catch (e) {
      layout = { skipped: e.message.split('\n')[0] };
    }
  }
  const result = { at: new Date().toISOString(), render, playtest, visual, layout };
  fs.writeFileSync(path.join(OUT_DIR, `${sceneId}.json`), `${JSON.stringify(result, null, 2)}\n`);

  const flagged = [...render, ...playtest.flagged, ...(visual?.flagged ?? [])];
  // 玩家數據（scripts/import-play-stats.mjs 匯入的）：玩家常找不到的物件
  const players = fs.existsSync(PLAY_STATS) ? strugglingItems(parsePlayStats(readJson(PLAY_STATS)), sceneId) : [];
  const queue = fs.existsSync(QUEUE) ? readJson(QUEUE) : {};
  const prev = queue[sceneId] ?? {};
  const entry = { ...prev, at: result.at, flagged, similar: visual?.similar ?? [], players, ...(layout && !layout.skipped ? { layout: { score: layout.score, issues: layout.issues } } : {}) };
  fs.writeFileSync(QUEUE, `${JSON.stringify({ ...queue, [sceneId]: entry }, null, 2)}\n`);
  return { flagged, similar: visual?.similar ?? [], players, playtest: playtest.stats, layout, sheets: visual?.sheets ?? [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sceneId = args.find((a) => !a.startsWith('--'));
  if (!sceneId) {
    console.error('用法：node scripts/review-scene.mjs <scene> [--no-vision]');
    process.exit(1);
  }
  const out = args.includes('--layout-only')
    ? await reviewLayoutOnly(sceneId)
    : await reviewScene(sceneId, { vision: !args.includes('--no-vision'), layout: !args.includes('--no-layout') });
  console.log(JSON.stringify(out, null, 2));
}
