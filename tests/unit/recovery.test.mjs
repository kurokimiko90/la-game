import { describe, expect, it } from 'vitest';
import { GIVE_UP_AFTER, backoffMs, idleNotice, isSkipped, onFailure, resumeIfDue } from '../../scripts/lib/recovery.mjs';

const NOW = Date.parse('2026-09-26T10:00:00+09:00');
const bank = { theme: { id: 'bank', name: '銀行', zone: 'commercial' }, slot: { x: 9520, y: 3080 } };
const base = (over) => ({ phase: 'planning', current: bank, history: [], ...over });

describe('backoffMs', () => {
  it('30 分鐘起跳、每次加倍、最多 6 小時', () => {
    expect(backoffMs(1)).toBe(30 * 60e3);
    expect(backoffMs(2)).toBe(60 * 60e3);
    expect(backoffMs(3)).toBe(120 * 60e3);
    expect(backoffMs(10)).toBe(6 * 3600e3);
  });
});

describe('onFailure', () => {
  it('新主題物品不夠：直接跳過主題、回到 idle，不卡住', () => {
    const r = onFailure(base(), { message: '規劃只得到 28 個', skippable: true }, NOW);
    expect(r.action).toBe('skip');
    expect(r.state.phase).toBe('idle');
    expect(r.state.current).toBeNull();
    expect(r.state.skipped).toEqual([{ id: 'bank', kind: 'theme', reason: '規劃只得到 28 個', at: NOW }]);
  });

  it('補元素物品不夠：記成跳過補元素', () => {
    const r = onFailure(base({ current: { id: 'park', topUp: true } }), { message: 'x', skippable: true }, NOW);
    expect(r.state.skipped[0]).toMatchObject({ id: 'park', kind: 'topUp' });
  });

  it('其他錯誤：停在 blocked，排定退避後的重試時間', () => {
    const r = onFailure(base(), { message: 'codex 連不上' }, NOW);
    expect(r.action).toBe('retry');
    expect(r.state).toMatchObject({ phase: 'blocked', resumePhase: 'planning', error: 'codex 連不上', attempts: 1, retryAt: NOW + backoffMs(1) });
  });

  it('同一步連續失敗，次數累加、退避變長', () => {
    const first = onFailure(base({ phase: 'integrating', current: { id: 'bank' } }), { message: 'e2e' }, NOW).state;
    const resumed = resumeIfDue(first, first.retryAt);
    const second = onFailure(resumed, { message: 'e2e' }, first.retryAt).state;
    expect(second.attempts).toBe(2);
    expect(second.retryAt).toBe(first.retryAt + backoffMs(2));
  });

  it(`整合連續失敗 ${GIVE_UP_AFTER} 次：放棄這個場景（abandon），回到 idle`, () => {
    const s = base({ phase: 'integrating', current: { id: 'bank' }, attempts: GIVE_UP_AFTER - 1 });
    const r = onFailure(s, { message: 'e2e 失敗' }, NOW);
    expect(r.action).toBe('abandon');
    expect(r.state.phase).toBe('idle');
    expect(r.state.skipped[0]).toMatchObject({ id: 'bank', kind: 'scene', reason: 'e2e 失敗' });
    expect(r.state.attempts).toBeUndefined();
  });

  it('規劃、生成的錯誤多半是 miko-ws 連不上：一直重試，不放棄主題', () => {
    for (const phase of ['planning', 'generating']) {
      const r = onFailure(base({ phase, attempts: 20 }), { message: 'down' }, NOW);
      expect(r.action).toBe('retry');
    }
  });

  it('不改原本的 state', () => {
    const s = base();
    onFailure(s, { message: 'x', skippable: true }, NOW);
    expect(s).toEqual(base());
  });
});

describe('resumeIfDue', () => {
  const blocked = { phase: 'blocked', resumePhase: 'integrating', current: { id: 'bank' }, error: 'e2e', attempts: 2, retryAt: NOW, history: [] };

  it('還沒到時間：null', () => {
    expect(resumeIfDue(blocked, NOW - 1)).toBeNull();
  });

  it('到時間：回到原本的步驟，保留次數', () => {
    expect(resumeIfDue(blocked, NOW)).toEqual({ phase: 'integrating', current: { id: 'bank' }, attempts: 2, history: [] });
  });

  it('舊版 state（沒有 retryAt）：馬上重試', () => {
    const old = { ...blocked, retryAt: undefined, attempts: undefined };
    expect(resumeIfDue(old, NOW)).toMatchObject({ phase: 'integrating' });
  });

  it('不是 blocked：原樣回傳', () => {
    const idle = { phase: 'idle', current: null, history: [] };
    expect(resumeIfDue(idle, NOW)).toBe(idle);
  });
});

describe('isSkipped', () => {
  const state = { skipped: [{ id: 'bank', kind: 'theme' }, { id: 'park', kind: 'topUp' }] };
  it('依 id 和種類判斷', () => {
    expect(isSkipped(state, 'bank', 'theme')).toBe(true);
    expect(isSkipped(state, 'bank', 'topUp')).toBe(false);
    expect(isSkipped(state, 'park', 'topUp')).toBe(true);
    expect(isSkipped({}, 'bank', 'theme')).toBe(false);
  });
});

describe('idleNotice', () => {
  it('同樣的閒置原因只記一次', () => {
    const first = idleNotice({ phase: 'idle' }, '沒有空的 slot 了');
    expect(first.changed).toBe(true);
    expect(first.state.idleReason).toBe('沒有空的 slot 了');
    const again = idleNotice(first.state, '沒有空的 slot 了');
    expect(again.changed).toBe(false);
    expect(again.state).toBe(first.state);
  });
  it('原因變了要再記', () => {
    expect(idleNotice({ idleReason: '沒有空的 slot 了' }, '主題用完了').changed).toBe(true);
  });
});
