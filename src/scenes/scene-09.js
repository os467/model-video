import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 09 电子计算机：1940s 电子管机柜 + 插线板 + 编织电缆 + 机械计数器。
// 静态重点：localT≈1.5（标题、电缆、第一排电子管）
// 与 localT≈3.0（插头入座、整墙灯丝、计数器停在 002、烧管、蒸汽、定格）。
const TAU = Math.PI * 2;

const C = {
  bg: '#061614',
  bgDeep: '#020c0a',
  cabinet: '#0c2a23',
  cabinetLight: '#123c32',
  cabinetDeep: '#061a15',
  panel: '#0a241e',
  panelEdge: '#1c4a3d',
  mint: '#ccffe9',
  accent: '#2fe0a4',
  cream: '#f0e6c8',
  creamDim: '#c8b98f',
  glass: '#438a78',
  glassPale: '#bdf3df',
  brassDark: '#6b4a26',
  brass: '#a97d45',
  brassLight: '#d8a75a',
  copper: '#b56a3e',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe0a0',
  emberWhite: '#fff8e6',
  smoke: '#d8c7a6',
  rubber: '#071511',
  braidHi: '#24594a',
  braidLo: '#030d0a',
  slot: '#020806'
};

const META = {
  id: 9,
  cn: '电子计算机',
  en: 'Electronic Computers',
  era: '1940s · ENIAC',
  group: 'electronic'
};

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const ROAD_TOP = 470;
const ROAD_BOTTOM = 530;
const HERO_X = 500;
const SOCKET_Y = 450;

const CAB = { x: 696, y: 230, w: 244, h: 426 };
const PATCH = { x: 450, y: 352, w: 240, h: 252 };
const RAIL = { x0: 462, x1: 684, y: SOCKET_Y };
const COUNTER = { x: 700, y: 560, w: 132, h: 90 };
const SCOPE = { x: 838, y: 560, w: 82, h: 90 };

const TUBES = {
  cols: [716, 766, 816, 866, 916],
  rows: [286, 342, 398, 446]
};

const PANEL_SOCKETS = [
  [566, 386],
  [602, 386],
  [638, 386],
  [674, 386],
  [566, 418],
  [602, 418],
  [638, 418],
  [674, 418]
];

function drawScrew(p, x, y, r = 2.2, alpha = 1) {
  if (alpha <= 0.002) return;
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.55 * alpha);
  p.ellipse(x + 0.6, y + 0.7, r * 2.5, r * 2.5);
  fillHex(p, C.brassDark, 0.85 * alpha);
  p.ellipse(x, y, r * 1.9, r * 1.9);
  fillHex(p, C.brassLight, 0.32 * alpha);
  p.ellipse(x - r * 0.25, y - r * 0.28, r * 0.75, r * 0.62);
  strokeHex(p, C.slot, 0.7 * alpha);
  p.strokeWeight(0.7);
  p.line(x - r * 0.55, y + r * 0.1, x + r * 0.55, y - r * 0.1);
  p.pop();
}

// ---------- 背景：深绿黑机柜内腔 + 很淡的柜体网格/螺钉 ----------

