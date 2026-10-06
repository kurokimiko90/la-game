#!/usr/bin/env node
// 擺放 → content/layouts/<scene>.json（鎖定檔，可以手改）
//
//   npm run content:layout                    # 全部場景：只替還沒有位置的物件跑演算法
//   npm run content:layout -- park            # 指定場景
//   npm run content:layout -- park --reset    # 整個重排（場景上線後不要用：玩家記住的位置會變）
//   npm run content:layout -- park --refill   # 物件不動，只重新產生重複擺放（複本）
//
// 自動擴展的街區（有 terrain）擺完會補「重複擺放」：檯面空位、小東西旁邊再放同一個物品（scripts/lib/copies.mjs）。
// 已有的複本不動，只在空位補新的；複本和新擺的物件重疊時拿掉那個複本。
// 所有場景在同一張小鎮地圖上：擺一個場景時，其他場景已鎖定的物件當成障礙物一起避開。
// 已有位置的物件完全不動；manifest 拿掉的物件會從鎖定檔移除。規範見 docs/scene-standard.md §2。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutScene } from './lib/layout.mjs';
import { copyOf, fillCopies } from './lib/copies.mjs';
import { copyExclusions, formatLayout, layoutFile, loadSceneConfig, loadSceneSource, loadStage, lockedPlacements, readJson, siteAllows, surfacesOf } from './lib/scene-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

// 複本：留下原物件還在、沒和新擺的物件重疊的舊複本，再在空位補新的
function layoutCopies({ source, stage, placed, locked, previous, refill, obstacles }) {
  const { sceneId, sceneConfig, zones, items } = source;
  if (!sceneConfig.terrain) return { kept: [], added: [] };
  const ids = new Set(items.map((it) => it.id));
  const fresh = placed.filter((p) => !locked[p.id]);
  const kept = refill ? [] : Object.entries(previous)
    .filter(([id]) => ids.has(copyOf(id) ?? ''))
    .map(([id, pos]) => ({ id, ...pos }))
    .filter((c) => !fresh.some((p) => overlaps(c, p)));
  const exclude = copyExclusions(sceneConfig, stage, items);
  for (const p of placed) if (p.float) exclude.add(p.id);
  const added = fillCopies({
    sceneId, zones, items, placements: placed, surfaces: surfacesOf(sceneConfig.bands, zones, stage),
    obstacles: [...obstacles, ...kept], exclude, allows: siteAllows(sceneConfig.terrain), maxRatio: 1 - kept.length / Math.max(1, items.length),
  });
  return { kept, added };
}

function buildLayout(source, { reset, refill }, obstacles) {
  const { sceneId, sceneConfig, zones, items } = source;
  const file = layoutFile(ROOT, sceneId);
  const previous = !reset && fs.existsSync(file) ? readJson(file) : {};
  const ids = new Set(items.map((it) => it.id));
  const removed = Object.keys(previous).filter((id) => !ids.has(id) && !copyOf(id));
  const locked = Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id)));

  const warnings = [];
  const stage = loadStage(ROOT, source);
  const placed = layoutScene({
    staged: stage?.anchors,
    sceneId, zones, items, locked, obstacles, warnings, arrange: sceneConfig.arrange,
    bands: sceneConfig.bands, place: sceneConfig.place, clusters: sceneConfig.clusters,
    loose: sceneConfig.loose, noFlip: sceneConfig.noFlip, rows: sceneConfig.rows, spots: sceneConfig.spots,
  });
  const { kept, added: copies } = layoutCopies({ source, stage, placed, locked, previous, refill, obstacles });
  const pos = ({ x, y, w, h, rotate, flip, depth }) => ({ x, y, w, h, rotate, flip, ...(depth === undefined ? {} : { depth }) });
  const layout = Object.fromEntries([...placed, ...kept, ...copies].map((p) => [p.id, pos(p)]));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, formatLayout(layout));

  for (const w of warnings) console.warn(`⚠️ ${w}`);
  const added = placed.filter((p) => !locked[p.id]).length;
  const copyText = kept.length || copies.length ? `；重複擺放保留 ${kept.length}、新增 ${copies.length}` : '';
  console.log(`${sceneId}: 保留 ${Object.keys(locked).length}、新擺 ${added}${removed.length ? `、移除 ${removed.join(', ')}` : ''}${copyText} → ${path.relative(ROOT, file)}`);
  return placed;
}

function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const refill = args.includes('--refill');
  const config = loadSceneConfig(ROOT);
  const named = args.filter((a) => !a.startsWith('--'));
  const targets = named.length ? named : config.order;
  const sources = new Map(config.order.map((id) => [id, loadSceneSource(ROOT, config, id)]));
  for (const id of targets) if (!sources.has(id)) throw new Error(`scene-config.json 的 order 沒有 ${id}`);

  // 其他場景的位置：不重排的場景用鎖定檔；這次重排的場景等它擺完再加入
  const placedByScene = new Map();
  for (const id of config.order) {
    if (!(reset && targets.includes(id))) placedByScene.set(id, lockedPlacements(ROOT, sources.get(id)));
  }
  for (const sceneId of targets) {
    const obstacles = [...placedByScene].filter(([id]) => id !== sceneId).flatMap(([, list]) => list);
    placedByScene.set(sceneId, buildLayout(sources.get(sceneId), { reset, refill }, obstacles));
  }
}

try {
  main();
} catch (e) {
  console.error(`失敗：${e.message}`);
  process.exit(1);
}
