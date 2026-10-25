// 移植自 Ginza 專案 web/shop-paint-kit.js（2026-10-11 版），原樣保留；顏色在 ginzaShopInteriors.ts 統一換成色票。
// 店內圖集的繪製工具：以公尺為單位在 canvas 格子上作畫，y 由下往上。
export const ROOM = { width: 5.5, height: 3.5, depth: 3.6 };
export const CELL = [256, 160];
// 每種店的六個面：後牆、側牆、地板、天花板、靠窗陳列層、中段陳列層。
export const SURFACES = ['back', 'side', 'floor', 'ceiling', 'front', 'mid'];
export const LAYER_DEPTHS = { front: 0.85, mid: 2.05 };

const SIZE = {
  back: [ROOM.width, ROOM.height], side: [ROOM.depth, ROOM.height], floor: [ROOM.width, ROOM.depth],
  ceiling: [ROOM.width, ROOM.depth], front: [ROOM.width, ROOM.height], mid: [ROOM.width, ROOM.height],
};

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 在 (ox, oy) 格子內建立公尺座標畫筆。
export function surface(ctx, ox, oy, kind) {
  const [mw, mh] = SIZE[kind];
  const sx = CELL[0] / mw, sy = CELL[1] / mh;
  const X = (m) => ox + m * sx, Y = (m) => oy + CELL[1] - m * sy;
  const paint = (color) => { ctx.fillStyle = color; return ctx; };
  const s = {
    ctx, w: mw, h: mh, sx, sy,
    rect(x, y, w, h, color) { paint(color).fillRect(X(x), Y(y + h), w * sx, h * sy); return s; },
    fill(color) { return s.rect(0, 0, mw, mh, color); },
    vgrad(x, y, w, h, stops) {
      const g = ctx.createLinearGradient(0, Y(y + h), 0, Y(y));
      stops.forEach(([t, c]) => g.addColorStop(t, c));
      return s.rect(x, y, w, h, g);
    },
    hgrad(x, y, w, h, stops) {
      const g = ctx.createLinearGradient(X(x), 0, X(x + w), 0);
      stops.forEach(([t, c]) => g.addColorStop(t, c));
      return s.rect(x, y, w, h, g);
    },
    ellipse(x, y, rx, ry, color) {
      paint(color).beginPath(); ctx.ellipse(X(x), Y(y), rx * sx, ry * sy, 0, 0, Math.PI * 2); ctx.fill(); return s;
    },
    // 由下往上的半圓頂（蛋糕、碗、和菓子）。
    dome(x, y, rx, ry, color) {
      paint(color).beginPath(); ctx.ellipse(X(x), Y(y), rx * sx, ry * sy, 0, Math.PI, 0); ctx.fill(); return s;
    },
    poly(points, color) {
      paint(color).beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath(); ctx.fill(); return s;
    },
    line(x0, y0, x1, y1, width, color) {
      ctx.strokeStyle = color; ctx.lineWidth = width * sx;
      ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke(); return s;
    },
    // 由上方光源投射到牆面的扇形光斑。
    scallop(x, top, width, depth, alpha = 0.35) {
      const g = ctx.createRadialGradient(X(x), Y(top), 0, X(x), Y(top), depth * sy);
      g.addColorStop(0, `rgba(255,246,226,${alpha})`); g.addColorStop(1, 'rgba(255,246,226,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(X(x), Y(top), width / 2 * sx, depth * sy, 0, 0, Math.PI); ctx.fill(); return s;
    },
  };
  return s;
}

// ---- 共用家具／商品輪廓 ----
export function garment(s, x, y, w, len, color, sleeves = true) {
  s.line(x, y + 0.04, x, y + 0.13, 0.015, '#8b8274');
  const shoulder = y - 0.02;
  s.poly([[x - w * 0.22, shoulder + 0.02], [x + w * 0.22, shoulder + 0.02], [x + w / 2, shoulder - 0.08],
    [x + w * 0.45, y - len], [x - w * 0.45, y - len], [x - w / 2, shoulder - 0.08]], color);
  if (sleeves) s.rect(x + w * 0.38, y - len * 0.62, w * 0.12, len * 0.55, shade(color, -0.12));
  s.rect(x - 0.012, y - len, 0.024, len - 0.04, shade(color, -0.08));
}

export function mannequin(s, x, floorY, outfit, dress = false) {
  s.rect(x - 0.32, floorY, 0.64, 0.14, '#e8e2d8').rect(x - 0.32, floorY + 0.14, 0.64, 0.02, '#c9c0b2');
  const base = floorY + 0.16;
  s.rect(x - 0.015, base, 0.03, 0.3, '#9e9588');
  const hip = base + 0.95, shoulder = base + 1.45;
  if (dress) {
    s.poly([[x - 0.2, shoulder], [x + 0.2, shoulder], [x + 0.13, hip], [x + 0.32, base + 0.3], [x - 0.32, base + 0.3], [x - 0.13, hip]], outfit);
  } else {
    s.poly([[x - 0.22, shoulder], [x + 0.22, shoulder], [x + 0.25, base + 0.55], [x - 0.25, base + 0.55]], outfit);
    s.rect(x - 0.15, base + 0.3, 0.12, 0.3, '#3c3a38').rect(x + 0.03, base + 0.3, 0.12, 0.3, '#3c3a38');
  }
  s.rect(x - 0.27, shoulder - 0.6, 0.07, 0.58, shade(outfit, -0.1)).rect(x + 0.2, shoulder - 0.6, 0.07, 0.58, shade(outfit, -0.1));
  s.rect(x - 0.035, shoulder, 0.07, 0.08, '#e9e3da').ellipse(x, shoulder + 0.2, 0.09, 0.12, '#efe9e0');
}

export function table(s, x, w, top, color, legs = '#5d4a3a', thickness = 0.05) {
  s.rect(x, top - thickness, w, thickness, color);
  s.rect(x + 0.05, 0, 0.05, top - thickness, legs).rect(x + w - 0.1, 0, 0.05, top - thickness, legs);
}

export function chair(s, x, facing, color) {
  s.rect(x - 0.2, 0.45, 0.4, 0.05, color);
  s.rect(x - 0.18, 0, 0.03, 0.45, color).rect(x + 0.15, 0, 0.03, 0.45, color);
  const backX = facing > 0 ? x - 0.2 : x + 0.17;
  s.rect(backX, 0.45, 0.03, 0.45, color).rect(Math.min(backX, x - 0.2), 0.82, 0.4, 0.06, color);
}

export function plant(s, x, y, size, pot = '#d9d1c4') {
  s.rect(x - size * 0.22, y, size * 0.44, size * 0.42, pot);
  for (const [dx, dy, r] of [[0, 0.8, 0.32], [-0.22, 0.62, 0.26], [0.22, 0.66, 0.27], [0.05, 1.05, 0.22]]) {
    s.ellipse(x + dx * size, y + dy * size, r * size, r * size * 1.05, ['#4f7a4c', '#628c56', '#3f6a43', '#6d9a5d'][Math.abs(Math.round(dx * 10)) % 4]);
  }
}

export function pendant(s, x, drop, color = '#2e2a26', glow = '#ffe2a8') {
  s.line(x, s.h, x, s.h - drop, 0.012, '#2b2b2b');
  s.poly([[x - 0.18, s.h - drop - 0.2], [x + 0.18, s.h - drop - 0.2], [x + 0.07, s.h - drop], [x - 0.07, s.h - drop]], color);
  s.rect(x - 0.12, s.h - drop - 0.22, 0.24, 0.03, glow);
}

// 層架：兩側立柱、數層隔板，每格交由 item(x, y, w, rand) 填商品。
export function shelving(s, x, w, bottom, top, rows, item, rand, frame = '#6e5b48') {
  const step = (top - bottom) / rows;
  for (let r = 0; r < rows; r++) {
    const y = bottom + r * step;
    s.rect(x, y, w, 0.035, frame);
    let cx = x + 0.04;
    while (cx < x + w - 0.08) cx += item(cx, y + 0.035, step - 0.08, rand) + 0.02;
  }
  s.rect(x, top, w, 0.035, frame).rect(x - 0.03, 0, 0.04, top + 0.03, frame).rect(x + w - 0.01, 0, 0.04, top + 0.03, frame);
}

// shade 只接受 #rrggbb。
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }
