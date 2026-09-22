#!/usr/bin/env node
// 自動擴展小鎮：每執行一次推進一步，由 miko-ws runtime 的 LaGameExpandScheduler 每 30 分鐘叫一次。
// 所有 LLM 工作（場景規劃、單字表）和 SVG 生成都交給 miko-ws；發音用本機 edge-tts。
//
//   node scripts/auto-expand.mjs              推進一步
//   node scripts/auto-expand.mjs --status     看目前狀態
//   node scripts/auto-expand.mjs --unblock    修好問題後，從卡住的步驟重來
//
// 流程：idle →（miko-ws codex 規劃 4 區 + 約 70 個物品）→ generating（miko-ws 生成 SVG，失敗的隔輪重排）
//       → integrating（同步 SVG、寫 scene-config、擺放、build、音檔、全部測試、commit）→ idle
// 任何一步失敗就停在 blocked，不會一直燒 LLM 額度；錯誤寫在 .auto-expand/state.json。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nextSlot, worldSize } from './lib/district-kit.mjs';
import { upsertScene } from './lib/config-writer.mjs';
import { codexText, ensureGenerator, jobProgress, registerJob, requeueFailed } from './lib/miko.mjs';
import {
  buildOutlinePrompt, buildZonePrompt, extractJson, parseOutline, planToManifest, planToSceneConfig, splitCount, validateElements, wordKey,
} from './lib/scene-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(ROOT, '.auto-expand');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOCK_FILE = path.join(STATE_DIR, 'lock');
const LOG_FILE = path.join(STATE_DIR, 'auto-expand.log');
const P = {
  settings: path.join(ROOT, 'content', 'expansion.json'),
  config: path.join(ROOT, 'content', 'scene-config.json'),
  manifests: path.join(ROOT, 'content', 'svg-manifests'),
  plans: path.join(ROOT, 'content', 'plans'),
  svg: path.join(ROOT, 'public', 'svg'),
  log: path.join(ROOT, 'docs', 'expansion.md'),
};
const ZONE_TRIES = 3;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

const loadState = () => (fs.existsSync(STATE_FILE) ? readJson(STATE_FILE) : { phase: 'idle', current: null, history: [] });
const saveState = (s) => writeJson(STATE_FILE, s);

function acquireLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8'));
    try { process.kill(pid, 0); return false; } catch { /* 前一次已結束，鎖是殘留的 */ }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  return true;
}

/** 跑一個指令，輸出寫到 .auto-expand/<name>.log；失敗就丟錯並附上最後幾行 */
function run(name, cmd, args) {
  const logFile = path.join(STATE_DIR, `${name}.log`);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' } });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  fs.writeFileSync(logFile, out);
  if (r.status !== 0) throw new Error(`${name} 失敗（${path.relative(ROOT, logFile)}）：\n${out.trim().split('\n').slice(-12).join('\n')}`);
  return out;
}

// ── 規劃（miko-ws codex）──────────────────────────────────────────────

function usedWords() {
  const used = { ids: new Set(), en: new Set(), zh: new Set() };
  for (const f of fs.readdirSync(P.manifests)) {
    for (const el of readJson(path.join(P.manifests, f)).elements) {
      used.ids.add(el.ref.itemId);
      used.en.add(wordKey(el.ref.words.en));
      used.zh.add(el.name);
    }
  }
  return used;
}

function pickTheme(settings, config) {
  const taken = new Set([...config.order, ...(fs.existsSync(P.plans) ? fs.readdirSync(P.plans).map((f) => path.basename(f, '.json')) : [])]);
  return settings.themes.find((t) => !taken.has(t.id)) ?? null;
}

function usedSlots() {
  if (!fs.existsSync(P.plans)) return [];
  return fs.readdirSync(P.plans).map((f) => readJson(path.join(P.plans, f)).slot);
}

