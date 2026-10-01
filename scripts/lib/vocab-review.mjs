// 單字審核：規劃（scene-plan 的格式驗證）通過後，再請 LLM 當語言老師審一次內容。
// 審的是格式驗證看不出來的：日文是不是最自然的說法、讀音對不對、中文是不是台灣常用說法、這個場景裡會不會真的看到。
// 有修正就套用，沒修正的不合格物品丟掉；審核自己沒回到的物品照留（審核失誤不擋整個流程）。

/** 審核丟掉超過這個比例就當作審核本身不可靠（實測會因為區域不理想丟掉一半），只套用修正、不丟物品 */
export const MAX_REJECT_RATIO = 0.2;

const KANA_RE = /^[ぁ-ゟ゠-ヿー・ 　]+$/;
const CJK_RE = /[一-鿿]/;

/** 一個場景的物品一次送審；zones：區域 id → 名稱（讓審核知道物品放在哪一區，例如健身房的泳池邊） */
export function buildReviewPrompt({ sceneName, elements, zones = {} }) {
  const lines = elements.map((e) => `- ${e.id}【${zones[e.zone] ?? e.zone}】：${e.en}｜${e.zh}｜${e.ja}（${e.reading}）`);
  return [
    `你是日語和英語老師，替一個語言學習找物遊戲審單字。場景是「${sceneName}」，玩家在場景裡點物品聽發音、記單字。`,
    '逐一檢查下面每個物品（格式：id【所在區域】：英文｜繁體中文｜日文（讀音假名））。物品的圖已經照英文畫好了。',
    '1. 日文是日本人對這個東西最自然常用的說法；讀音假名正確',
    '2. 英文是最常用的說法；繁體中文是台灣常用說法',
    `3. 這個東西在「${sceneName}」裡會出現（放在哪一區由別人決定，區域只是參考，不要因為區域判錯）`,
    '4. 不要太專業或罕見（一般學習者用得到）',
    '',
    ...lines,
    '',
    '只回 JSON，不要其他文字：{"items":[{"id":"...","ok":true}]}',
    '只在確定有錯時才寫 "ok":false（說法可以接受就算 ok）。有問題的寫 "issue"（中文、20 字內）。',
    '同一個東西只是中文或日文說法不對，附 "fix"（只放要改的欄位：zh / ja / reading，讀音要和日文一致）；',
    '英文不對、或這個東西不該出現在這裡，不要附 fix（不能換成別的東西，圖已經畫好了）。',
  ].join('\n');
}

/**
 * fix 裡合格的欄位；有任何一個欄位不合格就整個不採用（回 null）。
 * 不收 en：圖是照英文畫的，改英文等於換了一個東西（實測審核會把泳帽「修」成水壺）。
 */
function validFix(fix) {
  if (!fix || typeof fix !== 'object' || fix.en !== undefined) return null;
  const changes = {};
  for (const key of ['zh', 'ja', 'reading']) {
    if (fix[key] === undefined) continue;
    const v = String(fix[key]).trim();
    if (!v) return null;
    if (key === 'reading' && !KANA_RE.test(v)) return null;
    if (key === 'zh' && !CJK_RE.test(v)) return null;
    changes[key] = v;
  }
  return Object.keys(changes).length ? changes : null;
}

/**
 * @param {object[]} elements 規劃好的物品
 * @param {Array<{ id: string, ok: boolean, issue?: string, fix?: object }>} verdicts 審核結果
 * @returns {{ ok: object[], fixed: Array<{ id: string, issue: string, changes: object }>, rejected: Array<{ id: string, reason: string }>, unreliable: boolean }}
 */
export function applyReview(elements, verdicts) {
  const byId = new Map((Array.isArray(verdicts) ? verdicts : []).filter((v) => v && typeof v.id === 'string').map((v) => [v.id, v]));
  const ok = [];
  const fixed = [];
  const rejected = [];
  for (const e of elements) {
    const v = byId.get(e.id);
    if (!v || v.ok !== false) {
      ok.push(e);
      continue;
    }
    const issue = String(v.issue ?? '不合適').trim().slice(0, 40);
    const changes = validFix(v.fix);
    if (changes) {
      ok.push({ ...e, ...changes });
      fixed.push({ id: e.id, issue, changes });
    } else {
      rejected.push({ id: e.id, reason: `審核：${issue}` });
    }
  }
  if (rejected.length > elements.length * MAX_REJECT_RATIO) {
    const fixedById = new Map(ok.map((e) => [e.id, e]));
    return { ok: elements.map((e) => fixedById.get(e.id) ?? e), fixed, rejected: [], unreliable: true };
  }
  return { ok, fixed, rejected, unreliable: false };
}
