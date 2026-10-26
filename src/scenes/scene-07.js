import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 07 布尔代数：暗蓝绿蓝图/铜制逻辑板，双圆 Venn、机械门链、
// 4x2 真值表、y≈500 打孔纸带与 0/1 双瓣拨杆。
// 静态重点：localT≈1.5（标题/纸带/Venn 进场）与 localT≈3.0（A = NOT A 回环、
// 半翻面、真值表亮行、约 1s 定格）。

const TAU = Math.PI * 2;

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const C = {
  board: '#162322',
  boardDeep: '#0e1917',
  boardWarm: '#1c1a17',
  trough: '#0b1614',
  grid: '#5f7f78',
  cold: '#5f7f78',
  cream: '#e8dfc6',
  creamDim: '#c6b99c',
  brassDeep: '#4e3317',
  brassDark: '#6e4a22',
  brass: '#b8863c',
  brassLight: '#d8a75a',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe0a0',
  tape: '#d7d0bd',
  tapeLight: '#e7dec8',
  tapeEdge: '#b9b19b',
  tapeInk: '#584f3e',
  hole: '#141b19',
  shadow: '#07100e'
};

const META = {
  id: 7,
  cn: '布尔代数',
  en: 'Boolean Algebra',
  era: '1850s · 布尔',
  group: 'mechanical'
};

const VENN = {
  a: { x: 724, y: 390, r: 145 },
  b: { x: 820, y: 402, r: 140 }
};

const GATES = [
  { x: 482, kind: 'AND' },
  { x: 552, kind: 'OR' },
  { x: 622, kind: 'NOT' }
];
const GATE_Y = 398;

const TABLE = { x: 636, y: 564, w: 264, h: 136, head: 29, rows: 4 };
const TABLE_ROWS = [
  ['0', '1'],
  ['1', '0'],
  ['0', '1'],
  ['1', '0']
];

const TROUGH_Y0 = 464;
const TROUGH_Y1 = 542;
const TAPE_Y0 = 478;
const TAPE_Y1 = 538;
const TAPE_MID = 508;
const DATA_STEP = 20;
const DATA_X0 = 10;
const DATA_COUNT = 50;

const LOOP = { x: 438, y: 466, w: 128, h: 82, r: 18 };
const LOOP_BITS = '01011010';

function tapeBit(i) {
  return hash2(i, 17, 7) > 0.48 ? 1 : 0;
}

const BLUEPRINT_BLOBS = [
  [172, 132, 360, 210, '#20322c', 0.28],
  [812, 134, 350, 180, '#1d2d28', 0.25],
  [122, 330, 190, 320, '#1a2925', 0.25],
  [500, 236, 280, 150, '#20352f', 0.12],
  [150, 774, 430, 300, '#182622', 0.34],
  [806, 706, 380, 250, '#1f1d18', 0.29],
  [502, 902, 430, 180, '#20302a', 0.18],
  [968, 490, 150, 380, '#111d1a', 0.26]
];

const PITS = (() => {
  const rng = mulberry32(0x7b17a1);
  const list = [];
  for (let i = 0; i < 160; i++) {
    list.push({
      x: 30 + rng() * 940,
      y: 30 + rng() * 940,
      r: 0.35 + rng() * 1.3,
      a: 0.016 + rng() * 0.042,
      light: rng() > 0.72
    });
  }
  return list;
})();

const SCRATCHES = (() => {
  const rng = mulberry32(0x07c0de);
  const list = [];
  for (let i = 0; i < 34; i++) {
    const x = 35 + rng() * 930;
    const y = 35 + rng() * 930;
    const a = -1.15 + rng() * 2.3;
    const len = 8 + rng() * 66;
    list.push({
      x0: x,
      y0: y,
      x1: x + Math.cos(a) * len,
      y1: y + Math.sin(a) * len,
      a: 0.018 + rng() * 0.045,
      w: 0.45 + rng() * 0.65,
      light: rng() > 0.7
    });
  }
  return list;
})();

const TAPE_FIBERS = (() => {
  const rng = mulberry32(0x7a9e07);
  const list = [];
  for (let i = 0; i < 170; i++) {
    list.push({
      x: rng() * 1000,
      y: 480 + rng() * 56,
      len: 2 + rng() * 10,
      a: 0.022 + rng() * 0.065,
      light: rng() > 0.62,
      w: 0.45 + rng() * 0.55
    });
  }
  return list;
})();

function dashedLine(p, x1, y1, x2, y2, dash, gap, color, alpha, weight) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(d + dash, len);
    p.line(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
  }
}

function rivet(p, x, y, r = 2.2) {
  p.noStroke();
  fillHex(p, C.shadow, 0.6);
  p.ellipse(x + 0.6, y + 0.8, r * 2.3, r * 2.3);
  fillHex(p, C.brassDark, 1);
  p.ellipse(x, y, r * 2, r * 2);
  fillHex(p, C.brass, 0.82);
  p.ellipse(x - 0.4, y - 0.5, r * 1.45, r * 1.45);
  fillHex(p, C.cream, 0.32);
  p.ellipse(x - 0.7, y - 0.8, r * 0.55, r * 0.55);
}

