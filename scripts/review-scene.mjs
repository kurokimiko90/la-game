#!/usr/bin/env node
// 場景品質檢查：渲染檢查 + 自動試玩 + 看圖驗收，結果進待人工審清單（.auto-expand/review-queue.json）。
// auto-expand 整合完會叫它；也可以手動跑。看圖驗收要 miko-ws runtime 在跑（codex 附圖）。
//
//   node scripts/review-scene.mjs <scene>              # 三項都做
//   node scripts/review-scene.mjs <scene> --no-vision  # 不叫 LLM（只做渲染檢查 + 自動試玩）
//
// 詳細結果：.auto-expand/review/<scene>.json；對照表圖：.auto-expand/review/<scene>-<n>.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { asImage, checkScene } from './check-svg-render.mjs';
import { playtestScene } from './lib/playtest.mjs';
import { buildVisualPrompt, chunkItems, parseVisual } from './lib/visual-review.mjs';
import { codexText } from './lib/miko.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(ROOT, '.auto-expand');
const OUT_DIR = path.join(STATE_DIR, 'review');
const QUEUE = path.join(STATE_DIR, 'review-queue.json');
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

export async function reviewScene(sceneId, { vision = true } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { scene, items } = sceneItems(sceneId);
  const render = (await checkScene(sceneId)).filter((r) => r.flag).map(({ id, flag }) => ({ id, flag }));
  const playtest = playtestScene(scene);
  const visual = vision ? await visionReview(sceneId, scene.name, items) : null;
  const result = { at: new Date().toISOString(), render, playtest, visual };
  fs.writeFileSync(path.join(OUT_DIR, `${sceneId}.json`), `${JSON.stringify(result, null, 2)}\n`);

  const flagged = [...render, ...playtest.flagged, ...(visual?.flagged ?? [])];
  const queue = fs.existsSync(QUEUE) ? readJson(QUEUE) : {};
  fs.writeFileSync(QUEUE, `${JSON.stringify({ ...queue, [sceneId]: { at: result.at, flagged, similar: visual?.similar ?? [] } }, null, 2)}\n`);
  return { flagged, similar: visual?.similar ?? [], playtest: playtest.stats, sheets: visual?.sheets ?? [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sceneId = args.find((a) => !a.startsWith('--'));
  if (!sceneId) {
    console.error('用法：node scripts/review-scene.mjs <scene> [--no-vision]');
    process.exit(1);
  }
  console.log(JSON.stringify(await reviewScene(sceneId, { vision: !args.includes('--no-vision') }), null, 2));
}
