import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 06 差分机与分析机：深铁/黄铜机器内腔 + 数字轮柱 + 打孔卡带 + 齿条轨。
// 静态重点：localT≈1.5（标题、齿条、数字柱）与 localT≈3.0（卡带闭环、重复读数、蒸汽定格）。
const TAU = Math.PI * 2;

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const C = {
  bg: '#1c1a17',
  bgDeep: '#0d0c0a',
  ironDeep: '#151310',
  iron: '#211e1a',
  ironLight: '#2d2822',
  ironEdge: '#3a332a',
  blueprint: '#9db4a9',
  brassDeep: '#3f2b15',
  brassDark: '#6e4a22',
  brass: '#b8863c',
  brassMid: '#c9954a',
  brassLight: '#e8b86a',
  cream: '#f0debc',
  creamDim: '#cbb287',
  tape: '#d8c7a3',
  tapeEdge: '#9d855f',
  tapeShade: '#b7a17a',
  hole: '#18110b',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe0a0',
  slot: '#0e0b08',
  steam: '#d8c7a6',
  spark: '#ffd28a'
};

const META = {
  id: 6,
  cn: '差分机与分析机',
  en: 'Difference & Analytical Engines',
  era: '1830s · 巴贝奇',
  group: 'mechanical'
};

const RACK = {
  y0: 630,
  drop: 130,
  rampX0: 900,
  rampX1: 1000,
  half: 13,
  pitch: 20,
  actorDrop: 38
};

const BANK = {
  x: 620,
  y: 258,
  w: 300,
  h: 356,
  cols: 6,
  colX0: 654,
  colStep: 45,
  rows: 6,
  rowY0: 306,
  rowStep: 27,
  wheelW: 33,
  wheelH: 23
};

// 第 2 小节定格：最下面两行都读出 314159，让“重复的一行”一眼可见。
const REPEAT_ROW = [3, 1, 4, 1, 5, 9];

// 帧内背景用固定随机种子预生成，避免每帧抖动。
const BACK_SPECKS = (() => {
  const rng = mulberry32(0x06f00d);
  const list = [];
  for (let i = 0; i < 44; i++) {
    list.push({
      x: 58 + rng() * 884,
      y: 112 + rng() * 810,
      r: 0.6 + rng() * 1.8,
      a: 0.04 + rng() * 0.1,
      light: rng() > 0.65
    });
  }
  return list;
})();

const GRID_FIBERS = (() => {
  const rng = mulberry32(0x6c0de);
  const list = [];
  for (let i = 0; i < 28; i++) {
    list.push({
      x: 60 + rng() * 880,
      y: 120 + rng() * 790,
      len: 8 + rng() * 26,
      a: -0.3 + rng() * 0.6,
      alpha: 0.02 + rng() * 0.045
    });
  }
  return list;
})();

// 齿轮轮廓：12/16/24 齿共用。齿顶 r，齿根 0.78r。
function gearRingPath(p, r, teeth) {
  const step = TAU / teeth;
  const root = r * 0.78;
  p.beginShape();
  for (let j = 0; j < teeth; j++) {
    const a = j * step;
    p.vertex(Math.cos(a - step * 0.3) * root, Math.sin(a - step * 0.3) * root);
    p.vertex(Math.cos(a - step * 0.17) * r, Math.sin(a - step * 0.17) * r);
    p.vertex(Math.cos(a + step * 0.17) * r, Math.sin(a + step * 0.17) * r);
    p.vertex(Math.cos(a + step * 0.3) * root, Math.sin(a + step * 0.3) * root);
  }
  p.endShape(p.CLOSE);
}

function drawGear(p, cx, cy, r, teeth, angle, alpha, spokes = 5) {
  p.push();
  p.translate(cx, cy);
  p.rotate(angle);
  p.noStroke();

  // 背光、落影、深色齿底
  fillHex(p, '#080604', 0.42 * alpha);
  p.ellipse(r * 0.12 + 5, r * 0.14 + 6, r * 2.12, r * 2.12);
  fillHex(p, C.slot, 0.96 * alpha);
  gearRingPath(p, r + 2.2, teeth);
  fillHex(p, C.brassDeep, alpha);
  gearRingPath(p, r, teeth);

  // 铜面：底色、亮面、局部暗边
  fillHex(p, C.brass, 0.98 * alpha);
  p.ellipse(-r * 0.03, -r * 0.03, r * 1.48, r * 1.48);
  fillHex(p, C.brassLight, 0.13 * alpha);
  p.ellipse(-r * 0.14, -r * 0.16, r * 1.03, r * 1.03);
  fillHex(p, C.brassDark, 0.42 * alpha);
  p.ellipse(r * 0.12, r * 0.18, r * 1.26, r * 1.26);

  // 大齿轮减重孔
  if (r >= 34) {
    for (let k = 0; k < spokes; k++) {
      const a = k * (TAU / spokes) + 0.38;
      fillHex(p, C.brassDeep, 0.42 * alpha);
      p.ellipse(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.27, r * 0.21);
      fillHex(p, C.slot, 0.34 * alpha);
      p.ellipse(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.2, r * 0.14);
    }
  }

  // 轮辐与轮毂
  strokeHex(p, C.brassDeep, 0.64 * alpha);
  p.strokeWeight(Math.max(1.2, r * 0.07));
  for (let k = 0; k < spokes; k++) {
    const a = k * (TAU / spokes) + 0.19;
    p.line(Math.cos(a) * r * 0.27, Math.sin(a) * r * 0.27,
      Math.cos(a) * r * 0.71, Math.sin(a) * r * 0.71);
  }
  p.noStroke();
  fillHex(p, C.brassDark, alpha);
  p.ellipse(0, 0, r * 0.42, r * 0.42);
  fillHex(p, C.slot, 0.9 * alpha);
  p.ellipse(0, 0, r * 0.24, r * 0.24);
  fillHex(p, C.brassMid, 0.55 * alpha);
  p.ellipse(-r * 0.04, -r * 0.05, r * 0.13, r * 0.13);

  // 齿缘受光/暗边
  p.noFill();
  strokeHex(p, C.brassLight, 0.36 * alpha);
  p.strokeWeight(1.1);
  for (let k = 0; k < teeth; k += 2) {
    const a = k * (TAU / teeth);
    p.arc(0, 0, r * 1.93, r * 1.93, a - 0.16, a + 0.08);
  }
  strokeHex(p, C.brassDeep, 0.55 * alpha);
  p.strokeWeight(1.2);
  p.arc(0, 0, r * 1.43, r * 1.43, Math.PI * 0.08, Math.PI * 0.56);
  strokeHex(p, C.creamDim, 0.28 * alpha);
  p.strokeWeight(0.9);
  p.arc(0, 0, r * 1.36, r * 1.36, Math.PI * 1.06, Math.PI * 1.58);

  p.pop();
}

function drawRivet(p, x, y, r = 3, alpha = 0.55) {
  p.noStroke();
  fillHex(p, C.bgDeep, 0.7 * alpha);
  p.ellipse(x + 0.8, y + 1, r * 2.2, r * 2.2);
  fillHex(p, C.brassDark, 0.9 * alpha);
  p.ellipse(x, y, r * 2, r * 2);
  fillHex(p, C.brassMid, 0.65 * alpha);
  p.ellipse(x - r * 0.28, y - r * 0.32, r * 1.15, r * 1.15);
  p.noFill();
  strokeHex(p, C.brassLight, 0.26 * alpha);
  p.strokeWeight(0.8);
  p.arc(x, y, r * 1.8, r * 1.8, Math.PI * 1.02, Math.PI * 1.7);
}

