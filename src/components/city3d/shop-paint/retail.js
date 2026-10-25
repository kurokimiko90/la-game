// 移植自 Ginza 專案 web/shop-paint-retail.js（2026-10-11 版），原樣保留；顏色在 ginzaShopInteriors.ts 統一換成色票。
// 物販類店內陳列。參考銀座同業態常見擺放（精品櫥窗人台、珠寶玻璃櫃、化妝品試用台、
// 文具書店高架、白盒畫廊、雜貨木台），是典型構成示意，不對應特定店鋪。
import { garment, mannequin, table, plant, shelving, shade, pick } from './kit.js';

export function tiles(s, base, line, size = 0.6) {
  s.fill(base);
  for (let x = 0; x < s.w; x += size) s.rect(x, 0, 0.012, s.h, line);
  for (let y = 0; y < s.h; y += size) s.rect(0, y, s.w, 0.012, line);
}

export function downlights(s, base, glow = '#fff6df', step = 1.1) {
  s.fill(base);
  for (let x = step / 2; x < s.w; x += step) {
    for (let y = 0.6; y < s.h; y += 1.2) s.ellipse(x, y, 0.07, 0.07, glow);
  }
}

function wallBase(s, upper, lower, skirting = '#8d8377') {
  s.vgrad(0, 0, s.w, s.h, [[0, shade(upper, 0.03)], [1, shade(upper, -0.06)]]);
  if (lower) s.rect(0, 0, s.w, 0.9, lower);
  s.rect(0, 0, s.w, 0.08, skirting);
}

const CLOTHES = ['#1f2330', '#e8e0d2', '#8a2f2f', '#b49a74', '#2f4537', '#6d7b8c', '#d9c8b0', '#3a3231'];
const BAGS = ['#6a3d26', '#1d1d1d', '#c7a46a', '#8f2c2c', '#e3d9c8'];

export const fashion = {
  back(s, rand) {
    wallBase(s, '#ece6dc', null);
    // 中央燈箱壁龕陳列皮包，兩側掛衣桿。
    s.rect(1.85, 0.75, 1.8, 2.15, '#d9d1c4');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = 1.93 + c * 0.57, y = 0.85 + r * 0.68;
        s.rect(x, y, 0.5, 0.6, '#f7f2e8').rect(x, y + 0.56, 0.5, 0.04, '#fff9ec');
        if ((r + c) % 2 === 0 || rand() < 0.5) {
          const bag = pick(rand, BAGS);
          s.rect(x + 0.1, y + 0.03, 0.3, 0.22, bag).line(x + 0.16, y + 0.25, x + 0.25, y + 0.38, 0.02, shade(bag, -0.1)).line(x + 0.34, y + 0.25, x + 0.25, y + 0.38, 0.02, shade(bag, -0.1));
        } else {
          s.rect(x + 0.08, y + 0.03, 0.34, 0.08, pick(rand, CLOTHES)).rect(x + 0.1, y + 0.11, 0.3, 0.07, pick(rand, CLOTHES));
        }
      }
    }
    for (const [x0, x1] of [[0.25, 1.6], [3.9, 5.25]]) {
      s.rect(x0, 1.95, x1 - x0, 0.03, '#a8916b');
      for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.2 + rand() * 0.06) garment(s, x, 1.93, 0.36, 0.7 + rand() * 0.45, pick(rand, CLOTHES));
      s.rect(x0, 2.3, x1 - x0, 0.03, '#d2c8b8');
      for (let x = x0 + 0.1; x < x1 - 0.2; x += 0.42) s.rect(x, 2.33, 0.32, 0.12, pick(rand, CLOTHES));
    }
    for (let x = 0.9; x < 5.5; x += 1.2) s.scallop(x, 3.4, 1.0, 1.1, 0.25);
  },
  side(s, rand) {
    wallBase(s, '#e6dfd3', null);
    s.rect(0.3, 1.75, 3.0, 0.03, '#a8916b');
    for (let x = 0.5; x < 3.2; x += 0.15 + rand() * 0.05) garment(s, x, 1.73, 0.3, 0.75 + rand() * 0.35, pick(rand, CLOTHES));
    s.rect(0.3, 2.25, 3.0, 0.035, '#cfc4b2');
    for (let x = 0.4; x < 3.1; x += 0.45) s.rect(x, 2.285, 0.3, 0.1, pick(rand, CLOTHES)).rect(x + 0.02, 2.385, 0.26, 0.08, pick(rand, CLOTHES));
  },
  floor(s) { tiles(s, '#ddd4c4', '#cbbfac', 0.9); s.ellipse(2.75, 1.9, 1.6, 0.9, 'rgba(160,140,115,0.25)'); },
  ceiling(s) { downlights(s, '#f1ede6'); },
  front(s, rand) {
    // 櫥窗兩側人台，中間留出看進店內的視線。
    mannequin(s, 0.85, 0, pick(rand, CLOTHES), rand() < 0.5);
    mannequin(s, 4.65, 0, pick(rand, CLOTHES), rand() < 0.5);
    s.rect(1.6, 0, 0.5, 0.35, '#e3dbcf').rect(1.68, 0.35, 0.34, 0.22, pick(rand, BAGS));
  },
  mid(s, rand) {
    table(s, 1.8, 1.9, 0.78, '#d8cdbb', '#9f8f78', 0.08);
    for (let x = 1.95; x < 3.6; x += 0.4) {
      const c = pick(rand, CLOTHES);
      for (let k = 0; k < 3; k++) s.rect(x, 0.78 + k * 0.05, 0.32, 0.045, k % 2 ? shade(c, 0.06) : c);
    }
    s.rect(3.0, 0.93, 0.32, 0.24, pick(rand, BAGS));
    s.rect(4.4, 0, 0.9, 0.42, '#7c6a58').rect(4.4, 0.42, 0.9, 0.06, '#5c4d40'); // 試鞋凳
  },
};

