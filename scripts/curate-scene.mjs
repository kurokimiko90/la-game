#!/usr/bin/env node
// 逐場景策展：看情境覆蓋、把不屬於這個場所的物品退役（真實場景裡找不到合理位置的東西不硬塞）。
//
//   node scripts/curate-scene.mjs info <scene>             # 區域、各組情境、沒進情境的物品
//   node scripts/curate-scene.mjs retire <scene> <file>    # file：{ "<id>": "原因", … }
//   node scripts/curate-scene.mjs move <scene> <file>      # file：{ "<id>": "<zone>", … }，物品換到別的區域（只用在還沒上線的街區）
//   node scripts/curate-scene.mjs coverage                 # 全部自動街區的情境覆蓋率
//
// 退役：物品移到 plan.rejected（原因前綴「退役：」，之後補元素不會再加回來），重產 manifest，
// 並從鎖定檔、情境檔、scene-config（place / motion / clusters / loose）移除。SVG 與音檔留著不刪。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertScene } from './lib/config-writer.mjs';
import { MAX_MOTION_RATIO } from './lib/motion.mjs';
import { planToManifest } from './lib/scene-plan.mjs';
import { stagedIds } from './lib/stage-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  plan: (id) => path.join(ROOT, 'content', 'plans', `${id}.json`),
  manifest: (id) => path.join(ROOT, 'content', 'svg-manifests', `${id}.json`),
  layout: (id) => path.join(ROOT, 'content', 'layouts', `${id}.json`),
  stage: (id) => path.join(ROOT, 'content', 'stages', `${id}.json`),
  config: path.join(ROOT, 'content', 'scene-config.json'),
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, `${JSON.stringify(d, null, 2)}\n`);
const SLOTS = ['main', 'on', 'wall', 'beside', 'front'];

function sceneItems(id) {
  return readJson(P.manifest(id)).elements
    .filter((e) => fs.existsSync(path.join(ROOT, 'public', 'svg', id, `${e.ref.itemId}.svg`)))
    .map((e) => ({ id: e.ref.itemId, zone: e.ref.zone, zh: e.name, size: e.sizeHint }));
}

function info(id) {
  const items = sceneItems(id);
  const byId = new Map(items.map((it) => [it.id, it]));
  const stage = fs.existsSync(P.stage(id)) ? readJson(P.stage(id)) : { zones: {} };
  const terrain = readJson(P.config).scenes[id].terrain;
  const staged = stagedIds(stage);
  const label = (x) => `${x}(${byId.get(x)?.zh ?? '?'})`;
  for (const tz of terrain?.zones ?? []) {
    const zs = stage.zones?.[tz.id];
    console.log(`\n## ${tz.id} ${tz.indoor ? '室內' : '室外'} ${tz.x1 - tz.x0}×${tz.y1 - tz.y0}`);
    (zs?.sets ?? []).forEach((s, i) => {
      const parts = SLOTS.filter((k) => s[k]).map((k) => `${k}:${[s[k]].flat().map(label).join(',')}`);
      console.log(`  [${i}] ${s.row} ${s.x.join('-')} ${s.fixture ?? '-'} 「${s.note ?? ''}」 ${parts.join(' ')}`);
    });
    if (zs?.sky) console.log(`  sky: ${Object.keys(zs.sky).map(label).join(',')}`);
    const left = items.filter((it) => it.zone === tz.id && !staged.has(it.id));
    if (left.length) console.log(`  未入情境 ${left.length}：${left.map((it) => `${it.id}(${it.zh},${it.size[0]})`).join(' ')}`);
  }
}

function dropFromStage(stage, ids) {
  for (const zs of Object.values(stage.zones ?? {})) {
    for (const s of zs.sets) {
      if (ids.has(s.main)) delete s.main;
      for (const k of ['on', 'wall', 'beside', 'front']) if (s[k]) s[k] = s[k].filter((x) => !ids.has(x));
    }
    zs.sets = zs.sets.filter((s) => s.fixture || s.main || ['on', 'wall', 'beside', 'front'].some((k) => s[k]?.length));
    for (const x of Object.keys(zs.sky ?? {})) if (ids.has(x)) delete zs.sky[x];
  }
  for (const x of Object.keys(stage.scale ?? {})) if (ids.has(x)) delete stage.scale[x];
  return stage;
}

function retire(id, file) {
  const reasons = readJson(path.resolve(file));
  const ids = new Set(Object.keys(reasons));
  const plan = readJson(P.plan(id));
  const missing = [...ids].filter((x) => !plan.elements.some((e) => e.id === x));
  if (missing.length) throw new Error(`${id} 的規劃裡沒有：${missing.join(', ')}`);
  plan.rejected = [
    ...(plan.rejected ?? []),
    ...plan.elements.filter((e) => ids.has(e.id)).map((e) => ({ id: e.id, reason: `退役：${reasons[e.id]}`, zone: e.zone })),
  ];
  plan.elements = plan.elements.filter((e) => !ids.has(e.id));
  if (plan.icon && ids.has(plan.icon)) delete plan.icon;
  writeJson(P.plan(id), plan);
  writeJson(P.manifest(id), planToManifest(plan));

  const layout = readJson(P.layout(id));
  fs.writeFileSync(P.layout(id), formatLayout(Object.fromEntries(Object.entries(layout).filter(([x]) => !ids.has(x)))));
  if (fs.existsSync(P.stage(id))) writeJson(P.stage(id), dropFromStage(readJson(P.stage(id)), ids));

  cleanConfig(id, ids, ids);
  console.log(`${id}：退役 ${ids.size} 個，剩 ${plan.elements.length} 個`);
}

