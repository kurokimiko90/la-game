import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAY_STATS, HARD_SCORE, difficulty, hardestItems, parsePlayStats, recordFind, recordHint, recordRevealed, recordWrong, strugglingItems,
} from '@/lib/playstats';

const KEY = 'gym/dumbbell';

describe('記錄', () => {
  it('找到：次數 + 1，累計花費時間', () => {
    const s = recordFind(recordFind(EMPTY_PLAY_STATS, KEY, 4000), KEY, 2000);
    expect(s.items[KEY]).toEqual({ asked: 2, found: 2, wrong: 0, hints: 0, revealed: 0, findMs: 6000 });
  });
  it('點錯、提示、揭曉各自累計；揭曉也算被問過一次', () => {
    let s = recordWrong(EMPTY_PLAY_STATS, KEY);
    s = recordHint(s, KEY);
    s = recordRevealed(s, KEY);
    expect(s.items[KEY]).toEqual({ asked: 1, found: 0, wrong: 1, hints: 1, revealed: 1, findMs: 0 });
  });
  it('不改原本的物件', () => {
    const before = JSON.stringify(EMPTY_PLAY_STATS);
    recordFind(EMPTY_PLAY_STATS, KEY, 1000);
    expect(JSON.stringify(EMPTY_PLAY_STATS)).toBe(before);
  });
  it('花費時間有上限（掛機不算）', () => {
    expect(recordFind(EMPTY_PLAY_STATS, KEY, 10 * 60_000).items[KEY].findMs).toBe(120_000);
  });
});

describe('difficulty / hardestItems', () => {
  it('點錯、提示、揭曉越多越難；問得太少的不列', () => {
    let s = EMPTY_PLAY_STATS;
    s = recordFind(recordFind(s, 'a/easy', 2000), 'a/easy', 2000);
    s = recordRevealed(recordRevealed(s, 'a/hard'), 'a/hard');
    s = recordFind(recordWrong(recordWrong(s, 'a/mid'), 'a/mid'), 'a/mid', 9000);
    s = recordFind(s, 'a/mid', 5000);
    s = recordRevealed(s, 'a/once');
    expect(difficulty(s.items['a/hard'])).toBeGreaterThan(difficulty(s.items['a/mid']));
    expect(difficulty(s.items['a/mid'])).toBeGreaterThan(difficulty(s.items['a/easy']));
    expect(hardestItems(s, 10).map((x) => x.key)).toEqual(['a/hard', 'a/mid', 'a/easy']);
  });
});

describe('parsePlayStats', () => {
  it('壞資料當作空的；不合法的欄位丟掉', () => {
    expect(parsePlayStats(null)).toEqual(EMPTY_PLAY_STATS);
    expect(parsePlayStats({ version: 9 })).toEqual(EMPTY_PLAY_STATS);
    const ok = parsePlayStats({ version: 1, items: { [KEY]: { asked: 2, found: 1, wrong: 'x', hints: -1, revealed: 1, findMs: 3000 }, bad: 5 } });
    expect(ok.items).toEqual({ [KEY]: { asked: 2, found: 1, wrong: 0, hints: 0, revealed: 1, findMs: 3000 } });
  });
});

describe('strugglingItems', () => {
  it('只列這個街區、問夠次數、分數超過門檻的', () => {
    let s = EMPTY_PLAY_STATS;
    s = recordRevealed(recordRevealed(s, 'gym/rope'), 'gym/rope');
    s = recordFind(recordFind(s, 'gym/ball', 1000), 'gym/ball', 1000);
    s = recordRevealed(recordRevealed(s, 'park/tree'), 'park/tree');
    expect(strugglingItems(s, 'gym')).toEqual([{ id: 'rope', flag: expect.stringMatching(/^玩家常找不到/) }]);
    expect(HARD_SCORE).toBeGreaterThan(difficulty(s.items['gym/ball']));
  });
});
