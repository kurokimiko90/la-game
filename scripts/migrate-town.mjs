#!/usr/bin/env node
// 小鎮分區搬遷（docs/town-zoning-plan.md）：戶外區域搬到北邊的沿街地塊、室內區域搬到南邊的室內區。
//
//   node scripts/migrate-town.mjs          # 搬遷並寫檔
//   node scripts/migrate-town.mjs --dry    # 只印出每個區域的位移
//
// 物件位置用「整區平移」：鎖定檔裡的物件加上區域的位移，區域內的相對位置不變，不重排。
// 可以重跑：已經在新位置的區域位移是 0。
// - 自動擴展的街區：依 content/expansion.json 的 town 分配位置，寫進 content/plans/<scene>.json 的 rects，
//   scene-config 由規劃重新產生（planToSceneConfig）。
// - 超市（手畫、全部室內）：整塊搬進室內區，設定裡的座標一起平移，加上 "indoor": true。
// - 公園、商業街、河邊：不動。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertScene } from './lib/config-writer.mjs';
import { planToSceneConfig } from './lib/scene-plan.mjs';
import { formatLayout, layoutFile, readJson } from './lib/scene-source.mjs';
import { allocateBuilding, placeDistrict, worldFor } from './lib/town-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  config: path.join(ROOT, 'content', 'scene-config.json'),
  settings: path.join(ROOT, 'content', 'expansion.json'),
  plans: path.join(ROOT, 'content', 'plans'),
  svg: path.join(ROOT, 'public', 'svg'),
};
const INDOOR_HAND = ['supermarket'];

const bbox = (rects) => [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
const shiftRect = ([x0, y0, x1, y1], dx, dy) => [x0 + dx, y0 + dy, x1 + dx, y1 + dy];

// 手寫設定裡的座標一起平移：區域、地帶（x 類 / y 類欄位、gaps、override）、rows、spots
function shiftBand(band, dx, dy) {
  const out = { ...band };
  for (const k of ['x0', 'x1']) if (typeof out[k] === 'number') out[k] += dx;
  for (const k of ['top', 'bottom', 'base']) if (typeof out[k] === 'number') out[k] += dy;
  if (out.levels) out.levels = out.levels.map((y) => y + dy);
  if (out.gaps) out.gaps = out.gaps.map(([a, b]) => [a + dy, b + dy]);
  if (out.override) out.override = Object.fromEntries(Object.entries(out.override).map(([z, o]) => [z, shiftBand(o, dx, dy)]));
  return out;
}

function shiftHandScene(cfg, dx, dy) {
  return {
    ...cfg,
    indoor: true,
    zones: Object.fromEntries(Object.entries(cfg.zones).map(([z, r]) => [z, shiftRect(r, dx, dy)])),
    bands: Object.fromEntries(Object.entries(cfg.bands).map(([k, b]) => [k, shiftBand(b, dx, dy)])),
    ...(cfg.rows ? { rows: cfg.rows.map((row) => ({ ...row, points: row.points.map(([x, y]) => [x + dx, y + dy]) })) } : {}),
    ...(cfg.spots ? { spots: Object.fromEntries(Object.entries(cfg.spots).map(([id, [x, y]]) => [id, [x + dx, y + dy]])) } : {}),
  };
}

// 鎖定檔：物件所在區域的位移
function shiftLayout(sceneId, zoneOfItem, deltas, dry) {
  const file = layoutFile(ROOT, sceneId);
  if (!fs.existsSync(file)) return 0;
  const layout = readJson(file);
  let moved = 0;
  const out = Object.fromEntries(Object.entries(layout).map(([id, pos]) => {
    const d = deltas[zoneOfItem[id]];
    if (!d || (!d[0] && !d[1])) return [id, pos];
    moved++;
    return [id, { ...pos, x: pos.x + d[0], y: pos.y + d[1], ...(pos.depth === undefined ? {} : { depth: pos.depth + d[1] }) }];
  }));
  if (!dry) fs.writeFileSync(file, formatLayout(out));
  return moved;
}

const available = (sceneId) => fs.readdirSync(path.join(P.svg, sceneId)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));

