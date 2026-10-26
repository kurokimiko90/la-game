// 按實際場景擺放：元素生成之後的標準流程（scripts/auto-expand.mjs 和 scripts/place-scene.mjs 共用）。
//
// 1. 情境規劃：請 codex 把物品想成真實空間裡的「情境」（櫃台、座位區、靠牆設備…）→ content/stages/<scene>.json
//      new / restage：整個街區重新規劃，--reset 重排（物件位置全部重算）
//      topUp：舊情境不動，只把還沒安排的新物品開成新的組；舊物品位置不動
// 2. 擺放（build-layout）：情境錨點優先；被擋住的物品拿出情境、交給自動排列再試，最多 pruneRounds 輪；
//    還是不行才放棄情境（新街區刪掉情境檔、補元素還原舊情境），照舊自動排列，不讓流程卡住。
// 3. 回報沒進情境的地上物品（unstaged）：真實場景裡找不到合理位置的東西，呼叫端把它們退役，而不是散落在地上。
//    道路、軌道、水面、天空的物品本來就不進情境，不算。沒有情境（整個自動排列）時不回報，免得整個街區被退役。
//
// codex 和 build-layout 由呼叫端傳入（ask、layout），這裡只有流程，方便測試。
import fs from 'node:fs';
import path from 'node:path';
import { blockedIds, buildStagePrompt, parseStage, pruneStage, stagedIds } from './stage-plan.mjs';

export const MODES = ['new', 'restage', 'topUp'];
const BAND_SPOTS = ['road', 'track', 'water', 'sky'];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

/** 問 codex → 修整 → 驗證；有問題帶著問題重問，最多 tries 次。成功回傳情境，否則 null */
async function planStage({ plan, available, terrain, existing, ask, log, tries }) {
  let problems = [];
  for (let i = 0; i < tries; i++) {
    try {
      const r = parseStage(await ask(buildStagePrompt({ plan, available, problems, existing })), { plan, available, terrain, existing });
      problems = r.problems;
      if (!problems.length) {
        log(`情境規劃完成${r.dropped.length ? `，${r.dropped.length} 個物品沒安排到（照舊自動排列）：${r.dropped.join('、')}` : ''}`);
        return r.stage;
      }
    } catch (e) {
      problems = [e.message.split('\n')[0]];
    }
  }
  log(`情境規劃沒做成，照舊自動排列：${problems.slice(0, 3).join('；')}`);
  return null;
}

/** 有 SVG、該放地上（不是道路 / 水面 / 天空）、但不在情境裡的物品 */
function unstagedIds(plan, available, stageFile, isNew) {
  if (!fs.existsSync(stageFile)) return [];
  const has = new Set(available);
  const done = stagedIds(readJson(stageFile));
  return plan.elements.filter((e) => has.has(e.id) && !BAND_SPOTS.includes(e.spot) && !done.has(e.id) && isNew(e.id)).map((e) => e.id);
}

/** 補元素時還有沒有地上的新物品要安排（沒有就不用問 codex） */
function hasNewItems(plan, available, existing) {
  const has = new Set(available);
  const done = stagedIds(existing);
  return plan.elements.some((e) => has.has(e.id) && !done.has(e.id) && !BAND_SPOTS.includes(e.spot));
}

/**
 * @param {{
 *   plan: object, available: string[], terrain: object, mode: 'new' | 'restage' | 'topUp', stageFile: string,
 *   ask: (prompt: string) => Promise<string>, layout: (args: string[]) => unknown, log: (msg: string) => void,
 *   tries?: number, pruneRounds?: number, isNew?: (id: string) => boolean,
 * }} input  isNew：補元素時只回報這一輪新加的物品（舊物品位置已鎖定，不動）
 * @returns {Promise<{ staged: boolean, unstaged: string[] }>}  staged：最後有沒有用上情境；unstaged：沒進情境的地上物品
 */
export async function placeScene({ plan, available, terrain, mode, stageFile, ask, layout, log, tries = 2, pruneRounds = 6, isNew = () => true }) {
  if (!MODES.includes(mode)) throw new Error(`不認得的擺放模式 ${mode}`);
  const topUp = mode === 'topUp';
  const existing = topUp && fs.existsSync(stageFile) ? readJson(stageFile) : null;
  if (!topUp) fs.rmSync(stageFile, { force: true });

  // 補元素：沒有情境檔（手畫的街區、規劃失敗過）或沒有新的地上物品 → 不問 codex
  const shouldPlan = !topUp || (existing && hasNewItems(plan, available, existing));
  const stage = shouldPlan ? await planStage({ plan, available, terrain, existing, ask, log, tries }) : null;
  if (stage) writeJson(stageFile, stage);

  const args = topUp ? [] : ['--reset'];
  for (let round = 0; ; round++) {
    try {
      layout(args);
      return { staged: fs.existsSync(stageFile), unstaged: unstagedIds(plan, available, stageFile, isNew) };
    } catch (e) {
      if (!fs.existsSync(stageFile)) throw e;
      const ids = blockedIds(e.message);
      if (ids.length && round < pruneRounds) {
        writeJson(stageFile, pruneStage(readJson(stageFile), ids));
        log(`情境擺放有物件被擋住，改成自動排列：${ids.join('、')}`);
        continue;
      }
      log(`情境擺放排不下，改用自動排列：${e.message.split('\n')[0]}`);
      if (existing) writeJson(stageFile, existing);
      else fs.rmSync(stageFile);
      layout(args);
      return { staged: Boolean(existing), unstaged: existing ? unstagedIds(plan, available, stageFile, isNew) : [] };
    }
  }
}
