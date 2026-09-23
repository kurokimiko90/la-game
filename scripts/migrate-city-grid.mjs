// 一次性遷移：把自動擴展的街區整個平移，讓 slot 之間空出街道（docs/city-plan.md P3）。
// 每個街區（區域、地帶、地形、鎖定的物品位置）整塊一起移，街區內的相對位置不變；手畫的核心 4 個場景不動。
//   node scripts/migrate-city-grid.mjs          預覽要移多少
//   node scripts/migrate-city-grid.mjs --write  寫入（之後跑 npm run content:scenes）
// 舊格線：核心 3600×2600，slot 2600×1300 緊貼；新格線：slot 之間留 STREET_WIDTH（和 src/lib/city.ts 一致）。
import fs from 'node:fs';
import path from 'node:path';
import { upsertScene } from './lib/config-writer.mjs';
import { buildDistrict, STREET_WIDTH, worldSize } from './lib/district-kit.mjs';
import { formatLayout } from './lib/scene-source.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = {
  settings: path.join(ROOT, 'content', 'expansion.json'),
  config: path.join(ROOT, 'content', 'scene-config.json'),
  plans: path.join(ROOT, 'content', 'plans'),
  layouts: path.join(ROOT, 'content', 'layouts'),
};
const OLD = { coreW: 3600, slotW: 2600, slotH: 1300 };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, data) => fs.writeFileSync(f, `${JSON.stringify(data, null, 2)}\n`);

/** 舊 slot 左上角 → 平移量：左邊每一條縱向街、上面每一條橫向街各 STREET_WIDTH */
export function shiftFor(slot) {
  const col = slot.x < OLD.coreW ? 0 : 1 + (slot.x - OLD.coreW) / OLD.slotW;
  const row = slot.y / OLD.slotH;
  if (!Number.isInteger(col) || !Number.isInteger(row)) throw new Error(`slot ${slot.x},${slot.y} 不在舊格線上`);
  return { dx: col * STREET_WIDTH, dy: row * STREET_WIDTH };
}

const addY = (v, d) => (Array.isArray(v) ? v.map((n) => n + d) : v + d);

function shiftBandLike(b, { dx, dy }) {
  const out = { ...b };
  for (const k of ['top', 'bottom', 'base']) if (typeof b[k] === 'number') out[k] = b[k] + dy;
  for (const k of ['x0', 'x1']) if (typeof b[k] === 'number') out[k] = b[k] + dx;
  if (b.levels) out.levels = addY(b.levels, dy);
  if (b.gaps) out.gaps = b.gaps.map((g) => addY(g, dy));
  if (b.override) out.override = Object.fromEntries(Object.entries(b.override).map(([z, o]) => [z, shiftBandLike(o, { dx, dy })]));
  return out;
}

const shiftRect = (r, { dx, dy }) => ({ ...r, x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0 + dy, y1: r.y1 + dy });

function shiftTerrain(t, d) {
  return {
    ...shiftRect(t, d),
    zones: t.zones.map((z) => ({
      ...shiftRect(z, d),
      ...(z.wallBase ? { wallBase: z.wallBase + d.dy } : {}),
      ...(z.road ? { road: { y0: z.road.y0 + d.dy, y1: z.road.y1 + d.dy } } : {}),
      ...(z.track ? { track: { y0: z.track.y0 + d.dy, y1: z.track.y1 + d.dy } } : {}),
      ...(z.pool ? { pool: shiftRect(z.pool, d) } : {}),
    })),
  };
}

export function shiftSceneConfig(entry, d) {
  return {
    ...entry,
    zones: Object.fromEntries(Object.entries(entry.zones).map(([id, [x0, y0, x1, y1]]) => [id, [x0 + d.dx, y0 + d.dy, x1 + d.dx, y1 + d.dy]])),
    bands: Object.fromEntries(Object.entries(entry.bands).map(([id, b]) => [id, shiftBandLike(b, d)])),
    terrain: shiftTerrain(entry.terrain, d),
  };
}

function main() {
  const write = process.argv.includes('--write');
  const settings = readJson(P.settings);
  if (settings.grid?.street === STREET_WIDTH) return console.log('已經遷移過（expansion.json 的 grid.street），不重做');

  const config = readJson(P.config);
  const plans = fs.readdirSync(P.plans).map((f) => readJson(path.join(P.plans, f)));
  const moved = [];
  for (const plan of plans) {
    const d = shiftFor(plan.slot);
    const slot = { x: plan.slot.x + d.dx, y: plan.slot.y + d.dy };
    const entry = shiftSceneConfig(config.scenes[plan.id], d);
    // 檢查：平移後的幾何要和新 slot 重新算出來的一模一樣
    const fresh = buildDistrict({ slot, zones: plan.zones, elements: [], colorIndex: plan.colorIndex ?? 0 });
    for (const key of ['zones', 'bands', 'terrain']) {
      if (JSON.stringify(fresh[key]) !== JSON.stringify(entry[key])) throw new Error(`${plan.id}：平移後的 ${key} 和重算的不一致`);
    }
    const layoutFile = path.join(P.layouts, `${plan.id}.json`);
    const layout = readJson(layoutFile);
    const shifted = Object.fromEntries(Object.entries(layout).map(([id, p]) => [id, { ...p, x: p.x + d.dx, y: p.y + d.dy }]));
    moved.push({ plan: { ...plan, slot }, entry, layoutFile, layout: shifted, d });
    console.log(`${plan.id.padEnd(14)} (${plan.slot.x},${plan.slot.y}) → (${slot.x},${slot.y})  物品 ${Object.keys(layout).length}`);
  }

  const world = worldSize({ width: OLD.coreW, height: 2600 }, moved.map((m) => m.plan.slot));
  console.log(`地圖 ${config.world.width}×${config.world.height} → ${world.width}×${world.height}`);
  if (!write) return console.log('預覽而已；加 --write 寫入');

  let text = fs.readFileSync(P.config, 'utf8');
  for (const m of moved) {
    writeJson(path.join(P.plans, `${m.plan.id}.json`), m.plan);
    fs.writeFileSync(m.layoutFile, formatLayout(m.layout));
    text = upsertScene(text, m.plan.id, m.entry, { world, order: config.order });
  }
  fs.writeFileSync(P.config, text);
  const slots = settings.slots.map((s) => { const d = shiftFor(s); return { ...s, x: s.x + d.dx, y: s.y + d.dy }; });
  writeJson(P.settings, { ...settings, grid: { street: STREET_WIDTH }, slots });
  console.log('已寫入；接著跑 npm run content:scenes');
}

if (process.argv[1] === new URL(import.meta.url).pathname) main();
