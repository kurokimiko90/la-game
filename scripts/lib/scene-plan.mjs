// 自動擴展的「場景規劃」：給 miko-ws（codex）的 prompt，以及把 LLM 回的 JSON 驗證、整理成
// content/plans/<scene>.json → manifest（miko-ws 生成 SVG 用）→ scene-config（擺放用）。
// LLM 的輸出不可信：每個欄位都驗證，不合格的物品丟掉並記下原因，不讓一個壞物品弄壞整個場景。純函式。
import { allowedSpots, buildDistrict, normalizeZone } from './district-kit.mjs';
import { MAX_MOTION_RATIO, MOTION_PRESETS } from './motion.mjs';

export const CATEGORIES = ['設施', '交通工具', '道具', '食物', '植物', '自然'];
export const SIZES = ['small', 'medium', 'large'];

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
const EN_RE = /^[a-z][a-z' -]*[a-z]$/;
const KANA_RE = /^[ぁ-ゟ゠-ヿー・ 　]+$/;
const CJK_RE = /[一-鿿]/;
const NO_TEXT_RE = /[0-9０-９A-Za-zＡ-Ｚａ-ｚ]/;

const SPOT_TEXT = {
  ground: '地上',
  wall: '掛在後牆上（時鐘、海報、壁架這類）',
  wallbase: '靠著後牆立著的大型設備（冰箱、販賣機、門）',
  surface: '放在檯面上',
  road: '車道上的車輛',
  track: '鐵軌上的列車',
  water: '水上的船或浮具',
  sky: '飄在空中（氣球、風箏）',
};
const FEATURE_TEXT = {
  none: '一般地面', road: '有一條車道', track: '有鐵軌', water: '有一片水池', counter: '有吧台',
  table: '有長桌', stand: '有階梯式陳列台', chiller: '有冷藏櫃', checkout: '有收銀台',
};

/** LLM 回的文字 → 第一個 JSON 物件（容許前後有說明文字或 ``` 圍欄） */
export function extractJson(text) {
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('回應裡沒有 JSON 物件');
  return JSON.parse(s.slice(start, end + 1));
}

/** 英文單字比對用：小寫、去掉結尾的 s（避免 glove / gloves 這種重複） */
export const wordKey = (en) => String(en).trim().toLowerCase().replace(/(es|s)$/, '');

export function buildOutlinePrompt({ theme, existingScenes }) {
  return [
    '你在幫語言學習找物遊戲《記憶小鎮》設計一個新街區。玩家在 2D 小鎮地圖上找東西，點物品會顯示單字並播放英語、日語發音。',
    `新街區主題：「${theme.name}」（id 用 ${theme.id}）。小鎮已經有：${existingScenes.join('、')}。`,
    '把街區分成剛好 4 個區域，依玩家走的路線排序（第 1 個是入口）。每個區域：',
    '- id：英文小寫 kebab-case',
    '- name：繁體中文 2–5 個字',
    '- indoor：true 或 false',
    '- floor：室內只能是 tile | wood | carpet；室外只能是 grass | paving | sand | concrete',
    '- feature：none | road（車道）| track（鐵軌）| water（水池）| counter（吧台）| table（長桌）| stand（階梯陳列台）| chiller（冷藏櫃）| checkout（收銀台）。road / track / water 只能在室外；4 個區域的 feature 盡量不同，至少 2 個不是 none。',
    '只回傳 JSON，不要其他文字：',
    `{"id":"${theme.id}","name":"${theme.name}","zones":[{"id":"entrance","name":"入口","indoor":false,"floor":"paving","feature":"none"}]}`,
  ].join('\n');
}

/** @returns {{ id: string, name: string, zones: object[] }} */
export function parseOutline(raw, { theme, usedZoneIds = [] }) {
  const data = extractJson(raw);
  const zones = Array.isArray(data.zones) ? data.zones : [];
  if (zones.length !== 4) throw new Error(`區域要剛好 4 個，收到 ${zones.length} 個`);
  const seen = new Set(usedZoneIds);
  const clean = zones.map((z, i) => {
    let id = ID_RE.test(z.id) ? z.id : `zone-${i + 1}`;
    if (seen.has(id)) id = `${theme.id}-${id}`;
    seen.add(id);
    const name = typeof z.name === 'string' && CJK_RE.test(z.name) ? z.name.trim().slice(0, 8) : `區域${i + 1}`;
    return normalizeZone({ ...z, id, name });
  });
  return { id: theme.id, name: theme.name, zones: clean };
}

/**
 * spots：這次只收這些位置（補元素時只要 ground）；existing：區域裡已經有的物品 { id, zh }，新的要和它們不同、可以搭配。
 * 可以放別的位置時，至少一半要放地上：不然 LLM 常把東西全擺在牆上和檯面上，地板空一大片。
 */
export function buildZonePrompt({ sceneName, zone, count, avoidEn, maxMotion, spots = allowedSpots(zone), existing = [] }) {
  const spotText = spots.map((s) => `${s}（${s === 'surface' ? `放在${FEATURE_TEXT[zone.feature].slice(1)}上` : SPOT_TEXT[s]}）`).join(' | ');
  const minGround = spots.length > 1 && spots.includes('ground') ? Math.ceil(count / 2) : 0;
  return [
    `語言學習找物遊戲《記憶小鎮》，街區「${sceneName}」裡的區域「${zone.name}」（${zone.indoor ? '室內' : '室外'}，${FEATURE_TEXT[zone.feature]}）。`,
    ...(existing.length ? [`這個區域已經有：${existing.map((e) => `${e.zh}（${e.id}）`).join('、')}。列出其他東西，可以和它們搭配。`] : []),
    `列出 ${count} 個會出現在這裡、語言初學者（A1–A2）該學的具體物品名詞。規則：`,
    '1. 單一、能用正面扁平向量圖示畫出來、一眼認得出的物品。不要動物、人物、場所、抽象概念、液體或一大片東西；也不要人形或動物形狀的東西（雕像、玩偶、畫著人形的標誌），這類圖畫不出來。',
    '2. 物品不能靠文字辨認（例如招牌、書名），圖裡不會有任何文字或數字。',
    `3. 英文單字不能和這些重複（單複數不同也算重複）：${avoidEn.join(', ')}`,
    '4. 每個物品的欄位：',
    '   id：英文小寫 kebab-case（通常就是英文單字）',
    '   zh：繁體中文（台灣用語）；en：英文單字（小寫）；ja：日文常用說法；reading：只用平假名或片假名的讀音',
    `   category：${CATEGORIES.join(' | ')}`,
    '   size：small（手拿得起）| medium（家具、腳踏車大小）| large（建築、車輛、大型設備）',
    `   spot：${spotText}${minGround ? `；至少 ${minGround} 個是 ground` : ''}`,
    '   desc：繁體中文 20–60 字，正面平視的外觀：主要形狀、顏色、一兩個一眼能認出的特徵。不要寫數字或英文字母。',
    '   loose：true = 散落在地上、可以歪倒的小東西',
    `   motion：null，或 sway（植物、布料輕擺）| wobble（會震動的機器、車輛）| bob（水上、空中浮動）| drift（風箏飄移）；最多 ${maxMotion} 個不是 null`,
    '   cluster：null，或同區另一個物品的 id（擺在它旁邊，例如餐具靠著餐桌）',
    '只回傳 JSON，不要其他文字：',
    '{"elements":[{"id":"bench","zh":"長椅","en":"bench","ja":"ベンチ","reading":"ベンチ","category":"設施","size":"medium","spot":"ground","desc":"三條木板椅面加兩條木板椅背、黑色鐵製椅腳的長椅。","loose":false,"motion":null,"cluster":null}]}',
  ].join('\n');
}

/**
 * 驗證一個區域的物品。used：已經用掉的 { ids, en, zh }（Set），通過的物品會加進去。
 * spots：可以放的位置，其他的退回地上。
 * @returns {{ ok: object[], rejected: Array<{ id: string, reason: string }> }}
 */
export function validateElements(list, { zone, used, spots = allowedSpots(zone) }) {
  const ok = [];
  const rejected = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = raw ?? {};
    const en = String(e.en ?? '').trim().toLowerCase();
    const reason = (() => {
      if (!ID_RE.test(e.id)) return 'id 格式不對';
      if (used.ids.has(e.id)) return 'id 重複';
      if (!EN_RE.test(en)) return '英文格式不對';
      if (used.en.has(wordKey(en))) return '英文重複';
      if (typeof e.zh !== 'string' || !CJK_RE.test(e.zh)) return '缺中文';
      if (used.zh.has(e.zh.trim())) return '中文重複';
      if (typeof e.ja !== 'string' || !e.ja.trim()) return '缺日文';
      if (!KANA_RE.test(String(e.reading ?? ''))) return '讀音不是假名';
      if (!CATEGORIES.includes(e.category)) return `類別 ${e.category} 不在清單`;
      if (!SIZES.includes(e.size)) return 'size 不對';
      const desc = String(e.desc ?? '');
      if (desc.length < 8 || desc.length > 120) return '描述長度不對';
      if (NO_TEXT_RE.test(desc)) return '描述有數字或英文字母';
      return null;
    })();
    if (reason) {
      rejected.push({ id: String(e.id ?? '?'), reason });
      continue;
    }
    const item = {
      id: e.id, zh: e.zh.trim(), en, ja: e.ja.trim(), reading: e.reading.trim(), category: e.category, size: e.size,
      zone: zone.id, spot: spots.includes(e.spot) ? e.spot : 'ground', desc: String(e.desc).trim(),
      loose: e.loose === true && e.size === 'small',
      motion: MOTION_PRESETS[e.motion] ? e.motion : null,
      cluster: typeof e.cluster === 'string' ? e.cluster : null,
    };
    used.ids.add(item.id);
    used.en.add(wordKey(en));
    used.zh.add(item.zh);
    ok.push(item);
  }
  return { ok, rejected };
}

