// 小鎮分區：北邊是戶外街景，南邊是室內剖面區（docs/town-zoning-plan.md）。
// - 戶外：自動擴展街區的戶外區域是沿街的「地塊」（LOT），一列一列排，每列地塊的南邊是一條大街。
//   同一個場景的地塊放在同一列、相鄰。
// - 室內：每個場景的室內區域是一棟「建築」，房間由左到右排成一列；建築依序往右排，排不下就換下一列。
// 位置設定在 content/expansion.json 的 town；這裡只做計算，純函式。

export const LOT = { w: 1300, h: 650 };
export const ROOM = { w: 1300, h: 650 };
export const STREET_H = 250;

const intersects = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * 戶外地塊的列 → 每列的地塊矩形 [x0, y0, x1, y1]
 * @param {Array<{ x0: number, y: number, cols: number }>} rows
 */
export function lotRows(rows) {
  return rows.map(({ x0, y, cols }) => Array.from({ length: cols }, (_, i) => [x0 + i * LOT.w, y, x0 + (i + 1) * LOT.w, y + LOT.h]));
}

/**
 * 找同一列裡 count 個相鄰的空地塊（依列的順序找第一個放得下的）。
 * @param {number} count
 * @param {number[][]} occupied 已經用掉的矩形
 * @returns {number[][] | null}
 */
export function allocateLots(count, occupied, rows) {
  if (count === 0) return [];
  for (const lots of lotRows(rows)) {
    for (let i = 0; i + count <= lots.length; i++) {
      const run = lots.slice(i, i + count);
      if (run.every((r) => !occupied.some((o) => intersects(r, o)))) return run;
    }
  }
  return null;
}

/**
 * 下一棟建築的位置：接在最後一列最右邊的建築後面，寬度不夠就換下一列。
 * @param {{ w: number, h: number }} size
 * @param {number[][]} buildings 已經有的建築外框（依放置順序）
 * @param {{ x0: number, y0: number, width: number, gap: number, rowGap: number }} area
 * @returns {number[]} [x0, y0, x1, y1]
 */
export function allocateBuilding(size, buildings, area) {
  if (!buildings.length) return [area.x0, area.y0, area.x0 + size.w, area.y0 + size.h];
  const rowY = Math.max(...buildings.map((b) => b[1]));
  const row = buildings.filter((b) => b[1] === rowY);
  const x = Math.max(...row.map((b) => b[2])) + area.gap;
  if (x + size.w <= area.x0 + area.width) return [x, rowY, x + size.w, rowY + size.h];
  const y = rowY + Math.max(...row.map((b) => b[3] - b[1])) + area.rowGap;
  return [area.x0, y, area.x0 + size.w, y + size.h];
}

/** 建築外框 → 房間矩形（由左到右） */
export function roomRects(building, count) {
  const [x0, y0] = building;
  return Array.from({ length: count }, (_, i) => [x0 + i * ROOM.w, y0, x0 + (i + 1) * ROOM.w, y0 + ROOM.h]);
}

/**
 * 一個自動擴展街區的區域 → 地圖矩形（依區域順序）。戶外區域拿地塊，室內區域合成一棟建築。
 * @param {Array<{ indoor: boolean }>} zones
 * @param {{ occupied: number[][], buildings: number[][], town: object }} ctx  town：expansion.json 的 town
 * @returns {{ rects: number[][], building: number[] | null }}
 */
export function placeDistrict(zones, { occupied, buildings, town }) {
  const outdoor = zones.filter((z) => !z.indoor).length;
  const indoor = zones.length - outdoor;
  const lots = allocateLots(outdoor, occupied, town.outdoorRows);
  if (!lots) throw new Error(`戶外沒有 ${outdoor} 個相鄰的空地塊了（content/expansion.json 的 town.outdoorRows 加欄）`);
  const building = indoor ? allocateBuilding({ w: indoor * ROOM.w, h: ROOM.h }, buildings, town.indoor) : null;
  const rooms = building ? roomRects(building, indoor) : [];
  let li = 0;
  let ri = 0;
  return { rects: zones.map((z) => (z.indoor ? rooms[ri++] : lots[li++])), building };
}

/** 室內區的上緣以北都是戶外（大街、河、東岸畫到這裡為止） */
export function outdoorHeight(town) {
  return town.indoor.y0 - town.indoor.gapAbove;
}

/** 每列地塊南邊的大街 [x0, y0, x1, y1]（空的列也畫，之後的地塊接得上） */
export function streetRects(town) {
  return town.outdoorRows.map(({ x0, y, cols }) => [x0, y + LOT.h, x0 + cols * LOT.w, y + LOT.h + STREET_H]);
}

/** 地圖大小：所有區域與大街的外框 + 邊距；streets 給背景畫大街 */
export function worldFor(rects, town) {
  const pad = town.indoor.x0;
  const streets = streetRects(town);
  const all = [...rects, ...streets];
  return {
    width: Math.max(town.minWidth, ...all.map((r) => r[2] + pad)),
    height: Math.max(...all.map((r) => r[3] + pad)),
    outdoorHeight: outdoorHeight(town),
    streets,
  };
}

/**
 * 現有場景 → 已用的戶外地塊與室內建築外框（給 placeDistrict）。
 * @param {Array<{ zones: Array<{ rect: number[], indoor: boolean }> }>} scenes
 */
export function townOccupancy(scenes) {
  const occupied = [];
  const buildings = [];
  for (const { zones } of scenes) {
    occupied.push(...zones.filter((z) => !z.indoor).map((z) => z.rect));
    const inside = zones.filter((z) => z.indoor).map((z) => z.rect);
    if (inside.length) buildings.push([Math.min(...inside.map((r) => r[0])), Math.min(...inside.map((r) => r[1])), Math.max(...inside.map((r) => r[2])), Math.max(...inside.map((r) => r[3]))]);
  }
  return { occupied, buildings };
}