function drawBackdrop(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  // 只铺本版块的 0..1000，不压到第 8 版块的纸带。
  p.rect(0, 0, 1000, 1000);

  // 低频的大块明暗，让背景不是一张平色纸。
  fillHex(p, C.bgDeep, 0.5);
  p.rect(0, 700, 1000, 300);
  fillHex(p, C.cabinet, 0.08);
  p.rect(330, 60, 640, 640, 10);
  fillHex(p, C.cabinetLight, 0.035);
  p.rect(0, 120, 1000, 120);
  fillHex(p, C.bgDeep, 0.24);
  p.rect(0, 430, 1000, 260);

  // 很淡的机柜网格。
  p.strokeWeight(1);
  for (let x = 0; x <= 1000; x += 125) {
    strokeHex(p, C.mint, x % 250 === 0 ? 0.032 : 0.015);
    p.line(x, 0, x, 1000);
  }
  for (let y = 0; y <= 1000; y += 125) {
    strokeHex(p, C.mint, y % 250 === 0 ? 0.028 : 0.013);
    p.line(0, y, 1000, y);
  }

  // 板块接缝，比网格略深。
  p.strokeWeight(2);
  strokeHex(p, C.slot, 0.4);
  p.line(620, 0, 620, 1000);
  p.line(0, 700, 1000, 700);
  strokeHex(p, C.mint, 0.028);
  p.strokeWeight(1);
  p.line(621, 0, 621, 1000);
  p.line(0, 701, 1000, 701);

  // 背景螺钉：避开标题区。
  drawScrew(p, 72, 92, 2.4, 0.62);
  drawScrew(p, 928, 92, 2.4, 0.62);
  drawScrew(p, 72, 720, 2.2, 0.5);
  drawScrew(p, 928, 720, 2.2, 0.5);
  drawScrew(p, 72, 932, 2.2, 0.46);
  drawScrew(p, 928, 932, 2.2, 0.46);
  drawScrew(p, 500, 96, 2.0, 0.44);

  // 上下暗角，给机柜一点纵深；渐变直接操作 ctx，严格 save/restore。
  const ctx = p.drawingContext;
  const grad = ctx.createLinearGradient(0, 0, 0, 1000);
  grad.addColorStop(0, 'rgba(1,7,5,0.46)');
  grad.addColorStop(0.18, 'rgba(1,7,5,0)');
  grad.addColorStop(0.76, 'rgba(1,7,5,0)');
  grad.addColorStop(1, 'rgba(1,7,5,0.42)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
  p.pop();
}

// ---------- 机柜墙与电子管 ----------

function tubeLitAt(col, row, hold) {
  if (row === 3) return smoothstep(1.16, 1.28, hold);
  const on = 2.22 + (3 - row) * 0.16 + hash2(col, row, 9) * 0.05;
  return smoothstep(on, on + 0.1, hold);
}

function drawTube(p, x, y, lit, burn, seed) {
  const glow = lit * (1 - burn);
  p.push();
  p.noStroke();
  // 管座落影
  fillHex(p, C.slot, 0.55);
  p.ellipse(x + 1, y + 27, 24, 6);

  if (glow > 0.02) {
    fillHex(p, C.ember, 0.032 * glow);
    p.ellipse(x, y - 2, 38, 50);
    fillHex(p, C.emberHot, 0.07 * glow);
    p.ellipse(x, y - 2, 18, 32);
  }

  // 玻璃管身
  fillHex(p, C.glass, 0.12 + 0.08 * glow);
  p.rect(x - 10, y - 20, 20, 38, 10);
  if (burn > 0.01) {
    fillHex(p, '#010605', 0.55 * burn);
    p.rect(x - 9, y - 19, 18, 36, 9);
  }

  // 内部支架
  strokeHex(p, C.brassDark, 0.7);
  p.strokeWeight(1);
  p.line(x - 3, y + 14, x - 2, y + 5);
  p.line(x + 3, y + 14, x + 2, y + 5);

  // 灯丝：同一条暖火种
  const pts = [
    [x, y + 16],
    [x - 3, y + 8],
    [x + 3, y + 1],
    [x - 3, y - 7],
    [x + 2, y - 14],
    [x, y - 18]
  ];
  p.noFill();
  strokeHex(p, burn > 0.5 ? '#241a12' : C.ember, burn > 0.5 ? 0.7 : 0.55 + 0.4 * glow);
  p.strokeWeight(1.4);
  p.beginShape();
  for (const [px, py] of pts) p.vertex(px, py);
  p.endShape();

  if (glow > 0.02) {
    strokeHex(p, C.emberHot, 0.35 + 0.55 * glow);
    p.strokeWeight(0.9);
    p.beginShape();
    for (const [px, py] of pts) p.vertex(px, py);
    p.endShape();
    strokeHex(p, C.emberCore, 0.4 + 0.5 * glow);
    p.strokeWeight(0.55);
    p.beginShape();
    for (let i = 1; i < pts.length - 1; i++) p.vertex(pts[i][0], pts[i][1]);
    p.endShape();
  }

  if (burn > 0.35) {
    strokeHex(p, '#000000', 0.8);
    p.strokeWeight(1.1);
    p.line(x - 4, y - 1, x + 4, y + 1);
    // 玻璃上的细裂纹，让静态帧也读得出“这根已经烧了”
    strokeHex(p, C.glassPale, 0.26 * burn);
    p.strokeWeight(0.7);
    p.beginShape();
    p.vertex(x - 6, y - 10);
    p.vertex(x - 1, y - 5);
    p.vertex(x - 4, y + 1);
    p.vertex(x + 3, y + 5);
    p.endShape();
    p.noStroke();
    fillHex(p, '#020504', 0.55 * burn);
    p.ellipse(x + 1, y - 16, 8, 10);
  }

  // 玻璃轮廓与反光
  p.noFill();
  strokeHex(p, C.glassPale, 0.2 + 0.16 * glow);
  p.strokeWeight(1);
  p.rect(x - 10, y - 20, 20, 38, 10);
  strokeHex(p, C.glassPale, 0.16 + 0.3 * glow);
  p.strokeWeight(0.8);
  p.line(x - 5, y - 14, x - 5, y + 6);
  p.noStroke();
  fillHex(p, C.glassPale, 0.28 + 0.2 * glow);
  p.ellipse(x - 4.5, y - 10, 1.5, 3.1);

  // 顶部小帽与黄铜底座
  fillHex(p, C.brassDark, 1);
  p.ellipse(x, y - 22, 7, 4.5);
  fillHex(p, C.brassLight, 0.34);
  p.ellipse(x - 1, y - 22.6, 3, 1.4);
  fillHex(p, C.brassDark, 1);
  p.rect(x - 9, y + 16, 18, 8, 2);
  fillHex(p, C.brass, 0.62);
  p.rect(x - 8, y + 17, 16, 2, 1);
  fillHex(p, C.slot, 0.7);
  p.rect(x - 8, y + 22, 16, 2, 1);
  fillHex(p, C.brassLight, 0.18 + hash2(seed, 3) * 0.12);
  p.ellipse(x - 6, y + 20, 1.4, 1.2);
  strokeHex(p, C.brassDark, 1);
  p.strokeWeight(1.5);
  p.line(x - 4, y + 24, x - 4, y + 28);
  p.line(x + 4, y + 24, x + 4, y + 28);
  p.pop();
}

function drawBurnFlash(p, x, y, hold) {
  const flash = smoothstep(2.79, 2.81, hold) * (1 - smoothstep(2.9, 3.04, hold));
  if (flash <= 0.01) return;
  p.push();
  p.noFill();
  strokeHex(p, C.emberWhite, 0.55 * flash);
  p.strokeWeight(1.2);
  p.ellipse(x, y - 2, 30 + (1 - flash) * 22, 42 + (1 - flash) * 26);
  strokeHex(p, C.emberHot, 0.4 * flash);
  p.strokeWeight(1);
  p.ellipse(x, y - 2, 18, 28);
  p.noStroke();
  fillHex(p, C.emberCore, 0.7 * flash);
  p.ellipse(x, y - 12, 3, 4.5);
  for (let i = 0; i < 4; i++) {
    const a = -1.9 + i * 0.55;
    const r = 10 + hash2(i, 17) * 9;
    strokeHex(p, i % 2 ? C.cream : C.emberHot, 0.55 * flash);
    p.strokeWeight(0.9);
    p.line(x, y - 2, x + Math.cos(a) * r, y - 2 + Math.sin(a) * r);
  }
  p.pop();
}

function drawCabinet(p, hold) {
  p.push();
  p.noStroke();

  fillHex(p, '#010605', 0.55);
  p.rect(CAB.x + 8, CAB.y + 10, CAB.w, CAB.h, 6);

  fillHex(p, '#081d18', 1);
  p.rect(CAB.x, CAB.y, CAB.w, CAB.h, 5);
  fillHex(p, C.cabinet, 1);
  p.rect(CAB.x + 5, CAB.y + 5, CAB.w - 10, CAB.h - 10, 3);
  fillHex(p, C.cabinetLight, 0.2);
  p.rect(CAB.x + 9, CAB.y + 9, CAB.w - 18, 250, 2);
  fillHex(p, C.cabinetDeep, 0.35);
  p.rect(CAB.x + 9, CAB.y + 334, CAB.w - 18, CAB.h - 346, 2);

  p.noFill();
  strokeHex(p, C.panelEdge, 0.78);
  p.strokeWeight(1.4);
  p.rect(CAB.x + 5, CAB.y + 5, CAB.w - 10, CAB.h - 10, 3);
  strokeHex(p, C.mint, 0.1);
  p.strokeWeight(1);
  p.rect(CAB.x + 8, CAB.y + 8, CAB.w - 16, CAB.h - 16, 2);

  // 两侧氧化铜立柱
  p.noStroke();
  fillHex(p, C.brassDark, 0.55);
  p.rect(CAB.x + 2, CAB.y + 12, 3, CAB.h - 24);
  p.rect(CAB.x + CAB.w - 5, CAB.y + 12, 3, CAB.h - 24);
  fillHex(p, C.brassLight, 0.15);
  p.rect(CAB.x + 3, CAB.y + 14, 1, CAB.h - 28);

  // 顶部的蚀刻标签条（只做刻度，不写产品字）
  fillHex(p, '#0a2620', 0.95);
  p.rect(CAB.x + 16, CAB.y + 12, CAB.w - 32, 14, 2);
  for (let k = 0; k < 12; k++) {
    fillHex(p, k % 3 === 0 ? C.ember : k % 2 ? C.mint : C.creamDim,
      k % 3 === 0 ? 0.28 : 0.12);
    p.rect(CAB.x + 22 + k * 16, CAB.y + 16, k % 3 === 0 ? 6 : 3, 2, 1);
  }

  // 电子管后的细导线
  p.strokeWeight(0.8);
  for (let r = 0; r < TUBES.rows.length; r++) {
    for (let c = 0; c < TUBES.cols.length; c++) {
      const x = TUBES.cols[c];
      const y = TUBES.rows[r];
      strokeHex(p, C.brassDark, 0.18);
      p.line(x, y + 28, x, TUBES.rows[3] + 30);
      if (c % 2 === 0) {
        strokeHex(p, C.copper, 0.12);
        p.line(x + 1, y + 28, x + 1, TUBES.rows[3] + 30);
      }
    }
  }

  // 每一排的托架
  for (let r = 0; r < TUBES.rows.length; r++) {
    const ry = TUBES.rows[r] + 27;
    p.noStroke();
    fillHex(p, C.cabinetDeep, 0.9);
    p.rect(CAB.x + 18, ry, CAB.w - 36, 4, 1);
    fillHex(p, C.brassDark, 0.4);
    p.rect(CAB.x + 18, ry, CAB.w - 36, 1.2);
    fillHex(p, C.brassLight, 0.12);
    p.rect(CAB.x + 18, ry, CAB.w - 36, 0.7);
  }

  // 20 支电子管；右上角那支在 2.8s 烧掉。
  for (let r = 0; r < TUBES.rows.length; r++) {
    for (let c = 0; c < TUBES.cols.length; c++) {
      const x = TUBES.cols[c];
      const y = TUBES.rows[r];
      const lit = tubeLitAt(c, r, hold);
      const isBurnt = r === 0 && c === 4;
      const burn = isBurnt ? smoothstep(2.8, 2.84, hold) : 0;
      drawTube(p, x, y, lit, burn, c * 13 + r * 7);
      if (isBurnt) drawBurnFlash(p, x, y, hold);
    }
  }

  // 柜体下沿的散热缝（在路面带下缘之外）
  p.strokeWeight(1);
  for (let k = 0; k < 5; k++) {
    strokeHex(p, C.mint, 0.06);
    p.line(CAB.x + 24, 538 + k * 4, CAB.x + CAB.w - 24, 538 + k * 4);
  }

  drawScrew(p, CAB.x + 12, CAB.y + 12, 2.2, 0.8);
  drawScrew(p, CAB.x + CAB.w - 12, CAB.y + 12, 2.2, 0.8);
  drawScrew(p, CAB.x + 12, CAB.y + CAB.h - 12, 2.2, 0.7);
  drawScrew(p, CAB.x + CAB.w - 12, CAB.y + CAB.h - 12, 2.2, 0.7);
  p.pop();
}

// ---------- 插线板：插孔、母线槽、扳钮、小表头 ----------

function drawSocket(p, x, y, seed) {
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.9);
  p.ellipse(x + 1, y + 1, 17, 17);
  fillHex(p, C.brassDark, 0.95);
  p.ellipse(x, y, 15, 15);
  fillHex(p, C.panel, 1);
  p.ellipse(x, y - 0.5, 10.5, 10.5);
  fillHex(p, '#010504', 1);
  p.ellipse(x, y, 6.5, 6.5);
  p.noFill();
  strokeHex(p, C.brassLight, 0.34);
  p.strokeWeight(0.9);
  p.arc(x, y, 13, 13, Math.PI * 1.05, Math.PI * 1.62);
  strokeHex(p, C.mint, 0.08);
  p.strokeWeight(0.7);
  p.arc(x, y, 15, 15, Math.PI * 0.1, Math.PI * 0.6);
  if (hash2(x, y, seed) > 0.68) {
    p.noStroke();
    fillHex(p, C.ember, 0.22);
    p.ellipse(x, y, 2.4, 2.4);
  }
  p.pop();
}

