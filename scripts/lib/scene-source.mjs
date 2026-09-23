// 讀一個場景的原始內容：scene-config + manifest + public/svg（清洗過），給 build-layout / build-scenes 共用。
// 只收有 SVG 的物件（Lane B）；動物與人物（Lane A）還沒有素材，列在 skipped。
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeSvg } from './svg-sanitize.mjs';
import { validateSceneConfig } from './scene-config.mjs';
import { resolveBand } from './layout.mjs';

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadSceneConfig(root) {
  return readJson(path.join(root, 'content', 'scene-config.json'));
}

/**
 * zones：地圖上的區域矩形（scene-config 的位置 + manifest 的名稱），依 manifest 順序
 * @returns {{ sceneId: string, sceneConfig: object, zones: Array<{ id: string, name: string, x0: number, y0: number, x1: number, y1: number }>, items: object[], skipped: string[] }}
 */
export function loadSceneSource(root, config, sceneId) {
  const sceneConfig = config.scenes[sceneId];
  if (!sceneConfig) throw new Error(`scene-config.json 沒有 ${sceneId}`);
  const manifest = readJson(path.join(root, 'content', 'svg-manifests', `${sceneId}.json`));

  const skipped = [];
  const items = [];
  for (const el of manifest.elements) {
    const { itemId, zone, words } = el.ref;
    const file = path.join(root, 'public', 'svg', sceneId, `${itemId}.svg`);
    if (!fs.existsSync(file)) { skipped.push(itemId); continue; }
    const svg = sanitizeSvg(fs.readFileSync(file, 'utf8'), `${sceneId}/${itemId}`);
    items.push({ id: itemId, zone, category: el.category, sizeHint: el.sizeHint, words, viewBox: svg.viewBox, body: svg.body });
  }

  const zoneIds = Object.keys(manifest.zones);
  const problems = validateSceneConfig(sceneId, sceneConfig, items.map((it) => it.id), zoneIds, Object.fromEntries(items.map((it) => [it.id, it.zone])));
  if (problems.length) throw new Error(`scene-config.json 有問題：\n  ${problems.join('\n  ')}`);
  const zones = zoneIds.map((id) => {
    const [x0, y0, x1, y1] = sceneConfig.zones[id];
    return { id, name: manifest.zones[id], x0, y0, x1, y1 };
  });
  return { sceneId, sceneConfig, zones, items, skipped };
}

export function layoutFile(root, sceneId) {
  return path.join(root, 'content', 'layouts', `${sceneId}.json`);
}

// 一個物件一行，方便手改與看 diff
export function formatLayout(layout) {
  const lines = Object.keys(layout).sort().map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(layout[id]).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

// 鎖定檔的位置 → 擺放資料（加上 layer/float；SVG 長寬比變了就保留寬度與底線重算高度）
// 只差 1 單位是 itemSize 的四捨五入誤差，不算長寬比變了（不然 build 的遮擋檢查會和擺放時對不上）
export function fitToViewBox(pos, viewBox) {
  const [, , vw, vh] = viewBox;
  const h = Math.round(pos.w * (vh / vw));
  if (Math.abs(h - pos.h) <= 1) return { ...pos };
  return { ...pos, y: pos.y + pos.h - h, h };
}

/** 一個場景鎖定檔裡的物件位置（地圖座標）；沒有鎖定檔回傳空陣列。給其他場景當 obstacles 用 */
export function lockedPlacements(root, source) {
  const { sceneConfig, zones, items } = source;
  const file = layoutFile(root, source.sceneId);
  if (!fs.existsSync(file)) return [];
  const layout = readJson(file);
  return items.filter((it) => layout[it.id]).map((it) => {
    const zone = zones.find((z) => z.id === it.zone);
    const band = bandOf(sceneConfig, it, zone);
    return { id: it.id, layer: band.layer, float: band.float, ...fitToViewBox(layout[it.id], it.viewBox) };
  });
}

export function bandOf(sceneConfig, item, zone) {
  const { bands, place = {} } = sceneConfig;
  return resolveBand(bands, place[item.id] ?? 'ground', zone) ?? resolveBand(bands, 'ground', zone);
}