/** 規劃 → manifest（miko-ws 生成 SVG 用，格式同手寫的 content/svg-manifests/*.json） */
/**
 * 手畫的核心場景（公園、商業街、河邊、超市）沒有規劃檔：從 manifest 反推一份，讓補元素流程也能替它們補物品。
 * core: true = 場景設定是手寫的，整合時不重寫 scene-config（新物品只照 ground 地帶自動排，舊物品不動）。
 * itemsTarget：這個場景自己的目標數（手畫區域有湖、馬路、貨架，空地比生成街區少）。
 */
export function manifestToPlan(manifest, { id, name, indoor, itemsTarget }) {
  const floor = indoor ? 'tile' : 'paving';
  return {
    id,
    name,
    core: true,
    itemsTarget,
    zones: Object.entries(manifest.zones).map(([zid, zname]) => ({ id: zid, name: zname, indoor, floor, feature: 'none' })),
    elements: manifest.elements.map((e) => ({
      id: e.ref.itemId, zone: e.ref.zone, zh: e.ref.words['zh-TW'], en: e.ref.words.en, ja: e.ref.words.ja.text, reading: e.ref.words.ja.reading,
      category: e.category, size: e.sizeHint, desc: e.desc, ...(e.lane === 'b' ? {} : { lane: e.lane }),
    })),
  };
}

