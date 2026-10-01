// 構圖審查：街區每個區域在試玩伺服器上截一張圖（scripts/review-scene.mjs --layout），附圖交給 miko-ws 的 codex，
// 問擺放合不合理（東西放錯地方、浮空、擠成一團、整區空蕩）並給 1–5 分。結果只進待人工審清單。

export function buildLayoutPrompt(sceneName, zones) {
  return [
    `附圖是語言學習找物遊戲「${sceneName}」街區的 ${zones.length} 個區域（俯視 3/4 角度的 2D 插圖，物件正面直立）。玩家在場景裡找東西、記單字，物件位置會固定下來。`,
    '依附圖順序，每張是一個區域，裡面應該有這些物品（英文 中文）：',
    ...zones.map((z, i) => `第 ${i + 1} 張：${z.name}（${z.id}）：${z.items.map((it) => `${it.en} ${it.zh}`).join('、')}`),
    '',
    '判斷擺放合不合理：東西放在不會出現的地方（例如床在馬路上、魚在草地上）、浮在空中或牆上不該掛的、互相疊在一起看不清、擠成一團或整區空蕩、和區域主題不搭。',
    '風格簡單、地面是模板沒關係，只看擺放。',
    '只回 JSON，不要其他文字：{"score":4,"issues":[{"zone":"區域 id","issue":"中文 30 字內","items":["英文名"]}]}',
    'score：1 = 很亂看不懂、3 = 可以玩但有明顯問題、5 = 自然合理。沒問題 issues 給空陣列；items 只放有問題的物品，看不出是哪個就給空陣列。',
  ].join('\n');
}

/** codex 回的文字 → { score, issues }；物品用 id 或英文對回 id，不認得的區域、物品丟掉 */
export function parseLayout(raw, zones) {
  const text = String(raw);
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const zoneIds = new Set(zones.map((z) => z.id));
  const lookup = new Map(zones.flatMap((z) => z.items.flatMap((it) => [[it.id, it.id], [it.en.toLowerCase(), it.id]])));
  const score = Number.isFinite(json.score) ? Math.min(5, Math.max(1, Math.round(json.score))) : null;
  const issues = (Array.isArray(json.issues) ? json.issues : [])
    .filter((x) => x && zoneIds.has(x.zone) && typeof x.issue === 'string')
    .map((x) => ({
      zone: x.zone,
      issue: x.issue.trim().slice(0, 60),
      items: (Array.isArray(x.items) ? x.items : []).map((n) => lookup.get(String(n).toLowerCase())).filter(Boolean),
    }));
  return { score, issues };
}
