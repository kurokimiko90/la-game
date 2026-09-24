#!/usr/bin/env node
// 發音（ChatGPT 的聲音）：一個場景一種語言，整份朗讀稿送 miko-ws 念一次 → 切成每個詞 → whisper 驗收 → mp3
//
//   node scripts/build-voice.mjs                 # 所有場景 × en/ja/zh，只做還沒通過驗收的詞
//   node scripts/build-voice.mjs park --lang=zh  # 指定場景 / 語言
//   node scripts/build-voice.mjs park --force    # 全部重錄
//   node scripts/build-voice.mjs park --recut    # 不錄音，用 .cache 裡的錄音重切（調切割參數用）
//
// 流程：whisper 聽寫整段 → 對回每個詞的大概位置（漏念的詞會對不上）→ 在附近最安靜處下刀 →
// 每段單獨再聽寫一次，像那個詞才寫入 public/audio。沒過的詞集中再錄一次（最多 MAX_ROUNDS 輪），
// 還是沒過就保留原本的 edge-tts 音檔（build-audio.mjs 產生的），列在最後。
// 通過的詞記在 content/voice/<scene>.json，build-audio 不會覆蓋它們。錄音原檔在 .cache/voice-takes/。
//
// 需要：miko-ws 指揮中心在跑（ChatGPT 帳號）、ffmpeg、whisper-cli
// 與模型（WHISPER_MODEL，預設 ~/whisper-models/ggml-large-v3-turbo.bin）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gptVoice } from './lib/miko.mjs';
import { cutAround, frameEnergy, padClip, renderClip, wavBuffer } from './lib/voice-cut.mjs';
import { PASS_SCORE, VOICE_LANGS, alignItems, heardScore, spokenMatches, spokenText, takeScript } from './lib/voice-take.mjs';
import { localIso } from './lib/local-time.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src', 'data', 'scenes');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const STATE_DIR = path.join(ROOT, 'content', 'voice');
const TAKE_DIR = path.join(ROOT, '.cache', 'voice-takes');
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(os.homedir(), 'whisper-models', 'ggml-large-v3-turbo.bin');
const RATE = 24000;
const MAX_ROUNDS = 3;

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 28, ...opts });
  if (r.error) throw new Error(`${cmd} 跑不起來：${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} 失敗：${String(r.stderr ?? '').slice(-300)}`);
  return r.stdout;
}

/** 任何音檔 → 16-bit 單聲道 PCM */
function decode(file, rate = RATE) {
  const pcm = run('ffmpeg', ['-v', 'error', '-i', file, '-ar', String(rate), '-ac', '1', '-f', 's16le', '-']);
  return new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length));
}

function writeWav(samples, file, rate = RATE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wavBuffer(samples, rate));
}

/**
 * whisper 聽寫多個檔（模型只載一次）→ 每個檔的 segments。
 * words：-ml 1 一段一個 token；英語加 -sow 合成整個詞（中日文沒有空格，加了會整段黏成一個）。
 */
function transcribe(files, lang, { words = false } = {}) {
  if (!fs.existsSync(WHISPER_MODEL)) throw new Error(`找不到 whisper 模型：${WHISPER_MODEL}（設 WHISPER_MODEL）`);
  const split = lang === 'en' ? ['-ml', '1', '-sow'] : ['-ml', '1'];
  const args = ['-m', WHISPER_MODEL, '-l', lang, '-oj', '-np', ...(words ? split : ['-nt'])];
  run('whisper-cli', [...args, ...files.flatMap((f) => ['-f', f])]);
  return files.map((f) => readJson(`${f}.json`, { transcription: [] }).transcription
    .map((t) => ({ text: t.text, from: t.offsets.from / 1000, to: t.offsets.to / 1000 })));
}

