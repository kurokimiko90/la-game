// 自動擴展的「情境規劃」：請 miko-ws（codex）把每個區域想成真實空間，把物品分到幾組情境（見 staging.mjs），
// 回來的 JSON 先修整（丟掉不存在 / 重複 / 放錯區域的物品、不能用的家具、重疊的組），再驗證；
// 修不好就回傳問題，呼叫端可以帶著問題重問一次，還是不行就不用情境（照舊自動排列）。純函式。
import { FIXTURES, ROWS, SLOTS, validateStage } from './staging.mjs';
import { extractJson } from './scene-plan.mjs';

const FIXTURE_TEXT = {
  desk: '書桌 / 工作桌（有桌腳）', counter: '實心長櫃台', cabinet: '矮櫃', display: '玻璃展示櫃', shelf: '靠牆開放層架（兩層，只能 back、室內）',
  stand: '階梯陳列台（兩層）', 'cloth-table': '鋪桌布的長桌', rug: '地毯（主體物件站在上面）', platform: '木平台', planter: '長條花台（植物放 on）',
  board: '牆上布告板（只能 back、室內，物品放 wall）', facade: '建築門面（只能 back、室外，物品放 wall；加 "door": true 畫出入口）',
};

/** 這個場景可以用的家具（和單字撞名的不能用：背景不能長得像可點的物品） */
export function usableFixtures(words) {
  const set = new Set(words.map((w) => w.toLowerCase()));
  return Object.keys(FIXTURES).filter((k) => !FIXTURES[k].words.some((w) => set.has(w)));
}

/**
 * @param {{ plan: object, available: string[], problems?: string[] }} input
 *   problems：上一次回答的問題（重問時附上）
 */
export function buildStagePrompt({ plan, available, problems = [] }) {
  const has = new Set(available);
  const elements = plan.elements.filter((e) => has.has(e.id));
  const fixtures = usableFixtures(elements.map((e) => e.en));
  const zoneText = plan.zones.map((z) => {
    const list = elements.filter((e) => e.zone === z.id && !['road', 'track', 'water', 'sky'].includes(e.spot));
    return [
      `### ${z.id}（${z.name}，${z.indoor ? '室內，有後牆' : '室外'}，地面 ${z.floor}${z.feature !== 'none' ? `，地形 ${z.feature}` : ''}）`,
      ...list.map((e) => `- ${e.id}：${e.zh}，${e.size}`),
    ].join('\n');
  }).join('\n\n');
  return [
    '你是城市遊戲的場景規劃師。語言學習找物遊戲《記憶小鎮》的街區「' + plan.name + '」有 4 個區域，每個區域是 3/4 俯視的一塊 1300×650 空間（室內上方 180 是後牆）。',
    '請把每個區域的物品安排成真實世界裡會看到的樣子：先想這個空間實際怎麼用（動線、櫃台、座位區、靠牆的設備），拆成 3–6 組「情境」，每組是一件家具或一個主體物品，其他物品依和它的關係擺。',
    '',
    '每組的欄位：',
    `- row：${ROWS.join(' | ')}（back 靠後牆 / 建築，mid 中間，front 靠近鏡頭）。前排盡量留空當走道，大部分東西放 back 和 mid。`,
    '- x：[a, b]，這組佔區域寬度的比例（0–1）。同一排的組不能重疊，組和組之間留一點空隙。',
    `- fixture（可省略）：背景家具，只能用 ${fixtures.join(' | ')}。說明：${fixtures.map((f) => `${f}=${FIXTURE_TEXT[f]}`).join('；')}`,
    '- main（可省略）：當主體的物品 id（沙發、推車、冰箱這類大東西）。',
    '- on：放在家具檯面上、或主體物品上面的小東西。',
    '- wall：掛在這組上方牆上的東西（室內；室外只有 facade 能掛）。只掛牆的組可以不要 fixture 和 main。',
    '- beside：立在家具 / 主體兩側地上的東西。',
    '- front：散在這組前面地上的東西（掉在地上的小物）。',
    '- note：這組是什麼（繁體中文，例如「掛號櫃台」）。',
    '規則：每個列出的物品剛好出現一次；小東西不要單獨放在地上，要放在合理的家具上；大設備靠牆；同類的東西放一起（例如文具都在同一張桌上）。',
    '',
    '物品（id：名稱，大小）：',
    zoneText,
    '',
    ...(problems.length ? ['上一次的回答有這些問題，請修正：', ...problems.map((p) => `- ${p}`), ''] : []),
    '只回傳 JSON，不要其他文字：',
    '{"zones":{"lobby":{"sets":[{"note":"掛號櫃台","row":"back","x":[0.3,0.6],"fixture":"desk","on":["telephone"],"wall":["clock"],"beside":["plant"]}]}}}',
  ].join('\n');
}