async function planScene(theme, slot, colorIndex, settings) {
  const config = readJson(P.config);
  log(`規劃 ${theme.name}（${theme.id}），位置 ${slot.x},${slot.y}`);
  const outline = parseOutline(await codexText(buildOutlinePrompt({ theme, existingScenes: config.order.map((id) => config.scenes[id].name) })), { theme });
  log(`區域：${outline.zones.map((z) => `${z.name}(${z.indoor ? '室內' : '室外'}/${z.floor}/${z.feature})`).join('、')}`);

  const used = usedWords();
  const counts = splitCount(settings.itemsPerScene, outline.zones.length);
  const elements = [];
  const rejected = [];
  for (const [i, zone] of outline.zones.entries()) {
    let got = 0;
    for (let t = 0; t < ZONE_TRIES && got < counts[i]; t++) {
      const need = counts[i] - got;
      const prompt = buildZonePrompt({ sceneName: outline.name, zone, count: need, avoidEn: [...used.en], maxMotion: Math.max(1, Math.floor(need * 0.2)) });
      let list;
      try {
        list = extractJson(await codexText(prompt)).elements;
      } catch (e) {
        log(`  ${zone.name} 第 ${t + 1} 次解析失敗：${e.message}`);
        continue;
      }
      const result = validateElements((Array.isArray(list) ? list : []).slice(0, need), { zone, used });
      elements.push(...result.ok);
      rejected.push(...result.rejected.map((r) => ({ ...r, zone: zone.id })));
      got += result.ok.length;
    }
    log(`  ${zone.name}：${got}/${counts[i]} 個`);
  }
  if (elements.length < settings.minItems) throw new Error(`規劃只得到 ${elements.length} 個合格物品（至少要 ${settings.minItems}）`);

  const plan = { ...outline, slot, colorIndex, icon: (elements.find((e) => e.size === 'large') ?? elements[0]).id, elements, rejected, createdAt: new Date().toISOString() };
  writeJson(path.join(P.plans, `${plan.id}.json`), plan);
  const manifestFile = path.join(P.manifests, `${plan.id}.json`);
  writeJson(manifestFile, planToManifest(plan));
  registerJob({ sceneName: `語言小鎮・${plan.name}`, slug: `la-${plan.id}`, manifest: manifestFile });
  log(`規劃完成：${elements.length} 個物品（丟掉 ${rejected.length} 個不合格），已登記 miko-ws 生成`);
  return plan;
}

// ── 整合 ──────────────────────────────────────────────────────────────

function integrate(plan, settings) {
  run('sync-svg', process.execPath, ['scripts/sync-svg.mjs']);
  const dir = path.join(P.svg, plan.id);
  const available = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => path.basename(f, '.svg')) : [];
  if (available.length < settings.minItems) throw new Error(`${plan.id} 只有 ${available.length} 個 SVG（至少要 ${settings.minItems}）`);

  const text = fs.readFileSync(P.config, 'utf8');
  const config = JSON.parse(text);
  const order = config.order.includes(plan.id) ? config.order : [...config.order, plan.id];
  const world = worldSize(settings.core, usedSlots());
  fs.writeFileSync(P.config, upsertScene(text, plan.id, planToSceneConfig(plan, available), { world, order }));
  log(`scene-config：${plan.id}，${available.length} 個物件，地圖 ${world.width}×${world.height}`);

  run('layout', process.execPath, ['scripts/build-layout.mjs', plan.id]);
  run('build-scenes', process.execPath, ['scripts/build-scenes.mjs']);
  run('audio', process.execPath, ['scripts/build-audio.mjs']);
  run('unit-test', 'npx', ['vitest', 'run']);
  run('typecheck', 'npx', ['tsc', '--noEmit']);
  run('lint', 'npx', ['eslint']);
  run('e2e', 'npm', ['run', 'test:e2e']);
  return available.length;
}

function appendLog(plan, count, rounds) {
  const text = fs.readFileSync(P.log, 'utf8');
  const row = `| ${plan.name}（${plan.id}） | ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | ${count} | ${rounds} | 自動 |`;
  fs.writeFileSync(P.log, `${text.trimEnd()}\n${row}\n`);
}

function commit(plan, count, settings) {
  const branch = run('git-branch', 'git', ['branch', '--show-current']).trim();
  if (branch !== settings.branch) throw new Error(`目前在 ${branch}，自動擴展只 commit 到 ${settings.branch}`);
  run('git-add', 'git', ['add', 'content', 'public/svg', 'public/audio', 'src/data/scenes', 'docs/expansion.md']);
  run('git-commit', 'git', ['commit', '-m', `feat: add ${plan.name} district (${count} items)\n\nauto-expand：miko-ws 規劃與生成 SVG，edge-tts 發音。`]);
}

