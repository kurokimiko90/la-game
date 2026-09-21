// content/scene-config.json 的檢查：拼錯的物件 id、不存在的地帶、未知的動態類型、區域沒有地圖位置，都在 build 時擋下。
import { MOTION_PRESETS } from './motion.mjs';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function checkBand(name, band) {
  const problems = [];
  const scale = band.scale ?? [1, 1];
  if (!Array.isArray(scale) || scale.length !== 2 || !scale.every(isNum)) problems.push(`地帶 ${name} 的 scale 要是 [上, 下] 兩個數字`);
  if (band.levels && (!Array.isArray(band.levels) || !band.levels.length || !band.levels.every(isNum))) problems.push(`地帶 ${name} 的 levels 要是數字陣列`);
  for (const key of ['x0', 'x1', 'top', 'bottom', 'base', 'float', 'layer', 'inset']) {
    if (band[key] !== undefined && !isNum(band[key])) problems.push(`地帶 ${name} 的 ${key} 要是數字`);
  }
  if (isNum(band.top) && isNum(band.bottom) && band.top > band.bottom) problems.push(`地帶 ${name} 要 top ≤ bottom`);
  return problems;
}

function checkZones(zones, zoneIds) {
  const problems = [];
  for (const id of zoneIds) if (!zones[id]) problems.push(`區域 ${id} 沒有地圖位置（zones.${id}: [x0, y0, x1, y1]）`);
  for (const [id, rect] of Object.entries(zones)) {
    if (!zoneIds.includes(id)) problems.push(`zones.${id}：manifest 沒有這個區域`);
    const ok = Array.isArray(rect) && rect.length === 4 && rect.every(isNum) && rect[2] > rect[0] && rect[3] > rect[1];
    if (!ok) problems.push(`區域 ${id} 的位置要是 [x0, y0, x1, y1] 且 x1 > x0、y1 > y0`);
  }
  return problems;
}

/**
 * @param {string} sceneId
 * @param {object} config scene-config.json 裡這個場景的設定
 * @param {string[]} itemIds 這個場景有 SVG 的物件
 * @param {string[]} zoneIds manifest 裡的區域
 * @returns {string[]} 問題清單，空陣列 = 通過
 */
export function validateSceneConfig(sceneId, config, itemIds, zoneIds) {
  const problems = [];
  const ids = new Set(itemIds);
  const bands = config.bands ?? {};
  const needItem = (id, where) => { if (!ids.has(id)) problems.push(`${where}：沒有物件 ${id}`); };

  if (!config.name) problems.push('缺少 name');
  if (config.icon) needItem(config.icon, 'icon');
  problems.push(...checkZones(config.zones ?? {}, zoneIds));
  if (!bands.ground) problems.push('bands 一定要有 ground（沒指定地帶的物件都放這裡）');
  for (const [name, band] of Object.entries(bands)) problems.push(...checkBand(name, band));

  for (const [id, band] of Object.entries(config.place ?? {})) {
    needItem(id, 'place');
    if (!bands[band]) problems.push(`place.${id}：沒有地帶 ${band}`);
  }
  (config.clusters ?? []).forEach((group, i) => group.forEach((id) => needItem(id, `clusters[${i}]`)));
  (config.loose ?? []).forEach((id) => needItem(id, 'loose'));
  (config.noFlip ?? []).forEach((id) => needItem(id, 'noFlip'));
  for (const [id, type] of Object.entries(config.motion ?? {})) {
    needItem(id, 'motion');
    if (!MOTION_PRESETS[type]) problems.push(`motion.${id}：未知的動態類型 ${type}`);
  }
  return problems.map((p) => `${sceneId}：${p}`);
}
