// 單字正規化：codex 常把物品 id 的寫法（air-conditioner）當成英文單字，日語讀音也常把片假名轉成平假名。
// 規劃（scene-plan validateElements）和單字審核都經過這裡；content/plans 與 svg-manifests 也用它一次修正過。

/** 英文本來就帶連字號的詞（其餘的連字號都換成空白） */
const HYPHENATED = [
  'check-in', 'x-ray', 'yo-yo', 'walkie-talkie', 'flip-flop', 'go-kart', 'pull-up', 'push-up', 'wind-up',
  'full-length', 'non-slip', 'coin-operated', 't-shirt', 'tie-dye', 'hi-fi', 'walk-in', 'pop-up', 'ping-pong',
  'roll-on', 'built-in', 'one-way', 'drive-through',
];
const HYPHEN_RE = new RegExp(`\\b(${HYPHENATED.map((w) => w.replace('-', '\\-')).join('|')})\\b`, 'g');

/** @param {string} en */
export function normalizeEn(en) {
  const keep = [];
  const masked = String(en).trim().toLowerCase().replace(HYPHEN_RE, (m) => `\u0000${keep.push(m) - 1}\u0000`);
  return masked.replace(/-/g, ' ').replace(/\s+/g, ' ').trim().replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}

const KANA_ONLY_RE = /^[ぁ-ゟ゠-ヿー・ 　]+$/;
const KATAKANA_RUN_RE = /[ァ-ヺー]+/g;
const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * 讀音跟寫法對齊：純假名的詞讀音就是寫法本身；有漢字的詞，寫法裡的片假名在讀音裡也保留片假名（手荷物カート → てにもつカート）。
 * @param {string} text @param {string} reading
 */
export function normalizeReading(text, reading) {
  const t = String(text).trim();
  let r = String(reading).trim();
  if (KANA_ONLY_RE.test(t)) return t;
  let from = 0;
  for (const run of t.match(KATAKANA_RUN_RE) ?? []) {
    if (!/[ァ-ヺ]/.test(run)) continue;
    const at = r.indexOf(toHiragana(run), from);
    if (at < 0) {
      const kept = r.indexOf(run, from);
      if (kept >= 0) from = kept + run.length;
      continue;
    }
    r = r.slice(0, at) + run + r.slice(at + run.length);
    from = at + run.length;
  }
  return r;
}
