// 移植自 Ginza 專案 web/shop-paint-food.js（2026-10-11 版），原樣保留；顏色在 ginzaShopInteriors.ts 統一換成色票。
// 餐飲與服務類店內陳列：洋菓子／和菓子冷藏櫃、喫茶吧台、餐廳吧台、便利店貨架與飲料櫃、
// 銀行櫃台、美髮鏡台。典型構成示意，不對應特定店鋪。
import { table, chair, plant, pendant, shelving, shade, pick } from './kit.js';
import { tiles, downlights } from './retail.js';

const CAKES = ['#f4e6d0', '#e9b3b8', '#7a4a32', '#f7f1e3', '#d8a25a', '#9cbf7a', '#c7444f', '#efd27a'];
const BOXES = ['#f3ecdf', '#b52b34', '#1f3c6b', '#d8c39a', '#2f5d48', '#e7c3c6'];

function giftBox(x, y, h, rand, s) {
  const w = 0.22 + rand() * 0.12, bh = Math.min(h, 0.1 + rand() * 0.14), c = pick(rand, BOXES);
  s.rect(x, y, w, bh, c).rect(x + w * 0.45, y, 0.025, bh, c === '#f3ecdf' ? '#b52b34' : '#f3ecdf');
  if (rand() < 0.5 && bh < h - 0.12) s.rect(x + 0.02, y + bh, w - 0.04, 0.08, pick(rand, BOXES));
  return w;
}

export const sweets = {
  back(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#f4ecdc'], [1, '#e6dac4']]);
    shelving(s, 0.2, 2.1, 1.0, 2.6, 4, (x, y, h) => giftBox(x, y, h, rand, s), rand, '#a78560');
    shelving(s, 3.2, 2.1, 1.0, 2.6, 4, (x, y, h) => giftBox(x, y, h, rand, s), rand, '#a78560');
    // 後方作業間的暖簾與收銀台。
    s.rect(2.45, 0.9, 0.6, 1.9, '#4f2f28').rect(2.45, 1.95, 0.6, 0.85, '#2d4560').rect(2.74, 1.95, 0.02, 0.5, '#e9dcc4');
    s.rect(0.2, 0, 5.1, 0.95, '#c2a27c').rect(0.2, 0.95, 5.1, 0.04, '#8a6a4a').rect(4.2, 0.99, 0.35, 0.25, '#3a3a3a');
  },
  side(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#f2e9d8'], [1, '#e3d6bf']]);
    shelving(s, 0.3, 3.0, 0.15, 2.3, 5, (x, y, h) => giftBox(x, y, h, rand, s), rand, '#a78560');
  },
  floor(s) { tiles(s, '#e9e1d2', '#d8ccb8', 0.45); },
  ceiling(s) { downlights(s, '#f6f1e8', '#fff3da', 0.9); },
  front(s, rand) {
    // 窗邊低台：禮盒疊放與蛋糕台座樣品。
    s.rect(0.3, 0, 1.8, 0.6, '#d9c4a2').rect(0.3, 0.6, 1.8, 0.03, '#a78560');
    for (let x = 0.4; x < 1.9;) x += giftBox(x, 0.63, 0.4, rand, s) + 0.05;
    s.rect(4.25, 0, 0.12, 0.85, '#c9b28a').rect(3.9, 0.85, 0.82, 0.03, '#efe6d6');
    s.dome(4.31, 0.88, 0.3, 0.26, pick(rand, CAKES)).rect(4.01, 0.88, 0.6, 0.07, '#f7efe0');
  },
  mid(s, rand) {
    // 全寬冷藏玻璃櫃：兩層托盤擺生菓子／蛋糕。
    s.rect(0.25, 0, 5.0, 0.62, '#b8956c').rect(0.25, 0.62, 5.0, 0.04, '#8a6a4a');
    s.rect(0.3, 0.66, 4.9, 0.6, 'rgba(232,244,246,0.42)');
    for (const y of [0.68, 0.98]) {
      s.rect(0.3, y, 4.9, 0.015, '#f2f2ee');
      for (let x = 0.42; x < 5.1; x += 0.24) {
        const c = pick(rand, CAKES);
        if (rand() < 0.5) s.dome(x + 0.08, y + 0.015, 0.08, 0.09, c);
        else s.rect(x, y + 0.015, 0.16, 0.1, c).rect(x, y + 0.115, 0.16, 0.025, shade(c, 0.12));
      }
    }
    s.rect(0.25, 1.26, 5.0, 0.03, '#d4d0c6');
  },
};

