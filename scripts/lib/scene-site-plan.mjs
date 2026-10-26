// 自動街區的低對比場地結構。目標物仍由 stages / layouts 擺放；這裡依每個
// 空間的實際用途補上背景，而不是對所有房間畫同一條色帶。
const EXPLICIT = new Set(['school', 'classroom', 'zoo', 'botanical-garden', 'home']);

const rect = (z, id, kind, x0, y0, x1, y1) => ({
  id: `${z.id}-${id}`,
  kind,
  x0: Math.round(z.x0 + (z.x1 - z.x0) * x0),
  y0: Math.round(z.y0 + (z.y1 - z.y0) * y0),
  x1: Math.round(z.x0 + (z.x1 - z.x0) * x1),
  y1: Math.round(z.y0 + (z.y1 - z.y0) * y1),
});

const gardenZones = new Set(['front-garden', 'sculpture-garden', 'boardwalk', 'training-yard', 'front-yard', 'front-plaza']);

// 不再自動畫排隊帶和座位區：每個區域都有情境擺放（content/stages）畫出真正的櫃台、座椅，
// 通用的半透明色塊疊在家具上反而像看不清楚的幽靈家具。
function detailsFor(zone) {
  const features = [];
  // 戶外入口採用步道；室內的通行空白由分組與地板保留，避免每間房都長得一樣。
  if (!zone.indoor && ['entrance', 'plaza', 'front-plaza', 'station-entrance', 'front-yard'].includes(zone.id)) {
    features.push(rect(zone, 'arrival-walk', 'walkway', .08, .72, .92, .86));
  }
  if (gardenZones.has(zone.id) && !zone.indoor) {
    features.push(rect(zone, 'planting', 'bed', .08, .18, .28, .44));
    features.push(rect(zone, 'shade', 'canopy', .68, .14, .90, .34));
  }
  if (zone.id === 'tide-pool' && !zone.pool) features.push(rect(zone, 'observation-pool', 'pond', .50, .22, .91, .70));
  if (zone.id === 'training-yard') features.push(rect(zone, 'training-court', 'court', .33, .24, .63, .68));
  if (zone.id === 'platform') features.push(rect(zone, 'platform-walk', 'walkway', .05, .70, .95, .80));
  return features;
}

/** 將共通的動線加在尚未有手寫細節的自動街區。手寫場景永遠優先。 */
export function applySceneSitePlan(config) {
  for (const [sceneId, scene] of Object.entries(config.scenes ?? {})) {
    if (EXPLICIT.has(sceneId) || !scene.terrain) continue;
    scene.terrain.sharedShell = true;
    scene.terrain.structure = sceneId;
    for (const zone of scene.terrain.zones ?? []) {
      if (zone.details?.length) continue;
      zone.details = detailsFor(zone);
    }
  }
  return config;
}