function drawBoard(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.board, 1);
  p.rect(0, 0, 1000, 1000);

  for (const [x, y, w, h, color, alpha] of BLUEPRINT_BLOBS) {
    fillHex(p, color, alpha);
    p.ellipse(x, y, w, h);
  }

  // 顶部/底部的轻微氧化色，不压成纯黑。
  fillHex(p, C.boardWarm, 0.32);
  p.rect(0, 0, 1000, 150);
  fillHex(p, C.brassDark, 0.028);
  p.rect(0, 0, 1000, 16);
  fillHex(p, C.boardDeep, 0.32);
  p.rect(0, 864, 1000, 136);
  fillHex(p, C.brassDark, 0.018);
  p.rect(0, 986, 1000, 14);

  // 淡蓝图网格：25 一格，100 一条主格线。
  for (let x = 0; x <= 1000; x += 25) {
    const major = x % 100 === 0;
    strokeHex(p, C.grid, major ? 0.085 : 0.038);
    p.strokeWeight(major ? 0.85 : 0.55);
    p.line(x, 24, x, 976);
  }
  for (let y = 0; y <= 1000; y += 25) {
    const major = y % 100 === 0;
    strokeHex(p, C.grid, major ? 0.085 : 0.038);
    p.strokeWeight(major ? 0.85 : 0.55);
    p.line(24, y, 976, y);
  }

  // 蓝图纸上的低频横向折痕/压痕。
  p.noFill();
  for (let i = 0; i < 7; i++) {
    const y = 98 + i * 118;
    strokeHex(p, i % 2 ? C.cold : C.cream, 0.018 + i * 0.002);
    p.strokeWeight(0.9);
    p.line(35, y, 965, y + Math.sin(i * 1.7) * 2.2);
  }

  // 板材拼缝与边框。
  strokeHex(p, C.boardDeep, 0.52);
  p.strokeWeight(1.3);
  p.line(88, 24, 88, 976);
  p.line(912, 24, 912, 976);
  strokeHex(p, C.grid, 0.05);
  p.strokeWeight(0.7);
  p.line(89.4, 30, 89.4, 970);
  p.line(913.4, 30, 913.4, 970);

  p.noFill();
  strokeHex(p, C.brassDark, 0.5);
  p.strokeWeight(1.2);
  p.rect(24, 24, 952, 952, 5);
  strokeHex(p, C.cream, 0.11);
  p.strokeWeight(0.7);
  p.rect(31, 31, 938, 938, 3);

  // 四角铜片。
  p.noStroke();
  for (const [x, y, sx, sy] of [
    [24, 24, 1, 1],
    [976, 24, -1, 1],
    [24, 976, 1, -1],
    [976, 976, -1, -1]
  ]) {
    fillHex(p, C.brassDark, 0.62);
    p.rect(sx > 0 ? x : x - 34, sy > 0 ? y : y - 5, 34, 5, 1);
    p.rect(sx > 0 ? x : x - 5, sy > 0 ? y : y - 34, 5, 34, 1);
    rivet(p, x + 20 * sx, y + 2.5 * sy, 1.9);
    rivet(p, x + 2.5 * sx, y + 20 * sy, 1.9);
  }
  for (const [x, y] of [[60, 60], [940, 60], [60, 940], [940, 940]]) {
    rivet(p, x, y, 2.3);
  }

  // 黄铜水平基准线 + 刻点。
  strokeHex(p, C.brass, 0.2);
  p.strokeWeight(1);
  p.line(70, 744, 930, 744);
  for (let x = 80; x <= 920; x += 40) {
    const major = x % 200 === 0;
    strokeHex(p, C.brassLight, major ? 0.34 : 0.18);
    p.strokeWeight(0.8);
    p.line(x, 744, x, 744 + (major ? 8 : 4));
  }
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(7);
  fillHex(p, C.brassLight, 0.28);
  p.text('0', 70, 751);
  p.text('1', 930, 751);

  // 左下角的淡构造弧，只做蓝图辅助线。
  p.noFill();
  for (let k = 0; k < 3; k++) {
    strokeHex(p, C.cold, 0.075 + k * 0.012);
    p.strokeWeight(0.8);
    p.arc(176, 824, 180 + k * 58, 180 + k * 58, -1.1, 1.55);
  }

  // 暗点、亮屑、划痕。
  for (const s of PITS) {
    p.noStroke();
    fillHex(p, s.light ? C.creamDim : C.shadow, s.a);
    p.ellipse(s.x, s.y, s.r * 2, s.r * 1.5);
  }
  p.strokeCap(p.ROUND);
  for (const s of SCRATCHES) {
    strokeHex(p, s.light ? C.brassLight : C.creamDim, s.a);
    p.strokeWeight(s.w);
    p.line(s.x0, s.y0, s.x1, s.y1);
  }

  p.pop();
}

function drawTrough(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.trough, 1);
  p.rect(0, TROUGH_Y0, 1000, TROUGH_Y1 - TROUGH_Y0);
  fillHex(p, C.shadow, 0.26);
  p.rect(0, TROUGH_Y0 + 3, 1000, 6);
  fillHex(p, C.boardWarm, 0.09);
  p.rect(0, TROUGH_Y0 + 9, 1000, TROUGH_Y1 - TROUGH_Y0 - 18);

  for (let x = 0; x < 1000; x += 44) {
    strokeHex(p, C.grid, 0.028);
    p.strokeWeight(0.7);
    p.line(x, TROUGH_Y0 + 5, x, TROUGH_Y1 - 5);
  }

  p.noStroke();
  fillHex(p, C.brassDark, 0.82);
  p.rect(0, TROUGH_Y0, 1000, 2);
  fillHex(p, C.brassLight, 0.19);
  p.rect(0, TROUGH_Y0 + 2, 1000, 0.9);
  fillHex(p, C.brassDark, 0.7);
  p.rect(0, TROUGH_Y1 - 2, 1000, 2);
  fillHex(p, C.brassLight, 0.13);
  p.rect(0, TROUGH_Y1 - 2.8, 1000, 0.8);
  p.pop();
}

function drawConstruction(p) {
  p.push();
  p.strokeCap(p.ROUND);

  dashedLine(p, 498, 390, 968, 390, 7, 9, C.cold, 0.13, 0.8);
  dashedLine(p, 724, 220, 724, 500, 4, 11, C.cold, 0.1, 0.8);
  dashedLine(p, 820, 236, 820, 500, 4, 11, C.cold, 0.08, 0.8);
  dashedLine(p, 820, 390, 968, 390, 4, 8, C.cold, 0.09, 0.8);

  p.noFill();
  strokeHex(p, C.cold, 0.12);
  p.strokeWeight(0.8);
  p.ellipse(VENN.a.x, VENN.a.y, 22, 22);
  p.ellipse(VENN.b.x, VENN.b.y, 22, 22);
  p.line(VENN.a.x - 9, VENN.a.y, VENN.a.x + 9, VENN.a.y);
  p.line(VENN.a.x, VENN.a.y - 9, VENN.a.x, VENN.a.y + 9);
  p.line(VENN.b.x - 9, VENN.b.y, VENN.b.x + 9, VENN.b.y);
  p.line(VENN.b.x, VENN.b.y - 9, VENN.b.x, VENN.b.y + 9);

  // 真值表左上角的小型定位角标。
  p.strokeWeight(1);
  for (const [x, y, sx, sy] of [
    [TABLE.x - 13, TABLE.y - 13, 1, 1],
    [TABLE.x + TABLE.w + 13, TABLE.y - 13, -1, 1],
    [TABLE.x - 13, TABLE.y + TABLE.h + 13, 1, -1],
    [TABLE.x + TABLE.w + 13, TABLE.y + TABLE.h + 13, -1, -1]
  ]) {
    strokeHex(p, C.cold, 0.22);
    p.line(x, y, x + 12 * sx, y);
    p.line(x, y, x, y + 12 * sy);
  }
  p.pop();
}