const CUPS = ['#f4f1ea', '#e0d4c1', '#2e2a26', '#b98a5e'];
export const cafe = {
  back(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#d9c7aa'], [1, '#c4ad8a']]);
    s.rect(0, 0, s.w, 1.0, '#6b4b33');
    // 後吧台層架：咖啡杯、豆袋；黑板菜單（無文字，只畫線）。
    for (const y of [1.55, 1.95, 2.35]) {
      s.rect(0.3, y, 3.0, 0.03, '#5a3e2a');
      for (let x = 0.4; x < 3.2; x += 0.18) {
        if (rand() < 0.35) s.rect(x, y + 0.03, 0.12, 0.2, pick(rand, ['#7b5a3c', '#b29270', '#2f4a3a']));
        else s.rect(x, y + 0.03, 0.09, 0.08, pick(rand, CUPS));
      }
    }
    s.rect(3.6, 1.45, 1.5, 1.05, '#2d332f').rect(3.55, 1.4, 1.6, 0.05, '#7a5a3c');
    for (let y = 1.6; y < 2.4; y += 0.14) s.rect(3.75, y, 0.4 + rand() * 0.7, 0.025, '#c9cbbf');
  },
  side(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#d6c3a5'], [1, '#c0a986']]);
    s.rect(0, 0, s.w, 1.0, '#6b4b33');
    // 沿牆長椅與掛畫。
    s.rect(0.4, 0, 3.0, 0.45, '#7d3b32').rect(0.4, 0.45, 3.0, 0.4, '#8f463b');
    for (const x of [0.8, 2.2]) s.rect(x - 0.03, 1.5, 0.66, 0.5, '#3b2c22').rect(x, 1.53, 0.6, 0.44, pick(rand, ['#b9a07c', '#7f8f7a', '#c48f6a']));
  },
  floor(s) { s.fill('#8a6446'); for (let x = 0; x < s.w; x += 0.15) s.rect(x, 0, 0.012, s.h, '#76543a'); },
  ceiling(s) { s.fill('#4a3a2e'); for (let x = 0.4; x < s.w; x += 0.5) s.rect(x, 0, 0.08, s.h, '#3a2c22'); },
  front(s, rand) {
    // 窗邊小圓桌＋曲木椅，盆栽。
    for (const x of [1.0, 4.4]) {
      s.ellipse(x, 0.72, 0.32, 0.03, '#2e2a26').rect(x - 0.02, 0, 0.04, 0.72, '#2e2a26').rect(x - 0.2, 0, 0.4, 0.03, '#2e2a26');
      s.rect(x - 0.12, 0.75, 0.08, 0.07, pick(rand, CUPS));
      chair(s, x - 0.55, 1, '#4a3324'); chair(s, x + 0.55, -1, '#4a3324');
    }
    plant(s, 2.7, 0, 0.75, '#b9a27f');
  },
  mid(s) {
    // 吧台、義式咖啡機、甜點櫃，上方吊燈。
    s.rect(0.6, 0, 3.6, 1.0, '#5a3e2a').rect(0.55, 1.0, 3.7, 0.05, '#2e2620');
    s.rect(1.0, 1.05, 0.6, 0.42, '#c9c9c4').rect(1.05, 1.47, 0.5, 0.06, '#9a9a96').rect(1.15, 1.1, 0.08, 0.12, '#2a2a2a').rect(1.37, 1.1, 0.08, 0.12, '#2a2a2a');
    s.rect(2.4, 1.05, 1.2, 0.36, 'rgba(230,240,240,0.5)');
    for (let x = 2.5; x < 3.5; x += 0.22) s.dome(x + 0.08, 1.08, 0.08, 0.08, CAKES[Math.floor(x * 7) % CAKES.length]);
    for (const x of [1.3, 2.75, 4.2]) pendant(s, x, 0.9, '#2e2a26');
  },
};

