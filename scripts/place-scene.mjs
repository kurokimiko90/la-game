#!/usr/bin/env node
// 按實際場景擺放一個自動擴展的街區（流程見 scripts/lib/placement.mjs），然後 build 場景資料。
//
//   npm run content:place -- bank                  補元素模式：舊物件不動，只安排還沒在情境裡的物件
//   npm run content:place -- bank --mode=restage   整個情境重新規劃、重排（物件位置會全部改變）
//
// 需要 miko-ws 指揮中心在跑（codex）。自動擴展整合時會自己跑同一套流程，這個指令是手動補救用。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codexText } from './lib/miko.mjs';
import { MODES, placeScene } from './lib/placement.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function node(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) throw new Error(`${script} 失敗：\n${out.trim()}`);
  process.stdout.write(out);
}

async function main() {
  const args = process.argv.slice(2);
  const sceneId = args.find((a) => !a.startsWith('--'));
  const mode = args.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) ?? 'topUp';
  if (!sceneId) throw new Error('用法：node scripts/place-scene.mjs <scene> [--mode=topUp|restage]');
  if (!MODES.includes(mode)) throw new Error(`--mode 只能是 ${MODES.join(' | ')}`);

  const planFile = path.join(ROOT, 'content', 'plans', `${sceneId}.json`);
  if (!fs.existsSync(planFile)) throw new Error(`沒有 content/plans/${sceneId}.json（只有自動擴展的街區能用）`);
  const plan = readJson(planFile);
  const terrain = readJson(path.join(ROOT, 'content', 'scene-config.json')).scenes[sceneId]?.terrain;
  if (plan.core || !terrain) throw new Error(`${sceneId} 沒有街區地形（手畫的核心場景用 rows / spots）`);
  const svgDir = path.join(ROOT, 'public', 'svg', sceneId);
  const available = fs.readdirSync(svgDir).filter((f) => f.endsWith('.svg')).map((f) => path.basename(f, '.svg'));

  const { staged } = await placeScene({
    plan, available, terrain, mode,
    stageFile: path.join(ROOT, 'content', 'stages', `${sceneId}.json`),
    ask: codexText,
    layout: (layoutArgs) => node('scripts/build-layout.mjs', [sceneId, ...layoutArgs]),
    log: (msg) => console.log(msg),
  });
  node('scripts/build-scenes.mjs', []);
  console.log(`${sceneId}：擺放完成（${staged ? '情境擺放' : '自動排列'}）。確認沒問題再 commit。`);
}

main().catch((e) => {
  console.error(`失敗：${e.message}`);
  process.exit(1);
});