const GEMS = ['#ffffff', '#fdf3d0', '#d8f0ff', '#ffd8e2', '#e9ffe8'];
function sparkle(s, x, y, rand, n = 6) {
  for (let i = 0; i < n; i++) s.ellipse(x + (rand() - 0.5) * 0.3, y + rand() * 0.12, 0.018, 0.018, pick(rand, GEMS));
}

export const jewelry = {
  back(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#4a3a2e'], [1, '#2c231d']]);
    for (let x = 0.2; x < s.w; x += 0.55) s.rect(x, 0.1, 0.012, 3.3, '#3a2e25');
    // 壁面燈箱展示櫃 3 座與中央品牌金屬板（無文字）。
    for (const x of [0.45, 2.25, 4.05]) {
      s.rect(x - 0.05, 0.95, 1.1, 1.5, '#a68a5a').vgrad(x, 1.0, 1.0, 1.4, [[0, '#fff3dc'], [1, '#e6d2b0']]);
      for (const y of [1.25, 1.75]) { s.rect(x, y, 1.0, 0.02, '#cfbfa2'); for (let k = 0; k < 3; k++) { s.rect(x + 0.15 + k * 0.3, y + 0.02, 0.14, 0.18, '#f6efe4'); sparkle(s, x + 0.22 + k * 0.3, y + 0.12, rand, 3); } }
    }
    s.rect(2.4, 2.75, 0.7, 0.18, '#c9a253');
  },
  side(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#4d3d30'], [1, '#30261f']]);
    for (const x of [0.4, 1.9]) {
      s.rect(x, 1.0, 1.2, 1.3, '#a68a5a').vgrad(x + 0.05, 1.05, 1.1, 1.2, [[0, '#fff0d6'], [1, '#e3cda9']]);
      sparkle(s, x + 0.6, 1.4, rand, 10); sparkle(s, x + 0.6, 1.85, rand, 8);
    }
  },
  floor(s) { s.fill('#8c7a66'); s.rect(0.4, 0.4, 4.7, 2.8, '#a2907a'); },
  ceiling(s) { downlights(s, '#e8dfd2', '#fff1d4', 0.9); s.ellipse(2.75, 1.8, 0.9, 0.6, '#f4e7cc'); },
  front(s, rand) {
    // 柱形展示台，上覆玻璃罩，內置項鍊胸台。
    for (const x of [1.0, 4.5]) {
      s.rect(x - 0.22, 0, 0.44, 1.05, '#2f2721').rect(x - 0.3, 1.05, 0.6, 0.04, '#c9a253');
      s.rect(x - 0.28, 1.09, 0.56, 0.46, 'rgba(225,240,245,0.55)');
      s.poly([[x - 0.12, 1.09], [x + 0.12, 1.09], [x + 0.07, 1.4], [x - 0.07, 1.4]], '#1e1a18');
      sparkle(s, x, 1.25, rand, 8);
    }
  },
  mid(s, rand) {
    // 腰高玻璃展示櫃：木櫃身、亮燈玻璃面與商品閃點；上方小型水晶吊燈。
    for (const [x, w] of [[0.5, 2.0], [3.0, 2.0]]) {
      s.rect(x, 0, w, 0.62, '#3b2f27').rect(x, 0.62, w, 0.04, '#c9a253');
      s.vgrad(x + 0.04, 0.66, w - 0.08, 0.3, [[0, '#fff7e6'], [1, '#d8e8ec']]);
      for (let k = 0.2; k < w - 0.1; k += 0.25) sparkle(s, x + k, 0.7, rand, 3);
      s.rect(x, 0.96, w, 0.02, '#e9e1d2');
    }
    s.line(2.75, 3.5, 2.75, 3.05, 0.015, '#b8a272');
    for (let i = 0; i < 9; i++) s.ellipse(2.4 + i * 0.088, 2.85 + Math.sin(i / 8 * Math.PI) * -0.15, 0.03, 0.06, '#fff8e8');
    s.ellipse(2.75, 3.0, 0.38, 0.05, '#e7d7b0');
  },
};