// 不用 ctx.setLineDash：手动分段，保证状态干净。
function dashedEllipse(p, cx, cy, rx, ry, parts, alpha) {
  p.push();
  p.noFill();
  strokeHex(p, C.blueprint, alpha);
  p.strokeWeight(0.9);
  for (let i = 0; i < parts; i++) {
    const a = (i / parts) * TAU;
    const b = a + (TAU / parts) * 0.48;
    p.arc(cx, cy, rx * 2, ry * 2, a, b);
  }
  p.pop();
}

function dashedLine(p, x1, y1, x2, y2, dashes, alpha) {
  p.push();
  strokeHex(p, C.blueprint, alpha);
  p.strokeWeight(0.8);
  for (let i = 0; i < dashes; i++) {
    const q0 = i / dashes;
    const q1 = q0 + 0.56 / dashes;
    p.line(x1 + (x2 - x1) * q0, y1 + (y2 - y1) * q0,
      x1 + (x2 - x1) * q1, y1 + (y2 - y1) * q1);
  }
  p.pop();
}

function drawDimension(p, x1, y1, x2, y2, ticks) {
  p.push();
  strokeHex(p, C.blueprint, 0.085);
  p.strokeWeight(0.8);
  p.line(x1, y1, x2, y2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= ticks; i++) {
    const u = i / ticks;
    const x = x1 + dx * u;
    const y = y1 + dy * u;
    p.line(x - nx * 4, y - ny * 4, x + nx * 4, y + ny * 4);
  }
  p.noStroke();
  fillHex(p, C.blueprint, 0.085);
  p.triangle(x1, y1, x1 + dx / len * 5 + nx * 2.6, y1 + dy / len * 5 + ny * 2.6,
    x1 + dx / len * 5 - nx * 2.6, y1 + dy / len * 5 - ny * 2.6);
  p.triangle(x2, y2, x2 - dx / len * 5 + nx * 2.6, y2 - dy / len * 5 + ny * 2.6,
    x2 - dx / len * 5 - nx * 2.6, y2 - dy / len * 5 - ny * 2.6);
  p.pop();
}

function drawBackdrop(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  // 机器内腔：外框、内板、低对比暖光
  fillHex(p, C.ironDeep, 1);
  p.rect(0, 0, 1000, 82);
  p.rect(0, 918, 1000, 82);
  p.rect(0, 0, 48, 1000);
  p.rect(952, 0, 48, 1000);
  fillHex(p, C.iron, 1);
  p.rect(48, 82, 904, 836);
  fillHex(p, C.ironLight, 0.32);
  p.rect(56, 90, 888, 820);
  fillHex(p, C.bgDeep, 0.4);
  p.ellipse(140, 800, 610, 340);
  fillHex(p, C.bgDeep, 0.26);
  p.ellipse(952, 160, 360, 300);
  fillHex(p, C.brassDark, 0.045);
  p.ellipse(770, 250, 500, 390);
  fillHex(p, C.ember, 0.017);
  p.ellipse(505, 600, 520, 250);

  // 背景远处的巨大齿轮剪影，给左下角一点机械纵深。
  p.push();
  p.translate(230, 790);
  p.rotate(0.16);
  fillHex(p, '#2a231b', 0.42);
  gearRingPath(p, 160, 18);
  fillHex(p, C.bgDeep, 0.55);
  p.ellipse(0, 0, 245, 245);
  p.noFill();
  strokeHex(p, C.brassDark, 0.14);
  p.strokeWeight(1.5);
  p.ellipse(0, 0, 276, 276);
  p.ellipse(0, 0, 96, 96);
  p.pop();

  // 底部机坑里两根横管，避免下半屏变成纯黑。
  fillHex(p, C.ironDeep, 0.95);
  p.rect(48, 858, 904, 40);
  fillHex(p, C.iron, 0.95);
  p.rect(48, 862, 904, 22);
  fillHex(p, C.brassDark, 0.28);
  p.rect(48, 864, 904, 3);
  fillHex(p, C.ironLight, 0.24);
  p.rect(48, 880, 904, 2);

  // 很淡的蓝图网格
  p.push();
  for (let x = 68; x <= 936; x += 40) {
    const major = Math.round((x - 68) / 40) % 5 === 0;
    strokeHex(p, C.blueprint, major ? 0.045 : 0.021);
    p.strokeWeight(0.8);
    p.line(x, 94, x, 912);
  }
  for (let y = 104; y <= 912; y += 40) {
    const major = Math.round((y - 104) / 40) % 5 === 0;
    strokeHex(p, C.blueprint, major ? 0.045 : 0.021);
    p.strokeWeight(0.8);
    p.line(54, y, 946, y);
  }
  p.pop();

  // 图纸纤维与细小脏点
  p.push();
  for (const f of GRID_FIBERS) {
    strokeHex(p, C.blueprint, f.alpha);
    p.strokeWeight(0.7);
    p.line(f.x, f.y, f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len);
  }
  p.noStroke();
  for (const s of BACK_SPECKS) {
    fillHex(p, s.light ? C.creamDim : C.blueprint, s.a);
    p.ellipse(s.x, s.y, s.r * 2, s.r * 1.4);
  }
  p.pop();

  // 蓝色工程图式尺寸线/参考圆（冷灰绿只做极少量辅助线）
  dashedEllipse(p, 752, 180, 99, 99, 26, 0.065);
  dashedEllipse(p, 752, 180, 111, 111, 30, 0.042);
  dashedLine(p, 588, 312, 918, 312, 22, 0.052);
  drawDimension(p, 620, 116, 918, 116, 8);
  drawDimension(p, 940, 296, 940, 606, 8);
  drawDimension(p, 78, 430, 78, 604, 6);
  p.push();
  strokeHex(p, C.blueprint, 0.06);
  p.strokeWeight(0.8);
  p.line(740, 168, 764, 168);
  p.line(752, 156, 752, 180);
  p.ellipse(752, 180, 11, 11);
  p.pop();

  // 板缝
  p.push();
  p.strokeWeight(1.5);
  strokeHex(p, C.bgDeep, 0.65);
  p.line(112, 86, 112, 918);
  p.line(486, 86, 486, 918);
  p.line(610, 86, 610, 918);
  p.line(48, 760, 952, 760);
  p.strokeWeight(0.8);
  strokeHex(p, C.ironLight, 0.22);
  p.line(113.5, 88, 113.5, 916);
  p.line(487.5, 88, 487.5, 916);
  p.line(611.5, 88, 611.5, 916);
  p.line(50, 761.5, 950, 761.5);
  p.pop();

  // 框条与高光
  p.push();
  p.noStroke();
  fillHex(p, C.ironLight, 0.35);
  p.rect(48, 82, 904, 5);
  p.rect(48, 915, 904, 3);
  fillHex(p, C.brassDark, 0.38);
  p.rect(48, 90, 2, 820);
  p.rect(950, 90, 2, 820);
  p.rect(0, 78, 1000, 3);
  p.rect(0, 918, 1000, 3);
  strokeHex(p, C.brassLight, 0.16);
  p.strokeWeight(1);
  p.line(48, 82, 952, 82);
  p.line(48, 918, 952, 918);
  p.pop();

  // 铆钉排
  for (let x = 70; x <= 930; x += 68) {
    drawRivet(p, x, 58, 2.8, 0.5);
    drawRivet(p, x, 946, 2.8, 0.4);
  }
  for (let y = 138; y <= 892; y += 66) {
    drawRivet(p, 25, y, 3, 0.5);
    drawRivet(p, 975, y, 3, 0.44);
  }
  drawRivet(p, 64, 130, 3.4, 0.5);
  drawRivet(p, 936, 130, 3.4, 0.5);
  drawRivet(p, 64, 902, 3.4, 0.42);
  drawRivet(p, 936, 902, 3.4, 0.42);
  drawRivet(p, 552, 156, 2.2, 0.32);
  drawRivet(p, 890, 352, 2.4, 0.28);
  drawRivet(p, 902, 718, 2.6, 0.32);
  drawRivet(p, 506, 868, 2.4, 0.28);

  p.pop();
}

// 顶部 3 组齿轮：24 / 16 / 12 齿，咬合旋转。
function drawGearTrain(p, t) {
  const clock = t < 3 ? t : t < 4 ? 3 : t - 1;

  // 齿轮后方的吊轴支架：先画，齿轮压在前面，避免把 24 齿轮从中间劈开。
  p.push();
  p.noStroke();
  fillHex(p, C.slot, 0.8);
  p.rect(736, 84, 32, 92, 5);
  fillHex(p, C.ironLight, 0.55);
  p.rect(740, 88, 24, 84, 4);
  fillHex(p, C.brassDark, 0.75);
  p.rect(743, 94, 18, 74, 3);
  p.noFill();
  strokeHex(p, C.brassLight, 0.22);
  p.strokeWeight(1);
  p.line(746, 98, 746, 160);
  strokeHex(p, C.bgDeep, 0.65);
  p.strokeWeight(1.3);
  p.line(756, 98, 756, 160);
  for (const y of [106, 146]) {
    p.noStroke();
    fillHex(p, C.brassDeep, 0.9);
    p.rect(747, y, 16, 8, 2);
    drawRivet(p, 752, y + 4, 2.2, 0.5);
  }
  p.pop();

  drawGear(p, 832, 225, 28, 12, 0.2 + clock * 0.43, 0.9, 3);
  drawGear(p, 660, 224, 42, 16, 0.6 + clock * 0.25, 0.94, 4);
  drawGear(p, 752, 180, 64, 24, 0.28 - clock * 0.18, 0.97, 6);

  // 大齿轮轴帽：压在轮毂上，补足机械层次。
  p.push();
  p.noStroke();
  fillHex(p, C.ironLight, 0.76);
  p.ellipse(752, 180, 34, 34);
  fillHex(p, C.brassDark, 0.95);
  p.ellipse(752, 180, 26, 26);
  fillHex(p, C.slot, 0.92);
  p.ellipse(752, 180, 14, 14);
  fillHex(p, C.brassLight, 0.4);
  p.ellipse(750, 178, 5, 5);
  for (let k = 0; k < 4; k++) {
    const a = k * (TAU / 4) + 0.3;
    drawRivet(p, 752 + Math.cos(a) * 10.5, 180 + Math.sin(a) * 10.5, 1.4, 0.45);
  }
  p.pop();
}

// 卡带主动轮/导轮：黄铜小轮，压住卡带。
function drawTapeSpool(p, x, y, r, angle, alpha = 1) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.noStroke();
  fillHex(p, C.slot, 0.8 * alpha);
  p.ellipse(1.6, 2, r * 2.15, r * 2.15);
  fillHex(p, C.brassDark, alpha);
  p.ellipse(0, 0, r * 2, r * 2);
  fillHex(p, C.brass, alpha);
  p.ellipse(0, 0, r * 1.56, r * 1.56);
  fillHex(p, C.brassLight, 0.22 * alpha);
  p.ellipse(-r * 0.13, -r * 0.14, r * 1.06, r * 1.06);
  p.noFill();
  strokeHex(p, C.brassLight, 0.48 * alpha);
  p.strokeWeight(1);
  p.arc(0, 0, r * 1.66, r * 1.66, Math.PI * 1.02, Math.PI * 1.56);
  strokeHex(p, C.brassDeep, 0.55 * alpha);
  p.strokeWeight(1.1);
  p.arc(0, 0, r * 1.8, r * 1.8, Math.PI * 0.08, Math.PI * 0.6);
  p.noStroke();
  fillHex(p, C.slot, 0.95 * alpha);
  p.ellipse(0, 0, r * 0.46, r * 0.46);
  fillHex(p, C.brassMid, 0.7 * alpha);
  p.ellipse(-0.7, -0.8, r * 0.16, r * 0.16);
  for (let i = 0; i < 6; i++) {
    const a = i * (TAU / 6);
    fillHex(p, C.brassDeep, 0.5 * alpha);
    p.ellipse(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.18, r * 0.18);
  }
  p.pop();
}

function digitValue(col, row, t) {
  // 最下面两行先停；随后整列停住并读出重复行。
  const settleAt = 2.02 + (5 - row) * 0.075 + col * 0.015;
  if (t >= settleAt) {
    if (row >= 4) return REPEAT_ROW[col];
    return (col * 3 + row * 7 + 2 + (col + row) % 3) % 10;
  }
  const tick = Math.floor(t * 4.6 + hash2(col, row, 17) * 11 + col * 1.7 + row * 0.9);
  return ((tick % 10) + 10) % 10;
}

function drawDigitWheel(p, cx, cy, w, h, digit, repeat) {
  p.push();
  p.translate(cx, cy);
  p.noStroke();

  // 轮鼓外框和阴影
  fillHex(p, C.bgDeep, 0.72);
  p.rect(-w * 0.5 + 1.6, -h * 0.5 + 2, w, h, 2.5);
  fillHex(p, C.brassDeep, 0.98);
  p.rect(-w * 0.5 - 1, -h * 0.5 - 1, w + 2, h + 2, 2.5);
  fillHex(p, repeat ? C.brassMid : C.brass, 0.98);
  p.rect(-w * 0.5, -h * 0.5, w, h, 2);
  fillHex(p, C.brassLight, 0.2);
  p.rect(-w * 0.5, -h * 0.5, w, 4, 2);
  fillHex(p, C.brassDark, 0.38);
  p.rect(-w * 0.5, h * 0.5 - 5, w, 5, 2);
  p.rect(-w * 0.5, -h * 0.5, 2.2, h, 1.2);
  p.rect(w * 0.5 - 2.2, -h * 0.5, 2.2, h, 1.2);

  // 轮面弧光与刻线
  p.noFill();
  strokeHex(p, C.cream, 0.18);
  p.strokeWeight(0.8);
  p.arc(0, 0, w * 0.82, h * 1.55, Math.PI * 1.05, Math.PI * 1.95);
  strokeHex(p, C.brassDeep, 0.45);
  p.line(-w * 0.32, -h * 0.5 + 4, w * 0.32, -h * 0.5 + 4);
  p.line(-w * 0.28, h * 0.5 - 4, w * 0.28, h * 0.5 - 4);

  if (repeat) {
    fillHex(p, C.emberHot, 0.06);
    p.rect(-w * 0.5 + 2, -h * 0.5 + 2, w - 4, h - 4, 1.5);
  }

  // 可读数字：先压暗影，再上奶油色
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(17);
  p.noStroke();
  fillHex(p, C.brassDeep, 0.6);
  p.text(String(digit), 0.8, 1.2);
  fillHex(p, C.cream, repeat ? 0.98 : 0.88);
  p.text(String(digit), 0, 0.4);

  // 两侧小轴头
  fillHex(p, C.brassDeep, 0.9);
  p.rect(-w * 0.5 - 3.3, -1.5, 3, 3, 1);
  p.rect(w * 0.5 + 0.3, -1.5, 3, 3, 1);
  p.pop();
}

