#!/usr/bin/env node
// 自動擴展小鎮：每執行一次推進一步，由 miko-ws runtime 的 LaGameExpandScheduler 每 30 分鐘叫一次。
// 全程不等排程：規劃完直接開始生成，生成器結束後自己接著叫 --after-generator 整合，commit 完直接開下一個；排程只負責啟動和保底。
// 所有 LLM 工作（場景規劃、單字表）和 SVG 生成都交給 miko-ws；發音用本機 edge-tts 打底，英語再換成 ChatGPT 的聲音（build-voice）。
//
//   node scripts/auto-expand.mjs              推進一步
//   node scripts/auto-expand.mjs --status     看目前狀態
//   node scripts/auto-expand.mjs --unblock    修好問題後，從卡住的步驟重來
//
// 流程：idle →（miko-ws codex 規劃 4 區 + itemsPerScene 個物品）→ generating（miko-ws 生成 SVG，失敗的隔輪重排）
//       → integrating（同步 SVG、寫 scene-config、擺放、build、音檔、全部測試、commit）→ idle
// 補元素（expansion.json 的 topUp）：idle 時先把舊街區每區補到 itemsPerScene 的平均數，走同一套 generating → integrating。
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
  zoneShortfall,
} from './lib/scene-plan.mjs';
import { buildStagePrompt, parseStage } from './lib/stage-plan.mjs';
import { localIso } from './lib/local-time.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const STATE_DIR = path.join(ROOT, '.auto-expand');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOCK_FILE = path.join(STATE_DIR, 'lock');
const LOG_FILE = path.join(STATE_DIR, 'auto-expand.log');
const P = {
  settings: path.join(ROOT, 'content', 'expansion.json'),
  config: path.join(ROOT, 'content', 'scene-config.json'),
  manifests: path.join(ROOT, 'content', 'svg-manifests'),
  plans: path.join(ROOT, 'content', 'plans'),
  stages: path.join(ROOT, 'content', 'stages'),
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
  const line = `[${localIso()}] ${msg}`;
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
  // 手畫核心場景的規劃（core: true）沒有 slot
  return fs.readdirSync(P.plans).map((f) => readJson(path.join(P.plans, f)).slot).filter(Boolean);
}

/** 一個區域問 codex 要 count 個物品（最多 ZONE_TRIES 次），驗證通過的收下。existing：街區裡已經有的物品（太像的會擋下） */
async function planZone({ sceneName, zone, count, used, spots, existing = [] }) {
  const elements = [];
  const rejected = [];
  for (let t = 0; t < ZONE_TRIES && elements.length < count; t++) {
    const need = count - elements.length;
    const prompt = buildZonePrompt({
      sceneName, zone, count: need, avoidEn: [...used.en], maxMotion: Math.max(1, Math.floor(need * 0.2)), spots, existing: [...existing, ...elements],
    });
    let list;
    try {
      list = extractJson(await codexText(prompt)).elements;
    } catch (e) {
      log(`  ${zone.name} 第 ${t + 1} 次解析失敗：${e.message}`);
      continue;
    }
    const result = validateElements((Array.isArray(list) ? list : []).slice(0, need), { zone, used, spots, related: [...existing, ...elements] });
    elements.push(...result.ok);
    rejected.push(...result.rejected.map((r) => ({ ...r, zone: zone.id })));
  }
  log(`  ${zone.name}：${elements.length}/${count} 個`);
  return { elements, rejected };
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
    const r = await planZone({ sceneName: outline.name, zone, count: counts[i], used, existing: elements });
    elements.push(...r.elements);
    rejected.push(...r.rejected);
  }
  if (elements.length < settings.minItems) throw new Error(`規劃只得到 ${elements.length} 個合格物品（至少要 ${settings.minItems}）`);

  const plan = { ...outline, slot, colorIndex, icon: (elements.find((e) => e.size === 'large') ?? elements[0]).id, elements, rejected, createdAt: localIso() };
  writeJson(path.join(P.plans, `${plan.id}.json`), plan);
  const manifestFile = path.join(P.manifests, `${plan.id}.json`);
  writeJson(manifestFile, planToManifest(plan));
  registerJob({ sceneName: `語言小鎮・${plan.name}`, slug: `la-${plan.id}`, manifest: manifestFile });
  log(`規劃完成：${elements.length} 個物品（丟掉 ${rejected.length} 個不合格），已登記 miko-ws 生成`);
  return plan;
}

// ── 補元素（已上線的街區）────────────────────────────────────────────
// 舊街區不重新生成：每個區域補到 itemsPerScene 的平均數，只生成新的物品，舊物品的 SVG 和位置都不動。
// 補的全放地上（空的是地板）。每個街區對同一個 itemsPerScene 只補一次（plan.topUp 記錄），補不滿也不重試。