const BOTTLE = ['#6b8f5a', '#5a3218', '#d9b45a', '#2c4a6b', '#b8c7c0', '#7a2a2a'];
export const dining = {
  back(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#6e4e36'], [1, '#3e2c20']]);
    // 背光酒架與木格柵。
    s.vgrad(0.5, 1.4, 4.5, 1.4, [[0, '#f0b868'], [1, '#c98a44']]);
    for (const y of [1.45, 1.9, 2.35]) {
      s.rect(0.5, y, 4.5, 0.025, '#3a2a1e');
      for (let x = 0.6; x < 4.9; x += 0.12 + rand() * 0.05) s.rect(x, y + 0.025, 0.06, 0.24 + rand() * 0.08, pick(rand, BOTTLE));
    }
    for (let x = 0.1; x < s.w; x += 0.12) s.rect(x, 2.9, 0.05, 0.6, '#5a4030');
  },
  side(s, rand) {
    s.vgrad(0, 0, s.w, s.h, [[0, '#7a5a40'], [1, '#4a3626']]);
    for (let x = 0.05; x < s.w; x += 0.14) s.rect(x, 0.9, 0.07, 2.6, '#8d6a4c');
    s.rect(0.4, 1.4, 1.0, 0.7, '#2a1f18').rect(0.45, 1.45, 0.9, 0.6, pick(rand, ['#c79a5a', '#8a5a3a']));
  },
  floor(s) { tiles(s, '#5b4535', '#4a382b', 0.5); },
  ceiling(s) { s.fill('#2f241c'); for (let x = 0.7; x < s.w; x += 1.4) s.ellipse(x, 1.8, 0.1, 0.1, '#ffd9a0'); },
  front(s) {
    // 白桌布雙人桌。
    for (const x of [1.2, 4.3]) {
      s.rect(x - 0.45, 0.2, 0.9, 0.55, '#f2eee6').rect(x - 0.45, 0.72, 0.9, 0.04, '#ffffff');
      s.rect(x - 0.25, 0.76, 0.1, 0.12, '#e8e0cc').rect(x + 0.12, 0.76, 0.03, 0.2, '#e9e2d0');
      chair(s, x - 0.7, 1, '#3a281c'); chair(s, x + 0.7, -1, '#3a281c');
    }
  },
  mid(s) {
    // 吧台與高腳椅，吊燈。
    s.rect(0.4, 0, 4.7, 1.0, '#3e2b1e').rect(0.35, 1.0, 4.8, 0.06, '#9a7450');
    for (let x = 0.9; x < 5.0; x += 0.8) {
      s.rect(x - 0.17, 0.72, 0.34, 0.06, '#1f1a16').rect(x - 0.02, 0, 0.04, 0.72, '#8c8c88').rect(x - 0.15, 0, 0.3, 0.03, '#8c8c88');
    }
    for (const x of [1.4, 2.75, 4.1]) pendant(s, x, 1.05, '#b07a3a', '#ffd38a');
  },
};

const PACKS = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ffffff', '#fb8c00', '#8e24aa', '#6d4c41'];
function product(x, y, h, rand, s) {
  const w = 0.07 + rand() * 0.07;
  s.rect(x, y, w, Math.min(h, 0.12 + rand() * 0.14), pick(rand, PACKS));
  return w;
}
export const convenience = {
  back(s, rand) {
    s.fill('#f4f6f7');
    // 整面冷藏飲料櫃：玻璃門、門框、彩色瓶罐。
    s.rect(0.15, 0.1, 5.2, 2.3, '#d9dfe2');
    for (let d = 0; d < 6; d++) {
      const x = 0.2 + d * 0.86;
      s.rect(x, 0.15, 0.82, 2.2, '#eef7fb');
      for (let r = 0; r < 5; r++) {
        s.rect(x, 0.2 + r * 0.43, 0.82, 0.02, '#c4ccd0');
        for (let k = 0; k < 7; k++) s.rect(x + 0.04 + k * 0.11, 0.22 + r * 0.43, 0.07, 0.24, pick(rand, PACKS));
      }
      s.rect(x + 0.78, 0.15, 0.04, 2.2, '#9aa3a8').rect(x + 0.7, 1.0, 0.03, 0.4, '#7c858a');
    }
    s.rect(0, 2.5, s.w, 0.3, '#2e7d32').rect(0, 2.8, s.w, 0.1, '#1565c0');
  },
  side(s, rand) {
    s.fill('#f2f4f5');
    shelving(s, 0.1, 3.4, 0.1, 1.8, 6, (x, y, h) => product(x, y, h, rand, s), rand, '#b0b8bc');
  },
  floor(s) { tiles(s, '#dfe2e3', '#cfd3d4', 0.45); },
  ceiling(s) { s.fill('#f7f8f8'); for (let x = 0.5; x < s.w; x += 1.2) s.rect(x, 0.2, 0.3, 3.2, '#ffffff'); },
  front(s, rand) {
    // 日本便利店沿窗雜誌架。
    s.rect(0.2, 0, 5.1, 0.75, '#b8c0c4').rect(0.2, 0.75, 5.1, 0.03, '#8f989d');
    for (let x = 0.3; x < 5.2; x += 0.28) {
      s.poly([[x, 0.78], [x + 0.24, 0.78], [x + 0.26, 1.08], [x + 0.02, 1.08]], pick(rand, PACKS));
      s.rect(x + 0.04, 0.95, 0.15, 0.05, '#ffffff');
    }
  },
  mid(s, rand) {
    // 貨架端面（面向街道），中間通道可見後方飲料櫃。
    for (const x of [0.4, 3.4]) {
      shelving(s, x, 1.7, 0.1, 1.55, 5, (cx, cy, h) => product(cx, cy, h, rand, s), rand, '#b0b8bc');
      s.rect(x, 1.6, 1.7, 0.18, '#e53935');
    }
  },
};

