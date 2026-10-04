// 場所結構（VenueStructure.tsx 畫的牆面材質與各區地面圖案）。
// 手畫過的街區在 VenueStructure.tsx 的 VENUE_PLANS；自動擴展的新街區由 codex 從下面的清單挑，存在 terrain.venue。
// 這個檔不能 import 別的模組（auto-expand 用 node 直接載入 .ts）。

export const MOTIFS = [
  'arrival', 'concourse', 'platform', 'dining', 'kitchen', 'terrace',
  'triage', 'waiting', 'dispensary', 'apron', 'checkin', 'security', 'boarding',
  'reading', 'stacks', 'service', 'sorting', 'garage', 'operations',
  'display', 'shopseating', 'boardwalk', 'shores', 'fitting', 'showroom',
  'cinema', 'vault', 'gallery', 'workshop', 'evidence', 'training',
  'salon', 'wash', 'flowerbed', 'bouquet', 'stationery', 'exercise', 'pooldeck',
  'retail', 'consultation', 'camp-pitch', 'paddock', 'genkan', 'ride',
  'hotel-corridor', 'swim-lanes', 'strength', 'bedroom',
] as const;
export type Motif = (typeof MOTIFS)[number];

export const WALL_STYLES = ['glass', 'clinical', 'brick', 'warm', 'wood', 'cinema', 'stone', 'salon', 'garden', 'industrial'] as const;
export type WallStyle = (typeof WALL_STYLES)[number];

export interface VenuePlan {
  accent: string;
  wall: WallStyle;
  zones: Record<string, readonly Motif[]>;
}

export interface VenueZone {
  id: string;
  name: string;
  indoor: boolean;
}

const DEFAULT_ACCENT = '#9aa7b0';
const MAX_MOTIFS = 2;

export function buildVenuePrompt(sceneName: string, zones: readonly VenueZone[]): string {
  return [
    `替語言學習遊戲的街區「${sceneName}」選建築外觀。街區有這些區域：`,
    ...zones.map((z) => `- ${z.id}（${z.name}，${z.indoor ? '室內' : '室外'}）`),
    '',
    `wall（整棟的牆面材質，選一個）：${WALL_STYLES.join('、')}`,
    `每個區域選 1–${MAX_MOTIFS} 個地面圖案（照區域的用途選最像的）：${MOTIFS.join('、')}`,
    'accent：街區的強調色，柔和的 #rrggbb。',
    '只回 JSON，不要其他文字：{"accent":"#8aac8b","wall":"glass","zones":{"區域 id":["arrival"]}}',
  ].join('\n');
}

const isMotif = (m: unknown): m is Motif => (MOTIFS as readonly unknown[]).includes(m);
const isWall = (w: unknown): w is WallStyle => (WALL_STYLES as readonly unknown[]).includes(w);

/** codex 回的文字 → VenuePlan；不合法的欄位換成預設，缺的區域補上（室外 arrival、室內 service），一定回得出結果 */
export function parseVenue(raw: string, zones: readonly VenueZone[]): VenuePlan {
  let json: { accent?: unknown; wall?: unknown; zones?: Record<string, unknown> } = {};
  try {
    const text = String(raw);
    json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    json = {};
  }
  const picked = json.zones && typeof json.zones === 'object' ? json.zones : {};
  const out: Record<string, readonly Motif[]> = {};
  for (const z of zones) {
    const list = Array.isArray(picked[z.id]) ? (picked[z.id] as unknown[]).filter(isMotif).slice(0, MAX_MOTIFS) : [];
    out[z.id] = list.length ? list : [z.indoor ? 'service' : 'arrival'];
  }
  return {
    accent: typeof json.accent === 'string' && /^#[0-9a-f]{6}$/i.test(json.accent) ? json.accent : DEFAULT_ACCENT,
    wall: isWall(json.wall) ? json.wall : 'glass',
    zones: out,
  };
}
