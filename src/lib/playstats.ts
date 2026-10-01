// 玩家數據：每個物件被問了幾次、找到幾次、點錯、用提示、記憶挑戰被揭曉、找到花多久。
// 存在本機（localStorage，和進度分開的 key），/stats 頁看最難找的物件並匯出；
// 匯出檔用 scripts/import-play-stats.mjs 匯入後，品質檢查會把「玩家常找不到」列進待人工審清單。
// key 用 progress.ts 的 wordKey（`<sceneId>/<itemId>`）。

export interface ItemStat {
  /** 成為目標的次數（找到或被揭曉時才算一次完整的「問」） */
  asked: number;
  found: number;
  /** 找這個目標時點錯（點到別的物品、記憶挑戰點錯位置） */
  wrong: number;
  hints: number;
  /** 記憶挑戰點錯太多次被直接揭曉 */
  revealed: number;
  /** 找到所花時間的總和（每次最多 MAX_FIND_MS） */
  findMs: number;
}

export interface PlayStats {
  version: 1;
  items: Record<string, ItemStat>;
}

export const EMPTY_PLAY_STATS: PlayStats = { version: 1, items: {} };
/** 一次找超過兩分鐘多半是離開了，不再往上算 */
export const MAX_FIND_MS = 120_000;
/** 問過幾次以上才列進最難清單（一次的運氣成分太大） */
export const MIN_ASKED = 2;

const EMPTY_ITEM: ItemStat = { asked: 0, found: 0, wrong: 0, hints: 0, revealed: 0, findMs: 0 };

function bump(stats: PlayStats, key: string, delta: Partial<ItemStat>): PlayStats {
  const cur = stats.items[key] ?? EMPTY_ITEM;
  const next = { ...cur };
  for (const [k, v] of Object.entries(delta) as [keyof ItemStat, number][]) next[k] = cur[k] + v;
  return { ...stats, items: { ...stats.items, [key]: next } };
}

export const recordFind = (s: PlayStats, key: string, ms: number) =>
  bump(s, key, { asked: 1, found: 1, findMs: Math.min(Math.max(0, ms), MAX_FIND_MS) });
export const recordWrong = (s: PlayStats, key: string) => bump(s, key, { wrong: 1 });
export const recordHint = (s: PlayStats, key: string) => bump(s, key, { hints: 1 });
export const recordRevealed = (s: PlayStats, key: string) => bump(s, key, { asked: 1, revealed: 1 });

/** 難度分數：每問一次平均的點錯 + 2×提示 + 3×揭曉，加上平均找到時間（30 秒 = 1 分，最多 1 分） */
export function difficulty(stat: ItemStat): number {
  if (stat.asked === 0) return 0;
  const penalty = (stat.wrong + 2 * stat.hints + 3 * stat.revealed) / stat.asked;
  const avgMs = stat.found ? stat.findMs / stat.found : 0;
  return penalty + Math.min(avgMs / 30_000, 1);
}

export function hardestItems(stats: PlayStats, limit: number): Array<{ key: string; stat: ItemStat; score: number }> {
  return Object.entries(stats.items)
    .filter(([, stat]) => stat.asked >= MIN_ASKED)
    .map(([key, stat]) => ({ key, stat, score: difficulty(stat) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** localStorage / 匯入檔讀回來的資料：版本不對或壞掉就當作空的，欄位不合法的當 0 */
export function parsePlayStats(raw: unknown): PlayStats {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return EMPTY_PLAY_STATS;
  const items = (raw as { items?: unknown }).items;
  if (!items || typeof items !== 'object') return EMPTY_PLAY_STATS;
  const out: Record<string, ItemStat> = {};
  for (const [key, v] of Object.entries(items)) {
    if (!key.includes('/') || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[key] = { asked: count(o.asked), found: count(o.found), wrong: count(o.wrong), hints: count(o.hints), revealed: count(o.revealed), findMs: count(o.findMs) };
  }
  return { version: 1, items: out };
}

/** 分數到這裡算「玩家常找不到」（約等於每問一次就點錯兩次，或常常要提示） */
export const HARD_SCORE = 2;

/** 某個街區裡玩家常找不到的物件（給品質檢查的待人工審清單） */
export function strugglingItems(stats: PlayStats, sceneId: string): Array<{ id: string; flag: string }> {
  return hardestItems(stats, Infinity)
    .filter(({ key, score }) => key.startsWith(`${sceneId}/`) && score >= HARD_SCORE)
    .map(({ key, stat, score }) => ({ id: key.slice(sceneId.length + 1), flag: `玩家常找不到（分數 ${score.toFixed(1)}，問 ${stat.asked} 次）` }));
}
