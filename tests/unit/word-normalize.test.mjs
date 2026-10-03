import { describe, expect, test } from 'vitest';
import { normalizeEn, normalizeReading } from '../../scripts/lib/word-normalize.mjs';

describe('normalizeEn', () => {
  test('id 寫法的連字號換成空白', () => {
    expect(normalizeEn('air-conditioner')).toBe('air conditioner');
    expect(normalizeEn('loaf-of-bread')).toBe('loaf of bread');
    expect(normalizeEn(' Floor-Lamp ')).toBe('floor lamp');
  });
  test('本來就帶連字號的詞保留', () => {
    expect(normalizeEn('check-in-kiosk')).toBe('check-in kiosk');
    expect(normalizeEn('x-ray-machine')).toBe('x-ray machine');
    expect(normalizeEn('parked-go-kart')).toBe('parked go-kart');
    expect(normalizeEn('yo-yo')).toBe('yo-yo');
  });
  test('沒有連字號的不動', () => expect(normalizeEn("teacher's desk")).toBe("teacher's desk"));
});

describe('normalizeReading', () => {
  test('純假名的詞讀音就是寫法', () => {
    expect(normalizeReading('シャトルバス', 'しゃとるばす')).toBe('シャトルバス');
    expect(normalizeReading('パンくず', 'パンクズ')).toBe('パンくず');
    expect(normalizeReading('レターオープナー', 'れたーおーぷんあー')).toBe('レターオープナー');
  });
  test('有漢字的詞，片假名部分在讀音裡保留片假名', () => {
    expect(normalizeReading('手荷物カート', 'てにもつかーと')).toBe('てにもつカート');
    expect(normalizeReading('遊園地のミニ列車', 'ゆうえんちのみにれっしゃ')).toBe('ゆうえんちのミニれっしゃ');
    expect(normalizeReading('自動チェックイン機', 'じどうチェックインき')).toBe('じどうチェックインき');
  });
  test('漢字詞不動', () => expect(normalizeReading('飛行機', 'ひこうき')).toBe('ひこうき'));
});
