#!/usr/bin/env node
// 自動擴展小鎮：每執行一次推進一步，由 miko-ws runtime 的 LaGameExpandScheduler 每 30 分鐘叫一次。
// 全程不等排程：規劃完直接開始生成，生成器結束後自己接著叫 --after-generator 整合，commit 完直接開下一個；排程只負責啟動和保底。
// 所有 LLM 工作（場景規劃、單字表）和 SVG 生成都交給 miko-ws；發音用本機 edge-tts 打底，英語再換成 ChatGPT 的聲音（build-voice）。
//
//   node scripts/auto-expand.mjs              推進一步
//   node scripts/auto-expand.mjs --status     看目前狀態
//   node scripts/auto-expand.mjs --unblock    修好問題後，從卡住的步驟重來
//   node scripts/auto-expand.mjs --restage <scene> [--slot=x,y]   已上線的街區改成佔兩格、情境重排（物件位置會變）
//
// 流程：idle →（miko-ws codex 規劃 4 區 + itemsPerScene 個物品）→ generating（miko-ws 生成 SVG，失敗的隔輪重排）
//       → integrating（同步 SVG、寫 scene-config、擺放、build、音檔、全部測試、commit）→ idle
// 補元素（expansion.json 的 topUp）：idle 時先把舊街區每區補到 itemsPerScene 的平均數，走同一套 generating → integrating。
// 失敗不會一直停著（scripts/lib/recovery.mjs）：物品不夠就跳過這個主題；其他錯誤停在 blocked、退避後自動重試；
// 整合連續失敗幾次就放棄這個場景（改到一半的檔案收進 git stash）。錯誤和跳過紀錄在 .auto-expand/state.json。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cellsOf, nextSlot, worldSize } from './lib/district-kit.mjs';
import { upsertScene } from './lib/config-writer.mjs';
import { codexText, ensureGenerator, jobProgress, registerJob, requeueFailed } from './lib/miko.mjs';
import {
  buildOutlinePrompt, buildZonePrompt, extractJson, parseOutline, planToManifest, planToSceneConfig, preferNewWords, splitCount, validateElements, wordKey,
  zoneShortfall,
} from './lib/scene-plan.mjs';
import { placeScene } from './lib/placement.mjs';
import { localIso } from './lib/local-time.mjs';
import { idleNotice, isSkipped, onFailure, resumeIfDue } from './lib/recovery.mjs';
import { MAX_REJECT_RATIO, applyReview, buildReviewPrompt } from './lib/vocab-review.mjs';
import { buildVenuePrompt, parseVenue } from '../src/lib/venue.ts';
import { isLockError, lockAction } from './lib/git-lock.mjs';
import { buildDiagnosisPrompt, diagnosisReport, markDiagnosed, notifyTelegram, relatedLogs, shouldDiagnose, telegramSummary } from './lib/diagnose.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const STATE_DIR = path.join(ROOT, '.auto-expand');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOCK_FILE = path.join(STATE_DIR, 'lock');
const LOG_FILE = path.join(STATE_DIR, 'auto-expand.log');
const REVIEW_QUEUE = path.join(STATE_DIR, 'review-queue.json');
// commit 後等試玩伺服器換上新版再做構圖審查（scripts/reload-play.mjs 讀這份清單）
// 整合失敗的診斷報告（scripts/lib/diagnose.mjs）
const DIAGNOSIS_DIR = path.join(STATE_DIR, 'diagnosis');
const LAYOUT_PENDING = path.join(STATE_DIR, 'layout-pending.json');
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
const OVERSAMPLE = 1.5;
const GIT_TRIES = 6;
const GIT_WAIT_MS = 5000;

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

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function lockState() {
  const file = path.resolve(ROOT, run('git-path', 'git', ['rev-parse', '--git-path', 'index.lock']).trim());
  const gitRunning = spawnSync('pgrep', ['-x', 'git']).status === 0;
  try {
    return { file, exists: true, ageMs: Date.now() - fs.statSync(file).mtimeMs, gitRunning };
  } catch {
    return { file, exists: false, ageMs: 0, gitRunning };
  }
}

