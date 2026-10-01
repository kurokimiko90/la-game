import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, isLockError, lockAction } from '../../scripts/lib/git-lock.mjs';

const LOCK_OUT = "fatal: Unable to create '/repo/.git/index.lock': File exists.\n\nAnother git process seems to be running";

describe('isLockError', () => {
  it('認得 index.lock 被占用的輸出', () => {
    expect(isLockError(LOCK_OUT)).toBe(true);
  });
  it('其他錯誤不算', () => {
    expect(isLockError('fatal: pathspec did not match any files')).toBe(false);
    expect(isLockError('')).toBe(false);
  });
});

describe('lockAction', () => {
  it('鎖已經不在：直接重試', () => {
    expect(lockAction({ exists: false, ageMs: 0, gitRunning: false })).toBe('retry');
  });
  it('有 git 程序在跑：等它', () => {
    expect(lockAction({ exists: true, ageMs: STALE_AFTER_MS * 10, gitRunning: true })).toBe('wait');
  });
  it('沒有 git 程序、但鎖很新：等（可能剛開始）', () => {
    expect(lockAction({ exists: true, ageMs: 1000, gitRunning: false })).toBe('wait');
  });
  it('沒有 git 程序、鎖放超過門檻：是殘留，刪掉', () => {
    expect(lockAction({ exists: true, ageMs: STALE_AFTER_MS + 1, gitRunning: false })).toBe('remove');
  });
});