export function planToManifest(plan) {
  return {
    sceneName: `語言小鎮・${plan.name}`,
    sceneSlug: `la-${plan.id}`,
    propStyle: 'front-flat',
    zones: Object.fromEntries(plan.zones.map((z) => [z.id, z.name])),
    elements: plan.elements.map((e) => ({
      name: e.zh, category: e.category, lane: e.lane ?? 'b', sizeHint: e.size, desc: e.desc,
      ref: { project: 'la-game', scene: plan.id, zone: e.zone, itemId: e.id, words: { 'zh-TW': e.zh, en: e.en, ja: { text: e.ja, reading: e.reading } } },
    })),
  };
}

/**
 * 規劃 → scene-config 的一個場景。available：有 SVG 的物件 id（生成失敗的物件不能出現在設定裡）。
 */
export function planToSceneConfig(plan, available) {
  const has = new Set(available);
  const elements = plan.elements.filter((e) => has.has(e.id));
  if (!elements.length) throw new Error(`${plan.id}：沒有任何物件有 SVG`);
  const district = buildDistrict({ slot: plan.slot, zones: plan.zones, elements, colorIndex: plan.colorIndex ?? 0 });

  const byId = new Map(elements.map((e) => [e.id, e]));
  const onGround = (e) => !district.place[e.id];
  const groups = new Map();
  for (const e of elements) {
    const host = byId.get(e.cluster);
    if (!host || host.id === e.id || host.zone !== e.zone || host.cluster || !onGround(host) || !onGround(e)) continue;
    groups.set(host.id, [...(groups.get(host.id) ?? []), e.id]);
  }
  const maxMotion = Math.floor(elements.length * MAX_MOTION_RATIO * 0.8);
  const motion = Object.fromEntries(elements.filter((e) => e.motion).slice(0, maxMotion).map((e) => [e.id, e.motion]));
  const icon = (byId.get(plan.icon) ?? elements.find((e) => e.size === 'large') ?? elements[0]).id;

  return {
    name: plan.name,
    icon,
    zones: district.zones,
    bands: district.bands,
    place: district.place,
    clusters: [...groups].map(([host, members]) => [host, ...members]),
    loose: elements.filter((e) => e.loose && (onGround(e) || district.place[e.id]?.startsWith('surface-'))).map((e) => e.id),
    noFlip: [],
    motion,
    arrange: 'auto',
    terrain: district.terrain,
  };
}

/** 每個區域要幾個物品（總數平均分，前面的區域多 1） */
export function splitCount(total, parts) {
  return Array.from({ length: parts }, (_, i) => Math.floor(total / parts) + (i < total % parts ? 1 : 0));
}

/**
 * 已上線的街區每個區域還差幾個物品才到 itemsPerScene 的平均分配（只算有 SVG 的，生成失敗的不算）。
 * @returns {Array<{ zone: object, have: number, need: number }>}
 */
export function zoneShortfall(plan, available, itemsPerScene) {
  const has = new Set(available);
  const target = splitCount(itemsPerScene, plan.zones.length);
  return plan.zones.map((zone, i) => {
    const have = plan.elements.filter((e) => e.zone === zone.id && has.has(e.id)).length;
    return { zone, have, need: Math.max(0, target[i] - have) };
  });
}