export const service = {
  back(s) {
    s.fill('#e8eaea');
    s.rect(0, 2.3, s.w, 0.9, '#c9d3d8').rect(2.1, 2.5, 1.3, 0.5, '#1b4f8a');
    // 窗口櫃台、隔板、螢幕。
    s.rect(0.2, 0, 5.1, 1.0, '#c9b79c').rect(0.15, 1.0, 5.2, 0.05, '#f2efe9');
    for (let x = 0.2; x < 5.3; x += 1.27) {
      s.rect(x, 1.05, 0.03, 0.55, 'rgba(210,230,236,0.9)');
      s.rect(x + 0.45, 1.05, 0.35, 0.28, '#2c2f33').rect(x + 0.6, 1.33, 0.05, 0.08, '#2c2f33');
    }
  },
  side(s) {
    s.fill('#e6e8e8');
    // 自動提款機一排。
    for (let x = 0.5; x < 3.3; x += 0.95) {
      s.rect(x, 0, 0.75, 1.65, '#c2c8cc').rect(x + 0.1, 1.1, 0.55, 0.38, '#3a5a7a').rect(x + 0.15, 0.9, 0.45, 0.12, '#8a9296');
    }
  },
  floor(s) { s.fill('#8f9497'); s.rect(0, 0, s.w, 0.6, '#a2a7aa'); },
  ceiling(s) { s.fill('#f4f5f5'); for (let x = 0.4; x < s.w; x += 1.2) s.rect(x, 0.4, 0.6, 0.6, '#ffffff').rect(x, 2.2, 0.6, 0.6, '#ffffff'); },
  front(s) { plant(s, 0.7, 0, 1.2, '#cfd3d4'); s.rect(4.4, 0, 0.5, 1.2, '#d0d4d6').rect(4.45, 0.7, 0.4, 0.45, '#5b8ab8'); },
  mid(s) {
    for (let x = 1.5; x < 4.2; x += 0.62) s.rect(x, 0.42, 0.52, 0.12, '#30577f').rect(x, 0.54, 0.52, 0.4, '#3a6390').rect(x + 0.22, 0, 0.08, 0.42, '#7f8a90');
  },
};

export const salon = {
  back(s, rand) {
    s.fill('#ece7df');
    // 鏡台：圓角鏡、燈條、小檯面。
    for (let x = 0.35; x < 5.0; x += 1.7) {
      s.rect(x, 0.85, 1.3, 0.05, '#c3b6a3').rect(x + 0.15, 1.05, 1.0, 1.55, '#b8c9cf').rect(x + 0.15, 2.6, 1.0, 0.05, '#fff8e4');
      s.rect(x + 0.25, 0.9, 0.08, 0.16, pick(rand, ['#2a2a2a', '#c9a253', '#e9e1d3']));
    }
  },
  side(s, rand) {
    s.fill('#e8e2d8');
    shelving(s, 0.3, 1.6, 0.9, 2.2, 3, (x, y) => { s.rect(x, y, 0.06, 0.16, pick(rand, ['#2a2a2a', '#e9e1d3', '#c9a253', '#7a9a8a'])); return 0.07; }, rand, '#9b8466');
  },
  floor(s) { s.fill('#c9b496'); for (let x = 0; x < s.w; x += 0.2) s.rect(x, 0, 0.01, s.h, '#b59f80'); },
  ceiling(s) { downlights(s, '#f3efe8'); },
  front(s) { s.rect(3.8, 0, 1.3, 1.0, '#2f2b28').rect(3.75, 1.0, 1.4, 0.05, '#c9b28a'); plant(s, 0.7, 0, 1.0, '#e0d8cc'); },
  mid(s) {
    // 美髮椅背向街道、面對鏡台。
    for (let x = 1.0; x < 5.0; x += 1.7) {
      s.rect(x - 0.05, 0, 0.1, 0.45, '#8c8c88').rect(x - 0.3, 0, 0.6, 0.04, '#8c8c88');
      s.rect(x - 0.3, 0.45, 0.6, 0.12, '#2a2624').rect(x - 0.27, 0.57, 0.54, 0.62, '#36302c').rect(x - 0.35, 0.55, 0.06, 0.22, '#2a2624').rect(x + 0.29, 0.55, 0.06, 0.22, '#2a2624');
    }
  },
};