function drawPanelCable(p, pts) {
  const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] = pts;
  p.push();
  p.noFill();
  strokeHex(p, C.slot, 0.9);
  p.strokeWeight(5.2);
  p.bezier(x0, y0, cx1, cy1, cx2, cy2, x1, y1);
  strokeHex(p, C.cabinetDeep, 1);
  p.strokeWeight(3.6);
  p.bezier(x0, y0, cx1, cy1, cx2, cy2, x1, y1);
  strokeHex(p, C.braidHi, 0.45);
  p.strokeWeight(1.1);
  p.bezier(x0, y0, cx1, cy1, cx2, cy2, x1, y1);
  strokeHex(p, C.mint, 0.1);
  p.strokeWeight(0.6);
  p.bezier(x0 - 0.6, y0 - 0.6, cx1, cy1 - 0.6, cx2, cy2 - 0.6, x1, y1 - 0.6);
  p.noStroke();
  fillHex(p, C.brassDark, 0.9);
  p.ellipse(x0, y0, 5, 4);
  p.pop();
}

function drawBusRail(p, hold) {
  const x0 = RAIL.x0;
  const x1 = RAIL.x1;
  const y = RAIL.y;
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.72);
  p.rect(x0 - 5, y - 8, x1 - x0 + 10, 16, 3);
  fillHex(p, C.brassDark, 1);
  p.rect(x0 - 3, y - 6, x1 - x0 + 6, 12, 2);
  fillHex(p, C.brass, 0.7);
  p.rect(x0 - 1, y - 4, x1 - x0 + 2, 8, 1);
  fillHex(p, C.slot, 1);
  p.rect(x0, y - 2.5, x1 - x0, 5, 1);

  const heat = smoothstep(2.3, 2.95, hold);
  strokeHex(p, C.copper, 0.78);
  p.strokeWeight(1);
  p.line(x0 + 2, y - 1.5, x1 - 2, y - 1.5);
  strokeHex(p, C.emberHot, 0.22 + 0.4 * heat);
  p.line(x0 + 2, y + 1.7, x1 - 2, y + 1.7);

  // 主角在 3.0s 恰好停在这里；留一小段亮铜触点。
  fillHex(p, C.cream, 0.1);
  p.rect(HERO_X - 16, y - 7, 32, 14, 2);
  p.noFill();
  strokeHex(p, C.creamDim, 0.55);
  p.strokeWeight(0.9);
  p.rect(HERO_X - 16, y - 7, 32, 14, 2);
  p.noStroke();
  for (const px of [HERO_X - 6, HERO_X + 6]) {
    fillHex(p, C.brassLight, 0.78);
    p.ellipse(px, y, 4.2, 3);
    fillHex(p, C.emberCore, 0.35 + 0.4 * heat);
    p.ellipse(px, y, 1.8, 1.4);
  }

  drawScrew(p, x0 - 8, y, 1.8, 0.9);
  drawScrew(p, x1 + 8, y, 1.8, 0.9);
  p.pop();
}