function drawBankBase(p) {
  p.push();
  p.noStroke();
  const x = BANK.x;
  const y = BANK.y;
  const w = BANK.w;
  const h = BANK.h;

  // 落影/外壳
  fillHex(p, C.bgDeep, 0.62);
  p.rect(x + 6, y + 7, w, h, 7);
  fillHex(p, C.brassDeep, 1);
  p.rect(x - 2, y - 2, w + 4, h + 4, 7);
  fillHex(p, C.ironDeep, 1);
  p.rect(x + 3, y + 3, w - 6, h - 6, 5);
  fillHex(p, C.iron, 0.98);
  p.rect(x + 9, y + 9, w - 18, h - 18, 3);

  // 内腔压力板/暗窗
  fillHex(p, C.bgDeep, 0.67);
  p.rect(x + 18, y + 16, w - 36, h - 32, 2);
  fillHex(p, C.brassDark, 0.18);
  p.rect(x + 18, y + 16, w - 36, 4);
  fillHex(p, C.blueprint, 0.018);
  p.rect(x + 23, y + 25, w - 46, h - 48, 1);

  // 顶部与底部铜条
  fillHex(p, C.brassDark, 0.98);
  p.rect(x + 6, y + 5, w - 12, 9, 2);
  p.rect(x + 6, y + h - 14, w - 12, 9, 2);
  fillHex(p, C.brassLight, 0.46);
  p.rect(x + 10, y + 6, w - 20, 1.5);
  p.rect(x + 10, y + h - 13, w - 20, 1.2);
  fillHex(p, C.brassDeep, 0.5);
  p.rect(x + 6, y + 13, w - 12, 2);
  p.rect(x + 6, y + h - 17, w - 12, 2);

  // 四角包铜与螺栓
  for (const [cx, cy] of [[x + 15, y + 15], [x + w - 15, y + 15],
    [x + 15, y + h - 15], [x + w - 15, y + h - 15]]) {
    p.noStroke();
    fillHex(p, C.brassDark, 0.92);
    p.rect(cx - 8, cy - 8, 16, 16, 2.5);
    fillHex(p, C.brass, 0.55);
    p.rect(cx - 6, cy - 6, 12, 12, 2);
    drawRivet(p, cx, cy, 2.4, 0.6);
  }

  p.noFill();
  strokeHex(p, C.brassLight, 0.28);
  p.strokeWeight(1);
  p.rect(x + 4, y + 4, w - 8, h - 8, 5);
  strokeHex(p, C.bgDeep, 0.7);
  p.strokeWeight(1.2);
  p.rect(x + 12, y + 12, w - 24, h - 24, 3);
  p.pop();
}

function drawColumnRails(p, t) {
  const clock = t < 3 ? t : t < 4 ? 3 : t - 1;
  for (let i = 0; i < BANK.cols; i++) {
    const cx = BANK.colX0 + i * BANK.colStep;

    // 柱身铜轨：凹槽 + 亮边
    p.noStroke();
    fillHex(p, C.slot, 0.7);
    p.rect(cx - 18, 292, 36, 312, 2);
    fillHex(p, C.brassDark, 0.92);
    p.rect(cx - 16, 292, 4, 312, 1);
    p.rect(cx + 12, 292, 4, 312, 1);
    fillHex(p, C.brass, 0.65);
    p.rect(cx - 15, 292, 1.6, 312, 0.5);
    p.rect(cx + 13, 292, 1.6, 312, 0.5);
    fillHex(p, C.bgDeep, 0.46);
    p.rect(cx + 5, 538, 7, 64, 1.5);

    // 轮与轮之间的横向压条
    for (let row = 0; row < BANK.rows; row++) {
      const y = BANK.rowY0 + row * BANK.rowStep - 2.2;
      fillHex(p, C.brassDeep, 0.8);
      p.rect(cx - 17, y, 34, 1.4, 0.5);
      fillHex(p, C.brassLight, 0.14);
      p.rect(cx - 13, y + 1.2, 26, 0.7, 0.3);
      drawDigitWheel(p, cx, BANK.rowY0 + row * BANK.rowStep + BANK.wheelH / 2,
        BANK.wheelW, BANK.wheelH, digitValue(i, row, t), row >= 4 && t >= 2.35);
    }

    // 横梁以下的柱脚：短轴、油杯和一个小进位轮
    p.noStroke();
    fillHex(p, C.brassDeep, 0.9);
    p.rect(cx - 10, 548, 20, 44, 2);
    fillHex(p, C.brassDark, 0.95);
    p.ellipse(cx, 565, 17, 10);
    fillHex(p, C.creamDim, 0.24);
    p.ellipse(cx - 2, 563, 8, 3);
    drawGear(p, cx, 584, 7.5, 8, 0.4 + clock * 0.5 + i * 0.31, 0.8, 3);
  }
}

function drawCarryShaft(p, t) {
  const clock = t < 3 ? t : t < 4 ? 3 : t - 1;
  p.push();
  p.noStroke();
  // 横贯六柱的进位轴
  fillHex(p, C.bgDeep, 0.72);
  p.rect(632, 280, 278, 8, 3);
  fillHex(p, C.brassDeep, 0.98);
  p.rect(632, 278, 278, 7, 3);
  fillHex(p, C.brass, 0.9);
  p.rect(636, 279, 270, 4.5, 2);
  fillHex(p, C.brassLight, 0.52);
  p.rect(640, 279.5, 262, 1.2);

  for (let i = 0; i < BANK.cols; i++) {
    const cx = BANK.colX0 + i * BANK.colStep;
    // 轴座
    p.noStroke();
    fillHex(p, C.brassDark, 0.9);
    p.rect(cx - 6, 272, 12, 18, 2);
    drawGear(p, cx, 277, 9, 8, 0.35 + clock * 0.62 + i * 0.19, 0.98, 3);
    fillHex(p, C.slot, 0.9);
    p.ellipse(cx, 277, 4.5, 4.5);
    fillHex(p, C.ember, 0.35 + (t >= 2.5 ? 0.3 : 0));
    p.ellipse(cx, 277, 2.4, 2.4);
    drawRivet(p, cx, 291, 1.5, 0.45);
  }

  // 轴端轴承
  for (const x of [634, 908]) {
    p.noStroke();
    fillHex(p, C.ironLight, 0.95);
    p.rect(x - 6, 268, 12, 24, 3);
    fillHex(p, C.brassDark, 0.95);
    p.rect(x - 4, 271, 8, 18, 2);
    drawRivet(p, x, 280, 2, 0.6);
  }
  p.pop();
}

function drawRepeatedReadout(p, t) {
  const alpha = smoothstep(2.35, 2.72, t);
  if (alpha <= 0.01) return;
  p.push();
  p.noFill();
  strokeHex(p, C.creamDim, 0.24 * alpha);
  p.strokeWeight(0.8);
  const x0 = BANK.colX0 - 17;
  const x1 = BANK.colX0 + (BANK.cols - 1) * BANK.colStep + 17;
  const yTop = BANK.rowY0 + 4 * BANK.rowStep - 4;
  const yBottom = BANK.rowY0 + 6 * BANK.rowStep - 2;
  p.line(x0, yTop, x1, yTop);
  p.line(x0, yBottom, x1, yBottom);
  p.noStroke();
  fillHex(p, C.cream, 0.22 * alpha);
  p.rect(x0 + 18, yBottom - 0.6, x1 - x0 - 36, 1.2);
  // 左右小菱形刻度，表示“结果重复”
  for (const x of [x0 - 7, x1 + 7]) {
    fillHex(p, C.brassLight, 0.48 * alpha);
    p.push();
    p.translate(x, (yTop + yBottom) * 0.5);
    p.rotate(Math.PI / 4);
    p.rect(-2.4, -2.4, 4.8, 4.8);
    p.pop();
  }
  p.pop();
}