const TOP_UP_SPOTS = ['ground'];

function availableSvgs(sceneId) {
  const dir = path.join(P.svg, sceneId);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => path.basename(f, '.svg')) : [];
}

/** 這個街區要補到幾個物品：規劃裡有 itemsTarget（手畫核心場景）就用它，否則用 expansion.json 的 itemsPerScene */
const targetOf = (plan, settings) => plan.itemsTarget ?? settings.itemsPerScene;

/** 需要補的街區（依地圖順序）：已上線、還沒照目前的 itemsPerScene 補過、有區域不到目標數 */
function topUpCandidates(settings) {
  if (!fs.existsSync(P.plans)) return [];
  const { order } = readJson(P.config);
  return order
    .filter((id) => fs.existsSync(path.join(P.plans, `${id}.json`)))
    .map((id) => readJson(path.join(P.plans, `${id}.json`)))
    .filter((plan) => plan.topUp?.itemsPerScene !== targetOf(plan, settings))
    .map((plan) => ({ plan, shortfall: zoneShortfall(plan, availableSvgs(plan.id), targetOf(plan, settings)) }))
    .filter(({ shortfall }) => shortfall.some((s) => s.need > 0));
}

/** @returns {Promise<number>} 規劃到的新物品數 */
async function planTopUp({ plan, shortfall }, settings) {
  log(`補元素 ${plan.name}（${plan.id}）：${shortfall.map((s) => `${s.zone.name} ${s.have}+${s.need}`).join('、')}`);
  const used = usedWords();
  const added = [];
  const rejected = [];
  for (const { zone, need } of shortfall.filter((s) => s.need > 0)) {
    const r = await planZone({ sceneName: plan.name, zone, count: need, used, spots: TOP_UP_SPOTS, existing: [...plan.elements, ...added] });
    added.push(...r.elements);
    rejected.push(...r.rejected);
  }
  const next = {
    ...plan,
    elements: [...plan.elements, ...added],
    rejected: [...(plan.rejected ?? []), ...rejected],
    topUp: { itemsPerScene: targetOf(plan, settings), added: added.length, at: localIso() },
  };
  writeJson(path.join(P.plans, `${plan.id}.json`), next);
  const manifestFile = path.join(P.manifests, `${plan.id}.json`);
  writeJson(manifestFile, planToManifest(next));
  // job 在第一次生成時就登記了；miko-ws 只會生成 manifest 裡還沒做過的物品
  registerJob({ sceneName: `語言小鎮・${plan.name}`, slug: `la-${plan.id}`, manifest: manifestFile });
  log(`補元素規劃完成：${added.length} 個新物品（丟掉 ${rejected.length} 個不合格）`);
  return added.length;
}

// ── 整合 ──────────────────────────────────────────────────────────────

/** ChatGPT 的聲音（先只做英語）：失敗不擋整合，edge-tts 底稿已經在了 */
function tryVoice(sceneId) {
  try {
    run('voice', process.execPath, ['scripts/build-voice.mjs', sceneId, '--lang=en']);
  } catch (e) {
    log(`ChatGPT 發音沒做成，保留 edge-tts：${e.message.split('\n')[0]}`);
  }
}

const STAGE_TRIES = 2;

/**
 * 情境規劃（新街區才做；補元素時保留原本的情境，新物品照舊自動排列）。
 * 問 codex → 修整 → 驗證，有問題帶著問題重問；還是不行就不用情境。寫到 content/stages/<scene>.json。
 */
async function planStage(plan, available, terrain) {
  let problems = [];
  for (let i = 0; i < STAGE_TRIES; i++) {
    try {
      const raw = await codexText(buildStagePrompt({ plan, available, problems }));
      const r = parseStage(raw, { plan, available, terrain });
      problems = r.problems;
      if (!problems.length) {
        fs.mkdirSync(P.stages, { recursive: true });
        writeJson(path.join(P.stages, `${plan.id}.json`), r.stage);
        log(`情境規劃完成${r.dropped.length ? `，${r.dropped.length} 個物品沒安排到（照舊自動排列）：${r.dropped.join('、')}` : ''}`);
        return true;
      }
    } catch (e) {
      problems = [e.message.split('\n')[0]];
    }
  }
  log(`情境規劃沒做成，照舊自動排列：${problems.slice(0, 3).join('；')}`);
  return false;
}

// 擺放：有情境時先試情境，排不下（被擋太多）就刪掉情境檔、照舊自動排列，不讓自動擴展卡住
function layoutWithFallback(sceneId, args) {
  try {
    run('layout', process.execPath, ['scripts/build-layout.mjs', sceneId, ...args]);
  } catch (e) {
    const file = path.join(P.stages, `${sceneId}.json`);
    if (!fs.existsSync(file)) throw e;
    log(`情境擺放排不下，改用自動排列：${e.message.split('\n')[0]}`);
    fs.rmSync(file);
    run('layout', process.execPath, ['scripts/build-layout.mjs', sceneId, ...args]);
  }
}