function drawToggleBank(p, hold) {
  const bx = 462;
  const by = 542;
  const bw = 92;
  const bh = 58;
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.6);
  p.rect(bx + 3, by + 4, bw, bh, 3);
  fillHex(p, '#0a1e1a', 0.95);
  p.rect(bx, by, bw, bh, 3);
  fillHex(p, C.panel, 0.9);
  p.rect(bx + 3, by + 3, bw - 6, bh - 6, 2);
  p.noFill();
  strokeHex(p, C.panelEdge, 0.7);
  p.strokeWeight(1);
  p.rect(bx, by, bw, bh, 3);

  const litCount = 1 + Math.floor(0.99 + 3 * smoothstep(2.35, 2.78, hold));
  for (let i = 0; i < 4; i++) {
    const x = bx + 14 + i * 24;
    const baseY = by + 40;
    const angle = i % 2 === 0 ? -0.55 : 0.5;
    const tipX = x + Math.sin(angle) * 15;
    const tipY = baseY - Math.cos(angle) * 15;
    p.noStroke();
    fillHex(p, C.brassDark, 0.95);
    p.ellipse(x, baseY, 9, 6);
    strokeHex(p, C.slot, 1);
    p.strokeWeight(4.4);
    p.line(x, baseY, tipX, tipY);
    strokeHex(p, C.brass, 0.95);
    p.strokeWeight(2);
    p.line(x, baseY, tipX, tipY);
    p.noStroke();
    fillHex(p, C.slot, 1);
    p.ellipse(tipX, tipY, 5, 5);
    fillHex(p, C.brassLight, 0.32);
    p.ellipse(tipX - 1, tipY - 1, 1.8, 1.4);

    fillHex(p, i < litCount ? C.ember : C.cabinetDeep, i < litCount ? 0.85 : 0.9);
    p.ellipse(x, by + 12, 4, 4);
    if (i < litCount) {
      fillHex(p, C.emberHot, 0.18);
      p.ellipse(x, by + 12, 11, 11);
    }
  }

  p.strokeWeight(0.8);
  for (let k = 0; k < 5; k++) {
    strokeHex(p, C.creamDim, 0.22);
    p.line(bx + 8 + k * 18, by + 51, bx + 8 + k * 18, by + 54);
  }
  p.pop();
}

function drawMeter(p, hold) {
  const cx = 604;
  const cy = 570;
  const r = 20;
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.55);
  p.ellipse(cx + 2, cy + 3, r * 2.3, r * 2.3);
  fillHex(p, C.brassDark, 1);
  p.ellipse(cx, cy, r * 2.1, r * 2.1);
  fillHex(p, C.brass, 0.62);
  p.ellipse(cx, cy, r * 1.85, r * 1.85);
  fillHex(p, '#081c17', 1);
  p.ellipse(cx, cy, r * 1.55, r * 1.55);

  p.strokeWeight(0.8);
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * 0.76 + k * (Math.PI * 1.48 / 10);
    const inner = k % 5 === 0 ? r * 0.58 : r * 0.65;
    strokeHex(p, k % 5 === 0 ? C.cream : C.creamDim, k % 5 === 0 ? 0.55 : 0.3);
    p.line(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner,
      cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
  }

  const needle = -1.15 + smoothstep(2.2, 2.95, hold) * 1.65;
  strokeHex(p, C.cream, 0.8);
  p.strokeWeight(1.1);
  p.line(cx, cy, cx + Math.cos(needle) * r * 0.62, cy + Math.sin(needle) * r * 0.62);
  p.noStroke();
  fillHex(p, C.brassDark, 1);
  p.ellipse(cx, cy, 4.5, 4.5);
  fillHex(p, C.creamDim, 0.6);
  p.ellipse(cx - 0.5, cy - 0.5, 1.8, 1.8);
  p.noFill();
  strokeHex(p, C.glassPale, 0.2);
  p.strokeWeight(0.8);
  p.arc(cx, cy, r * 1.5, r * 1.5, Math.PI * 1.08, Math.PI * 1.6);
  p.pop();
}

function drawPatchSmoke(p, hold) {
  if (hold < 2.85) return;
  p.push();
  p.noStroke();
  for (let i = 0; i < 4; i++) {
    const birth = 2.84 + i * 0.045;
    const age = hold - birth;
    if (age <= 0) continue;
    const u = clamp(age / 0.55, 0, 1);
    const x = 514 + i * 5 + u * 8 + Math.sin(u * 2.6 + i) * 3;
    const y = 447 - u * (24 + i * 5);
    fillHex(p, C.smoke, (0.11 * (1 - u * 0.5)));
    p.ellipse(x, y, 12 + u * 18, 7 + u * 10);
    fillHex(p, C.creamDim, 0.05 * (1 - u));
    p.ellipse(x - 2, y - 2, 7 + u * 8, 4 + u * 5);
  }
  p.pop();
}

function drawPatchBoard(p, hold) {
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.5);
  p.rect(PATCH.x + 6, PATCH.y + 8, PATCH.w, PATCH.h, 4);
  fillHex(p, '#071c17', 1);
  p.rect(PATCH.x, PATCH.y, PATCH.w, PATCH.h, 4);
  fillHex(p, C.panel, 1);
  p.rect(PATCH.x + 4, PATCH.y + 4, PATCH.w - 8, PATCH.h - 8, 3);
  fillHex(p, C.cabinetLight, 0.1);
  p.rect(PATCH.x + 8, PATCH.y + 8, PATCH.w - 16, 78, 2);

  p.noFill();
  strokeHex(p, C.panelEdge, 0.78);
  p.strokeWeight(1.2);
  p.rect(PATCH.x + 4, PATCH.y + 4, PATCH.w - 8, PATCH.h - 8, 3);
  strokeHex(p, C.mint, 0.08);
  p.strokeWeight(0.8);
  p.rect(PATCH.x + 7, PATCH.y + 7, PATCH.w - 14, PATCH.h - 14, 2);

  // 顶部蚀刻刻度
  p.strokeWeight(1);
  for (let k = 0; k < 8; k++) {
    strokeHex(p, k % 3 === 0 ? C.creamDim : C.mint, k % 3 === 0 ? 0.32 : 0.13);
    p.line(PATCH.x + 20 + k * 14, PATCH.y + 17, PATCH.x + 20 + k * 14, PATCH.y + 23);
  }
  fillHex(p, C.creamDim, 0.11);
  p.rect(PATCH.x + 20, PATCH.y + 26, PATCH.w - 40, 1);

  // 左侧端子和两条母线
  fillHex(p, C.slot, 0.85);
  p.rect(PATCH.x + 14, PATCH.y + 36, 80, 52, 2);
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(PATCH.x + 17, PATCH.y + 39, 74, 46, 1);
  p.noFill();
  strokeHex(p, C.brassDark, 0.6);
  p.strokeWeight(1);
  p.line(PATCH.x + 22, PATCH.y + 48, PATCH.x + 86, PATCH.y + 48);
  p.line(PATCH.x + 22, PATCH.y + 74, PATCH.x + 86, PATCH.y + 74);
  for (const [tx, ty] of [
    [PATCH.x + 26, PATCH.y + 48],
    [PATCH.x + 82, PATCH.y + 48],
    [PATCH.x + 26, PATCH.y + 74],
    [PATCH.x + 82, PATCH.y + 74]
  ]) {
    drawScrew(p, tx, ty, 2.2, 0.9);
  }

  for (let i = 0; i < PANEL_SOCKETS.length; i++) {
    const [sx, sy] = PANEL_SOCKETS[i];
    drawSocket(p, sx, sy, i + 1);
  }

  // 插线板上的短线缆
  drawPanelCable(p, [566, 394, 545, 424, 580, 450, 616, 466]);
  drawPanelCable(p, [638, 394, 660, 418, 644, 440, 682, 452]);
  drawPanelCable(p, [602, 426, 618, 446, 596, 462, 572, 468]);
  drawPanelCable(p, [674, 426, 676, 440, 690, 448, 698, 452]);

  drawBusRail(p, hold);
  drawToggleBank(p, hold);
  drawMeter(p, hold);
  drawPatchSmoke(p, hold);

  drawScrew(p, PATCH.x + 12, PATCH.y + 12, 2.1, 0.8);
  drawScrew(p, PATCH.x + PATCH.w - 12, PATCH.y + 12, 2.1, 0.8);
  drawScrew(p, PATCH.x + 12, PATCH.y + PATCH.h - 12, 2.1, 0.7);
  drawScrew(p, PATCH.x + PATCH.w - 12, PATCH.y + PATCH.h - 12, 2.1, 0.7);
  p.pop();
}

