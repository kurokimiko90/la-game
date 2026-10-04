import type { DistrictTerrain, TerrainZone } from '@/lib/types';
import type { Motif, VenuePlan, WallStyle } from '@/lib/venue';

// 建築輪廓只佔背景；可點物件仍由 stage 與 layout 決定。每個場所明確列出
// 自己的功能帶，避免把相同的四格牆線套在所有街區上。
// 牆面材質與地面圖案的清單在 src/lib/venue.ts（自動擴展的新街區由 codex 從那裡挑，存在 terrain.venue）
export const VENUE_PLANS: Record<string, VenuePlan> = {
  station: { accent: '#b79a55', wall: 'glass', zones: { plaza: ['arrival'], 'ticket-hall': ['concourse'], gates: ['security'], platform: ['platform'] } },
  restaurant: { accent: '#b98b65', wall: 'warm', zones: { entrance: ['terrace'], 'dining-hall': ['dining'], 'open-kitchen': ['kitchen'], 'dessert-stand': ['service'] } },
  hospital: { accent: '#89a9b0', wall: 'clinical', zones: { entrance: ['triage'], lobby: ['concourse'], 'waiting-area': ['waiting'], pharmacy: ['dispensary'] } },
  airport: { accent: '#829cac', wall: 'glass', zones: { entrance: ['apron'], 'check-in-hall': ['checkin'], 'security-check': ['security'], 'departure-gate': ['boarding'] } },
  library: { accent: '#a5906c', wall: 'wood', zones: { entrance: ['arrival'], lobby: ['concourse'], bookstacks: ['stacks'], 'reading-room': ['reading'] } },
  'post-office': { accent: '#aa9771', wall: 'stone', zones: { entrance: ['arrival'], 'service-hall': ['service'], 'waiting-area': ['waiting'], 'sorting-room': ['sorting'] } },
  'fire-station': { accent: '#c57c65', wall: 'brick', zones: { 'front-yard': ['apron'], garage: ['garage'], 'equipment-room': ['operations'], 'dispatch-room': ['concourse'] } },
  bakery: { accent: '#c49b68', wall: 'warm', zones: { entrance: ['terrace'], 'display-area': ['display'], 'seating-area': ['shopseating'], 'checkout-counter': ['service'] } },
  beach: { accent: '#c5a46e', wall: 'wood', zones: { entrance: ['arrival'], boardwalk: ['boardwalk'], 'tide-pool': ['shores'], 'snack-shack': ['service'] } },
  'clothing-store': { accent: '#bb98ae', wall: 'salon', zones: { entrance: ['arrival'], display: ['showroom'], fitting: ['fitting'], checkout: ['service'] } },
  'movie-theater': { accent: '#877b9c', wall: 'cinema', zones: { entrance: ['arrival'], lobby: ['concourse'], 'screening-room': ['cinema'], 'snack-bar': ['service'] } },
  bank: { accent: '#9b9a72', wall: 'stone', zones: { 'front-plaza': ['arrival'], lobby: ['waiting'], 'service-hall': ['service'], 'vault-room': ['vault'] } },
  museum: { accent: '#b09b7e', wall: 'stone', zones: { entrance: ['arrival'], 'sculpture-garden': ['flowerbed'], 'main-gallery': ['gallery'], 'art-workshop': ['workshop'] } },
  'police-station': { accent: '#879aaa', wall: 'industrial', zones: { 'station-entrance': ['arrival'], reception: ['service'], 'evidence-room': ['evidence'], 'training-yard': ['training'] } },
  'hair-salon': { accent: '#c098a9', wall: 'salon', zones: { entrance: ['arrival'], reception: ['waiting'], 'styling-area': ['salon'], 'wash-area': ['wash'] } },
  'flower-shop': { accent: '#8da976', wall: 'garden', zones: { 'front-garden': ['flowerbed'], 'flower-display': ['display'], 'bouquet-counter': ['bouquet'], 'plant-corner': ['flowerbed'] } },
  bookstore: { accent: '#ae926d', wall: 'wood', zones: { entrance: ['arrival'], 'front-shelves': ['stacks'], 'reading-corner': ['reading'], checkout: ['service'] } },
  'stationery-store': { accent: '#91a5bd', wall: 'glass', zones: { entrance: ['arrival'], 'front-display': ['display'], 'writing-supplies': ['stationery'], 'checkout-counter': ['service'] } },
  gym: { accent: '#668b7b', wall: 'industrial', zones: { entrance: ['arrival', 'strength'], reception: ['service'], 'cardio-floor': ['exercise', 'strength'], poolside: ['swim-lanes', 'pooldeck'] } },
  pharmacy: { accent: '#6f9f88', wall: 'clinical', zones: { entrance: ['arrival', 'retail'], 'front-shop': ['retail', 'waiting'], 'medicine-aisle': ['dispensary', 'stacks'], 'consultation-room': ['consultation'] } },
  'electronics-store': { accent: '#718da8', wall: 'glass', zones: { storefront: ['arrival', 'display'], showroom: ['retail', 'showroom'], 'appliance-aisle': ['retail', 'stacks'], checkout: ['service', 'concourse'] } },
  campsite: { accent: '#6f8f69', wall: 'wood', zones: { 'camp-entrance': ['arrival', 'camp-pitch'], 'supply-hut': ['service', 'stacks'], 'picnic-ground': ['dining', 'terrace'], 'tent-site': ['camp-pitch'] } },
  farm: { accent: '#8c744f', wall: 'wood', zones: { farmyard: ['arrival', 'operations'], barn: ['workshop', 'stacks'], stable: ['operations', 'paddock'], pasture: ['paddock', 'shores'] } },
  'hot-spring': { accent: '#668f88', wall: 'wood', zones: { entrance: ['arrival', 'genkan'], lobby: ['service', 'waiting'], 'bathing-area': ['wash', 'pooldeck'], 'guest-room': ['bedroom', 'reading'] } },
  'amusement-park': { accent: '#b56e87', wall: 'warm', zones: { entrance: ['arrival', 'concourse'], midway: ['boardwalk', 'ride'], 'carousel-hall': ['ride'], 'water-ride': ['ride', 'shores'] } },
  hotel: { accent: '#9c7b55', wall: 'warm', zones: { entrance: ['arrival', 'apron'], lobby: ['checkin', 'waiting'], 'guest-floor': ['hotel-corridor'], 'dining-room': ['dining', 'service'] } },
  'swimming-pool': { accent: '#4c8ba3', wall: 'glass', zones: { 'pool-entrance': ['arrival', 'wash'], 'changing-room': ['fitting', 'wash'], 'indoor-pool': ['swim-lanes', 'pooldeck'], 'outdoor-pool': ['swim-lanes', 'pooldeck'] } },
};