/**
 * 手畫核心場景補元素：scene-config 是手寫的（rows、spots、手調的地帶），不重寫；
 * 新物品在 manifest 裡、沒有鎖定位置，build-layout 只替它們在 ground 地帶找位置，舊物品不動。
 */
function integrateCore(plan, available) {
  log(`整合 ${plan.name}（手畫場景，只替新物品排位置）：${available.length} 個 SVG`);
  run('layout', process.execPath, ['scripts/build-layout.mjs', plan.id]);
  runChecks(plan.id);
  return available.length;
}

function runChecks(sceneId) {
  run('build-scenes', process.execPath, ['scripts/build-scenes.mjs']);
  run('audio', process.execPath, ['scripts/build-audio.mjs']);
  tryVoice(sceneId);
  run('unit-test', 'npx', ['vitest', 'run']);
  run('typecheck', 'npx', ['tsc', '--noEmit']);
  run('lint', 'npx', ['eslint']);
  run('e2e', 'npm', ['run', 'test:e2e']);
}

async function integrate(plan, settings, { topUp = false } = {}) {
  run('sync-svg', process.execPath, ['scripts/sync-svg.mjs']);
  const available = availableSvgs(plan.id);
  if (plan.core) return integrateCore(plan, available);
  if (available.length < settings.minItems) throw new Error(`${plan.id} 只有 ${available.length} 個 SVG（至少要 ${settings.minItems}）`);

  const text = fs.readFileSync(P.config, 'utf8');
  const config = JSON.parse(text);
  const order = config.order.includes(plan.id) ? config.order : [...config.order, plan.id];
  const world = worldSize(settings.core, usedSlots());
  fs.writeFileSync(P.config, upsertScene(text, plan.id, planToSceneConfig(plan, available), { world, order }));
  log(`scene-config：${plan.id}，${available.length} 個物件，地圖 ${world.width}×${world.height}`);

  // 新街區還沒上線，可以用情境重排（--reset）；補元素時只替新物品排位置
  const staged = !topUp && !fs.existsSync(path.join(P.stages, `${plan.id}.json`)) && await planStage(plan, available, readJson(P.config).scenes[plan.id].terrain);
  layoutWithFallback(plan.id, staged ? ['--reset'] : []);
  runChecks(plan.id);
  return available.length;
}

function appendLog(plan, count, rounds, note = '自動') {
  const text = fs.readFileSync(P.log, 'utf8');
  const row = `| ${plan.name}（${plan.id}） | ${localIso().slice(0, 16).replace('T', ' ')} | ${count} | ${rounds} | ${note} |`;
  fs.writeFileSync(P.log, `${text.trimEnd()}\n${row}\n`);
}

function commit(title, settings) {
  const branch = run('git-branch', 'git', ['branch', '--show-current']).trim();
  if (branch !== settings.branch) throw new Error(`目前在 ${branch}，自動擴展只 commit 到 ${settings.branch}`);
  run('git-add', 'git', ['add', 'content', 'public/svg', 'public/audio', 'src/data/scenes', 'docs/expansion.md']);
  run('git-commit', 'git', ['commit', '-m', `${title}\n\nauto-expand：miko-ws 規劃與生成 SVG；發音 edge-tts 底稿 + ChatGPT（英語）。`]);
}

// ── 狀態機 ────────────────────────────────────────────────────────────

/**
 * 推進一步。回傳 true 表示下一步不用等排程，可以馬上接著跑（規劃完 → 開始生成、重排失敗 → 重開生成、commit 完 → 下一個）。
 * afterGenerator：由生成器結束後的接續呼叫進來。
 */