// ---------- 机械计数器 / 示波器 ----------

function counterDigits(hold) {
  if (hold < 2.16) return [0, 0, 0];
  if (hold >= 2.82) return [0, 0, 2];
  const k = Math.floor((hold - 2.16) * 38 + 0.001);
  return [(k * 3 + 7) % 10, (k * 7 + 3) % 10, (k * 5 + 1) % 10];
}

function drawCounter(p, hold) {
  const { x, y, w, h } = COUNTER;
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.55);
  p.rect(x + 5, y + 6, w, h, 4);
  fillHex(p, '#071c17', 1);
  p.rect(x, y, w, h, 4);
  fillHex(p, C.panel, 1);
  p.rect(x + 4, y + 4, w - 8, h - 8, 3);
  fillHex(p, C.cabinetLight, 0.12);
  p.rect(x + 6, y + 6, w - 12, 12, 1);
  p.noFill();
  strokeHex(p, C.panelEdge, 0.8);
  p.strokeWeight(1.1);
  p.rect(x + 4, y + 4, w - 8, h - 8, 3);

  // 顶部刻度
  p.strokeWeight(0.8);
  for (let k = 0; k < 9; k++) {
    strokeHex(p, k % 3 === 0 ? C.creamDim : C.mint, k % 3 === 0 ? 0.32 : 0.12);
    p.line(x + 14 + k * 13, y + 9, x + 14 + k * 13, y + 14);
  }

  const digits = counterDigits(hold);
  const settled = hold >= 2.82;
  const ctx = p.drawingContext;
  for (let i = 0; i < 3; i++) {
    const wx = x + 10 + i * 36;
    const wy = y + 22;
    const ww = 30;
    const wh = 48;

    p.noStroke();
    fillHex(p, C.brassDark, 1);
    p.rect(wx - 2, wy - 2, ww + 4, wh + 4, 3);
    fillHex(p, C.brass, 0.58);
    p.rect(wx - 1, wy - 1, ww + 2, 2, 1);
    fillHex(p, '#020b09', 1);
    p.rect(wx, wy, ww, wh, 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(wx, wy, ww, wh);
    ctx.clip();

    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);
    const finalHot = settled && i === 2;
    p.textSize(finalHot ? 34 : 28);
    fillHex(p, finalHot ? C.cream : C.mint, finalHot ? 0.96 : 0.72);
    p.text(String(digits[i]), wx + ww / 2, wy + wh / 2 + 1);

    if (!settled && hold > 2.16) {
      // 数字轮飞转的上下残影
      fillHex(p, C.mint, 0.1);
      p.textSize(24);
      p.text(String((digits[i] + 1) % 10), wx + ww / 2, wy + wh / 2 - 13);
      p.text(String((digits[i] + 9) % 10), wx + ww / 2, wy + wh / 2 + 16);
    }
    ctx.restore();

    // 玻璃反光
    p.noFill();
    strokeHex(p, C.glassPale, 0.14);
    p.strokeWeight(0.8);
    p.line(wx + 3, wy + 5, wx + 3, wy + wh - 8);
    fillHex(p, C.mint, 0.05);
    p.noStroke();
    p.rect(wx, wy, ww, 4);

    if (finalHot) {
      p.noFill();
      strokeHex(p, C.emberHot, 0.28 + 0.3 * smoothstep(2.82, 2.95, hold));
      p.strokeWeight(1);
      p.rect(wx - 3, wy - 3, ww + 6, wh + 6, 2);
    }
  }

  // 左下小指示灯
  p.noStroke();
  fillHex(p, settled ? C.ember : C.cabinetDeep, settled ? 0.9 : 0.9);
  p.ellipse(x + 8, y + 82, 4.2, 4.2);
  if (settled) {
    fillHex(p, C.emberHot, 0.16);
    p.ellipse(x + 8, y + 82, 12, 12);
  }
  p.strokeWeight(0.8);
  for (let k = 0; k < 4; k++) {
    strokeHex(p, C.creamDim, 0.24);
    p.line(x + 20 + k * 12, y + 80, x + 20 + k * 12, y + 84);
  }

  drawScrew(p, x + 8, y + h - 8, 1.8, 0.7);
  drawScrew(p, x + w - 8, y + h - 8, 1.8, 0.7);
  p.pop();
}