function drawRingTicks(p, cx, cy, r, color, alpha) {
  p.push();
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * TAU;
    const long = i % 6 === 0;
    const inner = r - (long ? 9 : 4);
    strokeHex(p, color, alpha * (long ? 1 : 0.52));
    p.strokeWeight(long ? 0.95 : 0.65);
    p.line(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner,
      cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
  }
  p.pop();
}

function drawLogicMedallion(p, x, y, kind, alpha) {
  p.push();
  p.noStroke();
  fillHex(p, C.shadow, 0.52 * alpha);
  p.ellipse(x + 1, y + 1.4, 19, 19);
  fillHex(p, C.boardDeep, 0.92 * alpha);
  p.ellipse(x, y, 18, 18);
  p.noFill();
  strokeHex(p, C.brass, 0.5 * alpha);
  p.strokeWeight(0.85);
  p.ellipse(x, y, 18, 18);
  strokeHex(p, C.cream, 0.68 * alpha);
  p.strokeWeight(0.9);

  if (kind === 'AND') {
    p.line(x - 4, y + 3.5, x, y - 4);
    p.line(x, y - 4, x + 4, y + 3.5);
  } else if (kind === 'OR') {
    p.arc(x, y - 2, 9.5, 9.5, 0, Math.PI);
  } else {
    p.line(x - 4, y, x + 3.5, y);
    p.ellipse(x + 5.2, y, 2.3, 2.3);
  }
  p.pop();
}

function drawWarmIntersection(p, t, alpha) {
  const x = 775;
  const y = 396;
  const pulse = 0.84 + 0.16 * Math.sin(t * TAU * 1.5);
  const warm = alpha * pulse;

  p.push();
  p.noStroke();
  for (let k = 6; k >= 1; k--) {
    fillHex(p, C.ember, 0.012 * k * warm);
    const d = 9 + k * 9;
    p.ellipse(x, y, d * 2.2, d * 1.7);
  }
  fillHex(p, C.ember, 0.2 * warm);
  p.ellipse(x, y, 31, 25);
  fillHex(p, C.emberHot, 0.78 * warm);
  p.ellipse(x - 0.5, y - 0.5, 11, 11);
  fillHex(p, C.emberCore, warm);
  p.ellipse(x - 1, y - 1, 4.4, 4.4);

  p.noFill();
  strokeHex(p, C.emberHot, 0.36 * warm);
  p.strokeWeight(0.8);
  p.ellipse(x, y, 17, 17);
  for (let i = 0; i < 4; i++) {
    const a = -0.6 + i * (TAU / 4);
    strokeHex(p, C.emberHot, (0.16 + 0.1 * i) * warm);
    p.strokeWeight(0.75);
    p.line(x + Math.cos(a) * 14, y + Math.sin(a) * 12,
      x + Math.cos(a) * 22, y + Math.sin(a) * 19);
  }
  p.pop();
}

function drawVenn(p, t) {
  const alpha = smoothstep(1.0, 1.8, t);
  if (alpha <= 0.002) return;

  const A = VENN.a;
  const B = VENN.b;
  p.push();
  p.noFill();

  // 黄铜圆圈：暗底、铜面、奶油细边。
  strokeHex(p, C.shadow, 0.34 * alpha);
  p.strokeWeight(4.6);
  p.ellipse(B.x + 1.2, B.y + 1.8, B.r * 2, B.r * 2);
  strokeHex(p, C.brassDark, 0.9 * alpha);
  p.strokeWeight(3.1);
  p.ellipse(B.x, B.y, B.r * 2, B.r * 2);
  strokeHex(p, C.brass, 0.88 * alpha);
  p.strokeWeight(1.6);
  p.ellipse(B.x, B.y, B.r * 2, B.r * 2);
  strokeHex(p, C.brassLight, 0.22 * alpha);
  p.strokeWeight(0.65);
  p.ellipse(B.x - 0.7, B.y - 0.8, (B.r - 5) * 2, (B.r - 5) * 2);

  // 奶油线稿圆。
  strokeHex(p, C.shadow, 0.3 * alpha);
  p.strokeWeight(3.4);
  p.ellipse(A.x + 1, A.y + 1.5, A.r * 2, A.r * 2);
  strokeHex(p, C.cream, 0.58 * alpha);
  p.strokeWeight(1.25);
  p.ellipse(A.x, A.y, A.r * 2, A.r * 2);
  strokeHex(p, C.creamDim, 0.15 * alpha);
  p.strokeWeight(0.65);
  p.ellipse(A.x, A.y, (A.r - 6) * 2, (A.r - 6) * 2);

  drawRingTicks(p, A.x, A.y, A.r, C.cream, 0.3 * alpha);
  drawRingTicks(p, B.x, B.y, B.r, C.brassLight, 0.34 * alpha);

  // B 圆环上的 0/1 小刻度字。
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(7.2);
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * (TAU / 8) + 0.08;
    const x = B.x + Math.cos(a) * (B.r + 12);
    const y = B.y + Math.sin(a) * (B.r + 12);
    if (y > 454) continue;
    fillHex(p, C.brassLight, 0.42 * alpha);
    p.text(i % 2 ? '1' : '0', x, y);
  }

  // A 圆环上半圈的三枚逻辑符号铭牌。
  for (const item of [
    [-2.7, 'AND'],
    [-Math.PI / 2, 'OR'],
    [-0.45, 'NOT']
  ]) {
    const a = item[0];
    drawLogicMedallion(
      p,
      A.x + Math.cos(a) * A.r,
      A.y + Math.sin(a) * A.r,
      item[1],
      alpha
    );
  }

  // A/B 区标识。
  p.noStroke();
  p.textFont('serif');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(19);
  fillHex(p, C.cream, 0.68 * alpha);
  p.text('A', 660, 312);
  fillHex(p, C.brassLight, 0.76 * alpha);
  p.text('B', 874, 326);
  p.textSize(8);
  p.textFont('monospace');
  fillHex(p, C.creamDim, 0.42 * alpha);
  p.text('0/1', 660, 330);
  fillHex(p, C.brassLight, 0.42 * alpha);
  p.text('0/1', 874, 344);

  drawWarmIntersection(p, t, alpha);
  p.pop();
}

