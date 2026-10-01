// 看圖驗收：物件每 SHEET_SIZE 個拼成一張編號對照表（scripts/review-scene.mjs 用 Chrome 畫），
// 附圖交給 miko-ws 的 codex（codex exec --image），問「每格是不是描述的東西」和「哪些長得太像會認錯」。
// 2026-10-01 起；準確度還沒校準過，結果只進待人工審清單，不擋 commit。

export const SHEET_SIZE = 20;

/** 切成一張圖一組，每組編號從 1 開始（對照表上的格子編號） */
export function chunkItems(items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += SHEET_SIZE) chunks.push(items.slice(i, i + SHEET_SIZE).map((it, k) => ({ n: k + 1, ...it })));
  return chunks;
}

export function buildVisualPrompt(sceneName, chunk) {
  return [
    `附圖是語言學習找物遊戲「${sceneName}」的物件對照表，每格左上角有編號。玩家要靠這張圖認出東西、學單字。`,
    '逐格檢查：圖是不是清單上寫的東西？一般人看得出來嗎？（風格簡單沒關係，只看會不會認錯或看不懂）',
    '另外找出長得太像、玩家會分不清的格子（兩兩一組）。',
    '',
    ...chunk.map((it) => `${it.n}. ${it.en}（${it.zh}）：${it.desc ?? ''}`),
    '',
    '只回 JSON，不要其他文字：{"items":[{"n":1,"ok":true}],"similar":[[2,5]]}',
    '看不出是什麼、或畫成別的東西才寫 "ok":false 和 "issue"（中文、20 字內）；可以接受就算 ok。沒有太像的就給空陣列。',
  ].join('\n');
}

/** codex 回的文字 → 標記的物件 id 與太像的 id 組；不認得的編號忽略 */
export function parseVisual(raw, chunk) {
  const text = String(raw);
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const byN = new Map(chunk.map((it) => [it.n, it.id]));
  const flagged = (Array.isArray(json.items) ? json.items : [])
    .filter((v) => v && v.ok === false && byN.has(v.n))
    .map((v) => ({ id: byN.get(v.n), flag: `看圖：${String(v.issue ?? '看不出是什麼').trim().slice(0, 40)}` }));
  const similar = (Array.isArray(json.similar) ? json.similar : [])
    .filter((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((n) => byN.has(n)))
    .map((pair) => pair.map((n) => byN.get(n)));
  return { flagged, similar };
}
