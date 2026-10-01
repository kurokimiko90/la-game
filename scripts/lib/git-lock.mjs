// git 的 index.lock 被占用時怎麼辦：有 git 在跑就等；沒有 git 在跑、鎖又放很久，是當掉的 git 留下的，刪掉。
// 2026-09-28 一個殘留的 index.lock 讓自動擴展的 git add / stash 失敗了三天（gym 沒 commit 成）。

/** 沒有 git 程序時，鎖放超過這麼久就當作殘留 */
export const STALE_AFTER_MS = 10 * 60e3;

const LOCK_RE = /index\.lock'?: File exists/;

/** git 的輸出是不是「index.lock 被占用」 */
export const isLockError = (text) => LOCK_RE.test(String(text ?? ''));

/**
 * @param {{ exists: boolean, ageMs: number, gitRunning: boolean }} lock
 * @returns {'retry' | 'wait' | 'remove'}
 */
export function lockAction({ exists, ageMs, gitRunning }) {
  if (!exists) return 'retry';
  if (gitRunning || ageMs <= STALE_AFTER_MS) return 'wait';
  return 'remove';
}