function drawTruthTable(p, t) {
  const alpha = smoothstep(1.1, 1.85, t);
  if (alpha <= 0.002) return;

  const lit = smoothstep(2.48, 2.7, t) * (1 - smoothstep(4.3, 5.1, t) * 0.7);
  const { x, y, w, h, head, rows } = TABLE;
  const rowH = (h - head) / rows;
  const colW = w / 2;

  p.push();
  p.noStroke();

  fillHex(p, C.shadow, 0.48 * alpha);
  p.rect(x + 4, y + 5, w, h, 4);
  fillHex(p, C.boardDeep, 0.94 * alpha);
  p.rect(x, y, w, h, 4);
  fillHex(p, C.boardWarm, 0.35 * alpha);
  p.rect(x + 1, y + 1, w - 2, head + 1, 3);

  fillHex(p, C.brassDark, 0.93 * alpha);
  p.rect(x, y, w, 3, 1);
  p.rect(x, y + h - 2, w, 2, 1);
  p.rect(x, y, 2, h, 1);
  p.rect(x + w - 2, y, 2, h, 1);

  p.noFill();
  strokeHex(p, C.brass, 0.62 * alpha);
  p.strokeWeight(1.25);
  p.rect(x + 1.5, y + 1.5, w - 3, h - 3, 3);
  strokeHex(p, C.cream, 0.15 * alpha);
  p.strokeWeight(0.65);
  p.rect(x + 5, y + 5, w - 10, h - 10, 2);

  // 亮行底色。
  if (lit > 0.01) {
    fillHex(p, C.ember, 0.085 * lit);
    p.rect(x + 3, y + head + 2 * rowH, w - 6, rowH);
    fillHex(p, C.emberHot, 0.055 * lit);
    p.rect(x + 3, y + head + 2 * rowH + 1, w - 6, 2);
  }

  // 行底纹与压槽格线。
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 1) {
      fillHex(p, C.cream, 0.018 * alpha);
      p.rect(x + 3, y + head + r * rowH, w - 6, rowH);
    }
  }
  for (let r = 0; r <= rows; r++) {
    strokeHex(p, C.brassDark, 0.28 * alpha);
    p.strokeWeight(0.8);
    p.line(x + 5, y + head + r * rowH, x + w - 5, y + head + r * rowH);
    strokeHex(p, C.cream, 0.06 * alpha);
    p.strokeWeight(0.5);
    p.line(x + 5, y + head + r * rowH + 1, x + w - 5, y + head + r * rowH + 1);
  }
  for (const cx of [x + colW, x + 3, x + w - 3]) {
    strokeHex(p, C.brassDark, 0.32 * alpha);
    p.strokeWeight(0.8);
    p.line(cx, y + 5, cx, y + h - 5);
  }
  strokeHex(p, C.brassDark, 0.4 * alpha);
  p.strokeWeight(0.9);
  p.line(x + 5, y + head, x + w - 5, y + head);

  p.noStroke();
  p.textFont('serif');
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.NORMAL);
  p.textSize(9.5);
  fillHex(p, C.creamDim, 0.72 * alpha);
  p.text('A', x + colW * 0.5, y + head * 0.52);
  p.text('NOT A', x + colW * 1.5, y + head * 0.52);

  p.textStyle(p.BOLD);
  p.textSize(16);
  for (let r = 0; r < rows; r++) {
    const highlighted = r === 2 && lit > 0.02;
    const cy = y + head + (r + 0.5) * rowH;
    for (let c = 0; c < 2; c++) {
      const cx = x + colW * (c + 0.5);
      const value = TABLE_ROWS[r][c];
      fillHex(p, C.shadow, 0.55 * alpha);
      p.text(value, cx + 0.9, cy + 1.2);
      fillHex(p, highlighted ? C.cream : C.brassLight, (highlighted ? 0.98 : 0.78) * alpha);
      p.text(value, cx, cy);
    }
  }

  if (lit > 0.01) {
    p.noStroke();
    fillHex(p, C.ember, 0.16 * lit);
    p.ellipse(x + 10, y + head + 2.5 * rowH, 18, 18);
    fillHex(p, C.emberHot, 0.8 * lit);
    p.ellipse(x + 10, y + head + 2.5 * rowH, 3.4, 3.4);
    p.noFill();
    strokeHex(p, C.brass, 0.5 * lit);
    p.strokeWeight(0.9);
    p.rect(x + 2.5, y + head + 2 * rowH + 1, w - 5, rowH - 2, 1.5);
  }

  rivet(p, x + 10, y + 10, 1.7);
  rivet(p, x + w - 10, y + 10, 1.7);
  p.pop();
}

function gatePulse(t, start, end) {
  return smoothstep(start, start + 0.08, t) * (1 - smoothstep(end, end + 0.18, t));
}

function drawGateMechanism(p, kind, alpha) {
  p.push();
  p.strokeCap(p.ROUND);

  // 输入杆：AND/OR 两根，NOT 一根。
  const inputs = kind === 'NOT' ? [0] : [-6, 6];
  for (const y of inputs) {
    strokeHex(p, C.shadow, 0.7 * alpha);
    p.strokeWeight(3.4);
    p.line(-35, y, -22, y);
    strokeHex(p, C.brassDark, 0.98 * alpha);
    p.strokeWeight(1.25);
    p.line(-35, y, -22, y);
    p.noStroke();
    fillHex(p, C.brassLight, 0.55 * alpha);
    p.ellipse(-22, y, 2.8, 2.8);
  }

  // 输出杆与铜接头。
  strokeHex(p, C.shadow, 0.7 * alpha);
  p.strokeWeight(3.4);
  p.line(20, 0, 34, 0);
  strokeHex(p, C.brassDark, 0.98 * alpha);
  p.strokeWeight(1.25);
  p.line(20, 0, 34, 0);
  p.noStroke();
  fillHex(p, C.brassLight, 0.58 * alpha);
  p.ellipse(33, 0, 3, 3);

  // 中央凸轮。
  p.noStroke();
  fillHex(p, C.shadow, 0.62 * alpha);
  p.ellipse(1.5, 2, 21, 21);
  fillHex(p, C.brassDark, 0.98 * alpha);
  p.ellipse(0, 0, 20, 20);
  fillHex(p, C.brass, 0.9 * alpha);
  p.ellipse(-0.7, -0.8, 16, 16);
  fillHex(p, C.boardDeep, 0.92 * alpha);
  p.ellipse(0, 0, 7.4, 7.4);

  p.noFill();
  strokeHex(p, C.brassLight, 0.5 * alpha);
  p.strokeWeight(0.8);
  p.arc(0, 0, 17, 17, Math.PI * 1.02, Math.PI * 1.62);

  // 不同门用不同的机械凸轮轮廓。
  if (kind === 'AND') {
    strokeHex(p, C.creamDim, 0.58 * alpha);
    p.strokeWeight(0.85);
    p.line(-8, 3, -3.5, -4.5);
    p.line(-3.5, -4.5, 1, 2.5);
    p.line(1, 2.5, 7, -4.5);
    p.line(7, -4.5, 8.5, -2.5);
  } else if (kind === 'OR') {
    strokeHex(p, C.creamDim, 0.62 * alpha);
    p.strokeWeight(0.9);
    p.arc(0, -1, 22, 21, Math.PI * 0.13, Math.PI * 0.87);
    p.line(-8.5, 7, 8.5, 7);
    p.line(8.5, 7, 6.8, 3.2);
  } else {
    strokeHex(p, C.creamDim, 0.7 * alpha);
    p.strokeWeight(1);
    p.line(-8, 7.5, 7.5, -7.5);
    p.ellipse(8.6, -8.6, 4.2, 4.2);
  }

  p.noStroke();
  for (let i = 0; i < 10; i++) {
    const a = i * (TAU / 10);
    fillHex(p, i % 2 ? C.brassLight : C.brassDark, 0.24 * alpha);
    p.ellipse(Math.cos(a) * 9.2, Math.sin(a) * 9.2, 1.3, 1.3);
  }
  p.pop();
}

