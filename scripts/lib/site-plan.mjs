// Visual site boundaries are also placement constraints, so later content builds
// cannot quietly put aquatic plants on paving or a target in the visitor route.
export const SITE_KINDS = ['path', 'walkway', 'queue', 'habitat', 'bed', 'pond', 'canopy', 'shelter', 'court', 'worktop', 'shelf', 'plinth', 'seating'];
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const inside = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

export function checkSitePlan({ terrain, items, placements }) {
  if (!terrain) return [];
  const problems = [];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const placed = new Map(placements.map((p) => [p.id, { x: p.x + p.w / 2, y: p.y + p.h }]));
  const ids = new Set();
  for (const zone of terrain.zones) {
    for (const f of zone.details ?? []) {
      if (!f.id || ids.has(f.id)) problems.push(`地形 id 缺少或重複：${f.id}`);
      ids.add(f.id);
      if (!SITE_KINDS.includes(f.kind)) problems.push(`${f.id}：未知地形 ${f.kind}`);
      if (![f.x0, f.y0, f.x1, f.y1].every(finite) || f.x0 >= f.x1 || f.y0 >= f.y1) {
        problems.push(`${f.id}：範圍必須是有效矩形`);
        continue;
      }
      if (f.x0 < zone.x0 || f.y0 < zone.y0 || f.x1 > zone.x1 || f.y1 > zone.y1) problems.push(`${f.id}：超出所屬區域 ${zone.id}`);
      for (const id of f.items ?? []) {
        if (itemMap.get(id)?.zone !== zone.id) problems.push(`${f.id}：${id} 不在區域 ${zone.id}`);
        else if (!placed.has(id) || !inside(placed.get(id), f)) problems.push(`${id}：底線必須位於 ${f.id}（${f.kind}）內`);
      }
      if (f.kind === 'path') {
        for (const i of items.filter((it) => it.zone === zone.id)) {
          if (placed.has(i.id) && inside(placed.get(i.id), f)) problems.push(`${i.id}：擋住走道 ${f.id}`);
        }
      }
    }
  }
  return problems;
}