const overlaps = (a, b) => a.x[0] < b.x[1] && b.x[0] < a.x[1];
const wallOnly = (set) => set.fixture === 'board' || set.fixture === 'facade' || (!set.fixture && !set.main && !['on', 'beside', 'front'].some((k) => set[k]?.length));

// 一組的修整：欄位型別、物品清單、家具
function cleanSet(raw, { zoneId, zoneOf, fixtures, seen, indoor }) {
  const take = (id) => {
    if (typeof id !== 'string' || zoneOf[id] !== zoneId || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const set = { row: ROWS.includes(raw.row) ? raw.row : 'mid' };
  if (typeof raw.note === 'string') set.note = raw.note.slice(0, 20);
  const x = Array.isArray(raw.x) ? raw.x.map(Number) : [];
  set.x = x.length === 2 && x.every((n) => n >= 0 && n <= 1) && x[0] < x[1] ? x : null;
  const fx = FIXTURES[raw.fixture];
  if (fx && fixtures.includes(raw.fixture) && !(fx.indoor && !indoor) && !(fx.outdoor && indoor)) {
    set.fixture = raw.fixture;
    if (fx.back) set.row = 'back';
    if (raw.fixture === 'facade' && raw.door === true) set.door = true;
  }
  if (take(raw.main)) set.main = raw.main;
  if (raw.over === true && set.main) set.over = true;
  for (const slot of SLOTS) {
    const list = (Array.isArray(raw[slot]) ? raw[slot] : []).filter(take);
    if (list.length) set[slot] = list;
  }
  // 沒有東西可以放在上面 → 改放前面地上；室外沒有門面 → 牆上的改放旁邊
  const canHold = (set.fixture && !FIXTURES[set.fixture].wallOnly && set.fixture !== 'facade') || set.main;
  if (set.on && !canHold) { set.front = [...(set.front ?? []), ...set.on]; delete set.on; }
  if (set.wall && !indoor && set.fixture !== 'facade') { set.beside = [...(set.beside ?? []), ...set.wall]; delete set.wall; }
  if (set.over && !set.wall) delete set.over;
  return set;
}

/**
 * LLM 回的文字 → 修整過的情境 + 驗證結果。
 * @param {string} raw
 * @param {{ plan: object, available: string[], terrain: object }} ctx
 * @returns {{ stage: object, problems: string[], dropped: string[] }}  dropped：沒被安排到的物品（會照舊自動排列）
 */
export function parseStage(raw, { plan, available, terrain }) {
  const data = extractJson(raw);
  const has = new Set(available);
  const elements = plan.elements.filter((e) => has.has(e.id) && !['road', 'track', 'water', 'sky'].includes(e.spot));
  const zoneOf = Object.fromEntries(elements.map((e) => [e.id, e.zone]));
  const words = plan.elements.filter((e) => has.has(e.id)).map((e) => e.en);
  const fixtures = usableFixtures(words);
  const seen = new Set();
  const zones = {};
  for (const z of plan.zones) {
    const release = (s) => { for (const id of [s.main, ...SLOTS.flatMap((k) => s[k] ?? [])].filter(Boolean)) seen.delete(id); };
    const sets = (Array.isArray(data.zones?.[z.id]?.sets) ? data.zones[z.id].sets : [])
      .map((s) => cleanSet(s ?? {}, { zoneId: z.id, zoneOf, fixtures, seen, indoor: z.indoor }));
    // 範圍不合法、同一排和前面的組重疊：丟掉，它的物品回到自動排列
    const kept = [];
    for (const s of sets) {
      const empty = !(s.fixture || s.main || SLOTS.some((k) => s[k]?.length));
      const clash = s.x && kept.some((k) => k.row === s.row && overlaps(k, s) && !wallOnly(k) && !wallOnly(s));
      if (!s.x || empty || clash) release(s);
      else kept.push(s);
    }
    // 天空的東西 LLM 不管：沿區域上緣平均排開
    const sky = plan.elements.filter((e) => has.has(e.id) && e.zone === z.id && e.spot === 'sky');
    if (kept.length) zones[z.id] = { sets: kept, ...(sky.length ? { sky: Object.fromEntries(sky.map((e, i) => [e.id, +((i + 0.5) / sky.length).toFixed(2)])) } : {}) };
  }
  const stage = { zones };
  const problems = validateStage({ stage, zoneOf: Object.fromEntries(plan.elements.filter((e) => has.has(e.id)).map((e) => [e.id, e.zone])), terrain, words });
  const dropped = elements.filter((e) => !seen.has(e.id)).map((e) => e.id);
  return { stage, problems, dropped };
}