function drawGate(p, gate, alpha, glow) {
  const { x, kind } = gate;
  p.push();
  p.translate(x, GATE_Y);
  p.noStroke();

  // 吊杆和落影。
  fillHex(p, C.shadow, 0.46 * alpha);
  p.rect(-2, -31, 7, 15, 2);
  fillHex(p, C.brassDark, 0.94 * alpha);
  p.rect(-4, -32, 8, 15, 2);
  fillHex(p, C.brass, 0.65 * alpha);
  p.rect(-2, -31, 3.5, 13, 1);
  fillHex(p, C.brassLight, 0.58 * alpha);
  p.ellipse(-1, -32, 11, 3);

  fillHex(p, C.shadow, 0.48 * alpha);
  p.rect(-27 + 2, -18 + 3, 54, 36, 4);

  // 深铁门体 + 黄铜包边。
  fillHex(p, C.brassDark, 0.95 * alpha);
  p.rect(-27, -18, 54, 36, 4);
  fillHex(p, C.boardWarm, 0.98 * alpha);
  p.rect(-24, -15, 48, 30, 2);
  fillHex(p, C.boardDeep, 0.92 * alpha);
  p.rect(-21, -12, 42, 22, 2);
  fillHex(p, C.brass, 0.2 * alpha);
  p.rect(-24, -15, 48, 1.6, 1);
  fillHex(p, C.brassLight, 0.1 * alpha);
  p.rect(-24, 14, 48, 1, 1);

  drawGateMechanism(p, kind, alpha);

  // 指示灯：高光经过时依次亮，t≈3 安静下来只留一点暖。
  const lamp = 0.11 + glow * 0.82;
  p.noStroke();
  fillHex(p, C.ember, (0.05 + glow * 0.14) * alpha);
  p.ellipse(16, -9, 16, 16);
  fillHex(p, C.emberHot, lamp * alpha);
  p.ellipse(16, -9, 4.2, 4.2);
  fillHex(p, C.emberCore, (0.2 + glow * 0.8) * alpha);
  p.ellipse(15.6, -9.4, 1.8, 1.8);
  p.noFill();
  strokeHex(p, C.brassLight, 0.34 * alpha);
  p.strokeWeight(0.6);
  p.ellipse(16, -9, 7, 7);

  // 铭牌。
  fillHex(p, C.brassDark, 0.98 * alpha);
  p.rect(-22, 16, 44, 13, 2);
  fillHex(p, '#11100d', 0.95 * alpha);
  p.rect(-20, 18, 40, 9, 1);
  p.noStroke();
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textSize(7.8);
  p.textAlign(p.CENTER, p.CENTER);
  fillHex(p, C.cream, 0.82 * alpha);
  p.text(kind, 0, 23);

  rivet(p, -23, -15, 1.5);
  rivet(p, 23, -15, 1.5);
  p.pop();
}

function drawGateChain(p, t) {
  const alpha = smoothstep(1.55, 2.05, t);
  if (alpha <= 0.002) return;

  const glows = [
    gatePulse(t, 2.14, 2.33),
    gatePulse(t, 2.36, 2.55),
    gatePulse(t, 2.58, 2.79) + 0.16 * smoothstep(2.8, 2.95, t)
  ];

  p.push();
  p.strokeCap(p.ROUND);

  // 顶部铜轨。
  strokeHex(p, C.shadow, 0.35 * alpha);
  p.strokeWeight(4.2);
  p.line(454, 368, 650, 368);
  strokeHex(p, C.brassDark, 0.82 * alpha);
  p.strokeWeight(2.8);
  p.line(454, 366, 650, 366);
  strokeHex(p, C.brass, 0.55 * alpha);
  p.strokeWeight(1);
  p.line(456, 364.7, 648, 364.7);
  for (let x = 464; x <= 642; x += 36) {
    p.noStroke();
    fillHex(p, C.brassLight, 0.4 * alpha);
    p.ellipse(x, 366, 2.4, 2.4);
  }

  // 门与门之间的细铜轨。
  for (let i = 0; i < GATES.length - 1; i++) {
    const x1 = GATES[i].x + 27;
    const x2 = GATES[i + 1].x - 27;
    strokeHex(p, C.shadow, 0.38 * alpha);
    p.strokeWeight(3.2);
    p.line(x1, 396, x2, 396);
    strokeHex(p, C.brassDark, 0.86 * alpha);
    p.strokeWeight(1.5);
    p.line(x1, 395, x2, 395);
    strokeHex(p, C.brassLight, 0.34 * alpha);
    p.strokeWeight(0.6);
    p.line(x1 + 1, 394.3, x2 - 1, 394.3);
  }

  for (let i = 0; i < GATES.length; i++) {
    drawGate(p, GATES[i], alpha, glows[i]);
  }

  // 门链上方向纸带垂落的一小段冷灰辅助线。
  dashedLine(p, 470, 354, 634, 354, 5, 8, C.cold, 0.16 * alpha, 0.7);

  p.pop();
}