function drawDigitBank(p, t) {
  drawBankBase(p);
  drawColumnRails(p, t);
  drawRepeatedReadout(p, t);
  drawCarryShaft(p, t);

  // 数字柱顶部：“DIFFERENCE”铭牌式的抽象横牌，不写真实标志。
  p.push();
  p.noStroke();
  fillHex(p, C.brassDark, 0.9);
  p.rect(662, 246, 216, 9, 2);
  fillHex(p, C.brassLight, 0.3);
  p.rect(676, 247, 188, 1.2);
  for (let i = 0; i < 5; i++) {
    const x = 686 + i * 38;
    fillHex(p, C.slot, 0.45);
    p.rect(x, 249.5, 20, 2, 0.5);
  }
  p.pop();
}

// ---------- 打孔卡带 ----------

function pathSamples(points, spacing, offset = 0, closed = false) {
  const pts = closed ? [...points, points[0]] : points;
  const out = [];
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    segs.push({ a, dx, dy, len });
    total += len;
  }
  if (total <= 0.001) return out;
  let d = ((offset % spacing) + spacing) % spacing;
  while (d < total) {
    let remain = d;
    for (const s of segs) {
      if (remain <= s.len) {
        const q = remain / s.len;
        out.push({
          x: s.a[0] + s.dx * q,
          y: s.a[1] + s.dy * q,
          angle: Math.atan2(s.dy, s.dx)
        });
        break;
      }
      remain -= s.len;
    }
    d += spacing;
  }
  return out;
}

function strokePolyline(p, points, weight, color, alpha = 1) {
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  p.strokeWeight(weight);
  strokeHex(p, color, alpha);
  p.beginShape();
  for (const [x, y] of points) p.vertex(x, y);
  p.endShape();
}

function drawPunchedRibbon(p, points, alpha, closed = false, phase = 0) {
  if (alpha <= 0.008 || points.length < 2) return;
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  const strokePts = closed ? [...points, points[0]] : points;

  // 卡带落影/纸边/纸面/纤维高光
  p.push();
  p.translate(2.4, 3.2);
  strokePolyline(p, strokePts, closed ? 16 : 15, C.bgDeep, 0.36 * alpha);
  p.pop();
  strokePolyline(p, strokePts, 14, C.tapeEdge, 0.95 * alpha);
  strokePolyline(p, strokePts, 11, C.tape, 0.98 * alpha);
  strokePolyline(p, strokePts, 7.2, C.tapeShade, 0.2 * alpha);
  strokePolyline(p, strokePts, 1.2, C.cream, 0.18 * alpha);

  // 打孔：沿路径按弧长排；孔边加纤维和压痕。
  const samples = pathSamples(points, 18, 9 + phase, closed);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    p.push();
    p.translate(s.x, s.y);
    p.rotate(s.angle);
    p.noStroke();
    fillHex(p, C.hole, 0.92 * alpha);
    p.rect(-2.4, -1.8, 4.8, 3.6, 1);
    fillHex(p, C.cream, 0.22 * alpha);
    p.rect(-2.1, -1.5, 3.4, 0.7, 0.3);
    if (hash2(i, 31) > 0.58) {
      strokeHex(p, C.cream, 0.2 * alpha);
      p.strokeWeight(0.6);
      p.line(-3.6, -3.2 - hash2(i, 32) * 1.6, -4.8 - hash2(i, 33) * 2.5, -3.7);
      p.line(3.4, 2.6, 5 + hash2(i, 34) * 2.6, 3.2);
    }
    p.pop();
  }

  // 卡带上的压痕/横向折线
  p.noFill();
  strokeHex(p, C.tapeEdge, 0.2 * alpha);
  p.strokeWeight(0.6);
  const folds = pathSamples(points, 54, 23, closed);
  for (let i = 0; i < folds.length; i++) {
    const s = folds[i];
    p.push();
    p.translate(s.x, s.y);
    p.rotate(s.angle);
    p.line(-4.5, -3.4, 4.5, -3.4);
    p.pop();
  }
  p.pop();
}

function drawTapeInput(p, t) {
  const alpha = smoothstep(0.5, 1.18, t);
  if (alpha <= 0.01) return;
  const phase = (t * 10) % 18;
  const pts = [
    [-35, 438], [55, 440], [145, 442], [260, 443], [355, 441],
    [423, 437], [456, 429], [486, 416], [512, 400], [536, 383],
    [560, 371], [584, 360], [608, 349], [619, 344]
  ];

  p.push();
  drawPunchedRibbon(p, pts, alpha, false, phase);

  // 左侧喂入槽
  p.noStroke();
  fillHex(p, C.slot, 0.96);
  p.rect(0, 418, 48, 44, 4);
  fillHex(p, C.brassDeep, 0.95);
  p.rect(0, 422, 30, 36, 3);
  fillHex(p, C.brassDark, 0.95);
  p.rect(0, 426, 25, 28, 2);
  fillHex(p, C.brassLight, 0.3);
  p.rect(3, 428, 16, 1.6);
  p.rect(3, 450, 16, 1.2);
  drawRivet(p, 37, 428, 2.1, 0.55);
  drawRivet(p, 37, 452, 2.1, 0.55);

  // 双压轮和导轮
  drawTapeSpool(p, 80, 440, 17, 0.3 + t * 0.5, 0.9);
  drawTapeSpool(p, 119, 441, 11.5, -0.2 - t * 0.7, 0.9);
  drawTapeSpool(p, 520, 399, 22, 0.1 + t * 0.45, 0.94);
  drawTapeSpool(p, 590, 357, 16, -0.35 - t * 0.5, 0.9);

  // 黄铜导槽，让卡带像穿过机器而不是贴在背景上
  p.push();
  p.translate(605, 347);
  p.rotate(-0.68);
  p.noStroke();
  fillHex(p, C.slot, 0.9);
  p.rect(-7, -9, 18, 18, 3);
  fillHex(p, C.brassDark, 0.95);
  p.rect(-5, -7, 14, 14, 2);
  fillHex(p, C.brassLight, 0.34);
  p.rect(-4, -6, 2, 12, 1);
  p.pop();

  // 压轮支架/油光
  p.noFill();
  strokeHex(p, C.brassDark, 0.7);
  p.strokeWeight(2);
  p.line(80, 457, 80, 478);
  p.line(119, 452, 119, 470);
  p.strokeWeight(0.9);
  strokeHex(p, C.creamDim, 0.28);
  p.line(521, 421, 531, 434);
  p.pop();
}

function drawTapeOutput(p, t) {
  const alpha = smoothstep(0.8, 1.35, t);
  if (alpha <= 0.01) return;
  const phase = (-t * 8) % 18;
  const pts = [
    [915, 436], [946, 431], [974, 426], [1008, 420]
  ];

  p.push();
  // 右侧吐出口
  p.noStroke();
  fillHex(p, C.slot, 0.94);
  p.rect(908, 422, 22, 30, 3);
  fillHex(p, C.brassDeep, 0.95);
  p.rect(910, 425, 18, 24, 2);
  fillHex(p, C.brassDark, 0.9);
  p.rect(914, 428, 13, 18, 1.5);
  drawRivet(p, 912, 426, 1.5, 0.5);
  drawRivet(p, 912, 450, 1.5, 0.5);
  drawPunchedRibbon(p, pts, alpha, false, phase);

  // 第 3 小节：孔位长出很小的 0/1 标记，接第 7 版块的纸带。
  const bits = smoothstep(4.35, 5.1, t) * alpha;
  if (bits > 0.01) {
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(7);
    p.noStroke();
    for (let i = 0; i < 7; i++) {
      const x = 936 + i * 10;
      const y = 423 - (x - 936) * 0.09;
      fillHex(p, C.cream, 0.4 * bits);
      p.text(hash2(i, 41) > 0.46 ? '1' : '0', x, y - 8);
    }
  }

  drawTapeSpool(p, 929, 431, 9, 0.2 + t * 0.6, 0.82);
  p.pop();
}

