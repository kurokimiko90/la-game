// la-game ↔ miko-ws 的橋接：所有 LLM 呼叫（場景規劃、單字表）和 SVG 生成都交給 miko-ws。
// 直接載入 miko-ws 自己的模組（llm-center-client、jobs、registry），不在這裡重寫它的邏輯。
// miko-ws 位置預設 ../miko-ws，可用 MIKO_WS_DIR 覆蓋；LLM 指揮中心要在跑（miko-ws runtime）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIKO_WS = path.resolve(process.env.MIKO_WS_DIR || path.join(ROOT, '..', 'miko-ws'));
const req = createRequire(path.join(MIKO_WS, 'package.json'));
const lib = (name) => req(`./src/skills/scene-assets/${name}`);

const CODEX_DEADLINE_MS = 30 * 60 * 1000;
const GATEWAY = process.env.LLM_GATEWAY_URL || 'http://localhost:3005';
// 指揮中心會把 ChatGPT 帳號一個個試過（每個失敗要 30–90 秒），整條鏈常超過 5 分鐘
const VOICE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * ChatGPT 朗讀（miko-ws 指揮中心 /api/llm/voice）→ outputPath（原始 AAC）。
 * 指揮中心在 ChatGPT 帳號全失敗時會退回 edge-tts；這裡要的就是 ChatGPT 的聲音，所以退回算失敗。
 * @returns {Promise<{ path: string, spoken: string, account: string }>}
 */
export async function gptVoice(text, outputPath) {
  const { fetch: undiciFetch, Agent } = req('undici');
  const headers = { 'content-type': 'application/json' };
  if (process.env.LLM_GATEWAY_TOKEN) headers['x-llm-token'] = process.env.LLM_GATEWAY_TOKEN;
  let res;
  try {
    res = await undiciFetch(`${GATEWAY}/api/llm/voice`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, outputPath, project: 'la-game', engine: 'gpt' }),
      dispatcher: new Agent({ headersTimeout: 0, bodyTimeout: 0 }),
      signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`miko-ws 指揮中心連不上（${GATEWAY}）：${e.message}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `指揮中心 HTTP ${res.status}`);
  if (json.voice?.engine !== 'gpt') throw new Error('ChatGPT 帳號都不能用（指揮中心退回了 edge-tts）');
  return json.voice;
}

/** codex 文字生成（miko-ws 指揮中心排隊，只走 codex） */
export async function codexText(prompt) {
  const client = lib('lib/llm-center-client.js');
  await client.ensureReady();
  // 規劃用 gpt-5.6-luna 最低的推理強度（low）省 codex 額度
  return client.runCodexText(prompt, { project: 'la-game', reasoningEffort: 'low', deadlineMs: CODEX_DEADLINE_MS });
}

/** 在 miko-ws 的 jobs.json 登記一個場景（已登記就不重複） */
export function registerJob({ sceneName, slug, manifest }) {
  const jobs = lib('jobs.js');
  const file = jobs.jobsFilePath();
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (list.some((j) => j.slug === slug)) return false;
  fs.writeFileSync(file, `${JSON.stringify([...list, { sceneName, slug, manifest, lane: 'b' }], null, 2)}\n`);
  return true;
}

/** @returns {{ total: number, done: number, failed: number, pending: number }} */
export function jobProgress(slug) {
  const jobs = lib('jobs.js');
  const job = jobs.loadJobs().find((j) => j.slug === slug);
  if (!job) throw new Error(`miko-ws jobs.json 沒有 ${slug}`);
  return jobs.jobProgress(job);
}

// LLM 明確說畫不出來（人形、動物形狀，Lane B 不畫生物）：重跑也一樣，不浪費額度
const PERMANENT_FAILURE = /無合適圖/;

/**
 * 生成失敗的元素退回 planned，讓排程重跑（codex 忙的時候整批逾時，隔一陣子再跑通常就好了）。
 * 永久性失敗（PERMANENT_FAILURE）不重跑，build 時這些物件會被略過。
 * 用 miko-ws 的場景寫入鎖，避免和正在跑的生成程序互搶 registry.json。
 * @returns {number} 退回的數量；拿不到鎖回傳 -1
 */
export function requeueFailed(slug, sceneName) {
  const jobs = lib('jobs.js');
  const registry = lib('registry.js');
  const lock = jobs.sceneLockPath(slug);
  if (!jobs.acquireLock(lock)) return -1;
  try {
    const reg = registry.loadRegistry(slug, sceneName);
    const failed = (reg.items || []).filter((it) => it.status === 'failed' && !PERMANENT_FAILURE.test(it.error ?? ''));
    for (const it of failed) it.status = 'planned';
    if (failed.length) registry.saveRegistry(slug, reg);
    return failed.length;
  } finally {
    jobs.releaseLock(lock);
  }
}

const isAlive = (pid) => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
};

/**
 * 背景跑 miko-ws 的生成排程（跑到沒有 pending 就自己結束）。已經在跑就不重開。
 * 給了 thenArgs 就在生成結束後接著跑 `node ...thenArgs`（在 la-game 根目錄），不用等下一次排程才發現生成完了。
 * @param {string[]} [thenArgs]
 * @returns {number} pid
 */
export function ensureGenerator(previousPid, logFile, thenArgs = []) {
  // 從接續呼叫進來時，previousPid 是自己或父行程（sh），那個生成器其實已經結束了
  const self = [process.pid, process.ppid];
  if (!self.includes(previousPid) && isAlive(previousPid)) return previousPid;
  const out = fs.openSync(logFile, 'a');
  // node 路徑和 la-game 根目錄用 $0/$1 傳給 sh，thenArgs 用 "$@"，不用自己處理引號
  const chain = thenArgs.length ? '; cd "$1" && shift && exec "$0" "$@"' : '';
  const child = spawn('/bin/sh', ['-c', `"$0" scripts/scene-asset-jobs.js --loop --gap-ms=15000${chain}`, process.execPath, ROOT, ...thenArgs], {
    cwd: MIKO_WS, detached: true, stdio: ['ignore', out, out],
  });
  child.unref();
  return child.pid;
}