// ── 狀態機 ────────────────────────────────────────────────────────────

async function tick() {
  const settings = readJson(P.settings);
  const state = loadState();
  if (state.phase === 'blocked') {
    log(`卡住中（${state.blockedAt}）：${state.error.split('\n')[0]}。修好後跑 --unblock`);
    return;
  }

  if (state.phase === 'idle' || state.phase === 'planning') {
    const config = readJson(P.config);
    if (state.history.length >= settings.maxScenes) return log(`已完成 ${state.history.length} 個場景，達到上限 ${settings.maxScenes}`);
    const theme = state.current?.theme ?? pickTheme(settings, config);
    const slot = state.current?.slot ?? nextSlot(settings.slots, usedSlots());
    if (!theme || !slot) return log(theme ? '沒有空的 slot 了（content/expansion.json 加 slots）' : '主題用完了（content/expansion.json 加 themes）');
    saveState({ ...state, phase: 'planning', current: { theme, slot } });
    const plan = await planScene(theme, slot, usedSlots().length, settings);
    saveState({ ...state, phase: 'generating', current: { id: plan.id, slug: `la-${plan.id}`, rounds: 0, startedAt: new Date().toISOString() } });
    return;
  }

  const cur = state.current;
  if (state.phase === 'generating') {
    const p = jobProgress(cur.slug);
    if (p.pending > 0) {
      const pid = ensureGenerator(cur.generatorPid, path.join(STATE_DIR, 'miko-generator.log'));
      saveState({ ...state, current: { ...cur, generatorPid: pid } });
      return log(`${cur.id} 生成中：done ${p.done}、failed ${p.failed}、pending ${p.pending}`);
    }
    if (p.failed > 0 && cur.rounds < settings.maxRequeueRounds) {
      const n = requeueFailed(cur.slug, `語言小鎮・${readJson(path.join(P.plans, `${cur.id}.json`)).name}`);
      if (n < 0) return log(`${cur.id} 的 miko-ws 場景鎖被占用，下一輪再重排`);
      if (n > 0) {
        saveState({ ...state, current: { ...cur, rounds: cur.rounds + 1 } });
        return log(`${cur.id}：${n} 個生成失敗，退回重排（第 ${cur.rounds + 1} 輪）`);
      }
    }
    saveState({ ...state, phase: 'integrating' });
    log(`${cur.id} 生成結束：done ${p.done}、failed ${p.failed}，開始整合`);
    state.phase = 'integrating';
  }

  if (state.phase === 'integrating') {
    const plan = readJson(path.join(P.plans, `${cur.id}.json`));
    const count = integrate(plan, settings);
    appendLog(plan, count, cur.rounds);
    commit(plan, count, settings);
    saveState({ phase: 'idle', current: null, history: [...state.history, { id: plan.id, name: plan.name, items: count, doneAt: new Date().toISOString() }] });
    log(`完成 ${plan.name}：${count} 個物件，已 commit`);
  }
}

function printStatus() {
  const s = loadState();
  console.log(JSON.stringify({ phase: s.phase, current: s.current, error: s.error, done: s.history.map((h) => `${h.name}(${h.items})`) }, null, 2));
  if (s.current?.slug) {
    try { console.log('miko-ws：', jobProgress(s.current.slug)); } catch (e) { console.log(e.message); }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) return printStatus();
  if (args.includes('--unblock')) {
    const s = loadState();
    saveState({ ...s, phase: s.resumePhase ?? 'idle', error: undefined, blockedAt: undefined, resumePhase: undefined });
    return log(`解除卡住，回到 ${s.resumePhase ?? 'idle'}`);
  }
  if (!acquireLock()) return log('上一次還在跑，略過');
  try {
    await tick();
  } catch (e) {
    const s = loadState();
    saveState({ ...s, phase: 'blocked', resumePhase: s.phase, error: e.message, blockedAt: new Date().toISOString() });
    log(`失敗，停在 blocked：${e.message}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

main();