function drawPaperTape(p, t) {
  p.push();
  p.noStroke();

  // 纸带投影与纸边。
  fillHex(p, C.shadow, 0.52);
  p.rect(0, TAPE_Y0 + 2, 1000, 60);
  fillHex(p, C.tapeEdge, 1);
  p.rect(0, TAPE_Y0, 1000, 60);
  fillHex(p, C.tape, 1);
  p.rect(0, TAPE_Y0 + 2, 1000, 56);
  fillHex(p, C.tapeLight, 0.68);
  p.rect(0, TAPE_Y0 + 2.4, 1000, 0.9);
  fillHex(p, C.tapeEdge, 0.55);
  p.rect(0, TAPE_Y1 - 1.5, 1000, 1.5);

  // 纸纤维。
  p.strokeCap(p.ROUND);
  for (const f of TAPE_FIBERS) {
    strokeHex(p, f.light ? C.tapeLight : C.tapeInk, f.a);
    p.strokeWeight(f.w);
    p.line(f.x, f.y, f.x + f.len, f.y + Math.sin(f.x * 0.013) * 0.8);
  }

  // 打孔纸带的细格线。
  strokeHex(p, C.tapeInk, 0.08);
  p.strokeWeight(0.55);
  for (let x = 0; x <= 1000; x += 20) {
    p.line(x, TAPE_Y0 + 3, x, TAPE_Y1 - 3);
  }
  for (const y of [483, 493, 508, 523, 533]) {
    strokeHex(p, C.tapeInk, y === TAPE_MID ? 0.1 : 0.062);
    p.strokeWeight(0.55);
    p.line(0, y, 1000, y);
  }

  // 两侧齿孔，间距 24（接第 8 版块的孔带）。
  for (let x = 10; x < 1000; x += 24) {
    fillHex(p, C.hole, 0.92);
    p.rect(x, 483, 6, 5, 1);
    p.rect(x, 529, 6, 5, 1);
    fillHex(p, C.tapeLight, 0.17);
    p.rect(x, 483, 6, 0.8, 0.5);
    p.rect(x, 529, 6, 0.8, 0.5);
  }

  // 数据位：1 为穿孔，0 为浅压痕。
  for (let i = 0; i < DATA_COUNT; i++) {
    const x = DATA_X0 + i * DATA_STEP;
    if (tapeBit(i)) {
      fillHex(p, C.hole, 0.9);
      p.ellipse(x, TAPE_MID, 6.2, 6.2);
      fillHex(p, C.tapeLight, 0.15);
      p.ellipse(x - 0.8, TAPE_MID - 0.7, 1.4, 1.1);
    } else {
      fillHex(p, C.tapeInk, 0.19);
      p.ellipse(x, TAPE_MID, 3.4, 2.6);
      fillHex(p, C.tapeLight, 0.13);
      p.ellipse(x - 0.4, TAPE_MID - 0.4, 1.3, 0.8);
    }
  }

  // 第 2 小节的回环区域：孔缘微暖 + 一小串可读的 0/1。
  const focus = smoothstep(2.24, 2.56, t) * (1 - smoothstep(4.3, 5.2, t) * 0.6);
  if (focus > 0.01) {
    fillHex(p, C.ember, 0.055 * focus);
    p.ellipse(502, TAPE_MID, 174, 35);
    // 高光段在两个瓣之间快翻时，纸带上的 0/1 也跟着闪；3.0 后收住。
    const chattering = t >= 2.18 && t < 3.0;
    const frame = Math.floor(t * 12);
    for (let i = 0; i < 7; i++) {
      const x = 448 + i * 16;
      const baseBit = LOOP_BITS[i % LOOP_BITS.length];
      const bit = chattering
        ? (hash2(i + 1, frame, 33) > 0.46 ? '1' : '0')
        : baseBit;
      const flick = chattering ? 0.7 + 0.3 * hash2(frame, i, 44) : 1;
      p.noStroke();
      fillHex(p, bit === '1' ? C.emberHot : C.creamDim, 0.16 * focus * flick);
      p.ellipse(x + 2, TAPE_MID, 10, 10);
      p.textFont('monospace');
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(6.6);
      fillHex(p, C.tapeInk, 0.34 * focus);
      p.text(bit, x + 2.6, 521.6);
      fillHex(p, C.emberHot, 0.64 * focus * flick);
      p.text(bit, x, 521);
    }
  }

  // 段端切边，保持纸带直线、无变形。
  strokeHex(p, C.tapeInk, 0.18);
  p.strokeWeight(1);
  p.line(0.5, 480, 0.5, 536);
  p.line(999.5, 480, 999.5, 536);
  p.pop();
}

function drawLoopToken(p, x, y, digit, alpha) {
  p.push();
  p.noStroke();
  fillHex(p, C.shadow, 0.45 * alpha);
  p.ellipse(x + 1, y + 1.5, 21, 21);
  fillHex(p, C.boardDeep, 0.96 * alpha);
  p.ellipse(x, y, 20, 20);
  p.noFill();
  strokeHex(p, C.brass, 0.6 * alpha);
  p.strokeWeight(0.85);
  p.ellipse(x, y, 20, 20);
  p.noStroke();
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(10);
  fillHex(p, C.cream, 0.9 * alpha);
  p.text(digit, x, y + 0.3);
  p.pop();
}

