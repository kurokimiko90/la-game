// 整合失敗的診斷：不再只是等時間重試，先請 codex（miko-ws 指揮中心，唯讀 sandbox）讀錯誤、log、程式碼，
// 寫一份原因分析 + 建議修法到 .auto-expand/diagnosis/，並用 Telegram 通知。只診斷、不改任何檔案；修不修由人決定。
// 同一個場景、同一個錯誤只診斷一次（每次重試都會再失敗，不重複花額度）。

/** 錯誤的指紋：第一行（去掉時間、數字），同樣的失敗不重複診斷 */
export const errorSignature = (message) => String(message).split('\n')[0].replace(/\b\d+\b/g, '#').trim().slice(0, 200);

/**
 * 要不要診斷：只診斷整合階段（規劃、生成失敗多半是 miko-ws 連不上），內容不夠（skippable）不診斷，同一個錯誤只一次。
 * @param {object} state 失敗當下的 state（phase 是出錯的步驟）
 */
export function shouldDiagnose(state, { message, skippable = false }) {
  if (skippable || state.phase !== 'integrating' || !state.current) return false;
  return !(state.current.diagnosed ?? []).includes(errorSignature(message));
}

/** 診斷過的錯誤記進 current（current 換場景就重置） */
export const markDiagnosed = (state, message) => (state.current
  ? { ...state, current: { ...state.current, diagnosed: [...new Set([...(state.current.diagnosed ?? []), errorSignature(message)])] } }
  : state);

/** 錯誤訊息裡提到的 log（.auto-expand/<name>.log）轉成絕對路徑，再加上固定要看的 */
export function relatedLogs(root, message) {
  const named = [...String(message).matchAll(/\.auto-expand\/[\w.-]+\.log/g)].map((m) => `${root}/${m[0]}`);
  return [...new Set([...named, `${root}/.auto-expand/auto-expand.log`, `${root}/test-results`])];
}

export function buildDiagnosisPrompt({ root, sceneId, sceneName, error, logs }) {
  return `你是「記憶小鎮」（la-game，Next.js 16 + React 19 + TypeScript）的資深工程師，負責診斷自動擴展的失敗。只能讀、不能改任何檔案。
專案在 ${root}（先讀 ${root}/CLAUDE.md、${root}/docs/expansion.md）。

自動擴展在整合新街區「${sceneName}」（${sceneId}）時失敗：
\`\`\`
${String(error).slice(0, 4000)}
\`\`\`
相關 log：${logs.join('、')}（e2e 失敗的頁面快照在 test-results/*/error-context.md）。

請讀 log 和相關程式碼，找出根本原因，不要猜。常見原因：街區變多後的效能（DOM 太大、逾時）、新場景資料觸發的邊界情況、測試假設過時、環境問題（port 被占用、機器負載）。

用繁體中文回答，格式固定：
## 原因
（一到三句，指出檔案:行號與證據）
## 建議修法
（要改哪個檔、怎麼改；不需要改程式就寫「不用改程式」並說明，例如環境問題重試即可）
## 信心
（高 / 中 / 低，一句話說明還缺什麼證據）`;
}

export function diagnosisReport({ sceneId, sceneName, error, at, answer }) {
  return `# 整合失敗診斷：${sceneName}（${sceneId}）\n\n- 時間：${at}\n- 錯誤：\n\n\`\`\`\n${String(error).slice(0, 2000)}\n\`\`\`\n\n${answer.trim()}\n`;
}

/** Telegram 摘要：場景 + 原因段落（截斷）+ 報告路徑 */
export function telegramSummary({ sceneName, answer, file }) {
  const cause = answer.match(/## 原因\s*([\s\S]*?)(\n## |$)/)?.[1]?.trim() ?? answer.trim();
  return `la-game 自動擴展卡住：${sceneName}\n${cause.slice(0, 600)}\n\n完整診斷：${file}`;
}

/**
 * 用 miko-ws 的 Telegram bot 通知管理員（TELEGRAM_TOKEN / ADMIN_ID，排程從 miko-ws 帶進來的環境變數）。
 * 沒設定或送不出去就回 false，不擋流程。
 */
export async function notifyTelegram(text, env = process.env, fetchFn = fetch) {
  const token = env.TELEGRAM_TOKEN;
  const chatId = env.ADMIN_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
