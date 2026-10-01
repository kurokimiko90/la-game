// 試玩伺服器（port 3220）重新 build + 重啟，讓新場景馬上看得到。
// 兩個 build 目錄輪流用（.next-play / .next-play-b）：build 到沒在用的那個，成功才停掉舊的、用新的啟動，
// build 期間舊的照常能玩；build 失敗就不動正在跑的伺服器。
// 自動擴展 commit 完在背景叫它；也可以手動跑：node scripts/reload-play.mjs
// 換版後順便做 auto-expand 排進 .auto-expand/layout-pending.json 的構圖審查（要新版才看得到新街區）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3220;
const DIRS = ['.next-play', '.next-play-b'];
const STATE_DIR = path.join(ROOT, '.auto-expand');
const LIVE_FILE = path.join(STATE_DIR, 'play-dist');
const LOCK = path.join(STATE_DIR, 'reload-play.lock');
const LOG = path.join(STATE_DIR, 'play.log');
const PORT_FREE_TIMEOUT_MS = 15_000;
const SERVER_UP_TIMEOUT_MS = 60_000;
const LAYOUT_PENDING = path.join(STATE_DIR, 'layout-pending.json');

const stamp = () => new Date().toISOString();
const note = (msg) => fs.appendFileSync(LOG, `[${stamp()}] reload-play：${msg}\n`);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 同時只跑一個；上一個還在跑就略過（它 build 的會是比較舊的 commit，下一次 commit 會再叫） */
function acquireLock() {
  if (fs.existsSync(LOCK) && alive(Number(fs.readFileSync(LOCK, 'utf8')))) return false;
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}

const listeners = () => spawnSync('lsof', ['-tiTCP:' + PORT, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.split('\n').map(Number).filter(Boolean);

async function stopServer() {
  for (const pid of listeners()) process.kill(pid, 'SIGTERM');
  const until = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (listeners().length && Date.now() < until) await new Promise((r) => setTimeout(r, 300));
  if (listeners().length) throw new Error(`port ${PORT} 停不掉`);
}

/** 新版伺服器起來後，做 auto-expand 排進來的構圖審查（scripts/review-scene.mjs --layout-only）；失敗留在清單裡下次再做 */
async function layoutReviews(out) {
  if (!fs.existsSync(LAYOUT_PENDING)) return;
  const until = Date.now() + SERVER_UP_TIMEOUT_MS;
  while (Date.now() < until) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch { /* 還沒起來 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (const sceneId of JSON.parse(fs.readFileSync(LAYOUT_PENDING, 'utf8'))) {
    const r = spawnSync(process.execPath, ['--no-warnings', 'scripts/review-scene.mjs', sceneId, '--layout-only'], { cwd: ROOT, stdio: ['ignore', out, out] });
    if (r.status !== 0) {
      note(`構圖審查 ${sceneId} 失敗（exit ${r.status}），留到下次`);
      continue;
    }
    const left = JSON.parse(fs.readFileSync(LAYOUT_PENDING, 'utf8')).filter((id) => id !== sceneId);
    fs.writeFileSync(LAYOUT_PENDING, JSON.stringify(left));
    note(`構圖審查 ${sceneId} 完成`);
  }
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!acquireLock()) return note('上一次還在跑，略過');
  try {
    const live = fs.existsSync(LIVE_FILE) ? fs.readFileSync(LIVE_FILE, 'utf8').trim() : DIRS[0];
    const next = DIRS.find((d) => d !== live) ?? DIRS[1];
    note(`build 到 ${next}`);
    const out = fs.openSync(LOG, 'a');
    const build = spawnSync('npx', ['next', 'build'], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: next }, stdio: ['ignore', out, out] });
    if (build.status !== 0) throw new Error(`next build 失敗（exit ${build.status}），伺服器沒動`);
    await stopServer();
    spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: next }, stdio: ['ignore', out, out], detached: true,
    }).unref();
    fs.writeFileSync(LIVE_FILE, next);
    note(`已用 ${next} 重啟 http://localhost:${PORT}`);
    await layoutReviews(out);
  } finally {
    fs.rmSync(LOCK, { force: true });
  }
}

main().catch((e) => {
  note(`失敗：${e.message}`);
  process.exitCode = 1;
});