function drawFeedbackLoop(p, t) {
  const wake = smoothstep(2.15, 2.55, t);
  const fade = 1 - smoothstep(4.45, 5.35, t) * 0.58;
  const alpha = (0.1 + 0.82 * wake) * fade;
  const gateAlpha = smoothstep(1.55, 2.05, t);

  p.push();

  // 从 NOT 门接出的铜轨，落向纸带上的回环。
  if (gateAlpha > 0.01) {
    p.strokeCap(p.ROUND);
    strokeHex(p, C.shadow, 0.3 * gateAlpha);
    p.strokeWeight(3.6);
    p.line(622, 431, 622, 458);
    p.line(622, 458, 566, 458);
    p.line(566, 458, 566, 466);
    strokeHex(p, C.brass, 0.66 * gateAlpha);
    p.strokeWeight(1.25);
    p.line(622, 431, 622, 457);
    p.line(622, 457, 566, 457);
    p.line(566, 457, 566, 466);
    p.noStroke();
    fillHex(p, C.brassLight, 0.55 * gateAlpha);
    p.ellipse(622, 431, 3, 3);
  }

  // 回环的暗铜外轨和亮铜内轨。
  p.noFill();
  p.strokeCap(p.ROUND);
  strokeHex(p, C.shadow, 0.46 * alpha);
  p.strokeWeight(5.2);
  p.rect(LOOP.x + 1, LOOP.y + 2, LOOP.w, LOOP.h, LOOP.r);
  strokeHex(p, C.brassDark, 0.95 * alpha);
  p.strokeWeight(3.2);
  p.rect(LOOP.x, LOOP.y, LOOP.w, LOOP.h, LOOP.r);
  strokeHex(p, C.brass, 0.92 * alpha);
  p.strokeWeight(1.25);
  p.rect(LOOP.x, LOOP.y, LOOP.w, LOOP.h, LOOP.r);
  strokeHex(p, C.cream, 0.26 * alpha);
  p.strokeWeight(0.55);
  p.rect(LOOP.x + 1.2, LOOP.y - 0.5, LOOP.w - 2.4, LOOP.h, LOOP.r);

  // 方向箭头：上缘向右、下缘向左。
  p.noStroke();
  fillHex(p, C.brassLight, 0.82 * alpha);
  p.triangle(534, 462.2, 534, 469.8, 542, 466);
  p.triangle(470, 544.2, 470, 551.8, 462, 548);

  // 回环两侧的 0 / 1 铭牌。
  drawLoopToken(p, LOOP.x, LOOP.y + LOOP.h * 0.5, '0', alpha);
  drawLoopToken(p, LOOP.x + LOOP.w, LOOP.y + LOOP.h * 0.5, '1', alpha);

  // 环上的暖火种小点，确定性固定位置。
  p.noStroke();
  for (const [x, y, s] of [
    [LOOP.x + 18, LOOP.y, 2.1],
    [LOOP.x + LOOP.w - 21, LOOP.y + LOOP.h, 1.7],
    [LOOP.x + LOOP.w, LOOP.y + 20, 1.2]
  ]) {
    fillHex(p, C.ember, 0.06 * wake);
    p.ellipse(x, y, s * 8, s * 8);
    fillHex(p, C.emberHot, 0.68 * wake * fade);
    p.ellipse(x, y, s, s);
  }

  // 公式铭牌。
  fillHex(p, C.shadow, 0.44 * alpha);
  p.rect(417, 559, 172, 25, 3);
  fillHex(p, C.brassDark, 0.92 * alpha);
  p.rect(416, 556, 172, 25, 3);
  fillHex(p, C.boardDeep, 0.95 * alpha);
  p.rect(418.5, 558.5, 167, 20, 2);
  p.noFill();
  strokeHex(p, C.brass, 0.7 * alpha);
  p.strokeWeight(0.85);
  p.rect(416, 556, 172, 25, 3);
  strokeHex(p, C.cream, 0.12 * alpha);
  p.strokeWeight(0.5);
  p.rect(419, 559, 166, 19, 2);
  p.noStroke();
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(10);
  fillHex(p, C.cream, 0.88 * alpha);
  p.text('A = NOT A', 502, 568.5);

  p.pop();
}

// 两拍一循环（1s）：快速翻到另一瓣，停住；高光时快翻，最后卡在 0/1 之间的半翻面。
function idleAngle(t) {
  const cycle = Math.floor(t);
  const phase = t - cycle;
  const from = cycle % 2 === 0 ? -1 : 1;
  const step = smoothstep(0, 0.18, phase);
  return 0.23 * (from - 2 * from * step);
}

function actorAngle(t) {
  const hold = clamp(t, 0, 6);
  if (hold >= 2.18 && hold < 3.0) {
    const chatterFade = smoothstep(2.18, 2.3, hold) * (1 - smoothstep(2.82, 3.0, hold));
    const base = 0.23 * Math.cos(TAU * hold);
    const chatter = Math.sin((hold - 2.18) * 34) * 0.25;
    return base * (1 - chatterFade) + chatter * chatterFade;
  }
  if (hold >= 3.0 && hold <= 4.15) return 0;
  if (hold > 4.15) return 0.23;
  return idleAngle(hold);
}