const BOTTLES = ['#e9c9c3', '#c43a4a', '#f3eee8', '#d9a7b0', '#a33242', '#e2b07a', '#ffffff', '#1d1d1f'];
export const cosmetics = {
  back(s, rand) {
    wallBase(s, '#f8f6f3', null, '#d8d4ce');
    // 品牌燈箱與口紅／瓶罐格架（色號排成漸層）。
    s.vgrad(2.0, 1.55, 1.5, 1.6, [[0, '#f2d8d2'], [1, '#e8b9b3']]).ellipse(2.75, 2.35, 0.35, 0.5, '#f9ebe6');
    for (const x0 of [0.2, 3.7]) {
      for (let r = 0; r < 6; r++) {
        const y = 0.9 + r * 0.33;
        s.rect(x0, y, 1.6, 0.02, '#e5e1db');
        for (let k = 0; k < 11; k++) s.rect(x0 + 0.05 + k * 0.14, y + 0.02, 0.07, r < 3 ? 0.12 : 0.2, BOTTLES[(k + r * 3) % BOTTLES.length]);
      }
    }
    s.rect(0, 0, s.w, 0.85, '#efebe6').rect(0, 0.85, s.w, 0.03, '#d9d3cb');
    for (let x = 0.7; x < 5.5; x += 1.4) s.scallop(x, 3.45, 1.2, 1.0, 0.3);
  },
  side(s, rand) {
    wallBase(s, '#f5f3f0', null, '#dad5ce');
    for (let r = 0; r < 5; r++) {
      s.rect(0.3, 1.0 + r * 0.34, 3.0, 0.02, '#e2ddd6');
      for (let k = 0; k < 18; k++) s.rect(0.36 + k * 0.16, 1.02 + r * 0.34, 0.08, 0.16 + rand() * 0.06, BOTTLES[(k * 2 + r) % BOTTLES.length]);
    }
    s.rect(0.6, 2.75, 2.2, 0.35, '#efd4cf');
  },
  floor(s) { tiles(s, '#f1eeea', '#e2ddd7', 0.8); },
  ceiling(s) { downlights(s, '#fbfaf8', '#ffffff', 0.9); },
  front(s, rand) {
    for (const x of [0.9, 4.6]) {
      s.rect(x - 0.35, 0, 0.7, 0.9, '#f5f2ee').rect(x - 0.35, 0.9, 0.7, 0.02, '#d8d1c8');
      s.rect(x - 0.12, 0.92, 0.24, 0.42, pick(rand, ['#e9c9c3', '#d9a7b0', '#f3eee8'])).rect(x - 0.05, 1.34, 0.1, 0.08, '#c9a253');
      s.rect(x + 0.15, 0.92, 0.1, 0.22, pick(rand, BOTTLES));
    }
  },
  mid(s, rand) {
    // 試用島台：白色檯面、試用盤、圓鏡。
    s.rect(1.4, 0, 2.7, 0.88, '#f6f4f1').rect(1.4, 0.88, 2.7, 0.03, '#cfc8bf');
    for (let x = 1.55; x < 4.0; x += 0.12) s.rect(x, 0.91, 0.05, 0.1 + rand() * 0.06, BOTTLES[Math.floor(rand() * BOTTLES.length)]);
    for (const x of [1.9, 3.6]) { s.rect(x - 0.01, 0.91, 0.02, 0.25, '#b9b1a6'); s.ellipse(x, 1.28, 0.14, 0.14, '#cfdfe6'); }
  },
};

