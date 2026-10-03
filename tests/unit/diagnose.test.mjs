import { describe, expect, test, vi } from 'vitest';
import { errorSignature, markDiagnosed, notifyTelegram, relatedLogs, shouldDiagnose, telegramSummary } from '../../scripts/lib/diagnose.mjs';

const integrating = (current = { id: 'cafe' }) => ({ phase: 'integrating', current });

describe('shouldDiagnose', () => {
  test('整合失敗才診斷', () => {
    expect(shouldDiagnose(integrating(), { message: 'e2e 失敗' })).toBe(true);
    expect(shouldDiagnose({ phase: 'planning', current: {} }, { message: 'miko-ws 連不上' })).toBe(false);
    expect(shouldDiagnose(integrating(), { message: '物品不夠', skippable: true })).toBe(false);
    expect(shouldDiagnose({ phase: 'integrating', current: null }, { message: 'x' })).toBe(false);
  });
  test('同一個錯誤只診斷一次（數字不同也算同一個）', () => {
    const s = markDiagnosed(integrating(), 'e2e 失敗：2 failed\n詳細');
    expect(shouldDiagnose(s, { message: 'e2e 失敗：3 failed\n另一段' })).toBe(false);
    expect(shouldDiagnose(s, { message: 'lint 失敗' })).toBe(true);
  });
});

test('errorSignature 只看第一行、數字正規化', () => {
  expect(errorSignature('e2e 失敗（12 passed）\nstack')).toBe('e2e 失敗（# passed）');
});

test('relatedLogs 抓錯誤裡提到的 log，加上固定的', () => {
  const logs = relatedLogs('/r', 'e2e 失敗（.auto-expand/e2e.log）：…');
  expect(logs).toEqual(['/r/.auto-expand/e2e.log', '/r/.auto-expand/auto-expand.log', '/r/test-results']);
});

test('telegramSummary 取原因段落', () => {
  const text = telegramSummary({ sceneName: '咖啡廳', answer: '## 原因\nDOM 太大\n## 建議修法\n剪掉', file: '/d.md' });
  expect(text).toContain('咖啡廳');
  expect(text).toContain('DOM 太大');
  expect(text).not.toContain('剪掉');
});

describe('notifyTelegram', () => {
  test('沒設定 token 就不送', async () => {
    const f = vi.fn();
    expect(await notifyTelegram('x', {}, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  test('送到 ADMIN_ID', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true });
    expect(await notifyTelegram('hi', { TELEGRAM_TOKEN: 't', ADMIN_ID: '42' }, f)).toBe(true);
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ chat_id: '42', text: 'hi' });
  });
  test('送失敗不丟錯', async () => {
    expect(await notifyTelegram('x', { TELEGRAM_TOKEN: 't', ADMIN_ID: '1' }, vi.fn().mockRejectedValue(new Error('net')))).toBe(false);
  });
});