async function tick({ afterGenerator = false } = {}) {
  const settings = readJson(P.settings);
  const state = loadState();
  if (state.phase === 'blocked') {
    log(`卡住中（${state.blockedAt}）：${state.error.split('\n')[0]}。修好後跑 --unblock`);
    return;
  }

  if (state.phase === 'idle' || state.phase === 'planning') {
    // 先補舊街區，再開新場景（正在規劃的新場景不打斷）
    const candidates = settings.topUp && !state.current?.theme ? topUpCandidates(settings) : [];
    const topUp = candidates.find((c) => c.plan.id === state.current?.id) ?? candidates[0];
    if (topUp) {
      const { id } = topUp.plan;
      saveState({ ...state, phase: 'planning', current: { id, topUp: true } });
      if (!(await planTopUp(topUp, settings))) {
        saveState({ ...state, phase: 'idle', current: null });
        log(`${id} 沒有補到合格的物品，略過`);
        return true;
      }
      saveState({ ...state, phase: 'generating', current: { id, slug: `la-${id}`, rounds: 0, startedAt: localIso(), topUp: true } });
      return true;
    }
    const config = readJson(P.config);
    if (state.history.length >= settings.maxScenes) return log(`已完成 ${state.history.length} 個場景，達到上限 ${settings.maxScenes}`);
    const theme = state.current?.theme ?? pickTheme(settings, config);
    const slot = state.current?.slot ?? nextSlot(settings.slots, usedSlots(), theme?.zone);
    if (!theme || !slot) return log(theme ? '沒有空的 slot 了（content/expansion.json 加 slots）' : '主題用完了（content/expansion.json 加 themes）');
    saveState({ ...state, phase: 'planning', current: { theme, slot } });
    const plan = await planScene(theme, slot, usedSlots().length, settings);
    saveState({ ...state, phase: 'generating', current: { id: plan.id, slug: `la-${plan.id}`, rounds: 0, startedAt: localIso() } });
    return true;
  }

  const cur = state.current;
  if (state.phase === 'generating') {
    const p = jobProgress(cur.slug);
    if (p.pending > 0) {
      // 生成器正常結束時 pending 應該是 0；還有 pending 代表它中途掛了，不在這裡重開，免得一直重啟
      if (afterGenerator) return log(`${cur.id} 生成器結束但還有 ${p.pending} 個 pending，等下一次排程再開`);
      const pid = ensureGenerator(cur.generatorPid, path.join(STATE_DIR, 'miko-generator.log'), [SELF, '--after-generator']);
      saveState({ ...state, current: { ...cur, generatorPid: pid } });
      return log(`${cur.id} 生成中：done ${p.done}、failed ${p.failed}、pending ${p.pending}`);
    }
    if (p.failed > 0 && cur.rounds < settings.maxRequeueRounds) {
      const n = requeueFailed(cur.slug, `語言小鎮・${readJson(path.join(P.plans, `${cur.id}.json`)).name}`);
      if (n < 0) return log(`${cur.id} 的 miko-ws 場景鎖被占用，下一輪再重排`);
      if (n > 0) {
        saveState({ ...state, current: { ...cur, rounds: cur.rounds + 1 } });
        log(`${cur.id}：${n} 個生成失敗，退回重排（第 ${cur.rounds + 1} 輪）`);
        return true;
      }
    }
    saveState({ ...state, phase: 'integrating' });
    log(`${cur.id} 生成結束：done ${p.done}、failed ${p.failed}，開始整合`);
    state.phase = 'integrating';
  }

  if (state.phase === 'integrating') {
    const plan = readJson(path.join(P.plans, `${cur.id}.json`));
    const layoutFile = path.join(ROOT, 'content', 'layouts', `${plan.id}.json`);
    const before = cur.topUp && fs.existsSync(layoutFile) ? Object.keys(readJson(layoutFile)).length : 0;
    const count = await integrate(plan, settings, { topUp: Boolean(cur.topUp) });
    if (cur.topUp) {
      appendLog(plan, count, cur.rounds, `補元素 +${count - before}`);
      commit(`feat: add ${count - before} items to ${plan.name} district (${count} total)`, settings);
      const history = state.history.map((h) => (h.id === plan.id ? { ...h, items: count, toppedUpAt: localIso() } : h));
      saveState({ phase: 'idle', current: null, history });
      log(`補完 ${plan.name}：+${count - before}，共 ${count} 個物件，已 commit`);
      return true;
    }
    appendLog(plan, count, cur.rounds);
    commit(`feat: add ${plan.name} district (${count} items)`, settings);
    saveState({ phase: 'idle', current: null, history: [...state.history, { id: plan.id, name: plan.name, items: count, doneAt: localIso() }] });
    log(`完成 ${plan.name}：${count} 個物件，已 commit`);
    return true;
  }
}

function printStatus() {
  const s = loadState();
  console.log(JSON.stringify({ phase: s.phase, current: s.current, error: s.error, done: s.history.map((h) => `${h.name}(${h.items})`) }, null, 2));
  const settings = readJson(P.settings);
  const topUp = topUpCandidates(settings).map(({ plan, shortfall }) => `${plan.name} +${shortfall.reduce((n, x) => n + x.need, 0)}`);
  if (topUp.length) console.log(`待補元素（目標 ${settings.itemsPerScene} 個、手畫場景看各自的 itemsTarget，topUp ${settings.topUp ? '開' : '關'}）：${topUp.join('、')}`);
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
    let afterGenerator = args.includes('--after-generator');
    while (await tick({ afterGenerator })) afterGenerator = false;
  } catch (e) {
    const s = loadState();
    saveState({ ...s, phase: 'blocked', resumePhase: s.phase, error: e.message, blockedAt: localIso() });
    log(`失敗，停在 blocked：${e.message}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

main();
