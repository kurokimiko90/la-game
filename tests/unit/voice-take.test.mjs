import { describe, expect, test } from 'vitest';
import {
  alignItems, heardScore, normalizeHeard, similarity, spokenMatches, spokenText, takeScript,
} from '../../scripts/lib/voice-take.mjs';

const w = (en, zh, ja, reading = ja) => ({ en, 'zh-TW': zh, ja: { text: ja, reading } });
const bench = w('bench', '長椅', 'ベンチ');
const gate = w('gate', '門', '門', 'もん');
const light = w('streetlight', '路燈', '街灯', 'がいとう');

describe('朗讀稿', () => {
  test('一行一個詞；英語首字大寫加句點，中日文加「。」', () => {
    expect(takeScript([bench, gate], 'en')).toBe('Bench.\nGate.');
    expect(takeScript([bench, gate], 'zh')).toBe('長椅。\n門。');
    expect(takeScript([bench, gate], 'ja')).toBe('ベンチ。\n門。');
    expect(() => spokenText(bench, 'fr')).toThrow();
  });

  test('ChatGPT 回的原稿要逐行一致', () => {
    expect(spokenMatches('Bench.\nGate.', 'Bench.\n\nGate.\n')).toBe(true);
    expect(spokenMatches('Bench.\nGate.', 'Sure!\nBench.\nGate.')).toBe(false);
    expect(spokenMatches('Bench.\nGate.', 'Bench. Gate.')).toBe(false);
  });
});

describe('驗收比對', () => {
  test('中文比無聲調拼音（whisper 常寫成同音字、簡體）', () => {
    expect(normalizeHeard('常译。', 'zh')).toBe(normalizeHeard('長椅', 'zh'));
    expect(heardScore(bench, 'zh', '常译')).toBe(1);
    expect(heardScore(bench, 'zh', '石头')).toBeLessThan(0.5);
  });

  test('日語：漢字寫法或讀音對上都算，片假名當平假名', () => {
    expect(heardScore(gate, 'ja', 'もん')).toBe(1);
    expect(heardScore(gate, 'ja', '門')).toBe(1);
    expect(normalizeHeard('ベンチ', 'ja')).toBe('べんち');
  });

  test('英語忽略大小寫與標點', () => {
    expect(heardScore(bench, 'en', ' Bench.')).toBe(1);
    expect(heardScore(light, 'en', 'Street light!')).toBe(1);
  });

  test('similarity', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abcd', 'abxd')).toBe(0.75);
    expect(similarity('', '')).toBe(1);
  });
});

describe('alignItems', () => {
  const u = (text, from, to) => ({ text, from, to });

  test('多個聽寫單位合成一個詞（street + light）', () => {
    const spans = alignItems([bench, light], [u(' bench,', 0, 0.4), u(' street', 0.4, 0.7), u('light,', 0.7, 1)], 'en');
    expect(spans[0]).toMatchObject({ from: 0, to: 0.4 });
    expect(spans[1]).toMatchObject({ from: 0.4, to: 1, score: 1 });
  });

  test('漏念的詞對不上（null），後面的詞不會錯位', () => {
    const spans = alignItems([bench, gate, light], [u('bench', 0, 0.4), u('streetlight', 0.4, 1)], 'en');
    expect(spans[1]).toBeNull();
    expect(spans[2]).toMatchObject({ from: 0.4, to: 1 });
  });

  test('空白處的幻聽被跳過', () => {
    const spans = alignItems([bench, gate], [u('bench', 0, 0.4), u('you', 0.4, 0.5), u('gate', 0.5, 0.9)], 'en');
    expect(spans[1]).toMatchObject({ from: 0.5, to: 0.9 });
  });

  test('中文逐字 token 合成一個詞', () => {
    const spans = alignItems([bench, gate], [u('常', 0, 0.2), u('译', 0.2, 0.4), u('门', 0.4, 0.6)], 'zh');
    expect(spans[0]).toMatchObject({ from: 0, to: 0.4 });
    expect(spans[1]).toMatchObject({ from: 0.4, to: 0.6 });
  });
});