// scene-config：ids 從 place / motion / clusters / loose / noFlip 拿掉；unplace 只拿掉 place 和 clusters（換區域的物品，地帶、群組跟著區域）
function cleanConfig(id, ids, unplace = new Set()) {
  const plan = readJson(P.plan(id));
  const text = fs.readFileSync(P.config, 'utf8');
  const config = JSON.parse(text);
  const sc = config.scenes[id];
  for (const x of Object.keys(sc.place ?? {})) if (ids.has(x) || unplace.has(x)) delete sc.place[x];
  for (const x of Object.keys(sc.motion ?? {})) if (ids.has(x)) delete sc.motion[x];
  // 物件變少後，會動的物件可能超過上限（和 planToSceneConfig 同一個留白比例）
  const maxMotion = Math.floor(plan.elements.length * MAX_MOTION_RATIO * 0.8);
  sc.motion = Object.fromEntries(Object.entries(sc.motion ?? {}).slice(0, maxMotion));
  sc.loose = (sc.loose ?? []).filter((x) => !ids.has(x));
  sc.noFlip = (sc.noFlip ?? []).filter((x) => !ids.has(x));
  const gone = (x) => ids.has(x) || unplace.has(x);
  sc.clusters = (sc.clusters ?? []).map((g) => (gone(g[0]) ? [] : g.filter((x) => !gone(x)))).filter((g) => g.length > 1);
  if (ids.has(sc.icon)) sc.icon = plan.elements.find((e) => e.size === 'large')?.id ?? plan.elements[0].id;
  replaceSceneConfig(text, id, sc);
}

// scene-config.json 是手排的格式：用 config-writer 只換掉這個場景那段（和自動擴展同一套寫法）
function replaceSceneConfig(text, id, sc) {
  const { world, order } = JSON.parse(text);
  fs.writeFileSync(P.config, upsertScene(text, id, sc, { world, order }));
}

function formatLayout(layout) {
  const lines = Object.entries(layout).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

function move(id, file) {
  const moves = readJson(path.resolve(file));
  const plan = readJson(P.plan(id));
  const zones = new Set(plan.zones.map((z) => z.id));
  for (const [x, zone] of Object.entries(moves)) {
    const el = plan.elements.find((e) => e.id === x);
    if (!el) throw new Error(`${id} 的規劃裡沒有 ${x}`);
    if (!zones.has(zone)) throw new Error(`${id} 沒有區域 ${zone}`);
    el.zone = zone;
  }
  writeJson(P.plan(id), plan);
  writeJson(P.manifest(id), planToManifest(plan));
  const ids = new Set(Object.keys(moves));
  cleanConfig(id, new Set(), ids);
  const layout = readJson(P.layout(id));
  fs.writeFileSync(P.layout(id), formatLayout(Object.fromEntries(Object.entries(layout).filter(([x]) => !ids.has(x)))));
  console.log(`${id}：${ids.size} 個物品換區域（位置清掉，重新擺放）`);
}

// 規劃裡已經沒有的物品，從 scene-config 清掉
function clean(id) {
  const has = new Set(readJson(P.plan(id)).elements.map((e) => e.id));
  const sc = readJson(P.config).scenes[id];
  const refs = [...Object.keys(sc.place ?? {}), ...Object.keys(sc.motion ?? {}), ...(sc.loose ?? []), ...(sc.noFlip ?? []), ...(sc.clusters ?? []).flat()];
  const gone = new Set(refs.filter((x) => !has.has(x)));
  cleanConfig(id, gone);
  console.log(`${id}：scene-config 清掉 ${gone.size} 個不存在的物品`);
}

function coverage() {
  const config = readJson(P.config);
  for (const id of config.order) {
    if (!config.scenes[id].terrain || !fs.existsSync(P.manifest(id))) continue;
    const items = sceneItems(id);
    const staged = fs.existsSync(P.stage(id)) ? stagedIds(readJson(P.stage(id))) : new Set();
    const n = items.filter((it) => staged.has(it.id)).length;
    console.log(`${id.padEnd(20)} ${String(n).padStart(3)} / ${String(items.length).padEnd(3)} ${n === items.length ? '✓' : ''}`);
  }
}

const [cmd, id, file] = process.argv.slice(2);
try {
  if (cmd === 'info') info(id);
  else if (cmd === 'retire') retire(id, file);
  else if (cmd === 'move') move(id, file);
  else if (cmd === 'clean') clean(id);
  else if (cmd === 'coverage') coverage();
  else throw new Error('用法：info <scene> | retire <scene> <file> | move <scene> <file> | coverage');
} catch (e) {
  console.error(`失敗：${e.message}`);
  process.exit(1);
}