function tapeLoopPoints(t) {
  const x = clamp(t, 0, 6) * (1000 / 6);
  const y = rackCenterY(x, t) - RACK.actorDrop;
  const cx = x;
  const cy = y + 3; // 稍微下移，保证闭环上缘不被默认路面带的横梁切掉。
  const rx = 84;
  const ry = 52;
  const tilt = -0.045;
  const pts = [];
  const count = 72;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const wobble = 1 + 0.035 * Math.sin(a * 3 + 0.7) + 0.014 * Math.sin(a * 5 - 0.4);
    const ex = Math.cos(a) * rx * wobble;
    const ey = Math.sin(a) * ry * wobble;
    pts.push([
      cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
      cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)
    ]);
  }
  return { pts, cx, cy };
}

function drawTapeLoop(p, t) {
  const alpha = smoothstep(2.34, 2.82, t) * (1 - smoothstep(4.18, 4.62, t));
  if (alpha <= 0.012) return;
  const { pts, cx, cy } = tapeLoopPoints(t);
  drawPunchedRibbon(p, pts, alpha, true, 3 + t * 4);

  // 再接一段“正在被齿轮卷回去”的短卡舌，让闭环有来路。
  const lip = [
    [cx + 54, cy - 42], [cx + 73, cy - 28], [cx + 84, cy - 6], [cx + 82, cy + 22]
  ];
  drawPunchedRibbon(p, lip, 0.82 * alpha, false, 5);

  // 黄铜卡扣：标记闭环的接缝
  p.push();
  p.translate(cx - 57, cy - 20);
  p.rotate(-0.72);
  p.noStroke();
  fillHex(p, C.bgDeep, 0.4 * alpha);
  p.rect(-6, -5, 24, 12, 2);
  fillHex(p, C.brassDark, 0.96 * alpha);
  p.rect(-7, -6, 22, 12, 2.5);
  fillHex(p, C.brass, 0.9 * alpha);
  p.rect(-5.5, -4.5, 19, 9, 2);
  fillHex(p, C.brassLight, 0.42 * alpha);
  p.rect(-4.5, -3.6, 17, 1.2);
  drawRivet(p, -1, 0, 1.7, 0.5 * alpha);
  drawRivet(p, 7, 0, 1.7, 0.5 * alpha);
  p.pop();

  // 卡带被拉紧的接触点：一点油光与暖色火花
  p.push();
  p.noStroke();
  const pull = smoothstep(2.44, 2.56, t) * (1 - smoothstep(2.66, 2.82, t));
  if (pull > 0.01) {
    fillHex(p, C.spark, 0.45 * pull);
    p.ellipse(cx + 51, cy - 35, 3.2, 2.2);
    p.ellipse(cx + 57, cy - 30, 2, 1.4);
    strokeHex(p, C.spark, 0.38 * pull);
    p.strokeWeight(0.8);
    p.line(cx + 54, cy - 38, cx + 60, cy - 43);
    p.line(cx + 48, cy - 33, cx + 51, cy - 39);
  }
  p.noStroke();
  fillHex(p, C.creamDim, 0.12 * alpha);
  p.ellipse(cx + 52, cy - 32, 17, 7);
  p.pop();
}

// ---------- 齿条轨 / 默认路面带 ----------

function rackLift(t) {
  return smoothstep(5.02, 5.9, clamp(t, 0, 6));
}

function rackCenterY(x, t) {
  const rise = smoothstep(RACK.rampX0, RACK.rampX1, clamp(x, 0, 1000));
  return RACK.y0 - RACK.drop * rackLift(t) * rise;
}

function rackAngle(x, t) {
  const x0 = clamp(x - 2, 0, 1000);
  const x1 = clamp(x + 2, 0, 1000);
  return Math.atan2(rackCenterY(x1, t) - rackCenterY(x0, t), x1 - x0);
}

function rackPoints(t, yOffset = 0) {
  const pts = [];
  for (let i = 0; i <= 100; i++) {
    const x = i * 10;
    pts.push([x, rackCenterY(x, t) + yOffset]);
  }
  return pts;
}

function drawRackTeeth(p, t) {
  p.push();
  for (let x = 10; x <= 990; x += RACK.pitch) {
    const y = rackCenterY(x, t);
    const a = rackAngle(x, t);
    p.push();
    p.translate(x, y);
    p.rotate(a);
    p.noStroke();
    // 齿根暗槽
    fillHex(p, C.bgDeep, 0.6);
    p.rect(-5.3, -RACK.half + 1, 10.6, 5, 0.8);
    // 齿身：暗底、铜面、顶部亮边
    fillHex(p, C.brassDeep, 0.9);
    p.quad(-4.8, -RACK.half + 1, 4.8, -RACK.half + 1, 2.7, -RACK.half - 5.2, -2.7, -RACK.half - 5.2);
    fillHex(p, C.brass, 0.92);
    p.quad(-4.1, -RACK.half + 0.2, 4.1, -RACK.half + 0.2, 2.3, -RACK.half - 4.2, -2.3, -RACK.half - 4.2);
    fillHex(p, C.brassLight, 0.38);
    p.rect(-2.3, -RACK.half - 4.1, 4.6, 0.9, 0.3);
    strokeHex(p, C.brassDeep, 0.6);
    p.strokeWeight(0.55);
    p.line(-4.5, -RACK.half + 0.4, 4.5, -RACK.half + 0.4);
    p.pop();
  }
  p.pop();
}

function drawRackSupports(p, t) {
  p.push();
  p.noStroke();
  for (const [x, h] of [[158, 78], [414, 64], [686, 84], [852, 58]]) {
    const y = rackCenterY(x, t);
    if (y < 620) continue;
    p.noStroke();
    fillHex(p, C.bgDeep, 0.45);
    p.rect(x - 8, y + 11, 18, h + 7, 2);
    fillHex(p, C.ironLight, 0.85);
    p.rect(x - 6, y + 12, 12, h, 2);
    fillHex(p, C.brassDark, 0.8);
    p.quad(x - 16, y + 13, x - 6, y + 13, x - 6, y + h - 4, x - 14, y + h - 12);
    p.quad(x + 6, y + 13, x + 16, y + 13, x + 14, y + h - 12, x + 6, y + h - 4);
    fillHex(p, C.iron, 1);
    p.rect(x - 22, y + h, 44, 8, 2);
    drawRivet(p, x - 14, y + 17, 1.6, 0.4);
    drawRivet(p, x + 14, y + 17, 1.6, 0.4);
  }
  p.pop();
}