const HAND_BUILT_PLANS: Record<string, VenuePlan> = {
  home: { accent: '#a57962', wall: 'warm', zones: { 'front-yard': ['arrival', 'flowerbed'], 'living-room': ['reading'], kitchen: ['kitchen'], bedroom: ['bedroom'] } },
};

const WALL_COLORS: Record<WallStyle, { face: string; trim: string }> = {
  glass: { face: '#d7e8e9', trim: '#8fabb0' },
  clinical: { face: '#e3f1ee', trim: '#90b1ae' },
  brick: { face: '#ecd8c9', trim: '#bb927f' },
  warm: { face: '#f4e5ce', trim: '#d0aa7f' },
  wood: { face: '#e9d7b8', trim: '#ae8963' },
  cinema: { face: '#d8d1de', trim: '#897b9d' },
  stone: { face: '#ebe5d7', trim: '#b9ab91' },
  salon: { face: '#f0e0e6', trim: '#c39caa' },
  garden: { face: '#e1ecd9', trim: '#9bb58c' },
  industrial: { face: '#dce5e6', trim: '#97aeb0' },
};

function VenueWall({ zone, style }: { zone: TerrainZone; style: WallStyle }) {
  if (!zone.indoor || !zone.wallBase) return null;
  const x = zone.x0 + 24;
  const y = zone.y0 + 27;
  const w = zone.x1 - zone.x0 - 48;
  const h = Math.max(0, zone.wallBase - y - 8);
  const { face, trim } = WALL_COLORS[style];
  return <g data-venue-wall={style} pointerEvents="none">
    <rect x={x} y={y} width={w} height={h} fill={face} opacity={.84} />
    <path d={`M${x} ${y + h - 7}H${x + w}`} stroke={trim} strokeWidth={7} opacity={.72} />
    {['glass', 'garden', 'salon'].includes(style) && Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${x + w * (i + 1) / 6} ${y + 12}V${y + h - 12}`} stroke={trim} strokeWidth={4} opacity={.55} />)}
    {['wood', 'brick', 'stone', 'warm'].includes(style) && Array.from({ length: 3 }, (_, i) => <path key={i} d={`M${x} ${y + (i + 1) * h / 4}H${x + w}`} stroke={trim} strokeWidth={3} opacity={.27} />)}
    {style === 'clinical' && <rect x={x} y={y + h * .65} width={w} height={10} fill={trim} opacity={.35} />}
    {style === 'cinema' && Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${x + w * (i + .5) / 8} ${y + 4}V${y + h - 10}`} stroke={trim} strokeWidth={15} opacity={.16} />)}
    {style === 'industrial' && Array.from({ length: 4 }, (_, i) => <path key={i} d={`M${x + w * (i + 1) / 5} ${y + 5}V${y + h - 5}`} stroke={trim} strokeWidth={5} opacity={.32} />)}
  </g>;
}

