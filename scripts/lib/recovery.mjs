// 自動擴展失敗後怎麼繼續，不讓整條產線一直停著。純函式。
// - 內容不夠（規劃的物品不合格太多，skippable）：這個主題／補元素直接跳過，下一輪換下一個
// - 規劃、生成出錯：多半是 miko-ws 連不上，退避後重試（30 分 → 1 → 2 → 4 → 6 小時），不放棄主題，免得連掉整串主題
// - 整合連續失敗 GIVE_UP_AFTER 次：放棄這個場景（abandon；呼叫端負責把改到一半的檔案收起來）
export const GIVE_UP_AFTER = 3;
const BASE_MS = 30 * 60e3;
const MAX_MS = 6 * 3600e3;

/** 第 attempt 次失敗後要等多久 */
export const backoffMs = (attempt) => Math.min(BASE_MS * 2 ** (attempt - 1), MAX_MS);

const jobOf = (current) => (current?.theme
  ? { id: current.theme.id, kind: 'theme' }
  : { id: current?.id ?? '?', kind: current?.topUp ? 'topUp' : 'scene' });

const BLOCK_KEYS = ['error', 'resumePhase', 'retryAt', 'blockedAt'];
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

const skip = (state, { id, kind }, reason, now) => {
  const rest = omit(state, [...BLOCK_KEYS, 'attempts']);
  return { ...rest, phase: 'idle', current: null, skipped: [...(state.skipped ?? []), { id, kind, reason, at: now }] };
};

/**
 * @param {object} state  失敗當下的 state（phase 是出錯的步驟）
 * @param {{ message: string, skippable?: boolean }} failure
 * @returns {{ action: 'skip' | 'abandon' | 'retry', state: object }}
 */
export function onFailure(state, { message, skippable = false }, now) {
  const job = jobOf(state.current);
  if (skippable) return { action: 'skip', state: skip(state, job, message, now) };
  const attempts = (state.attempts ?? 0) + 1;
  if (state.phase === 'integrating' && attempts >= GIVE_UP_AFTER) {
    return { action: 'abandon', state: skip(state, job, message, now) };
  }
  return {
    action: 'retry',
    state: { ...state, phase: 'blocked', resumePhase: state.phase, error: message, attempts, retryAt: now + backoffMs(attempts) },
  };
}

/** blocked 且到了重試時間 → 回到原本步驟的 state；還沒到 → null；不是 blocked → 原樣 */
export function resumeIfDue(state, now) {
  if (state.phase !== 'blocked') return state;
  if (state.retryAt != null && now < state.retryAt) return null;
  return { ...omit(state, BLOCK_KEYS), phase: state.resumePhase ?? 'idle' };
}

export const isSkipped = (state, id, kind) => (state.skipped ?? []).some((s) => s.id === id && s.kind === kind);

/**
 * 閒置（沒有 slot、主題用完、到達上限）時的原因；排程每 30 分鐘叫一次，同樣的原因只記一次 log。
 * @returns {{ state: object, changed: boolean }}
 */
export function idleNotice(state, reason) {
  if (state.idleReason === reason) return { state, changed: false };
  return { state: { ...state, idleReason: reason }, changed: true };
}