function drawRack(p, t) {
  p.push();
  // 轨下阴影
  strokePolyline(p, rackPoints(t, 7), 31, C.bgDeep, 0.38);
  // 三层黄铜轨
  strokePolyline(p, rackPoints(t), 29, C.brassDeep, 0.98);
  strokePolyline(p, rackPoints(t), 25, C.brass, 0.98);
  strokePolyline(p, rackPoints(t, 3), 20, C.brassDark, 0.56);
  strokePolyline(p, rackPoints(t, -7.5), 1.5, C.brassLight, 0.4);
  strokePolyline(p, rackPoints(t, 8.2), 1.6, C.bgDeep, 0.52);
  drawRackTeeth(p, t);

  // 左端与第 5 版块滑轨的抽象接套
  p.noStroke();
  fillHex(p, C.brassDeep, 0.96);
  p.rect(0, 617, 28, 30, 3);
  fillHex(p, C.ironLight, 0.9);
  p.rect(3, 619, 18, 26, 2);
  fillHex(p, C.brassDark, 0.9);
  p.rect(7, 622, 10, 20, 2);
  drawRivet(p, 14, 626, 1.8, 0.55);
  drawRivet(p, 14, 638, 1.8, 0.55);

  // 末端抬升到 y≈500，接第 7 版块纸带；用黄铜夹口收边。
  const endX = 998;
  const endY = rackCenterY(endX, t);
  p.push();
  p.translate(endX, endY);
  p.rotate(rackAngle(endX, t));
  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.rect(-18, -16, 25, 32, 3);
  fillHex(p, C.brass, 0.98);
  p.rect(-15, -13, 19, 26, 2);
  fillHex(p, C.brassLight, 0.45);
  p.rect(-13, -11, 15, 1.4);
  p.noFill();
  strokeHex(p, C.creamDim, 0.36);
  p.strokeWeight(0.9);
  p.line(-11, -15, 7, -15);
  p.line(-11, 15, 7, 15);
  p.pop();

  drawRackSupports(p, t);
  p.pop();
}

function drawBeamBand(p, t) {
  p.push();
  p.noStroke();

  // 完全覆盖默认路面带 y=470..530；往下多 2px 防止接缝漏边。
  fillHex(p, C.ironDeep, 1);
  p.rect(0, 468, 1000, 64);
  fillHex(p, C.iron, 1);
  p.rect(0, 471, 1000, 58);
  fillHex(p, C.ironLight, 0.3);
  p.rect(0, 473, 1000, 10);
  fillHex(p, C.bgDeep, 0.24);
  p.rect(0, 511, 1000, 16);

  // 上下铜轧条
  fillHex(p, C.brassDeep, 1);
  p.rect(0, 469, 1000, 3.2);
  p.rect(0, 527.8, 1000, 3.2);
  fillHex(p, C.brassDark, 0.94);
  p.rect(0, 472, 1000, 4.5);
  p.rect(0, 523.5, 1000, 4.5);
  fillHex(p, C.brassLight, 0.38);
  p.rect(0, 470.2, 1000, 1.1);
  p.rect(0, 529.8, 1000, 0.8);

  // 中间凹槽和加强肋
  fillHex(p, C.bgDeep, 0.45);
  p.rect(0, 481, 1000, 37);
  fillHex(p, C.ironEdge, 0.5);
  p.rect(0, 481, 1000, 1.2);
  fillHex(p, C.bgDeep, 0.5);
  p.rect(0, 517, 1000, 1.5);
  for (let x = 42; x < 1000; x += 84) {
    fillHex(p, C.ironLight, 0.3);
    p.rect(x, 482, 2, 35, 0.5);
    fillHex(p, C.bgDeep, 0.3);
    p.rect(x + 2, 482, 1.2, 35, 0.5);
  }

  // 板缝
  for (const x of [216, 402, 716, 848]) {
    fillHex(p, C.bgDeep, 0.58);
    p.rect(x, 470, 2.4, 60);
    fillHex(p, C.ironLight, 0.22);
    p.rect(x + 2.4, 472, 1, 56);
  }

  // 让数字柱穿过横梁的铜导套
  for (let i = 0; i < BANK.cols; i++) {
    const cx = BANK.colX0 + i * BANK.colStep;
    fillHex(p, C.slot, 0.9);
    p.rect(cx - 9, 470, 18, 60);
    fillHex(p, C.brassDeep, 0.92);
    p.rect(cx - 7, 470, 14, 60);
    fillHex(p, C.brass, 0.72);
    p.rect(cx - 5, 471, 10, 58);
    fillHex(p, C.brassLight, 0.3);
    p.rect(cx - 3.8, 472, 1.3, 56);
    fillHex(p, C.brassDark, 0.9);
    p.ellipse(cx, 497, 23, 9);
    fillHex(p, C.brass, 0.8);
    p.ellipse(cx, 497, 17, 6);
    fillHex(p, C.slot, 0.72);
    p.ellipse(cx, 497, 8, 3);
  }

  // 铆钉排
  for (let x = 30; x < 1000; x += 58) {
    if (x > 620 && x < 925) continue;
    p.noStroke();
    drawRivet(p, x, 478.5, 1.8, 0.42);
    drawRivet(p, x, 521.5, 1.8, 0.36);
  }

  // 右侧开口：齿条最终从这里上抬，进入第 7 版块
  p.noStroke();
  fillHex(p, C.bgDeep, 1);
  p.rect(918, 470, 82, 60);
  fillHex(p, C.slot, 0.96);
  p.rect(923, 474, 77, 52, 3);

  // 开口里的升降卷筒/斜导轨：平时待命，结尾把齿条托上 y≈500。
  p.noFill();
  strokeHex(p, C.brassDeep, 0.8);
  p.strokeWeight(3.4);
  p.line(923, 523, 989, 478);
  strokeHex(p, C.brassLight, 0.22);
  p.strokeWeight(0.9);
  p.line(924, 520, 987, 477);
  p.noStroke();
  fillHex(p, C.bgDeep, 0.76);
  p.ellipse(960, 501, 52, 42);
  fillHex(p, C.brassDeep, 0.92);
  p.ellipse(960, 501, 45, 35);
  fillHex(p, C.brass, 0.8);
  p.ellipse(960, 500, 36, 27);
  fillHex(p, C.ironLight, 0.3);
  p.ellipse(958, 498, 24, 16);
  fillHex(p, C.slot, 0.9);
  p.ellipse(960, 500, 10, 8);
  for (let k = 0; k < 8; k++) {
    const a = k * (TAU / 8) + 0.2;
    fillHex(p, C.brassDark, 0.85);
    p.ellipse(960 + Math.cos(a) * 20, 500 + Math.sin(a) * 14, 5, 3.6);
  }

  p.noFill();
  strokeHex(p, C.brassDark, 0.9);
  p.strokeWeight(1.5);
  p.rect(918, 470, 82, 60, 2);
  strokeHex(p, C.brassLight, 0.24);
  p.strokeWeight(0.8);
  p.line(921, 472, 997, 472);
  p.line(921, 528, 997, 528);

  p.pop();
}

// ---------- 蒸汽 ----------

function drawSeamSteam(p, t) {
  const hold = Math.min(t, 3);
  const fade = 1 - smoothstep(4.1, 4.9, t);
  const puffs = [
    [756, 248, 0, 12],
    [622, 342, 1, 9],
    [910, 558, 2, 8],
    [336, 586, 3, 7],
    [885, 300, 4, 8]
  ];
  p.push();
  p.noStroke();
  for (const [x, y, seed, base] of puffs) {
    const birth = 2.2 + hash2(seed, 51) * 0.42;
    const age = hold - birth;
    if (age <= 0) continue;
    const u = clamp(age / 0.95, 0, 1);
    const lift = u * (18 + hash2(seed, 52) * 22);
    const wobble = Math.sin(u * 2.8 + seed * 1.7) * 5 + hash2(seed, 53) * 4;
    fillHex(p, C.steam, (0.1 * (1 - u * 0.62)) * fade);
    p.ellipse(x + wobble, y - lift, base * 2.1 + u * 18, base * 1.2 + u * 9);
    fillHex(p, C.creamDim, (0.045 * (1 - u * 0.8)) * fade);
    p.ellipse(x + wobble - 3, y - lift - 2, base * 1.05 + u * 9, base * 0.62 + u * 5);
  }
  p.pop();
}

