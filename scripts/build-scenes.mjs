#!/usr/bin/env node
// 內容 → 遊戲資料：content/svg-manifests + public/svg + content/scene-config.json + content/layouts
//   → src/data/scenes/<scene>.json（物件、單字、清洗過的 SVG、地圖位置、動態、檯面）與 src/data/scenes/index.json
//
//   node scripts/build-scenes.mjs
//
// 所有場景在同一張小鎮地圖上（地圖座標）。位置只讀 content/layouts/<scene>.json（先跑 npm run content:layout）。
// 任一檢查沒過就失敗：區域不能互相重疊、擺放（不出區域、至少露出 60%，跨場景一起算）、動態數量、物件 id 跨場景不重複。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLayout, resolveBand } from './lib/layout.mjs';
import { checkMotionBudget, motionParams } from './lib/motion.mjs';
import { layoutFile, loadSceneConfig, loadSceneSource, lockedPlacements } from './lib/scene-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'scenes');

// 有 look 的地帶 = 背景要畫出來的檯面（蔬果台、冷藏櫃、收銀台、吧台、餐桌、碼頭）
function surfacesOf(bands, zones) {
  return Object.entries(bands).filter(([, b]) => b.look).flatMap(([name, b]) => zones.flatMap((z) => {
    const r = resolveBand(bands, name, z);
    return r ? [{ look: b.look, zone: z.id, x0: r.x0, x1: r.x1, levels: r.levels ?? [r.top], base: b.base ?? r.bottom + 60 }] : [];
  }));
}

function checkWorld(world, sources) {
  const all = sources.flatMap((s) => s.zones.map((z) => ({ ...z, sceneId: s.sceneId })));
  const problems = [];
  for (const z of all) {
    if (z.x0 < 0 || z.y0 < 0 || z.x1 > world.width || z.y1 > world.height) problems.push(`${z.sceneId}/${z.id} 超出地圖 ${world.width}×${world.height}`);
  }
  all.forEach((a, i) => all.slice(i + 1).forEach((b) => {
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) problems.push(`區域重疊：${a.sceneId}/${a.id} 和 ${b.sceneId}/${b.id}`);
  }));
  if (problems.length) throw new Error(`地圖區域有問題：\n  ${problems.join('\n  ')}`);
}

function buildScene(world, source, placements, obstacles) {
  const { sceneId, sceneConfig, zones, items } = source;
  const file = layoutFile(ROOT, sceneId);
  const missing = items.filter((it) => !placements.some((p) => p.id === it.id)).map((it) => it.id);
  if (missing.length) throw new Error(`${sceneId}：這些物件還沒有位置：${missing.join(', ')}，先跑 npm run content:layout -- ${sceneId}`);

  const problems = checkLayout({ zones, items, placements, obstacles });
  if (problems.length) throw new Error(`${sceneId} 擺放沒過檢查（改 ${path.relative(ROOT, file)} 或加 --reset 重排）：\n  ${problems.join('\n  ')}`);
  const motion = sceneConfig.motion ?? {};
  checkMotionBudget(motion, items.length);

  const byId = new Map(items.map((it) => [it.id, it]));
  // 陣列順序 = 繪製順序（後面的蓋在前面上）：先依 layer，同層依底線由上到下
  const ordered = [...placements].sort((a, b) => a.layer - b.layer || (a.y + a.h) - (b.y + b.h));
  return {
    id: sceneId,
    name: sceneConfig.name,
    width: world.width,
    height: world.height,
    zones: zones.map(({ id, name, x0, y0, x1, y1 }) => ({ id, name, x0, y0, x1, y1 })),
    surfaces: surfacesOf(sceneConfig.bands, zones),
    items: ordered.map(({ id, x, y, w, h, rotate = 0, flip = false, float = 0 }) => {
      const it = byId.get(id);
      return {
        id, zone: it.zone, category: it.category, words: it.words, viewBox: it.viewBox, body: it.body,
        x, y, w, h, rotate, flip,
        ...(float ? { float } : {}),
        ...(motion[id] ? { motion: motionParams(sceneId, id, motion[id]) } : {}),
      };
    }),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const config = loadSceneConfig(ROOT);
  const world = config.world;
  if (!world?.width || !world?.height) throw new Error('scene-config.json 缺少 world: { width, height }');
  const sources = config.order.map((id) => loadSceneSource(ROOT, config, id));
  checkWorld(world, sources);

  for (const s of sources) {
    if (!fs.existsSync(layoutFile(ROOT, s.sceneId))) throw new Error(`${s.sceneId}：沒有 ${path.relative(ROOT, layoutFile(ROOT, s.sceneId))}，先跑 npm run content:layout`);
  }
  const placementsOf = new Map(sources.map((s) => [s.sceneId, lockedPlacements(ROOT, s)]));
  const index = [];
  const seen = new Map();
  for (const source of sources) {
    const { sceneId } = source;
    const obstacles = [...placementsOf].filter(([id]) => id !== sceneId).flatMap(([, list]) => list);
    const scene = buildScene(world, source, placementsOf.get(sceneId), obstacles);
    // 所有場景在同一張畫布上，物件 id 必須全域唯一
    for (const it of scene.items) {
      if (seen.has(it.id)) throw new Error(`物件 id ${it.id} 在 ${seen.get(it.id)} 和 ${sceneId} 重複`);
      seen.set(it.id, sceneId);
    }
    const icon = scene.items.find((it) => it.id === config.scenes[sceneId].icon);
    if (!icon) throw new Error(`${sceneId}: 找不到代表物件 ${config.scenes[sceneId].icon}`);
    fs.writeFileSync(path.join(OUT_DIR, `${sceneId}.json`), `${JSON.stringify(scene)}\n`);
    index.push({ id: sceneId, name: scene.name, itemCount: scene.items.length, icon: { viewBox: icon.viewBox, body: icon.body } });
    const moving = scene.items.filter((it) => it.motion).length;
    console.log(`${sceneId}: ${scene.items.length} 個物件、${moving} 個會動${source.skipped.length ? `，略過（無 SVG）：${source.skipped.join(', ')}` : ''}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`→ ${path.relative(ROOT, OUT_DIR)}/`);
}

try {
  main();
} catch (e) {
  console.error(`失敗：${e.message}`);
  process.exit(1);
}