function lobePath(p, r) {
  p.beginShape();
  const teeth = 10;
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * TAU;
    const q = i % 4;
    const rr = q === 1 || q === 2 ? r : r * 0.9;
    p.vertex(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  p.endShape(p.CLOSE);
}

function drawActorLobe(p, x, y, digit, active, halfFlash, alpha) {
  p.push();
  p.translate(x, y);

  p.noStroke();
  if (active) {
    fillHex(p, C.ember, 0.075 + halfFlash * 0.075);
    p.ellipse(0, 0, 52, 52);
  }
  fillHex(p, C.shadow, 0.4 * alpha);
  p.ellipse(2, 3, 37, 37);
  fillHex(p, C.brassDeep, alpha);
  lobePath(p, 17.6);
  fillHex(p, C.brass, 0.98 * alpha);
  lobePath(p, 16.3);
  fillHex(p, C.brassLight, 0.18 * alpha);
  p.ellipse(-3, -4, 22, 20);

  // 中心刻字凹槽。
  fillHex(p, C.boardDeep, 0.92 * alpha);
  p.ellipse(0, 1, 21, 20);
  p.noFill();
  strokeHex(p, C.brassLight, 0.36 * alpha);
  p.strokeWeight(0.8);
  p.ellipse(0, 1, 21.5, 20.5);

  if (active) {
    p.noFill();
    strokeHex(p, C.emberHot, 0.58 + halfFlash * 0.32);
    p.strokeWeight(1.4);
    p.arc(0, 0, 35, 35, Math.PI * 0.08, Math.PI * 0.92);
  }

  p.noStroke();
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(14);
  fillHex(p, C.shadow, 0.7 * alpha);
  p.text(digit, 0.9, 2.1);
  fillHex(p, active ? C.cream : C.creamDim, (active ? 0.98 : 0.84) * alpha);
  p.text(digit, 0, 1.1);

  // 瓣缘的 1px 高光与小齿。
  p.noFill();
  strokeHex(p, C.brassLight, 0.42 * alpha);
  p.strokeWeight(0.7);
  p.arc(0, 0, 30, 30, Math.PI * 1.03, Math.PI * 1.55);
  strokeHex(p, C.emberHot, active ? 0.4 : 0.12);
  p.strokeWeight(0.6);
  p.arc(0, 0, 32, 32, Math.PI * 0.12, Math.PI * 0.4);
  p.pop();
}

function drawActorWorld(p, worldX, t) {
  const angle = actorAngle(t);
  const halfFlash = smoothstep(2.92, 2.97, t) * (1 - smoothstep(3.05, 3.38, t));
  const half = t >= 2.84 && t < 4.15 && Math.abs(angle) < 0.08;

  const arm = 32;
  const spread = 0.7;
  const ax = Math.sin(spread) * arm;
  const ay = Math.cos(spread) * arm;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const lobes = [
    { digit: '0', x: -ax * ca - ay * sa, y: -ax * sa + ay * ca },
    { digit: '1', x: ax * ca - ay * sa, y: ax * sa + ay * ca }
  ];
  const active0 = half || lobes[0].y > lobes[1].y + 0.35;
  const active1 = half || lobes[1].y > lobes[0].y + 0.35;
  const actives = [active0, active1];

  p.push();
  p.translate(worldX, 470);

  // 纸面上的暖光与接触阴影。
  p.noStroke();
  fillHex(p, C.ember, 0.045 + halfFlash * 0.055);
  p.ellipse(0, 40, 118, 27);
  fillHex(p, C.shadow, 0.25);
  p.ellipse(0, 44, 88, 13);
  for (let i = 0; i < 2; i++) {
    if (!actives[i]) continue;
    fillHex(p, C.shadow, 0.22);
    p.ellipse(lobes[i].x, 42.5, 18, 4.6);
    fillHex(p, C.brassLight, 0.16);
    p.ellipse(lobes[i].x - 1, 41.6, 10, 1.7);
  }

  // 吊杆/上端盖。
  fillHex(p, C.shadow, 0.38);
  p.rect(-3, -33, 8, 22, 3);
  fillHex(p, C.brassDark, 0.96);
  p.rect(-4, -35, 8, 22, 2);
  fillHex(p, C.brass, 0.62);
  p.rect(-2.5, -34, 3.5, 20, 1);
  fillHex(p, C.brassLight, 0.62);
  p.ellipse(-1, -35, 13, 4);
  fillHex(p, C.shadow, 0.6);
  p.ellipse(0.5, -33, 3.2, 1.4);

  // 双瓣拨杆的两条臂。
  p.strokeCap(p.ROUND);
  for (const lobe of lobes) {
    strokeHex(p, C.shadow, 0.48);
    p.strokeWeight(10);
    p.line(0, 0, lobe.x, lobe.y);
    strokeHex(p, C.brassDark, 1);
    p.strokeWeight(7);
    p.line(0, 0, lobe.x, lobe.y);
    strokeHex(p, C.brass, 0.96);
    p.strokeWeight(4.2);
    p.line(0, 0, lobe.x, lobe.y);
    strokeHex(p, C.brassLight, 0.3);
    p.strokeWeight(0.9);
    p.line(-0.5, -1, lobe.x - 0.5, lobe.y - 1);
  }

  drawActorLobe(p, lobes[0].x, lobes[0].y, '0', active0, halfFlash, 1);
  drawActorLobe(p, lobes[1].x, lobes[1].y, '1', active1, halfFlash, 1);

  // 中央轴承与同一颗暖赭火种。
  p.noStroke();
  fillHex(p, C.shadow, 0.5);
  p.ellipse(1.5, 1.8, 25, 25);
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, 22, 22);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, 19, 19);
  fillHex(p, C.brass, 0.95);
  p.ellipse(-0.8, -0.8, 14, 14);
  fillHex(p, C.boardDeep, 0.98);
  p.ellipse(0, 0, 10, 10);

  const emberPulse = 0.84 + 0.16 * Math.sin(t * TAU * 1.5);
  fillHex(p, C.ember, (0.16 + halfFlash * 0.2) * emberPulse);
  p.ellipse(0, 0, 31, 31);
  fillHex(p, C.ember, 0.62);
  p.ellipse(0, 0, 13, 13);
  fillHex(p, C.emberHot, 0.96);
  p.ellipse(-0.8, -0.8, 7.2, 7.2);
  fillHex(p, C.emberCore, 1);
  p.ellipse(-1.2, -1.2, 3, 3);
  p.noFill();
  strokeHex(p, C.emberHot, 0.28 + halfFlash * 0.4);
  p.strokeWeight(0.8);
  p.ellipse(0, 0, 24, 24);

  // 翻面时的小黄铜火花；半翻面时两边各留一点。
  const spark = 0.12 + halfFlash * 0.8;
  p.strokeCap(p.ROUND);
  for (let i = 0; i < 4; i++) {
    if (!actives[i % 2] && !half) continue;
    const base = i < 2 ? lobes[0] : lobes[1];
    const a = Math.PI * 0.12 + i * 0.24;
    strokeHex(p, i % 2 ? C.cream : C.emberHot, 0.42 * spark);
    p.strokeWeight(0.75);
    p.line(base.x + Math.cos(a) * 17, base.y + Math.sin(a) * 17,
      base.x + Math.cos(a) * (22 + i), base.y + Math.sin(a) * (22 + i));
  }

  // 第 2 小节开始在拨杆周围悬一小串 0/1。
  if (t > 2.15) {
    const bitsAlpha = smoothstep(2.2, 2.5, t) * (1 - smoothstep(4.9, 5.6, t) * 0.55);
    const out = smoothstep(4.15, 4.9, t);
    const spots = [
      [-56, -8, '0'],
      [56, -3, '1'],
      [-47, 12, '1'],
      [51, 17, '0']
    ];
    p.noStroke();
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(9);
    for (let i = 0; i < spots.length; i++) {
      const [x0, y0, bit] = spots[i];
      const dir = x0 < 0 ? -1 : 1;
      const x = x0 + dir * out * (11 + i * 2);
      const y = y0 - out * (6 + i * 2);
      fillHex(p, C.ember, 0.03 * bitsAlpha);
      p.ellipse(x, y, 11, 11);
      fillHex(p, C.emberHot, 0.64 * bitsAlpha);
      p.text(bit, x, y);
    }
  }

  p.pop();
}

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.noStroke();
  fillHex(p, C.cream, 0.66 * alpha);
  p.rect(206, 392, 188, 24, 2);
  p.noFill();
  strokeHex(p, C.brassLight, 0.44 * alpha);
  p.strokeWeight(1);
  p.rect(206, 392, 188, 24, 2);
  p.pop();
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();

    drawBoard(p);
    drawTrough(p);
    drawConstruction(p);
    drawVenn(p, t);
    drawTruthTable(p, t);
    drawGateChain(p, t);

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
    p.noStroke();

    drawTrough(p);
    drawPaperTape(p, t);
    drawFeedbackLoop(p, t);

    p.pop();
  },

  drawActor(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    // 主角直接吃世界坐标 state.x，不能减版块偏移。
    drawActorWorld(p, state.x, t);
    p.pop();
  }
};