// ---------- 主角：带卡舌片的黄铜齿轮 ----------

function drawActorTag(p) {
  const a = -2.34;
  p.push();
  p.rotate(0);
  // 标签卡片从齿轮左上侧伸出，不跟着轮齿乱转，读得清是“读卡的小齿轮”。
  p.push();
  p.rotate(a);
  p.translate(16, 0);
  p.noStroke();
  fillHex(p, C.bgDeep, 0.55);
  p.rect(2, -8, 42, 18, 3);
  fillHex(p, C.tapeEdge, 0.96);
  p.rect(0, -9, 42, 18, 3);
  fillHex(p, C.tape, 1);
  p.rect(1.8, -7.2, 38.4, 14.4, 2);
  fillHex(p, C.cream, 0.24);
  p.rect(5, -6, 29, 1.2, 0.4);
  fillHex(p, C.tapeShade, 0.35);
  p.rect(5, 5.6, 28, 1, 0.4);
  // 孔位
  fillHex(p, C.hole, 0.88);
  p.rect(9, -1.6, 4.6, 3.2, 1);
  p.rect(25, -1.6, 4.6, 3.2, 1);
  fillHex(p, C.cream, 0.2);
  p.rect(9.4, -1.2, 3.2, 0.6);
  // 纸边纤维
  strokeHex(p, C.cream, 0.28);
  p.strokeWeight(0.6);
  p.line(34, -7.8, 39, -7.2);
  p.line(33, 6.8, 37, 7.3);
  // 卡舌根部的黄铜夹
  p.noStroke();
  fillHex(p, C.brassDeep, 0.95);
  p.rect(-3, -6, 9, 12, 2);
  fillHex(p, C.brass, 0.9);
  p.rect(-1, -4.5, 6, 9, 1.5);
  drawRivet(p, 1.4, 0, 1.4, 0.48);
  p.pop();
  p.pop();
}

function drawActorGear(p, worldX, localX, t) {
  const rackY = rackCenterY(localX, t);
  const cy = rackY - RACK.actorDrop;
  const tug = smoothstep(2.46, 2.56, t) * (1 - smoothstep(2.7, 2.85, t));
  const roll = localX / 26 - 0.14 * tug;
  const hold = Math.min(t, 3);

  p.push();
  p.translate(worldX, cy);

  // 轨面上的接触光/影子
  p.noStroke();
  fillHex(p, C.bgDeep, 0.4);
  p.ellipse(5, 31, 68, 13);
  fillHex(p, C.ember, 0.08);
  p.ellipse(-2, 27, 54, 10);
  strokeHex(p, C.cream, 0.17);
  p.strokeWeight(0.9);
  p.line(-17, 28, 17, 28);

  drawActorTag(p);

  p.push();
  p.rotate(roll);
  p.noStroke();

  // 深色齿底 + 黄铜轮体
  fillHex(p, C.bgDeep, 0.95);
  gearRingPath(p, 28.2, 12);
  fillHex(p, C.brassDeep, 1);
  gearRingPath(p, 26.8, 12);
  fillHex(p, C.brassDark, 1);
  gearRingPath(p, 26, 12);
  fillHex(p, C.brass, 0.98);
  p.ellipse(-0.8, -0.8, 37, 37);
  fillHex(p, C.brassLight, 0.22);
  p.ellipse(-5, -6, 23, 23);

  // 轮辐
  strokeHex(p, C.brassDeep, 0.62);
  p.strokeWeight(2.2);
  for (let k = 0; k < 5; k++) {
    const a = k * (TAU / 5) + 0.2;
    p.line(Math.cos(a) * 7, Math.sin(a) * 7, Math.cos(a) * 17, Math.sin(a) * 17);
  }

  // 深色轮缘与内盘
  p.noFill();
  strokeHex(p, C.brassDeep, 0.72);
  p.strokeWeight(2);
  p.ellipse(0, 0, 43, 43);
  strokeHex(p, C.brassLight, 0.55);
  p.strokeWeight(1.2);
  p.arc(0, 0, 33, 33, Math.PI * 1.03, Math.PI * 1.6);
  strokeHex(p, C.brassDeep, 0.58);
  p.strokeWeight(1.1);
  p.arc(0, 0, 37, 37, Math.PI * 0.06, Math.PI * 0.56);

  // 中心火种：与第 4/5 版块同一颗暖赭火种
  p.noStroke();
  fillHex(p, C.slot, 1);
  p.ellipse(0, 0, 18, 18);
  fillHex(p, C.ember, 0.52);
  p.ellipse(0, 0, 14.5, 14.5);
  fillHex(p, C.emberHot, 0.96);
  p.ellipse(-0.7, -0.9, 7.5, 7.5);
  fillHex(p, C.emberCore, 1);
  p.ellipse(-1.1, -1.2, 2.8, 2.8);
  p.noFill();
  strokeHex(p, C.emberHot, 0.3 + (t >= 2.4 && t < 3 ? 0.12 : 0));
  p.strokeWeight(1);
  p.ellipse(0, 0, 20, 20);

  // 齿尖的小高光，保证 12 齿读得出来
  p.noStroke();
  for (let i = 0; i < 12; i++) {
    const a = i * (TAU / 12) + 0.12;
    fillHex(p, C.brassLight, 0.4);
    p.ellipse(Math.cos(a) * 26.4, Math.sin(a) * 26.4, 2.8, 1.3);
  }
  p.pop();

  // 与齿条接触的油光/火花
  const heat = 0.16 + Math.min(hold, 3) * 0.015;
  p.noStroke();
  fillHex(p, C.creamDim, heat);
  p.ellipse(2, 27, 20, 4);
  fillHex(p, C.spark, 0.12 + 0.1 * (t >= 2.5 ? 1 : 0));
  p.ellipse(-1, 26.5, 4.5, 2.4);

  // 卡带拉紧时的轻微蒸汽
  const steamFade = 1 - smoothstep(4.0, 4.8, t);
  for (let i = 0; i < 3; i++) {
    const birth = 2.5 + i * 0.06;
    const age = hold - birth;
    if (age <= 0) continue;
    const u = clamp(age / 0.56, 0, 1);
    fillHex(p, C.steam, 0.11 * (1 - u * 0.65) * steamFade);
    p.ellipse(-20 + i * 13 + u * 7, -31 - u * 16, 12 + u * 12, 6 + u * 7);
  }

  p.pop();
}

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  p.push();
  p.noStroke();
  fillHex(p, '#f3e3bc', 0.72 * alpha);
  p.rect(x - 93, y - 10, 186, 20, 2);
  p.noFill();
  strokeHex(p, C.brassLight, 0.44 * alpha);
  p.strokeWeight(1);
  p.rect(x - 93, y - 10, 186, 20, 2);
  p.pop();
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();

    drawBackdrop(p);
    drawGearTrain(p, t);
    drawDigitBank(p, t);
    drawTapeInput(p, t);
    drawTapeOutput(p, t);
    drawSeamSteam(p, t);

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
    drawBeamBand(p, t);
    drawRack(p, t);
    // 闭环画在齿条之后、主角之前：卡带完整绕在齿轮外，不被横梁或齿条切断。
    drawTapeLoop(p, t);
    p.pop();
  },

  drawActor(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const origin = (state.blockIndex - 1) * 1000;
    const localX = clamp(state.x - origin, 0, 1000);
    p.push();
    // 直接吃世界坐标 state.x；局部坐标只用于齿条高度和轮转角。
    drawActorGear(p, state.x, localX, t);
    p.pop();
  }
};