/** git 指令；index.lock 被占用時等一下重試，殘留的鎖（沒有 git 在跑、放超過 10 分鐘）直接刪掉（scripts/lib/git-lock.mjs） */
function git(name, args) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return run(name, 'git', args);
    } catch (e) {
      if (!isLockError(e.message) || attempt >= GIT_TRIES) throw e;
      const lock = lockState();
      const action = lockAction(lock);
      if (action === 'remove') {
        fs.rmSync(lock.file, { force: true });
        log(`刪掉殘留的 index.lock（${Math.round(lock.ageMs / 60e3)} 分鐘前留下、沒有 git 在跑）`);
      } else if (action === 'wait') {
        sleepSync(GIT_WAIT_MS);
      }
      log(`git ${args[0]} 撞到 index.lock，第 ${attempt} 次重試`);
    }
  }
}

// ── 規劃（miko-ws codex）──────────────────────────────────────────────

/**
 * 已用掉的 id（整張地圖唯一）和單字（只在同一個街區內不能重複；不同街區可以有同樣的東西）。
 * town：全鎮已有的單字（不擋，只是讓新詞優先）。sceneElements：這個街區已經有的物品。
 */
function usedWords(sceneElements = []) {
  const used = { ids: new Set(), en: new Set(), zh: new Set(), renamed: new Map(), town: new Map() };
  for (const f of fs.readdirSync(P.manifests)) {
    for (const el of readJson(path.join(P.manifests, f)).elements) {
      used.ids.add(el.ref.itemId);
      used.town.set(wordKey(el.ref.words.en), el.ref.words.en);
    }
  }
  for (const el of sceneElements) {
    used.en.add(wordKey(el.en));
    used.zh.add(el.zh);
  }
  return used;
}

function pickTheme(settings, config, state) {
  const taken = new Set([...config.order, ...(fs.existsSync(P.plans) ? fs.readdirSync(P.plans).map((f) => path.basename(f, '.json')) : [])]);
  return settings.themes.find((t) => !taken.has(t.id) && !isSkipped(state, t.id, 'theme') && !isSkipped(state, t.id, 'scene')) ?? null;
}

function usedSlots() {
  if (!fs.existsSync(P.plans)) return [];
  // 手畫核心場景的規劃（core: true）沒有 slot
  return fs.readdirSync(P.plans).map((f) => readJson(path.join(P.plans, f)).slot).filter(Boolean);
}

/**
 * 一個區域問 codex 要 count 個物品（最多 ZONE_TRIES 次），驗證通過的收下。existing：街區裡已經有的物品（太像的會擋下）。
 * 多要一半，全鎮還沒有的單字先收，不夠才用別的街區已有的。
 */
async function planZone({ sceneId, sceneName, zone, count, used, spots, existing = [] }) {
  const elements = [];
  const rejected = [];
  for (let t = 0; t < ZONE_TRIES && elements.length < count; t++) {
    const need = count - elements.length;
    const prompt = buildZonePrompt({
      sceneName, zone, count: Math.ceil(need * OVERSAMPLE), avoidEn: [], townEn: [...used.town.values()], maxMotion: Math.max(1, Math.floor(need * 0.2)), spots, existing: [...existing, ...elements],
    });
    let list;
    try {
      list = extractJson(await codexText(prompt)).elements;
    } catch (e) {
      log(`  ${zone.name} 第 ${t + 1} 次解析失敗：${e.message}`);
      continue;
    }
    const candidates = preferNewWords(Array.isArray(list) ? list : [], new Set(used.town.keys()));
    const result = validateElements(candidates, { zone, used, spots, related: [...existing, ...elements], sceneId, limit: need });
    elements.push(...result.ok);
    rejected.push(...result.rejected.map((r) => ({ ...r, zone: zone.id })));
  }
  const fresh = elements.filter((e) => !used.town.has(wordKey(e.en))).length;
  log(`  ${zone.name}：${elements.length}/${count} 個（新詞 ${fresh}）`);
  return { elements, rejected };
}