function drawScope(p, hold) {
  const { x, y, w, h } = SCOPE;
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.55);
  p.rect(x + 5, y + 6, w, h, 4);
  fillHex(p, '#071c17', 1);
  p.rect(x, y, w, h, 4);
  fillHex(p, C.panel, 1);
  p.rect(x + 4, y + 4, w - 8, h - 8, 3);
  p.noFill();
  strokeHex(p, C.panelEdge, 0.8);
  p.strokeWeight(1.1);
  p.rect(x + 4, y + 4, w - 8, h - 8, 3);

  const sx = x + 8;
  const sy = y + 12;
  const sw = w - 16;
  const sh = 58;
  p.noStroke();
  fillHex(p, '#020b09', 1);
  p.rect(sx, sy, sw, sh, 2);
  fillHex(p, C.accent, 0.02);
  p.rect(sx, sy, sw, sh, 2);

  p.strokeWeight(0.7);
  for (let k = 1; k < 6; k++) {
    strokeHex(p, C.accent, 0.09);
    p.line(sx + (sw * k) / 6, sy, sx + (sw * k) / 6, sy + sh);
  }
  for (let k = 1; k < 4; k++) {
    strokeHex(p, C.accent, 0.09);
    p.line(sx, sy + (sh * k) / 4, sx + sw, sy + (sh * k) / 4);
  }

  const amp = 2 + 11 * smoothstep(2.2, 2.8, hold);
  const phase = hold * 1.7;
  const cy = sy + sh * 0.52;
  p.noFill();
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 0) {
      strokeHex(p, C.accent, 0.16);
      p.strokeWeight(3.6);
    } else {
      strokeHex(p, C.accent, 0.86);
      p.strokeWeight(1.1);
    }
    p.beginShape();
    for (let k = 0; k <= 48; k++) {
      const u = k / 48;
      const px = sx + 2 + (sw - 4) * u;
      const py = cy + Math.sin(u * 9.4 + phase) * amp;
      p.vertex(px, py);
    }
    p.endShape();
  }

  // 扫描线
  strokeHex(p, C.mint, 0.05);
  p.strokeWeight(1);
  p.line(sx, cy, sx + sw, cy);
  fillHex(p, C.glassPale, 0.06);
  p.noStroke();
  p.rect(sx, sy, sw, 5);

  // 底部两个旋钮
  for (const kx of [x + 22, x + 46, x + 66]) {
    fillHex(p, C.slot, 1);
    p.ellipse(kx, y + 80, 9, 9);
    fillHex(p, C.brassDark, 1);
    p.ellipse(kx, y + 79, 7, 7);
    fillHex(p, C.brassLight, 0.28);
    p.ellipse(kx - 1, y + 78, 2, 2);
    strokeHex(p, C.slot, 0.8);
    p.strokeWeight(1);
    p.line(kx, y + 79, kx + 2, y + 76);
  }
  drawScrew(p, x + 6, y + h - 8, 1.6, 0.7);
  p.pop();
}

// ---------- 电缆路：从第 8 版块纸带接到第 10 版块导线束 ----------

function drawCableClamp(p, x, seed) {
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.68);
  p.rect(x - 8, ROAD_TOP - 3, 16, 66, 2);
  fillHex(p, C.rubber, 1);
  p.rect(x - 7, ROAD_TOP, 14, 60, 2);
  fillHex(p, C.brassDark, 0.82);
  p.rect(x - 7, ROAD_TOP, 14, 3);
  p.rect(x - 7, ROAD_BOTTOM - 3, 14, 3);
  fillHex(p, C.brassLight, 0.28);
  p.rect(x - 6, ROAD_TOP + 3, 2, 52);
  for (const y of [484, 516]) {
    fillHex(p, C.slot, 1);
    p.ellipse(x, y, 8, 8);
    fillHex(p, C.brassLight, 0.42 + hash2(seed, y, 3) * 0.16);
    p.ellipse(x - 1, y - 1, 3.2, 3.2);
    strokeHex(p, C.slot, 0.7);
    p.strokeWeight(0.7);
    p.line(x - 1.6, y, x + 1.6, y);
  }
  fillHex(p, C.copper, 0.8);
  p.rect(x + 6, 495, 3, 11, 1);
  fillHex(p, C.brassLight, 0.3);
  p.rect(x + 6.5, 496, 1, 4);
  p.pop();
}

function drawTapeLeadIn(p) {
  p.push();
  p.noStroke();
  // 第 8 版块纸带的最后一小截：y=478..538
  fillHex(p, C.slot, 0.34);
  p.rect(0, 476, 86, 66);
  fillHex(p, '#b9b7b0', 1);
  p.rect(0, 478, 74, 60);
  fillHex(p, '#d8d6cf', 1);
  p.rect(0, 478, 74, 4);
  fillHex(p, '#a7a49c', 1);
  p.rect(0, 534, 74, 4);

  // 齿孔与纸纤维
  fillHex(p, '#161616', 0.9);
  for (let x = 8; x < 68; x += 12) {
    p.rect(x, 483, 6, 5, 1);
    p.rect(x, 529, 6, 5, 1);
  }
  for (let i = 0; i < 26; i++) {
    fillHex(p, '#5b5a55', 0.05 + hash2(i, 11) * 0.08);
    p.rect(hash2(i, 12) * 70, 481 + hash2(i, 13) * 53, 2 + hash2(i, 14) * 7, 1);
  }
  strokeHex(p, '#171717', 0.14);
  p.strokeWeight(1);
  for (let x = 4; x <= 70; x += 12) p.line(x, 481, x, 537);
  for (const y of [493, 508, 523]) p.line(0, y, 72, y);
  fillHex(p, '#161616', 0.82);
  for (let x = 4; x < 70; x += 14) {
    if (hash2(x, 7) > 0.54) p.ellipse(x + 6, 508, 6, 6);
  }

  // 纸带断口：纤维散开、压进电缆编织纹
  fillHex(p, '#b9b7b0', 0.8);
  p.beginShape();
  p.vertex(74, 478);
  p.vertex(79, 486);
  p.vertex(73, 495);
  p.vertex(80, 505);
  p.vertex(74, 516);
  p.vertex(79, 526);
  p.vertex(73, 538);
  p.vertex(74, 538);
  p.endShape(p.CLOSE);
  p.strokeWeight(1);
  for (let i = 0; i < 9; i++) {
    const y = 482 + i * 6.5;
    strokeHex(p, i % 2 ? C.creamDim : '#a7a49c', 0.16 + hash2(i, 21) * 0.12);
    p.line(70, y, 96 + hash2(i, 22) * 18, y + (hash2(i, 23) - 0.5) * 8);
  }
  strokeHex(p, C.braidHi, 0.2);
  p.strokeWeight(1.4);
  p.line(78, 480, 104, 490);
  p.line(78, 536, 102, 526);
  p.pop();
}

