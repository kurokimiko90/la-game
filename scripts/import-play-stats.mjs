#!/usr/bin/env node
// 匯入 /stats 頁匯出的遊玩紀錄 → .auto-expand/play-stats.json（不進 git），
// 玩家常找不到的物件（src/lib/playstats.ts 的 strugglingItems）列進待人工審清單（--status 看得到）。
// 匯出檔是那台裝置的累計紀錄，所以是取代、不是累加。
//
//   node --no-warnings scripts/import-play-stats.mjs <匯出的 json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlayStats, strugglingItems } from '../src/lib/playstats.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(ROOT, '.auto-expand');
export const PLAY_STATS_FILE = path.join(STATE_DIR, 'play-stats.json');
const QUEUE = path.join(STATE_DIR, 'review-queue.json');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('用法：node --no-warnings scripts/import-play-stats.mjs <匯出的 json>');
  process.exit(1);
}
const stats = parsePlayStats(JSON.parse(fs.readFileSync(file, 'utf8')));
const count = Object.keys(stats.items).length;
if (count === 0) {
  console.error(`${file} 沒有可用的紀錄（格式不對或是空的）`);
  process.exit(1);
}
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(PLAY_STATS_FILE, `${JSON.stringify(stats, null, 2)}\n`);

const scenes = [...new Set(Object.keys(stats.items).map((k) => k.split('/')[0]))];
const queue = fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, 'utf8')) : {};
const next = { ...queue };
for (const sceneId of scenes) {
  const players = strugglingItems(stats, sceneId);
  if (!players.length) continue;
  const entry = queue[sceneId] ?? { at: new Date().toISOString(), flagged: [], similar: [] };
  next[sceneId] = { ...entry, players };
  console.log(`${sceneId}：${players.map((p) => `${p.id}（${p.flag}）`).join('、')}`);
}
fs.writeFileSync(QUEUE, `${JSON.stringify(next, null, 2)}\n`);
console.log(`匯入 ${count} 個物件的紀錄 → ${path.relative(ROOT, PLAY_STATS_FILE)}`);