/** 不合格原因統計（「英文重複 12、和已有的 x 太像 5」），失敗時寫進 log 才查得到為什麼 */
function summarizeRejected(rejected) {
  const counts = new Map();
  for (const { reason } of rejected) {
    const key = reason.startsWith('和已有的') ? '和已有的物品太像' : reason;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('、') || '（codex 沒回物品）';
}

/**
 * 單字審核（scripts/lib/vocab-review.mjs）：格式驗證過的物品再請 codex 當語言老師審一次，有修正就套用、改不好的丟掉。
 * 審核本身失敗（連不上、回的不是 JSON）就照原樣放行，不擋流程。
 */
async function reviewVocab(sceneName, elements, zoneList = []) {
  if (!elements.length) return { ok: elements, fixed: [], rejected: [] };
  try {
    const zones = Object.fromEntries(zoneList.map((z) => [z.id, z.name]));
    const { items } = extractJson(await codexText(buildReviewPrompt({ sceneName, elements, zones })));
    const r = applyReview(elements, items);
    if (r.unreliable) log(`單字審核想丟掉的超過 ${MAX_REJECT_RATIO * 100}%，當作審核不可靠：不丟物品，只套用修正`);
    log(`單字審核：${elements.length} 個，修正 ${r.fixed.length}、丟掉 ${r.rejected.length}${r.rejected.length ? `（${r.rejected.map((x) => `${x.id} ${x.reason}`).join('、').slice(0, 300)}）` : ''}`);
    return r;
  } catch (e) {
    log(`單字審核沒做成，照原樣放行：${e.message.split('\n')[0]}`);
    return { ok: elements, fixed: [], rejected: [] };
  }
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
    const r = await planZone({ sceneId: outline.id, sceneName: outline.name, zone, count: counts[i], used, existing: elements });
    elements.push(...r.elements);
    rejected.push(...r.rejected);
  }
  const review = await reviewVocab(outline.name, elements, outline.zones);
  elements.splice(0, elements.length, ...review.ok);
  rejected.push(...review.rejected);
  if (elements.length < settings.minItems) {
    log(`不合格原因：${summarizeRejected(rejected)}`);
    throw Object.assign(new Error(`規劃只得到 ${elements.length} 個合格物品（至少要 ${settings.minItems}）`), { skippable: true });
  }

  const plan = {
    ...outline, slot, colorIndex, icon: (elements.find((e) => e.size === 'large') ?? elements[0]).id, elements, rejected, reviewFixes: review.fixed, createdAt: localIso(),
  };
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
function topUpCandidates(settings, state = loadState()) {
  if (!fs.existsSync(P.plans)) return [];
  const { order } = readJson(P.config);
  return order
    .filter((id) => fs.existsSync(path.join(P.plans, `${id}.json`)) && !isSkipped(state, id, 'topUp'))
    .map((id) => readJson(path.join(P.plans, `${id}.json`)))
    .filter((plan) => plan.topUp?.itemsPerScene !== targetOf(plan, settings))
    .map((plan) => ({ plan, shortfall: zoneShortfall(plan, availableSvgs(plan.id), targetOf(plan, settings)) }))
    .filter(({ shortfall }) => shortfall.some((s) => s.need > 0));
}

/** @returns {Promise<number>} 規劃到的新物品數 */
async function planTopUp({ plan, shortfall }, settings) {
  log(`補元素 ${plan.name}（${plan.id}）：${shortfall.map((s) => `${s.zone.name} ${s.have}+${s.need}`).join('、')}`);
  const used = usedWords(plan.elements);
  const added = [];
  const rejected = [];
  for (const { zone, need } of shortfall.filter((s) => s.need > 0)) {
    const r = await planZone({ sceneId: plan.id, sceneName: plan.name, zone, count: need, used, spots: TOP_UP_SPOTS, existing: [...plan.elements, ...added] });
    added.push(...r.elements);
    rejected.push(...r.rejected);
  }
  const review = await reviewVocab(plan.name, added, plan.zones ?? []);
  added.splice(0, added.length, ...review.ok);
  rejected.push(...review.rejected);
  const next = {
    ...plan,
    elements: [...plan.elements, ...added],
    rejected: [...(plan.rejected ?? []), ...rejected],
    reviewFixes: [...(plan.reviewFixes ?? []), ...review.fixed],
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

/**
 * 品質檢查（scripts/review-scene.mjs）：渲染檢查 + 自動試玩（點不點得到、手機上多大）+ 看圖驗收（codex 附圖），
 * 結果進待人工審清單（--status 看得到）。構圖審查要新版的試玩伺服器，排進 layout-pending，reload-play 換版後做。只標記、不擋 commit：看圖驗收 2026-10-01 在 gym 校準約七成五準，還不夠自動決定。
 */
function qualityReview(sceneId) {
  try {
    run('review', process.execPath, ['--no-warnings', 'scripts/review-scene.mjs', sceneId, '--no-layout']);
    const pending = fs.existsSync(LAYOUT_PENDING) ? readJson(LAYOUT_PENDING) : [];
    writeJson(LAYOUT_PENDING, [...new Set([...pending, sceneId])]);
    const q = readJson(REVIEW_QUEUE)[sceneId];
    log(`品質檢查 ${sceneId}：標記 ${q.flagged.length} 個${q.flagged.length ? `（${q.flagged.map((f) => f.id).join('、').slice(0, 200)}）` : ''}、長得太像 ${q.similar.length} 組，已列入待人工審`);
  } catch (e) {
    log(`品質檢查沒做成：${e.message.split('\n')[0]}`);
  }
}

function runChecks(sceneId) {
  run('build-scenes', process.execPath, ['scripts/build-scenes.mjs']);
  run('audio', process.execPath, ['scripts/build-audio.mjs']);
  tryVoice(sceneId);
  run('unit-test', 'npx', ['vitest', 'run']);
  run('typecheck', 'npx', ['tsc', '--noEmit']);
  run('lint', 'npx', ['eslint']);
  run('e2e', 'npm', ['run', 'test:e2e']);
  qualityReview(sceneId);
}

/**
 * 場所結構（src/lib/venue.ts）：新街區沒有手畫的 VENUE_PLANS，請 codex 挑牆面材質和各區地面圖案，存進 plan.venue。
 * codex 失敗或回的不合法就用預設（parseVenue 一定回得出結果），不擋整合。
 */
async function planVenue(plan) {
  const zones = plan.zones.map((z) => ({ id: z.id, name: z.name, indoor: Boolean(z.indoor) }));
  let raw = '';
  try {
    raw = await codexText(buildVenuePrompt(plan.name, zones));
  } catch (e) {
    log(`場所結構沒問到，用預設：${e.message.split('\n')[0]}`);
  }
  const next = { ...plan, venue: parseVenue(raw, zones) };
  writeJson(path.join(P.plans, `${plan.id}.json`), next);
  log(`場所結構 ${plan.name}：${next.venue.wall}，${Object.entries(next.venue.zones).map(([z, m]) => `${z}=${m.join('+')}`).join('、')}`);
  return next;
}

async function integrate(plan, settings, { topUp = false, restage = false } = {}) {
  run('sync-svg', process.execPath, ['scripts/sync-svg.mjs']);
  const available = availableSvgs(plan.id);
  if (plan.core) return integrateCore(plan, available);
  if (available.length < settings.minItems) throw new Error(`${plan.id} 只有 ${available.length} 個 SVG（至少要 ${settings.minItems}）`);

  if (!topUp && !restage && !plan.venue) plan = await planVenue(plan);
  const text = fs.readFileSync(P.config, 'utf8');
  const config = JSON.parse(text);
  const order = config.order.includes(plan.id) ? config.order : [...config.order, plan.id];
  const world = worldSize(settings.core, usedSlots());
  fs.writeFileSync(P.config, upsertScene(text, plan.id, planToSceneConfig(plan, available), { world, order }));
  log(`scene-config：${plan.id}，${available.length} 個物件，地圖 ${world.width}×${world.height}`);

  // 按實際場景擺放（scripts/lib/placement.mjs）：新街區、重排整個規劃情境再 --reset；補元素只安排新物品，舊的不動
  await placeScene({
    plan, available, terrain: readJson(P.config).scenes[plan.id].terrain,
    mode: topUp ? 'topUp' : restage ? 'restage' : 'new',
    stageFile: path.join(P.stages, `${plan.id}.json`),
    ask: codexText,
    layout: (args) => run('layout', process.execPath, ['scripts/build-layout.mjs', plan.id, ...args]),
    log,
  });
  runChecks(plan.id);
  return available.length;
}

/**
 * 已上線的街區改成佔兩格（可以順便搬到 --slot=x,y），刪掉舊情境、重新規劃情境並 --reset 重排，整合、commit。
 * 物件位置會全部改變，只給擺放出問題、剛上線的街區用。失敗不動自動擴展的狀態，改到一半的檔案留著看。
 */
async function restage(sceneId, slotArg) {
  const settings = readJson(P.settings);
  const file = path.join(P.plans, `${sceneId ?? ''}.json`);
  if (!sceneId || !fs.existsSync(file)) throw new Error(`沒有 content/plans/${sceneId}.json`);
  const plan = readJson(file);
  if (plan.core || !plan.slot) throw new Error(`${sceneId} 是手畫的核心場景，不能 restage`);
  const [x, y] = slotArg ? slotArg.split(',').map(Number) : [plan.slot.x, plan.slot.y];
  const key = (s) => `${s.x},${s.y}`;
  const listed = new Map(settings.slots.map((s) => [key(s), s]));
  const taken = new Set(usedSlots().filter((s) => key(s) !== key(plan.slot)).flatMap(cellsOf).map(key));
  const cells = cellsOf({ x, y, span: 2 });
  const bad = cells.find((c) => !listed.has(key(c)) || taken.has(key(c)));
  if (bad) throw new Error(`${key(bad)} 不是空的 slot，${plan.name} 不能佔 ${key(cells[0])} 和 ${key(cells[1])}`);

  const next = { ...plan, slot: { ...listed.get(key(cells[0])), span: 2 } };
  writeJson(file, next);
  fs.rmSync(path.join(P.stages, `${sceneId}.json`), { force: true });
  log(`restage ${plan.name}：改成佔兩格（${key(cells[0])}、${key(cells[1])}），情境重排`);
  const count = await integrate(next, settings, { restage: true });
  commit(`feat: widen ${next.name} district to two slots and restage (${count} items)`, settings, logRow(next, count, 0, '改成兩格、情境重排'));
  log(`restage ${plan.name} 完成，已 commit`);
}

/** docs/expansion.md 第 5 節的一筆紀錄 */
function logRow(plan, count, rounds, note = '自動') {
  return `| ${plan.name}（${plan.id}） | ${localIso().slice(0, 16).replace('T', ' ')} | ${count} | ${rounds} | ${note} |`;
}

/** 紀錄寫進 docs/expansion.md 再 commit；commit 失敗就把紀錄拿掉，重試時才不會一筆變多筆 */
function commit(title, settings, row) {
  const branch = run('git-branch', 'git', ['branch', '--show-current']).trim();
  if (branch !== settings.branch) throw new Error(`目前在 ${branch}，自動擴展只 commit 到 ${settings.branch}`);
  const before = fs.readFileSync(P.log, 'utf8');
  fs.writeFileSync(P.log, `${before.trimEnd()}\n${row}\n`);
  try {
    git('git-add', ['add', ...COMMIT_PATHS]);
    git('git-commit', ['commit', '-m', `${title}\n\nauto-expand：miko-ws 規劃與生成 SVG；發音 edge-tts 底稿 + ChatGPT（英語）。`]);
  } catch (e) {
    fs.writeFileSync(P.log, before);
    throw e;
  }
  reloadPlay();
}

/** 試玩伺服器（3220）在背景重新 build + 重啟，新場景馬上看得到；不等它、失敗也不擋（紀錄在 .auto-expand/play.log） */
function reloadPlay() {
  spawn(process.execPath, ['scripts/reload-play.mjs'], { cwd: ROOT, stdio: 'ignore', detached: true }).unref();
  log('試玩伺服器背景重新 build 中（http://localhost:3220）');
}

// ── 狀態機 ────────────────────────────────────────────────────────────

/** 閒置原因只在第一次（或換了原因）記 log，排程每 30 分鐘叫一次不會洗版 */
function logIdle(state, reason) {
  const notice = idleNotice(state, reason);
  if (!notice.changed) return;
  saveState(notice.state);
  log(`${reason}（之後同樣的原因不再記）`);
}

/**
 * 推進一步。回傳 true 表示下一步不用等排程，可以馬上接著跑（規劃完 → 開始生成、重排失敗 → 重開生成、commit 完 → 下一個）。
 * afterGenerator：由生成器結束後的接續呼叫進來。
 */
async function tick({ afterGenerator = false } = {}) {
  const settings = readJson(P.settings);
  const loaded = loadState();
  const state = resumeIfDue(loaded, Date.now());
  if (!state) {
    log(`等重試（第 ${loaded.attempts ?? 1} 次失敗，${localIso(new Date(loaded.retryAt))} 再試）：${loaded.error.split('\n')[0]}`);
    return;
  }
  if (state !== loaded) {
    saveState(state);
    log(`重試 ${state.phase}（之前失敗 ${state.attempts ?? 1} 次）`);
  }

  if (state.phase === 'idle' || state.phase === 'planning') {
    // 先補舊街區，再開新場景（正在規劃的新場景不打斷）
    const candidates = settings.topUp && !state.current?.theme ? topUpCandidates(settings, state) : [];
    const topUp = candidates.find((c) => c.plan.id === state.current?.id) ?? candidates[0];
    if (topUp) {
      const { id } = topUp.plan;
      saveState({ ...state, phase: 'planning', current: { id, topUp: true }, idleReason: undefined });
      if (!(await planTopUp(topUp, settings))) {
        saveState({ ...state, phase: 'idle', current: null });
        log(`${id} 沒有補到合格的物品，略過`);
        return true;
      }
      saveState({ ...state, phase: 'generating', attempts: undefined, current: { id, slug: `la-${id}`, rounds: 0, startedAt: localIso(), topUp: true } });
      return true;
    }
    const config = readJson(P.config);
    if (state.history.length >= settings.maxScenes) return logIdle(state, `已完成 ${state.history.length} 個場景，達到上限 ${settings.maxScenes}`);
    const theme = state.current?.theme ?? pickTheme(settings, config, state);
    // 物品多（itemsPerScene 超過 wideAbove）的街區佔兩格；找不到相鄰的兩格就退回一格
    const span = settings.itemsPerScene > (settings.wideAbove ?? Infinity) ? 2 : 1;
    const slot = state.current?.slot ?? nextSlot(settings.slots, usedSlots(), theme?.zone, span) ?? nextSlot(settings.slots, usedSlots(), theme?.zone);
    if (!theme || !slot) return logIdle(state, theme ? '沒有空的 slot 了（content/expansion.json 加 slots）' : '主題用完了（content/expansion.json 加 themes）');
    saveState({ ...state, phase: 'planning', current: { theme, slot }, idleReason: undefined });
    const plan = await planScene(theme, slot, usedSlots().length, settings);
    saveState({ ...state, phase: 'generating', attempts: undefined, current: { id: plan.id, slug: `la-${plan.id}`, rounds: 0, startedAt: localIso() } });
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
    saveState({ ...state, phase: 'integrating', attempts: undefined });
    log(`${cur.id} 生成結束：done ${p.done}、failed ${p.failed}，開始整合`);
    state.phase = 'integrating';
  }

  if (state.phase === 'integrating') {
    const plan = readJson(path.join(P.plans, `${cur.id}.json`));
    const layoutFile = path.join(ROOT, 'content', 'layouts', `${plan.id}.json`);
    const before = cur.topUp && fs.existsSync(layoutFile) ? Object.keys(readJson(layoutFile)).length : 0;
    const count = await integrate(plan, settings, { topUp: Boolean(cur.topUp) });
    if (cur.topUp) {
      commit(`feat: add ${count - before} items to ${plan.name} district (${count} total)`, settings, logRow(plan, count, cur.rounds, `補元素 +${count - before}`));
      const history = state.history.map((h) => (h.id === plan.id ? { ...h, items: count, toppedUpAt: localIso() } : h));
      saveState({ ...state, phase: 'idle', current: null, attempts: undefined, history });
      log(`補完 ${plan.name}：+${count - before}，共 ${count} 個物件，已 commit`);
      return true;
    }
    commit(`feat: add ${plan.name} district (${count} items)`, settings, logRow(plan, count, cur.rounds));
    saveState({ ...state, phase: 'idle', current: null, attempts: undefined, history: [...state.history, { id: plan.id, name: plan.name, items: count, doneAt: localIso() }] });
    log(`完成 ${plan.name}：${count} 個物件，已 commit`);
    return true;
  }
}

function printStatus() {
  const s = loadState();
  console.log(JSON.stringify({
    phase: s.phase, current: s.current, error: s.error, attempts: s.attempts, retryAt: s.retryAt && localIso(new Date(s.retryAt)),
    idle: s.idleReason, skipped: (s.skipped ?? []).map((x) => `${x.kind}:${x.id}`), done: s.history.map((h) => `${h.name}(${h.items})`),
  }, null, 2));
  const queue = fs.existsSync(REVIEW_QUEUE) ? readJson(REVIEW_QUEUE) : {};
  const pending = Object.entries(queue).map(([id, q]) => `${id}（標記 ${q.flagged.length}、太像 ${(q.similar ?? []).length} 組${q.players?.length ? `、玩家常找不到 ${q.players.length}` : ''}${q.layout ? `、構圖 ${q.layout.score}/5` : ''}）`);
  if (pending.length) console.log(`待人工審（細節 .auto-expand/review/<scene>.json、對照表 .auto-expand/review/<scene>-<n>.png；看完從 .auto-expand/review-queue.json 刪掉）：${pending.join('、')}`);
  const settings = readJson(P.settings);
  const topUp = topUpCandidates(settings, s).map(({ plan, shortfall }) => `${plan.name} +${shortfall.reduce((n, x) => n + x.need, 0)}`);
  if (topUp.length) console.log(`待補元素（目標 ${settings.itemsPerScene} 個、手畫場景看各自的 itemsTarget，topUp ${settings.topUp ? '開' : '關'}）：${topUp.join('、')}`);
  if (s.current?.slug) {
    try { console.log('miko-ws：', jobProgress(s.current.slug)); } catch (e) { console.log(e.message); }
  }
}

const COMMIT_PATHS = ['content', 'public/svg', 'public/audio', 'src/data/scenes', 'docs/expansion.md'];

/**
 * 整合失敗：請 codex（唯讀）讀 log 和程式碼找原因，報告寫進 .auto-expand/diagnosis/、Telegram 通知。只診斷不修。
 * 診斷本身失敗只記 log，不影響原本的重試／放棄。
 * @returns {Promise<boolean>} 有沒有診斷（同一個錯誤只診斷一次）
 */
async function diagnose(s, e) {
  if (!shouldDiagnose(s, { message: e.message, skippable: Boolean(e.skippable) })) return false;
  const sceneId = s.current.id;
  const planFile = path.join(P.plans, `${sceneId}.json`);
  const sceneName = fs.existsSync(planFile) ? readJson(planFile).name : sceneId;
  try {
    log(`診斷 ${sceneName} 的整合失敗（codex 唯讀）…`);
    const answer = await codexText(buildDiagnosisPrompt({ root: ROOT, sceneId, sceneName, error: e.message, logs: relatedLogs(ROOT, e.message) }));
    const file = path.join(DIAGNOSIS_DIR, `${sceneId}-${localIso().replace(/[:.]/g, '-')}.md`);
    fs.mkdirSync(DIAGNOSIS_DIR, { recursive: true });
    fs.writeFileSync(file, diagnosisReport({ sceneId, sceneName, error: e.message, at: localIso(), answer }));
    const sent = await notifyTelegram(telegramSummary({ sceneName, answer, file }));
    log(`診斷報告：${path.relative(ROOT, file)}（Telegram ${sent ? '已通知' : '沒送出：沒設定 TELEGRAM_TOKEN / ADMIN_ID 或送不出去'}）`);
  } catch (err) {
    log(`診斷沒做成：${err.message.split('\n')[0]}`);
  }
  return true;
}

async function handleFailure(e) {
  const s = loadState();
  const diagnosed = await diagnose(s, e);
  const failed = onFailure(s, { message: e.message, skippable: Boolean(e.skippable) }, Date.now());
  const { action } = failed;
  const state = diagnosed ? markDiagnosed(failed.state, e.message) : failed.state;
  const job = s.current?.theme?.name ?? s.current?.id;
  let stashed = false;
  if (action === 'abandon') {
    // 改到一半的檔案收進 stash（可用 git stash list 找回），工作區回到上一個 commit，下一個場景才能乾淨地開始
    try {
      git('git-stash', ['stash', 'push', '--include-untracked', '-m', `auto-expand 放棄 ${job}`, '--', ...COMMIT_PATHS]);
      stashed = true;
    } catch (err) {
      log(`收起改到一半的檔案失敗，工作區要手動清：${err.message.split('\n')[0]}`);
    }
  }
  saveState(state);
  if (action === 'skip') log(`跳過 ${job}：${e.message}。下一輪換下一個`);
  else if (action === 'abandon') log(`放棄 ${job}（整合連續失敗）：${e.message.split('\n')[0]}。改到一半的檔案${stashed ? '在 git stash' : '還在工作區'}`);
  else log(`失敗（第 ${state.attempts} 次），${localIso(new Date(state.retryAt))} 自動重試：${e.message}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) return printStatus();
  if (args.includes('--unblock')) {
    const s = loadState();
    saveState({ ...resumeIfDue({ ...s, retryAt: undefined }, Date.now()), attempts: undefined });
    return log(`解除卡住，回到 ${s.resumePhase ?? s.phase}`);
  }
  if (!acquireLock()) return log('上一次還在跑，略過');
  const restageAt = args.indexOf('--restage');
  if (restageAt >= 0) {
    try {
      await restage(args[restageAt + 1], args.find((a) => a.startsWith('--slot='))?.slice('--slot='.length));
    } catch (e) {
      log(`restage 失敗：${e.message.split('\n')[0]}`);
      process.exitCode = 1;
    } finally {
      fs.rmSync(LOCK_FILE, { force: true });
    }
    return;
  }
  try {
    let afterGenerator = args.includes('--after-generator');
    while (await tick({ afterGenerator })) afterGenerator = false;
  } catch (e) {
    await handleFailure(e);
    process.exitCode = 1;
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

main();