function drawFrayedBundle(p) {
  const tips = [
    [920, 498, 986, 442],
    [926, 500, 992, 462],
    [932, 501, 996, 482],
    [938, 502, 998, 504],
    [934, 504, 994, 528],
    [928, 503, 988, 550],
    [944, 501, 998, 568]
  ];

  p.push();
  // 电缆末端的金属束环
  p.noStroke();
  fillHex(p, C.brassDark, 0.95);
  p.rect(916, ROAD_TOP + 2, 10, 56, 2);
  fillHex(p, C.brassLight, 0.3);
  p.rect(917, ROAD_TOP + 4, 2, 52);
  p.rect(923, ROAD_TOP + 4, 2, 52);

  for (let i = 0; i < tips.length; i++) {
    const [sx, sy, ex, ey] = tips[i];
    const cx1 = sx + (ex - sx) * 0.32 + (hash2(i, 31) - 0.5) * 12;
    const cy1 = sy + (hash2(i, 32) - 0.5) * 18;
    const cx2 = sx + (ex - sx) * 0.72 + (hash2(i, 33) - 0.5) * 16;
    const cy2 = ey + (hash2(i, 34) - 0.5) * 12;
    const curve = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const v = 1 - u;
      curve.push([
        v * v * v * sx + 3 * v * v * u * cx1 + 3 * v * u * u * cx2 + u * u * u * ex,
        v * v * v * sy + 3 * v * v * u * cy1 + 3 * v * u * u * cy2 + u * u * u * ey
      ]);
    }

    p.noFill();
    strokeHex(p, C.slot, 0.85);
    p.strokeWeight(3.2);
    p.beginShape();
    for (const [px, py] of curve) p.vertex(px, py);
    p.endShape();
    strokeHex(p, i % 3 === 0 ? C.copper : C.braidHi, 0.5);
    p.strokeWeight(1.3);
    p.beginShape();
    for (const [px, py] of curve) p.vertex(px, py);
    p.endShape();
    strokeHex(p, C.mint, 0.1);
    p.strokeWeight(0.6);
    p.beginShape();
    for (const [px, py] of curve) p.vertex(px - 0.4, py - 0.4);
    p.endShape();

    // 小铜坠
    p.noStroke();
    fillHex(p, C.slot, 0.6);
    p.ellipse(ex + 1.5, ey + 1.5, 6.5, 8);
    fillHex(p, C.copper, 0.96);
    p.ellipse(ex, ey, 5, 6.6);
    fillHex(p, C.brassLight, 0.55);
    p.ellipse(ex - 1, ey - 1.4, 1.6, 2.2);
  }
  p.pop();
}

function drawCable(p, hold) {
  p.push();
  p.noStroke();

  fillHex(p, C.slot, 0.5);
  p.rect(0, ROAD_BOTTOM, 1000, 17);
  fillHex(p, C.braidLo, 1);
  p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  fillHex(p, C.rubber, 1);
  p.rect(0, ROAD_TOP + 2, 1000, ROAD_BOTTOM - ROAD_TOP - 4);
  fillHex(p, C.braidHi, 0.055);
  p.rect(0, ROAD_TOP + 4, 1000, 10);

  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  ctx.clip();

  p.strokeCap(p.ROUND);
  for (let i = 0; i < 58; i++) {
    const x = -70 + i * 19 + hash2(i, 3) * 5;
    strokeHex(p, i % 2 ? C.braidHi : C.mint, 0.045 + hash2(i, 4) * 0.055);
    p.strokeWeight(1.2 + hash2(i, 5) * 1.1);
    p.line(x, ROAD_TOP, x + 58, ROAD_BOTTOM);
  }
  for (let i = 0; i < 58; i++) {
    const x = -70 + i * 19 + hash2(i, 7) * 5;
    strokeHex(p, i % 2 ? C.braidLo : '#010605', 0.22 + hash2(i, 8) * 0.18);
    p.strokeWeight(1.4 + hash2(i, 9) * 1.0);
    p.line(x, ROAD_BOTTOM, x + 58, ROAD_TOP);
  }

  // 顺着电缆方向的一层短纤维高光
  for (let i = 0; i < 46; i++) {
    const x = i * 22 + 6 + hash2(i, 12) * 9;
    const y = ROAD_TOP + 13 + hash2(i, 13) * 34;
    strokeHex(p, C.braidHi, 0.09 + hash2(i, 14) * 0.07);
    p.strokeWeight(1);
    p.line(x, y, x + 9 + hash2(i, 15) * 8, y + 0.6);
  }
  ctx.restore();

  // 边缘捆边
  p.strokeWeight(2);
  strokeHex(p, C.slot, 0.92);
  p.line(0, ROAD_TOP + 0.5, 1000, ROAD_TOP + 0.5);
  p.line(0, ROAD_BOTTOM - 0.5, 1000, ROAD_BOTTOM - 0.5);
  p.strokeWeight(1);
  strokeHex(p, C.braidHi, 0.28);
  p.line(0, ROAD_TOP + 3, 1000, ROAD_TOP + 3);
  p.line(0, ROAD_BOTTOM - 3, 1000, ROAD_BOTTOM - 3);
  strokeHex(p, C.mint, 0.055);
  p.line(0, 496, 1000, 496);

  // 主角入座时，电缆表面有一点点暖反光。
  const warm = smoothstep(2.8, 3.0, hold);
  if (warm > 0.01) {
    fillHex(p, C.ember, 0.035 * warm);
    p.ellipse(HERO_X, 491, 90, 26);
  }

  for (const [x, seed] of [[126, 1], [384, 2], [712, 3], [862, 4]]) {
    drawCableClamp(p, x, seed);
  }

  drawTapeLeadIn(p);
  drawFrayedBundle(p);
  p.pop();
}

// ---------- 主角：玻璃真空管 / 插头 ----------