/** 錄一份：送朗讀稿、存原檔與它對應的詞 */
async function recordTake(sceneId, lang, items, round) {
  const script = takeScript(items.map((i) => i.words), lang);
  const file = path.join(TAKE_DIR, sceneId, `${lang}-${Date.now()}.aac`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const voice = await gptVoice(script, file);
  const take = {
    file: path.relative(ROOT, file), lang, round, itemIds: items.map((i) => i.id), account: voice.account,
    at: localIso(), verbatim: spokenMatches(script, voice.spoken),
  };
  writeJson(file.replace(/\.aac$/, '.json'), take);
  return take;
}

/** 切一份錄音 → 每個詞的 { item, clip | null, heard, score } */
function cutTake(take, itemsById, workDir) {
  const items = take.itemIds.map((id) => itemsById.get(id));
  const samples = decode(path.join(ROOT, take.file));
  const whole = path.join(workDir, 'whole.wav');
  writeWav(decode(path.join(ROOT, take.file), 16000), whole, 16000);
  const [units] = transcribe([whole], take.lang, { words: true });
  const spans = alignItems(items.map((i) => i.words), units, take.lang);
  const segs = cutAround(frameEnergy(samples, RATE), spans);
  const clips = segs.map((s) => (s ? renderClip(samples, RATE, s) : null));
  const files = clips.map((c, i) => (c ? path.join(workDir, `${i}.wav`) : null));
  clips.forEach((c, i) => c && writeWav(padClip(c, RATE), files[i]));
  const heard = files.some(Boolean) ? transcribe(files.filter(Boolean), take.lang) : [];
  let h = 0;
  return items.map((item, i) => {
    if (!clips[i]) return { item, clip: null, heard: '', score: 0 };
    const text = heard[h++].map((s) => s.text).join('').trim();
    return { item, clip: clips[i], heard: text, score: heardScore(item.words, take.lang, text) };
  });
}

function encodeMp3(clip, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'wav', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '64k', out], { input: wavBuffer(clip, RATE) });
}

/** 通過的寫 mp3 + 記錄；回傳沒通過的詞 */
function keepPassed(results, sceneId, lang, take, state) {
  const failed = [];
  for (const r of results) {
    const ok = r.clip && r.score >= PASS_SCORE[lang];
    const mark = ok ? '✓' : '✗';
    console.log(`    ${mark} ${spokenText(r.item.words, lang)} → ${r.heard || '（沒對上）'} ${r.score.toFixed(2)}`);
    if (!ok) { failed.push(r.item); continue; }
    encodeMp3(r.clip, path.join(AUDIO_DIR, lang, sceneId, `${r.item.id}.mp3`));
    state[lang] = { ...state[lang], [r.item.id]: { heard: r.heard, score: Number(r.score.toFixed(2)), take: path.basename(take.file), account: take.account } };
  }
  return failed;
}

function cachedTakes(sceneId, lang) {
  const dir = path.join(TAKE_DIR, sceneId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith(`${lang}-`) && f.endsWith('.json')).sort()
    .map((f) => readJson(path.join(dir, f)));
}

async function voiceSceneLang(scene, lang, opts) {
  const stateFile = path.join(STATE_DIR, `${scene.id}.json`);
  const state = readJson(stateFile, {});
  const itemsById = new Map(scene.items.map((i) => [i.id, i]));
  let pending = scene.items.filter((i) => opts.force || opts.recut || !state[lang]?.[i.id]);
  if (!pending.length) return [];
  const takes = opts.recut ? cachedTakes(scene.id, lang) : [];
  for (let round = 1; pending.length && round <= (opts.recut ? takes.length : MAX_ROUNDS); round++) {
    console.log(`  ${scene.id}/${lang} 第 ${round} 輪：${pending.length} 個詞`);
    const take = opts.recut ? takes[round - 1] : await recordTake(scene.id, lang, pending, round);
    if (take.verbatim === false) {
      console.log('    ChatGPT 沒有照朗讀稿輸出（多了或少了字），這份不用');
      continue;
    }
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'la-voice-'));
    try {
      const want = new Set(pending.map((i) => i.id));
      const results = cutTake(take, itemsById, workDir).filter((r) => want.has(r.item.id));
      pending = keepPassed(results, scene.id, lang, take, state);
      writeJson(stateFile, state);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
  return pending.map((i) => `${scene.id}/${lang}/${i.id}`);
}

function parseArgs(argv) {
  const langArg = argv.find((a) => a.startsWith('--lang='));
  const langs = langArg ? langArg.slice(7).split(',') : VOICE_LANGS;
  const bad = langs.filter((l) => !VOICE_LANGS.includes(l));
  if (bad.length) throw new Error(`不支援的語言：${bad.join(', ')}`);
  return { scenes: argv.filter((a) => !a.startsWith('--')), langs, force: argv.includes('--force'), recut: argv.includes('--recut') };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const index = readJson(path.join(DATA_DIR, 'index.json'), []);
  const known = index.map((s) => s.id);
  const unknown = opts.scenes.filter((s) => !known.includes(s));
  if (unknown.length) throw new Error(`沒有這些場景：${unknown.join(', ')}`);
  const sceneIds = opts.scenes.length ? opts.scenes : known;
  const left = [];
  for (const id of sceneIds) {
    const scene = readJson(path.join(DATA_DIR, `${id}.json`));
    for (const lang of opts.langs) left.push(...await voiceSceneLang(scene, lang, opts));
  }
  console.log(left.length ? `還是沒過、保留 edge-tts 的 ${left.length} 個：\n  ${left.join('\n  ')}` : '全部通過');
}

main().catch((e) => {
  console.error(`失敗：${e.message}`);
  process.exit(1);
});
