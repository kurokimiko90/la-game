#!/usr/bin/env node
// 發音音檔：每個有 SVG 的物件 × 英語 / 日語 → public/audio/<lang>/<scene>/<itemId>.mp3
//
//   node scripts/build-audio.mjs            # 只補缺的（冪等）
//   node scripts/build-audio.mjs --force    # 全部重做
//
// 用 edge-tts（需 `pip install edge-tts`）。原型用合成音，正式版核心詞改真人錄音（見 docs/planning.md）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src', 'data', 'scenes');
const OUT_DIR = path.join(ROOT, 'public', 'audio');
const CONCURRENCY = 4;
const VOICES = {
  en: { voice: 'en-US-JennyNeural', rate: '-10%', text: (w) => w.en },
  ja: { voice: 'ja-JP-NanamiNeural', rate: '-10%', text: (w) => w.ja.text },
};

function runTts({ voice, rate, text, out }) {
  return new Promise((resolve, reject) => {
    const child = spawn('edge-tts', ['--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0
      ? resolve()
      : reject(new Error(`edge-tts exit ${code}: ${stderr.slice(-200)}`))));
  });
}

async function main() {
  const force = process.argv.includes('--force');
  const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
  const jobs = [];
  for (const { id: sceneId } of index) {
    const scene = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sceneId}.json`), 'utf8'));
    for (const item of scene.items) {
      for (const [lang, v] of Object.entries(VOICES)) {
        const out = path.join(OUT_DIR, lang, sceneId, `${item.id}.mp3`);
        if (!force && fs.existsSync(out) && fs.statSync(out).size > 0) continue;
        jobs.push({ voice: v.voice, rate: v.rate, text: v.text(item.words), out, label: `${lang}/${sceneId}/${item.id}` });
      }
    }
  }
  console.log(`待產生 ${jobs.length} 個音檔`);

  const failed = [];
  let done = 0;
  const worker = async () => {
    while (jobs.length) {
      const job = jobs.shift();
      fs.mkdirSync(path.dirname(job.out), { recursive: true });
      try {
        await runTts(job);
      } catch (e) {
        failed.push(`${job.label}: ${e.message}`);
      }
      done++;
      if (done % 20 === 0) console.log(`  ${done} 完成`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`完成 ${done - failed.length}，失敗 ${failed.length}`);
  failed.forEach((f) => console.log(`  ✗ ${f}`));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`失敗：${e.message}`);
  process.exit(1);
});