function main() {
  const dry = process.argv.includes('--dry');
  const town = readJson(P.settings).town;
  if (!town) throw new Error('content/expansion.json 沒有 town 設定');
  let text = fs.readFileSync(P.config, 'utf8');
  const config = JSON.parse(text);
  const occupied = [];
  const buildings = [];
  const updates = new Map();
  const report = [];

  for (const id of config.order) {
    const cfg = config.scenes[id];
    const planFile = path.join(P.plans, `${id}.json`);
    if (INDOOR_HAND.includes(id)) {
      const old = bbox(Object.values(cfg.zones));
      const b = allocateBuilding({ w: old[2] - old[0], h: old[3] - old[1] }, buildings, town.indoor);
      buildings.push(b);
      const [dx, dy] = [b[0] - old[0], b[1] - old[1]];
      const next = dx || dy ? shiftHandScene(cfg, dx, dy) : { ...cfg, indoor: true };
      updates.set(id, next);
      const manifest = readJson(path.join(ROOT, 'content', 'svg-manifests', `${id}.json`));
      const zoneOfItem = Object.fromEntries(manifest.elements.map((e) => [e.ref.itemId, e.ref.zone]));
      const moved = shiftLayout(id, zoneOfItem, Object.fromEntries(Object.keys(cfg.zones).map((z) => [z, [dx, dy]])), dry);
      report.push(`${id}：整塊平移 (${dx}, ${dy})，${moved} 個物件`);
      continue;
    }
    if (!cfg.terrain || !fs.existsSync(planFile)) {
      occupied.push(...Object.values(cfg.zones));
      continue;
    }
    const plan = readJson(planFile);
    const { rects, building } = placeDistrict(plan.zones, { occupied, buildings, town });
    occupied.push(...rects.filter((_, i) => !plan.zones[i].indoor));
    if (building) buildings.push(building);
    const deltas = Object.fromEntries(plan.zones.map((z, i) => [z.id, [rects[i][0] - cfg.zones[z.id][0], rects[i][1] - cfg.zones[z.id][1]]]));
    const nextPlan = { ...plan, rects };
    delete nextPlan.slot; // 舊的 2×2 slot 換成 rects
    const nextCfg = planToSceneConfig(nextPlan, available(id));
    // 由規劃重新產生的設定，除了位置以外要和現在的一樣（不然代表有手改過，要先處理）
    for (const key of Object.keys({ ...cfg, ...nextCfg })) {
      if (['zones', 'bands', 'terrain'].includes(key)) continue;
      if (JSON.stringify(cfg[key]) !== JSON.stringify(nextCfg[key])) throw new Error(`${id}：重新產生的 ${key} 和現在的設定不同，先確認有沒有手改過`);
    }
    updates.set(id, nextCfg);
    if (!dry) fs.writeFileSync(planFile, `${JSON.stringify(nextPlan, null, 2)}\n`);
    const zoneOfItem = Object.fromEntries(plan.elements.map((e) => [e.id, e.zone]));
    const moved = shiftLayout(id, zoneOfItem, deltas, dry);
    report.push(`${id}：${plan.zones.map((z) => `${z.id}${z.indoor ? '（室內）' : ''} (${deltas[z.id].join(', ')})`).join('、')}，${moved} 個物件`);
  }

  const allRects = config.order.flatMap((id) => Object.values((updates.get(id) ?? config.scenes[id]).zones));
  const world = worldFor(allRects, town);
  for (const [id, cfg] of updates) text = upsertScene(text, id, cfg, { world, order: config.order });
  if (!dry) fs.writeFileSync(P.config, text);
  for (const line of report) console.log(line);
  console.log(`地圖 ${world.width}×${world.height}，戶外到 y ${world.outdoorHeight}${dry ? '（--dry：沒有寫檔）' : ''}`);
}

try {
  main();
} catch (e) {
  console.error(`失敗：${e.message}`);
  process.exit(1);
}