function ZoneStructure({ zone, motifs, accent }: { zone: TerrainZone; motifs: readonly Motif[]; accent: string }) {
  const x = zone.x0; const y = zone.y0;
  const w = zone.x1 - x; const h = zone.y1 - y;
  const X = (n: number) => x + w * n;
  const Y = (n: number) => y + h * n;
  const rect = (key: string, a: number, b: number, c: number, d: number, fill = accent, opacity = .18, radius = 12) =>
    <rect key={key} x={X(a)} y={Y(b)} width={w * c} height={h * d} rx={radius} fill={fill} opacity={opacity} />;
  const line = (key: string, a: number, b: number, c: number, d: number, width = 8, dash?: string) =>
    <path key={key} d={`M${X(a)} ${Y(b)}L${X(c)} ${Y(d)}`} stroke={accent} strokeWidth={width} strokeDasharray={dash} opacity={.48} fill="none" />;
  const repeat = (n: number, draw: (i: number) => React.ReactNode) => Array.from({ length: n }, (_, i) => draw(i));
  return <g data-venue-zone={zone.id} pointerEvents="none">{motifs.map((motif, index) => {
    const key = `${zone.id}-${motif}-${index}`;
    switch (motif) {
      case 'arrival': return <g key={key}>
        {rect('threshold', .36, .04, .28, .20, '#f5ead5', .55, 25)}
        {line('axis', .5, .25, .5, .78, 12, '22 20')}
        {line('cross', .23, .78, .77, .78, 6)}
      </g>;
      case 'concourse': return <g key={key}>
        {rect('hall', .12, .35, .76, .49, '#f5ebd7', .33, 55)}
        {line('walk', .13, .75, .87, .75, 9, '40 24')}
      </g>;
      case 'platform': return <g key={key}>
        {rect('edge', .03, .73, .94, .07, '#e3c96d', .85, 3)}
        {repeat(14, i => line(`dot${i}`, .06 + i * .066, .76, .085 + i * .066, .76, 3))}
      </g>;
      case 'dining': return <g key={key}>
        {rect('center', .08, .33, .84, .51, '#efdfc4', .45, 35)}
        {repeat(3, i => rect(`place${i}`, .2 + i * .28, .51, .10, .11, '#ccb28d', .29, 26))}
      </g>;
      case 'kitchen': return <g key={key}>
        {rect('work', .05, .31, .90, .24, '#d3e1df', .52)}
        {line('safe', .11, .72, .89, .72, 9, '35 18')}
      </g>;
      case 'terrace': return <g key={key}>
        {rect('patio', .08, .26, .84, .56, '#e7d8b8', .57, 48)}
        {repeat(3, i => line(`pave${i}`, .21 + i * .27, .31, .21 + i * .27, .77, 4))}
      </g>;
      case 'triage': return <g key={key}>
        {rect('dropoff', .14, .55, .72, .25, '#e7ece7', .48, 22)}
        {line('route', .50, .14, .50, .73, 10, '26 20')}
      </g>;
      case 'waiting': return <g key={key}>
        {rect('quiet', .12, .40, .76, .43, '#e8e5d9', .56, 35)}
        {repeat(3, i => rect(`bay${i}`, .16 + i * .25, .57, .18, .10, accent, .18, 9))}
      </g>;
      case 'dispensary': return <g key={key}>
        {rect('staff', .08, .15, .84, .23, '#d9e8df', .42)}
        {line('boundary', .10, .48, .90, .48, 7, '35 12')}
      </g>;
      case 'apron': return <g key={key}>
        {rect('vehicle', .05, .56, .90, .26, '#c9d2d4', .45)}
        {repeat(4, i => line(`bay${i}`, .13 + i * .23, .59, .13 + i * .23, .80, 5))}
      </g>;
      case 'checkin': return <g key={key}>
        {repeat(4, i => rect(`island${i}`, .1 + i * .22, .43, .14, .22, '#d7e5e8', .42))}
        {line('front', .07, .76, .93, .76, 8, '32 14')}
      </g>;
      case 'security': return <g key={key}>
        {repeat(3, i => rect(`lane${i}`, .15 + i * .25, .39, .12, .39, '#d7e3e2', .38, 5))}
        {line('threshold', .09, .80, .91, .80, 8)}
      </g>;
      case 'boarding': return <g key={key}>
        {rect('route', .33, .25, .34, .61, '#d3e0e3', .50, 30)}
        {line('gate', .13, .79, .87, .79, 7, '24 18')}
      </g>;
      case 'reading': return <g key={key}>
        {rect('quiet', .09, .34, .82, .48, '#f4e8c9', .33, 48)}
        {line('spine', .50, .37, .50, .80, 4)}
      </g>;
      case 'stacks': return <g key={key}>
        {repeat(4, i => rect(`aisle${i}`, .12 + i * .22, .28, .10, .43, '#9c7657', .17, 5))}
        {line('cross', .09, .79, .91, .79, 5)}
      </g>;
      case 'service': return <g key={key}>
        {rect('behind', .07, .13, .86, .23, '#e9dcc2', .33)}
        {line('customer', .12, .57, .88, .57, 6, '18 13')}
      </g>;
      case 'sorting': return <g key={key}>
        {repeat(4, i => rect(`sorting${i}`, .09 + i * .225, .33, .16, .32, '#b6c1ad', .27, 7))}
        {line('dispatch', .07, .76, .93, .76, 6)}
      </g>;
      case 'garage': return <g key={key}>
        {repeat(3, i => <g key={i}>
          {rect(`slot${i}`, .07 + i * .31, .29, .26, .55, '#e7ded4', .35, 4)}
          {line(`mark${i}`, .07 + i * .31, .74, .33 + i * .31, .74, 8)}
        </g>)}
      </g>;
      case 'operations': return <g key={key}>
        {rect('rackzone', .05, .24, .90, .22, '#c5d4d7', .30)}
        {line('lane', .08, .71, .92, .71, 6, '16 14')}
      </g>;
      case 'display': return <g key={key}>
        {repeat(3, i => rect(`stand${i}`, .12 + i * .29, .38, .18, .24, '#efe4ce', .42, 12))}
        {line('front', .08, .78, .92, .78, 5)}
      </g>;
      case 'shopseating': return <g key={key}>
        {rect('seating', .13, .30, .74, .49, '#eadfc4', .42, 38)}
        {repeat(3, i => rect(`nook${i}`, .20 + i * .23, .55, .12, .13, '#d1b38e', .28, 20))}
      </g>;
      case 'boardwalk': return <g key={key}>
        {rect('deck', .04, .61, .92, .24, '#d7b78e', .56, 4)}
        {repeat(18, i => line(`plank${i}`, .07 + i * .05, .61, .07 + i * .05, .85, 2))}
      </g>;
      case 'shores': return <g key={key}>
        <path d={`M${X(.05)} ${Y(.68)}Q${X(.28)} ${Y(.52)} ${X(.50)} ${Y(.68)}T${X(.95)} ${Y(.68)}`} fill="none" stroke={accent} strokeWidth={12} opacity={.32} />
        {line('observe', .10, .84, .90, .84, 5, '20 15')}
      </g>;
      case 'fitting': return <g key={key}>
        {repeat(4, i => <g key={i}>
          {line(`rail${i}`, .10 + i * .22, .24, .10 + i * .22, .62, 8)}
          {rect(`stall${i}`, .10 + i * .22, .26, .17, .33, '#e9dfe8', .24, 6)}
        </g>)}
      </g>;
      case 'showroom': return <g key={key}>
        {rect('runway', .38, .20, .24, .62, '#ece1e5', .51, 32)}
        {line('edgeL', .31, .29, .31, .79, 4)}
        {line('edgeR', .69, .29, .69, .79, 4)}
      </g>;
      case 'cinema': return <g key={key}>
        {rect('aisle', .46, .33, .08, .53, '#b5adc0', .45, 6)}
        {repeat(4, i => line(`row${i}`, .12, .42 + i * .13, .88, .42 + i * .13, 7, '55 22'))}
      </g>;
      case 'vault': return <g key={key}>
        {rect('strongroom', .10, .22, .80, .57, '#c6ccbc', .28, 3)}
        <rect x={X(.10)} y={Y(.22)} width={w * .80} height={h * .57} fill="none" stroke={accent} strokeWidth={12} opacity={.34} />
      </g>;
      case 'gallery': return <g key={key}>
        {rect('loop', .08, .30, .84, .54, '#f2ead9', .30, 30)}
        {repeat(3, i => rect(`bay${i}`, .16 + i * .28, .37, .12, .15, accent, .16, 10))}
      </g>;
      case 'workshop': return <g key={key}>
        {repeat(3, i => rect(`deskarea${i}`, .12 + i * .28, .39, .19, .32, '#c9b99b', .22))}
      </g>;
      case 'evidence': return <g key={key}>
        {rect('secure', .08, .25, .84, .51, '#ccd9dc', .27)}
        {line('boundary', .08, .77, .92, .77, 9, '13 10')}
      </g>;
      case 'training': return <g key={key}>
        {rect('ground', .08, .24, .84, .56, '#c5d8c7', .40, 10)}
        {line('mid', .50, .27, .50, .77, 5)}
      </g>;
      case 'salon': return <g key={key}>
        {repeat(4, i => rect(`station${i}`, .10 + i * .22, .40, .15, .23, '#eee4dd', .40, 25))}
        {line('lane', .09, .79, .91, .79, 5)}
      </g>;
      case 'wash': return <g key={key}>
        {rect('wet', .08, .31, .84, .43, '#d3e9e9', .34, 20)}
        {repeat(5, i => line(`drain${i}`, .14 + i * .18, .69, .20 + i * .18, .69, 4))}
      </g>;
      case 'flowerbed': return <g key={key}>
        {repeat(3, i => rect(`bed${i}`, .08 + i * .31, .35, .22, .37, '#9fb87e', .32, 40))}
        {line('gardenpath', .06, .79, .94, .79, 8, '35 16')}
      </g>;
      case 'bouquet': return <g key={key}>
        {rect('prep', .16, .37, .68, .34, '#d7bb9a', .39, 12)}
        {line('water', .10, .77, .90, .77, 5, '12 15')}
      </g>;
      case 'stationery': return <g key={key}>
        {repeat(4, i => rect(`supply${i}`, .10 + i * .22, .30, .14, .39, '#d2dced', .34, 5))}
        {line('aisle', .08, .79, .92, .79, 5)}
      </g>;
      case 'exercise': return <g key={key}>
        {repeat(4, i => rect(`lane${i}`, .08 + i * .23, .28, .16, .47, '#c8daca', .38, 30))}
        {line('edge', .06, .80, .94, .80, 6)}
      </g>;
      case 'pooldeck': return <g key={key}>
        {rect('non-slip', .09, .28, .82, .52, '#cae2e3', .37, 18)}
        {repeat(7, i => line(`drain${i}`, .14 + i * .12, .77, .20 + i * .12, .77, 4))}
      </g>;
      case 'retail': return <g key={key}>
        {repeat(4, i => rect(`bay${i}`, .08 + i * .23, .30, .16, .34, '#d9e2df', .35, 8))}
        {line('cross-aisle', .06, .76, .94, .76, 8, '42 18')}
      </g>;
      case 'consultation': return <g key={key}>
        {rect('private-room', .14, .28, .72, .50, '#dce7e2', .46, 28)}
        {line('privacy', .14, .43, .86, .43, 7, '20 13')}
        {rect('turning-space', .39, .52, .22, .22, '#f5f1e8', .70, 55)}
      </g>;
      case 'camp-pitch': return <g key={key}>
        {repeat(3, i => <g key={i}>
          {rect(`pad${i}`, .06 + i * .31, .25, .27, .50, '#c9d1ae', .42, 36)}
          {line(`edge${i}`, .09 + i * .31, .68, .30 + i * .31, .68, 5, '16 13')}
        </g>)}
      </g>;
      case 'paddock': return <g key={key}>
        {rect('field', .06, .22, .88, .58, '#b9cb94', .32, 35)}
        {repeat(4, i => line(`rail${i}`, .08, .27 + i * .14, .92, .27 + i * .14, 5, '38 16'))}
        {line('service-lane', .50, .23, .50, .80, 8)}
      </g>;
      case 'genkan': return <g key={key}>
        {rect('stone-step', .22, .54, .56, .20, '#c7beb0', .56, 8)}
        {line('threshold', .18, .48, .82, .48, 9)}
        {repeat(5, i => rect(`shoe${i}`, .28 + i * .10, .61, .06, .08, '#866d55', .30, 10))}
      </g>;
      case 'ride': return <g key={key}>
        {rect('safety-zone', .12, .25, .76, .52, '#e8d9df', .34, 80)}
        <ellipse cx={X(.5)} cy={Y(.51)} rx={w * .26} ry={h * .22} fill="none" stroke={accent} strokeWidth={7} strokeDasharray="24 16" opacity={.42} />
        {line('queue-gate', .16, .79, .84, .79, 7, '18 13')}
      </g>;
      case 'hotel-corridor': return <g key={key}>
        {rect('corridor', .08, .43, .84, .31, '#d9d3c9', .48, 45)}
        {repeat(5, i => rect(`door${i}`, .08 + i * .18, .22, .12, .18, '#a88969', .30, 8))}
        {line('egress', .10, .79, .90, .79, 5, '32 16')}
      </g>;
      case 'swim-lanes': return <g key={key}>
        {rect('water', .08, .25, .84, .51, '#91cbdc', .50, 22)}
        {repeat(4, i => line(`lane${i}`, .11, .32 + i * .11, .89, .32 + i * .11, 5, '18 10'))}
        {repeat(5, i => rect(`block${i}`, .12 + i * .17, .18, .09, .08, '#e8ece8', .62, 4))}
      </g>;
      case 'strength': return <g key={key}>
        {repeat(3, i => rect(`station${i}`, .09 + i * .30, .28, .22, .43, '#c6d2d0', .36, 18))}
        {repeat(5, i => <circle key={i} cx={X(.16 + i * .17)} cy={Y(.77)} r={10} fill={accent} opacity={.34} />)}
      </g>;
      case 'bedroom': return <g key={key}>
        {rect('bed-clearance', .08, .30, .48, .45, '#e5ddd8', .52, 24)}
        <rect x={X(.64)} y={Y(.27)} width={w * .25} height={h * .18} rx={8} fill="#bda58f" opacity={.30} stroke={accent} strokeWidth={5} />
        {repeat(3, i => line(`wardrobe-door${i}`, .64 + i * .083, .28, .64 + i * .083, .44, 3))}
        {rect('dressing-zone', .64, .50, .25, .24, '#eee7df', .62, 45)}
        <ellipse cx={X(.765)} cy={Y(.62)} rx={w * .09} ry={h * .08} fill="none" stroke={accent} strokeWidth={5} opacity={.34} />
        {rect('bedside-niche', .49, .39, .08, .18, '#c9b7a7', .35, 8)}
        {line('clear-path', .58, .25, .58, .80, 6, '24 16')}
      </g>;
    }
  })}</g>;
}

export function VenueStructure({ terrain, sceneId }: { terrain: DistrictTerrain; sceneId?: string }) {
  const plan = (sceneId ? VENUE_PLANS[sceneId] ?? HAND_BUILT_PLANS[sceneId] : undefined) ?? terrain.venue;
  if (!plan) return null;
  return <g data-venue-structure={sceneId} pointerEvents="none">
    {terrain.zones.map((zone) => <VenueWall key={`${zone.id}-wall`} zone={zone} style={plan.wall} />)}
    {terrain.zones.map((zone) => <ZoneStructure key={zone.id} zone={zone} motifs={plan.zones[zone.id] ?? []} accent={plan.accent} />)}
  </g>;
}