const SPINES = ['#7a2b2b', '#28406b', '#2f5a3e', '#d9cfb8', '#b3833f', '#3d3d3d', '#8b6b9a', '#c45c3c', '#efe9dc', '#5d7a8a'];
function books(x, y, h, rand, s) {
  const w = 0.03 + rand() * 0.035, bh = h * (0.7 + rand() * 0.3);
  s.rect(x, y, w, bh, pick(rand, SPINES));
  return w;
}
export const bookstore = {
  back(s, rand) {
    s.fill('#e9e1d3');
    for (const [x, w] of [[0.1, 1.7], [1.9, 1.7], [3.7, 1.7]]) shelving(s, x, w, 0.12, 2.6, 6, (cx, cy, h) => books(cx, cy, h, rand, s), rand, '#8a6c4c');
    s.rect(0, 2.75, s.w, 0.5, '#d6c9b3');
  },
  side(s, rand) {
    s.fill('#e5dccd');
    shelving(s, 0.1, 3.4, 0.12, 2.6, 6, (cx, cy, h) => books(cx, cy, h, rand, s), rand, '#8a6c4c');
  },
  floor(s) {
    s.fill('#b58f66');
    for (let x = 0; x < s.w; x += 0.18) s.rect(x, 0, 0.01, s.h, '#a07c56');
  },
  ceiling(s) { s.fill('#efe8dc'); for (let x = 0.5; x < s.w; x += 1.5) s.rect(x, 0.4, 0.15, 2.8, '#fff8e8'); },
  front(s, rand) {
    // 窗邊平台：正面展示筆記本、鋼筆托盤與小立牌。
    s.rect(0.3, 0, 4.9, 0.7, '#9a7550').rect(0.3, 0.7, 4.9, 0.04, '#7a5a3c');
    for (let x = 0.5; x < 5.0; x += 0.42) {
      if (rand() < 0.3) continue;
      const h = 0.22 + rand() * 0.12;
      s.rect(x, 0.74, 0.26, h, pick(rand, SPINES)).rect(x + 0.03, 0.74 + h * 0.6, 0.2, 0.03, '#f4eee2');
    }
  },
  mid(s, rand) {
    for (const x of [0.6, 3.1]) {
      table(s, x, 1.8, 0.8, '#a17b54', '#7a5a3c', 0.06);
      for (let k = 0.08; k < 1.7; k += 0.3) {
        const n = 2 + Math.floor(rand() * 4);
        for (let j = 0; j < n; j++) s.rect(x + k, 0.8 + j * 0.04, 0.24, 0.035, pick(rand, SPINES));
      }
    }
  },
};