function drawActorBody(p, white) {
  p.push();
  p.noStroke();

  // 玻璃外壳：圆角胶囊。p5 2.x 在某些 bezier-only 闭合形状上会
  // 读空内部点；用等效圆角矩形避开，轮廓不变。
  fillHex(p, C.glass, 0.16);
  p.rect(-14, -40, 28, 71, 14);

  // 管内底部的一点深色
  fillHex(p, C.slot, 0.32);
  p.ellipse(0, 24, 22, 10);

  // 支架
  strokeHex(p, C.brassDark, 0.9);
  p.strokeWeight(1.2);
  p.line(-5, 28, -4, 16);
  p.line(5, 28, 4, 16);

  // 暖赭灯丝：第 3–8 版块那颗火种的玻璃管形态
  const pts = [
    [0, 26],
    [-4, 17],
    [4, 8],
    [-4, -2],
    [4, -12],
    [-3, -22],
    [0, -30]
  ];
  p.noFill();
  strokeHex(p, C.ember, 0.9);
  p.strokeWeight(1.8);
  p.beginShape();
  for (const [px, py] of pts) p.vertex(px, py);
  p.endShape();
  strokeHex(p, C.emberHot, 0.5 + 0.4 * white);
  p.strokeWeight(1.1);
  p.beginShape();
  for (const [px, py] of pts) p.vertex(px, py);
  p.endShape();
  strokeHex(p, C.emberCore, 0.65 + 0.35 * white);
  p.strokeWeight(0.65);
  p.beginShape();
  for (let i = 1; i < pts.length - 1; i++) p.vertex(pts[i][0], pts[i][1]);
  p.endShape();

  if (white > 0.01) {
    // 亮到发白：不是把整根管涂白，只让灯丝中心过曝。
    p.noStroke();
    fillHex(p, C.emberWhite, 0.12 * white);
    p.ellipse(0, -2, 20, 38);
    strokeHex(p, C.emberWhite, 0.75 * white);
    p.strokeWeight(0.9);
    p.beginShape();
    for (const [px, py] of pts) p.vertex(px, py);
    p.endShape();
  }

  // 顶部银镜/吸气剂
  fillHex(p, '#8fa99c', 0.1 + 0.06 * white);
  p.ellipse(0, -32, 12, 9);

  // 玻璃轮廓、反光
  p.noFill();
  strokeHex(p, C.glassPale, 0.34 + 0.22 * white);
  p.strokeWeight(1.2);
  p.rect(-14, -40, 28, 71, 14);
  strokeHex(p, C.glassPale, 0.35 + 0.2 * white);
  p.strokeWeight(1);
  p.line(-8, -24, -8, 8);
  strokeHex(p, C.mint, 0.2);
  p.strokeWeight(0.6);
  p.line(8, -20, 8, 4);
  fillHex(p, C.emberWhite, 0.25 + 0.4 * white);
  p.noStroke();
  p.ellipse(-7, -18, 1.8, 4.2);

  // 顶部小帽
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, -43, 10, 5);
  fillHex(p, C.brass, 0.65);
  p.ellipse(-1, -43.6, 5, 1.8);
  fillHex(p, C.brassLight, 0.28);
  p.ellipse(-2, -44, 2.4, 1);

  // 黄铜底座
  fillHex(p, C.brassDark, 1);
  p.rect(-12, 30, 24, 9, 2);
  fillHex(p, C.brass, 0.72);
  p.rect(-11, 31.5, 22, 2.2, 1);
  fillHex(p, C.slot, 0.78);
  p.rect(-11, 36, 22, 2.4, 1);
  fillHex(p, C.brassLight, 0.3);
  p.rect(-10, 31, 2, 6);
  strokeHex(p, C.brassDark, 1);
  p.strokeWeight(1.2);
  p.line(-12, 30, 12, 30);

  // 两根插脚
  for (const px of [-6, 6]) {
    strokeHex(p, C.slot, 0.8);
    p.strokeWeight(4.6);
    p.line(px, 38, px, 50);
    strokeHex(p, C.brass, 0.95);
    p.strokeWeight(2.8);
    p.line(px, 38, px, 49);
    strokeHex(p, C.brassLight, 0.55);
    p.strokeWeight(1);
    p.line(px - 0.8, 39, px - 0.8, 47);
    p.noStroke();
    fillHex(p, C.brassLight, 0.5);
    p.ellipse(px, 49.5, 3, 2);
  }

  p.pop();
}

function drawActorSpark(p, x, y, spark) {
  if (spark <= 0.02) return;
  p.push();
  p.noStroke();
  fillHex(p, C.emberCore, 0.16 * spark);
  p.ellipse(x, y, 34, 12);
  fillHex(p, C.emberHot, 0.22 * spark);
  p.ellipse(x, y, 18, 7);
  for (const px of [-6, 6]) {
    strokeHex(p, C.cream, 0.6 * spark);
    p.strokeWeight(0.9);
    p.line(x + px, y, x + px - 3, y + 4);
    p.line(x + px, y, x + px + 2.5, y + 3.5);
    p.noStroke();
    fillHex(p, C.emberWhite, 0.7 * spark);
    p.ellipse(x + px, y, 2.2, 2.2);
  }
  p.pop();
}

function drawActorTube(p, state) {
  const t = clamp(state.localT || 0, 0, 6);
  const localX = state.x - ((state.blockIndex || 9) - 1) * 1000;

  // 滚—立起—插—亮；3.0–4.0 保持插入姿态，之后拔脚滚走。
  const form = smoothstep(2.56, 2.92, t) * (1 - smoothstep(4.02, 4.36, t));
  const insert = smoothstep(2.9, 2.99, t) * (1 - smoothstep(3.96, 4.04, t));
  const rollPhase = (localX / 58) * TAU;
  const rock = Math.sin(rollPhase) * 0.1;
  const angle = (Math.PI / 2 + rock) * (1 - form);
  const cy = 482 + (400 - 482) * form - Math.sin(form * Math.PI) * 8 + insert * 2;
  const hold = Math.min(t, 3);
  const white = smoothstep(2.9, 2.98, hold) * (1 - smoothstep(4.35, 4.75, t));
  const spark = smoothstep(2.92, 2.97, t) * (1 - smoothstep(3.12, 3.34, t));
  const beat = 0.86 + 0.14 * Math.sin(TAU * (hold % 1) + 0.8);

  p.push();
  // 电缆上的影子和暖光
  p.push();
  p.translate(state.x, 0);
  p.noStroke();
  fillHex(p, C.slot, 0.34 * (1 - form * 0.45));
  p.ellipse(0, 498, 76 - 18 * form, 12 - 3 * form);
  fillHex(p, C.ember, 0.035 + 0.045 * white + 0.01 * beat);
  p.ellipse(0, cy, 92, 108);
  fillHex(p, C.emberHot, 0.045 + 0.09 * white);
  p.ellipse(0, cy, 44, 68);
  if (white > 0.01) {
    fillHex(p, C.emberWhite, 0.05 * white);
    p.ellipse(0, cy, 24, 46);
  }
  // 滚动残影
  if (form < 0.7) {
    p.noFill();
    for (let i = 0; i < 3; i++) {
      strokeHex(p, C.mint, (0.1 - i * 0.025) * (1 - form));
      p.strokeWeight(1);
      p.arc(-38 - i * 8, 482, 20 + i * 8, 12 + i * 5, Math.PI * 0.72, Math.PI * 1.36);
    }
  }
  p.pop();

  p.push();
  p.translate(state.x, cy);
  p.rotate(angle);
  drawActorBody(p, white);
  p.pop();

  // 插脚进入母线槽时，槽沿盖住针脚末端；随后补一点接触火花。
  if (insert > 0.05) {
    p.push();
    p.noStroke();
    fillHex(p, C.slot, 0.8);
    p.rect(state.x - 14, 449.4, 28, 2.8, 1);
    fillHex(p, C.brassDark, 0.85);
    p.rect(state.x - 14, 448.2, 28, 1);
    p.rect(state.x - 14, 452.2, 28, 0.9);
    p.pop();
  }
  drawActorSpark(p, state.x, 451, spark);
  p.pop();
}

// ---------- 标题年代窄带 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 196;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, '#e9f3d9', 0.74 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.noFill();
  strokeHex(p, C.cabinetLight, 0.38 * alpha);
  p.strokeWeight(0.8);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const hold = Math.min(t, 3);

    p.push();
    p.noStroke();

    drawBackdrop(p);
    drawCabinet(p, hold);
    drawPatchBoard(p, hold);
    drawCounter(p, hold);
    drawScope(p, hold);

    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (showTitle) {
      drawEraBand(p, titleAlpha);
      drawTitleCard(p, {
        ...META,
        number: META.id,
        x: 300,
        y: 362,
        alpha: titleAlpha
      });
    }

    p.pop();
  },

  drawRoad(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    drawCable(p, Math.min(t, 3));
    p.pop();
  },

  drawActor(p, state) {
    p.push();
    drawActorTube(p, state);
    p.pop();
  }
};
