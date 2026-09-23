// 朗讀稿與驗收（純函式）：一個場景一種語言送一份朗讀稿給 miko-ws（ChatGPT 讀出來），
// whisper 聽寫整段 → 對回每個詞大概在哪裡；切好之後再逐段聽寫，確認每段真的是那個詞。
import { pinyin } from 'pinyin-pro';

export const VOICE_LANGS = ['en', 'ja', 'zh'];

/** 要念的字（日語念漢字寫法，讓 ChatGPT 用正常的重音；驗收時讀音也算對） */
export function spokenText(words, lang) {
  if (lang === 'en') return words.en;
  if (lang === 'ja') return words.ja.text;
  if (lang === 'zh') return words['zh-TW'];
  throw new Error(`不支援的語言：${lang}`);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** 朗讀稿：一行一個詞，每行一個句號 */
export function takeScript(wordsList, lang) {
  return wordsList
    .map((w) => (lang === 'en' ? `${cap(spokenText(w, 'en'))}.` : `${spokenText(w, lang)}。`))
    .join('\n');
}

/** ChatGPT 回的原稿要和朗讀稿逐行一致（多一句開場白也會多出一段聲音） */
export function spokenMatches(script, spoken) {
  const lines = (s) => String(s).split('\n').map((l) => l.trim()).filter(Boolean);
  const a = lines(script);
  const b = lines(spoken);
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * 比對用的形式：去掉標點空白。中文轉成無聲調拼音（whisper 聽短詞常寫成同音字：長椅 → 常译），
 * 日語片假名轉平假名。
 */
export function normalizeHeard(text, lang) {
  const bare = String(text).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  if (lang === 'zh') return bare ? pinyin(bare, { toneType: 'none', type: 'array' }).join('') : '';
  if (lang === 'ja') return toHiragana(bare);
  return bare;
}

export function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)));
    }
    prev = row;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/** 逐段驗收的門檻 */
export const PASS_SCORE = { en: 0.75, ja: 0.6, zh: 0.75 };

/** 聽寫結果和預期的相似度（日語取漢字寫法、讀音兩者較高者） */
export function heardScore(words, lang, heard) {
  const h = normalizeHeard(heard, lang);
  return Math.max(...expectedForms(words, lang).map((e) => similarity(e, h)));
}

const MAX_UNITS = 8;
const MISS_COST = 1;
const EXTRA_COST = 0.5;

/**
 * 整段聽寫（whisper 的詞 / 字，含時間）對回預期的詞表：DP 允許漏念（ChatGPT 念長串時偶爾跳過一個）
 * 和多聽（whisper 在空白處幻聽）。一個詞可以對到連續好幾個聽寫單位（street + light）。
 * @param {Array<object>} wordsList 預期的詞（順序同朗讀稿）
 * @param {Array<{ text: string, from: number, to: number }>} units
 * @returns {Array<{ from: number, to: number, heard: string, score: number } | null>} 對不上（或太不像）是 null
 */
export function alignItems(wordsList, units, lang, minScore = 0.5) {
  const n = wordsList.length;
  const m = units.length;
  const norm = units.map((u) => normalizeHeard(u.text, lang));
  const forms = wordsList.map((w) => expectedForms(w, lang));
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cost[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c === Infinity) continue;
      const relax = (a, b, v, step) => { if (v < cost[a][b]) { cost[a][b] = v; back[a][b] = step; } };
      if (j < m) relax(i, j + 1, c + (norm[j] ? EXTRA_COST : 0), { i, j, k: 0 });
      if (i < n) relax(i + 1, j, c + MISS_COST, { i, j, k: -1 });
      if (i === n) continue;
      let joined = '';
      for (let k = 1; k <= MAX_UNITS && j + k <= m; k++) {
        joined += norm[j + k - 1];
        if (!joined) continue;
        const score = Math.max(...forms[i].map((e) => similarity(e, joined)));
        relax(i + 1, j + k, c + (1 - score), { i, j, k, score });
      }
    }
  }
  const out = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const step = back[i][j];
    if (step.k > 0 && step.score >= minScore) {
      const us = units.slice(step.j, step.j + step.k);
      out[step.i] = { from: us[0].from, to: us[us.length - 1].to, heard: us.map((u) => u.text).join(''), score: step.score };
    }
    i = step.i;
    j = step.j;
  }
  return out;
}

function expectedForms(words, lang) {
  const forms = lang === 'ja' ? [words.ja.text, words.ja.reading] : [spokenText(words, lang)];
  return forms.map((f) => normalizeHeard(f, lang));
}