const ART = ['#2b4c6f', '#c4513a', '#e4c35b', '#3c6e57', '#191919', '#d8cfc0', '#7f5a8c'];
function artwork(s, x, y, w, h, rand) {
  s.rect(x - 0.03, y - 0.03, w + 0.06, h + 0.06, '#2a2a2a').rect(x, y, w, h, '#f3f0ea');
  for (let i = 0; i < 4; i++) s.rect(x + w * (0.1 + rand() * 0.5), y + h * (0.1 + rand() * 0.5), w * (0.15 + rand() * 0.3), h * (0.1 + rand() * 0.35), pick(rand, ART));
}
export const gallery = {
  back(s, rand) {
    wallBase(s, '#f7f6f2', null, '#e3e0da');
    artwork(s, 0.8, 1.2, 1.4, 1.0, rand); artwork(s, 3.2, 1.0, 1.5, 1.3, rand);
    s.scallop(1.5, 3.45, 1.4, 1.6, 0.35).scallop(3.95, 3.45, 1.4, 1.6, 0.35);
  },
  side(s, rand) { wallBase(s, '#f4f2ee', null, '#e3e0da'); artwork(s, 1.1, 1.2, 1.2, 0.9, rand); },
  floor(s) { s.fill('#a9a59e'); s.ellipse(2.7, 1.8, 2.0, 1.2, 'rgba(255,255,255,0.08)'); },
  ceiling(s) { s.fill('#f2f1ee'); s.rect(0, 1.2, s.w, 0.05, '#2f2f2f'); s.rect(0, 2.4, s.w, 0.05, '#2f2f2f'); },
  front(s, rand) {
    s.rect(4.3, 0, 0.5, 0.95, '#f2f0eb');
    s.poly([[4.4, 0.95], [4.7, 0.95], [4.62, 1.45], [4.5, 1.6], [4.42, 1.3]], pick(rand, ART));
  },
  mid(s) { s.rect(2.0, 0.42, 1.5, 0.08, '#c8b79c').rect(2.1, 0, 0.06, 0.42, '#3a3a3a').rect(3.34, 0, 0.06, 0.42, '#3a3a3a'); },
};

const CERAMIC = ['#e8e1d3', '#6c8aa0', '#b9805c', '#3d4a4f', '#d6c49a', '#8fa58a', '#f4f1ea'];
function ware(x, y, h, rand, s) {
  const kind = rand();
  const c = pick(rand, CERAMIC);
  if (kind < 0.4) { s.dome(x + 0.09, y + 0.1, 0.09, 0.1, c).rect(x, y + 0.1, 0.18, 0.015, shade('#e8e1d3', -0.1)); return 0.18; }
  if (kind < 0.75) { s.rect(x, y, 0.08, 0.1, c).rect(x + 0.08, y + 0.03, 0.025, 0.05, c); return 0.11; }
  s.rect(x, y, 0.06, Math.min(h, 0.22), c).rect(x + 0.015, y + Math.min(h, 0.22), 0.03, 0.04, c); return 0.06;
}
export const goods = {
  back(s, rand) {
    wallBase(s, '#efe7da', null, '#a08c74');
    shelving(s, 0.25, 5.0, 0.6, 2.5, 5, (x, y, h) => ware(x, y, h, rand, s), rand, '#a37b52');
    s.rect(0.25, 0, 5.0, 0.6, '#b58b5f');
  },
  side(s, rand) {
    wallBase(s, '#ebe2d4', null, '#a08c74');
    // 有孔板：廚刀、剪刀、文具小物。
    s.rect(0.3, 1.0, 3.0, 1.5, '#d8c7aa');
    for (let x = 0.5; x < 3.2; x += 0.22) {
      const len = 0.25 + rand() * 0.15;
      s.rect(x, 2.2 - len, 0.035, len, '#c9ced2').rect(x - 0.01, 2.2, 0.055, 0.12, pick(rand, ['#3b2a20', '#5a3d2b', '#1f1f1f']));
    }
    shelving(s, 0.3, 3.0, 0.1, 0.9, 2, (x, y, h) => ware(x, y, h, rand, s), rand, '#a37b52');
  },
  floor(s) { s.fill('#c5a27b'); for (let y = 0; y < s.h; y += 0.2) s.rect(0, y, s.w, 0.01, '#b08d66'); },
  ceiling(s) { s.fill('#ece5d8'); for (let x = 0.6; x < s.w; x += 1.4) s.rect(x, 0, 0.08, s.h, '#a68560'); },
  front(s, rand) {
    // 階梯式陳列台：上層小物、下層器皿與乾燥花。
    s.rect(0.4, 0, 1.6, 0.45, '#b98d61').rect(0.6, 0.45, 1.2, 0.3, '#c99d6f');
    for (let x = 0.5; x < 1.9; x += 0.22) ware(x, 0.45, 0.2, rand, s);
    for (let x = 0.7; x < 1.7; x += 0.2) ware(x, 0.75, 0.2, rand, s);
    plant(s, 4.6, 0, 0.9, '#c7b9a2');
  },
  mid(s, rand) {
    table(s, 1.6, 2.4, 0.85, '#b88c5e', '#8a6844', 0.07);
    for (let x = 1.75; x < 3.85; x += 0.2) x += ware(x, 0.85, 0.2, rand, s) - 0.1;
  },
};
