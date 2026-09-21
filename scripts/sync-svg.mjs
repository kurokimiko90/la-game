#!/usr/bin/env node
// 把 miko-ws 場景素材工廠產出的 SVG 拉回 la-game。
//
//   node scripts/sync-svg.mjs          # 複製到 public/svg/<scene>/<itemId>.svg，寫 content/svg-status.json
//   node scripts/sync-svg.mjs --dry    # 只印統計
//
// miko-ws 位置預設 ../miko-ws，可用 MIKO_WS_DIR 覆蓋。
// 對應方式：registry.json 的 name ↔ manifest 的 name（同 miko-ws 的正規化規則）→ ref.itemId。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_DIR = path.join(ROOT, 'content', 'svg-manifests');
const OUT_DIR = path.join(ROOT, 'public', 'svg');
const STATUS_FILE = path.join(ROOT, 'content', 'svg-status.json');
const MIKO_WS = path.resolve(process.env.MIKO_WS_DIR || path.join(ROOT, '..', 'miko-ws'));
const ASSET_ROOT = path.join(MIKO_WS, 'data', 'scene-assets');

// 與 miko-ws registry.normalizeItemName 相同
const normalize = (name) => String(name || '').trim().toLowerCase().replace(/[（(].*?[)）]/g, '').trim();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function syncScene(manifestFile, { dry }) {
  const manifest = readJson(manifestFile);
  const sceneId = path.basename(manifestFile, '.json');
  const registryFile = path.join(ASSET_ROOT, manifest.sceneSlug, 'registry.json');
  const items = fs.existsSync(registryFile) ? readJson(registryFile).items || [] : [];
  const byName = new Map(items.map((it) => [normalize(it.name), it]));

  const status = { scene: sceneId, slug: manifest.sceneSlug, synced: [], failed: [], pending: [], skippedLaneA: [] };
  for (const el of manifest.elements) {
    const { itemId } = el.ref;
    if (el.lane !== 'b') { status.skippedLaneA.push(itemId); continue; }
    const item = byName.get(normalize(el.name));
    if (!item || item.status === 'planned') { status.pending.push(itemId); continue; }
    if (item.status !== 'done') { status.failed.push({ itemId, elementId: item.id, error: item.error || item.status }); continue; }

    const src = path.join(ASSET_ROOT, manifest.sceneSlug, 'items', item.id, 'image.svg');
    if (!fs.existsSync(src)) { status.failed.push({ itemId, elementId: item.id, error: 'image.svg 不存在' }); continue; }
    if (!dry) {
      const dest = path.join(OUT_DIR, sceneId, `${itemId}.svg`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    status.synced.push(itemId);
  }
  return status;
}

function main() {
  const dry = process.argv.includes('--dry');
  if (!fs.existsSync(ASSET_ROOT)) {
    throw new Error(`找不到 miko-ws 素材目錄：${ASSET_ROOT}（用 MIKO_WS_DIR 指定 miko-ws 位置）`);
  }
  const manifests = fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json')).sort();
  const scenes = manifests.map((f) => syncScene(path.join(MANIFEST_DIR, f), { dry }));

  console.table(scenes.map((s) => ({
    scene: s.scene, synced: s.synced.length, failed: s.failed.length, pending: s.pending.length, laneA: s.skippedLaneA.length,
  })));
  for (const s of scenes) {
    for (const f of s.failed) console.log(`  ✗ ${s.scene}/${f.itemId}（${f.elementId}）：${f.error}`);
  }
  if (dry) return;
  fs.writeFileSync(STATUS_FILE, `${JSON.stringify({ syncedAt: new Date().toISOString(), scenes }, null, 2)}\n`);
  console.log(`→ public/svg/、${path.relative(ROOT, STATUS_FILE)}`);
}

try {
  main();
} catch (e) {
  console.error(`失敗：${e.message}`);
  process.exit(1);
}
