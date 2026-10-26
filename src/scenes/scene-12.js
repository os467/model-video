import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 12 统计学习：1990s 统计实验台 + 概率代币 + 样本纸带。
// 静态重点：localT≈1.5（标题、CRT/散点图、纸带进场）与
// localT≈3.0（过拟合曲线穿过全部训练点、测试点落下、曲线打结、约 1s 定格）。
const TAU = Math.PI * 2;
const ROAD_TOP = 470;
const ROAD_BOTTOM = 530;
const ROAD_MID = 500;

const META = {
  id: 12,
  cn: '统计学习',
  en: 'Statistical Learning',
  era: '1990s',
  group: 'electronic'
};

const C = {
  bg: '#061614',
  bgDeep: '#030d0b',
  bgLow: '#071b16',
  wall: '#0a211b',
  wallDark: '#061612',
  wallLight: '#143c30',
  cabinet: '#0b251e',
  cabinetLight: '#174438',
  cabinetDeep: '#050f0c',
  teal: '#123c32',
  edge: '#23584a',
  mint: '#86e0be',
  mintPale: '#dcf8e8',
  phosphor: '#b4ffdf',
  ink: '#d7ffe9',
  cream: '#f0dfb8',
  creamDim: '#cdbb95',
  brassDeep: '#3d2915',
  brassDark: '#6a4824',
  brass: '#b8863c',
  brassLight: '#e3b56f',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa',
  red: '#c05a46',
  redDim: '#72372b',
  glass: '#03100c',
  desk: '#081e19',
  deskTop: '#0d2c24',
  paper: '#cdbf96',
  paperLight: '#efe3bd',
  paperDark: '#8a7c58',
  paperInk: '#2a4f40',
  dataBlue: '#63dfff',
  dataDeep: '#1a2750',
  dataBg: '#060a16'
};

// 主 CRT（散点图）与右下笔式绘图仪。
const CRT = { x: 512, y: 230, w: 430, h: 376 };
const SCREEN = { x: 548, y: 258, w: 358, h: 208 };
const PLOT = { x: 586, y: 280, w: 298, h: 150 };
const PLOTTER = { x: 636, y: 596, w: 308, h: 156 };
const HIST = { x: 654, y: 612, w: 272, h: 124 };

// 训练样本（归一化坐标，y 向上）。前 6 个之后加入一个深凹的噪声点，
// 让过拟合曲线在测试点附近明显下潜，测试点才能落在两条曲线之间。
const TRAIN = [
  { x: 0.06, y: 0.2, kind: 0 },
  { x: 0.16, y: 0.37, kind: 1 },
  { x: 0.27, y: 0.28, kind: 0 },
  { x: 0.38, y: 0.48, kind: 1 },
  { x: 0.47, y: 0.4, kind: 0 },
  { x: 0.57, y: 0.6, kind: 1 },
  { x: 0.66, y: 0.33, kind: 0 },
  { x: 0.75, y: 0.7, kind: 1 },
  { x: 0.85, y: 0.62, kind: 0 },
  { x: 0.94, y: 0.8, kind: 1 }
];

const TEST = { x: 0.64, y: 0.53 };

function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

// 屏幕内的散点图坐标。
function nx(v) {
  return PLOT.x + v * PLOT.w;
}
function ny(v) {
  return PLOT.y + (1 - v) * PLOT.h;
}

// 简单模型：一条很稳的缓升曲线，在测试点上方经过。
function smoothY(x) {
  return 0.2 + 0.52 * x + 0.06 * Math.sin(Math.PI * x);
}

function catmullRomY(y0, y1, y2, y3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * y1 +
      (-y0 + y2) * u +
      (2 * y0 - 5 * y1 + 4 * y2 - y3) * u2 +
      (-y0 + 3 * y1 - 3 * y2 + y3) * u3)
  );
}

// 端点为“简单模型”的延长线，中间严格穿过所有训练点。
const FIT_POINTS = [
  { x: 0.012, y: smoothY(0.012) },
  ...TRAIN,
  { x: 0.988, y: smoothY(0.988) }
];

const CURVE_XS = (() => {
  const set = new Set();
  for (let i = 0; i <= 150; i++) {
    set.add(Number((0.012 + (0.976 * i) / 150).toFixed(6)));
  }
  for (const p of TRAIN) set.add(p.x);
  return [...set].sort((a, b) => a - b);
})();

// Catmull-Rom 逐段求值；训练点处 u=0/1，扰动为零，保证曲线真的过点。
function fitYAt(x) {
  const pts = FIT_POINTS;
  let seg = 0;
  while (seg < pts.length - 2 && x > pts[seg + 1].x) seg++;
  const p0 = pts[Math.max(0, seg - 1)];
  const p1 = pts[seg];
  const p2 = pts[seg + 1];
  const p3 = pts[Math.min(pts.length - 1, seg + 2)];
  const u = clamp((x - p1.x) / Math.max(1e-6, p2.x - p1.x), 0, 1);
  const tremor = 0.011 * Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI);
  return clamp(catmullRomY(p0.y, p1.y, p2.y, p3.y, u) + tremor, 0.03, 0.97);
}

function blendedY(x, flex) {
  return smoothY(x) * (1 - flex) + fitYAt(x) * flex;
}

// ---------- 确定性预生成 ----------

const DUST = (() => {
  const rng = mulberry32(0x12c0de);
  const list = [];
  for (let i = 0; i < 118; i++) {
    list.push({
      x: rng() * 1000,
      y: 200 + rng() * 560,
      r: 0.5 + rng() * 1.4,
      a: 0.018 + rng() * 0.042,
      light: rng() > 0.64
    });
  }
  return list;
})();

// 纸带齿孔：上下两排供带孔，加一排稀疏数据孔。
const TAPE_HOLES = (() => {
  const list = [];
  for (let x = 8; x < 996; x += 12.5) {
    list.push({ x, y: 481, r: 1.05, a: 0.8 });
    list.push({ x, y: 519, r: 1.05, a: 0.8 });
  }
  for (let x = 17; x < 990; x += 13.5) {
    if (hash2(Math.floor(x), 3, 121) < 0.54) continue;
    list.push({ x, y: 514, r: 0.82, a: 0.72 });
  }
  return list;
})();

// 纸带上的样本点与 0/1 标签。
const TAPE_SAMPLES = (() => {
  const rng = mulberry32(0x5a3e11);
  const list = [];
  for (let i = 0; i < 24; i++) {
    list.push({
      x: 22 + i * 41.2,
      y: 489 + rng() * 8,
      bit: rng() > 0.5 ? '1' : '0',
      warm: rng() > 0.7,
      r: 1.55 + rng() * 0.95
    });
  }
  return list;
})();

const HIST_BARS = (() => {
  const base = [0.08, 0.16, 0.3, 0.52, 0.74, 0.92, 0.84, 0.64, 0.44, 0.54, 0.32, 0.16];
  return base.map((h, i) => ({
    h: clamp(h + (hash2(i, 7, 201) - 0.5) * 0.05, 0.05, 0.98),
    warm: i === 9
  }));
})();

const CARD_STACKS = [
  { x: 266, y: 692, rot: -0.04, count: 8, w: 96, h: 40, seed: 201 },
  { x: 352, y: 718, rot: 0.025, count: 6, w: 92, h: 38, seed: 202 },
  { x: 426, y: 668, rot: -0.055, count: 5, w: 88, h: 36, seed: 203 }
];

// ---------- 通用绘制小件 ----------

function linearWash(p, x0, y0, x1, y1, stops, x, y, w, h) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function screenWash(p, alpha) {
  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
  ctx.clip();
  const grad = ctx.createRadialGradient(
    SCREEN.x + SCREEN.w * 0.42,
    SCREEN.y + SCREEN.h * 0.46,
    8,
    SCREEN.x + SCREEN.w * 0.46,
    SCREEN.y + SCREEN.h * 0.48,
    SCREEN.w * 0.74
  );
  grad.addColorStop(0, `rgba(58, 214, 158, ${0.11 * alpha})`);
  grad.addColorStop(0.52, `rgba(22, 116, 86, ${0.045 * alpha})`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
  ctx.restore();
}

function panel(p, x, y, w, h, r, fill, alpha, edge, edgeAlpha, weight = 1) {
  p.push();
  p.noStroke();
  fillHex(p, fill, alpha);
  p.rect(x, y, w, h, r);
  if (edge && edgeAlpha > 0.002) {
    p.noFill();
    strokeHex(p, edge, edgeAlpha);
    p.strokeWeight(weight);
    p.rect(x, y, w, h, r);
  }
  p.pop();
}

function screw(p, x, y, r = 2.4) {
  p.push();
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.9);
  p.ellipse(x + 0.6, y + 0.7, r * 2.1, r * 2.1);
  fillHex(p, C.brassDark, 0.72);
  p.ellipse(x, y, r * 2, r * 2);
  fillHex(p, C.brassLight, 0.32);
  p.ellipse(x - 0.7, y - 0.7, r * 0.9, r * 0.7);
  strokeHex(p, C.brassDeep, 0.75);
  p.strokeWeight(0.7);
  p.line(x - r * 0.55, y, x + r * 0.55, y);
  p.pop();
}

function polyline(p, pts) {
  p.beginShape();
  for (const [x, y] of pts) p.vertex(x, y);
  p.endShape();
}

function strokePolyline(p, pts, color, alpha, weight) {
  if (alpha <= 0.002 || pts.length < 2) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  polyline(p, pts);
  p.pop();
}

// 折线虚线：逐段推进 dash/gap，手动画短线，不用 ctx.setLineDash。
function strokeDashedPolyline(p, pts, dash, gap, color, alpha, weight) {
  if (alpha <= 0.002 || pts.length < 2) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  let on = true;
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const ux = dx / len;
    const uy = dy / len;
    let d = 0;
    while (d < len - 1e-4) {
      const target = on ? dash : gap;
      const step = Math.min(target - carry, len - d);
      if (on && step > 0.01) {
        p.line(x0 + ux * d, y0 + uy * d, x0 + ux * (d + step), y0 + uy * (d + step));
      }
      d += step;
      carry += step;
      if (carry >= target - 1e-4) {
        carry = 0;
        on = !on;
      }
      if (step <= 1e-4) break;
    }
  }
  p.pop();
}

function drawCable(p, x0, y0, x1, y1, sag, color, alpha, weight) {
  p.push();
  p.noFill();
  strokeHex(p, C.bgDeep, alpha * 0.9);
  p.strokeWeight(weight + 1.8);
  p.beginShape();
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const v = 1 - u;
    const x = v * v * x0 + 2 * v * u * ((x0 + x1) * 0.5) + u * u * x1;
    const y = v * v * y0 + 2 * v * u * (Math.max(y0, y1) + sag) + u * u * y1;
    p.vertex(x, y);
  }
  p.endShape();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const v = 1 - u;
    const x = v * v * x0 + 2 * v * u * ((x0 + x1) * 0.5) + u * u * x1;
    const y = v * v * y0 + 2 * v * u * (Math.max(y0, y1) + sag) + u * u * y1;
    p.vertex(x, y);
  }
  p.endShape();
  p.pop();
}

// ---------- 墙面 / 桌面 ----------

function drawWallChart(p) {
  p.push();
  p.translate(96, 362);
  p.rotate(-0.035);
  p.noStroke();
  fillHex(p, C.bgDeep, 0.42);
  p.rect(-49, -66, 98, 132, 2);
  fillHex(p, '#c9bd97', 0.66);
  p.rect(-50, -68, 96, 130, 1.5);
  fillHex(p, '#ded2ad', 0.2);
  p.rect(-46, -64, 88, 122, 1);

  // 纸上的钟形曲线和几个样本点，手绘感，不是软件截图。
  strokeHex(p, '#3d5a49', 0.46);
  p.strokeWeight(1);
  p.beginShape();
  for (let i = 0; i <= 22; i++) {
    const x = -38 + (76 * i) / 22;
    const y = 22 - 34 * Math.exp(-(x * x) / (2 * 13 * 13));
    p.vertex(x, y);
  }
  p.endShape();
  strokeHex(p, '#3d5a49', 0.2);
  p.strokeWeight(0.6);
  p.line(-38, 23, 38, 23);
  p.noStroke();
  for (let i = 0; i < 8; i++) {
    fillHex(p, i % 3 === 0 ? C.ember : '#3d5a49', 0.35);
    p.ellipse(-31 + i * 9, 29 - (i % 3) * 2.5, 1.8, 1.8);
  }
  // 胶带角
  fillHex(p, '#e6dcb6', 0.3);
  p.rect(-58, -77, 26, 9, 1);
  p.rect(33, 58, 26, 9, 1);
  p.pop();
}

function drawRoom(p, t) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  linearWash(
    p,
    0,
    180,
    0,
    820,
    [
      [0, 'rgba(2,9,8,0.55)'],
      [0.28, 'rgba(4,20,17,0.06)'],
      [0.7, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,4,3,0.58)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 墙面竖向拼板与接缝。
  for (let x = 34; x < 1000; x += 118) {
    strokeHex(p, C.wallLight, 0.045);
    p.strokeWeight(1);
    p.line(x, 206, x, 590);
    strokeHex(p, C.bgDeep, 0.18);
    p.line(x + 3, 206, x + 3, 590);
  }
  strokeHex(p, C.wallLight, 0.05);
  p.strokeWeight(1);
  p.line(0, 252, 1000, 252);
  strokeHex(p, C.bgDeep, 0.2);
  p.line(0, 255, 1000, 255);
  strokeHex(p, C.wallLight, 0.04);
  p.line(0, 566, 1000, 566);

  // 右侧墙面的荧光绿示波器网格，只在设备后方，标题区不铺。
  p.strokeWeight(0.7);
  for (let x = 476; x <= 990; x += 24) {
    strokeHex(p, C.mint, (x - 476) % 120 === 0 ? 0.055 : 0.024);
    p.line(x, 214, x, 470);
  }
  for (let y = 214; y <= 470; y += 24) {
    strokeHex(p, C.mint, (y - 214) % 120 === 0 ? 0.055 : 0.024);
    p.line(476, y, 990, y);
  }
  p.noFill();
  strokeHex(p, C.edge, 0.16);
  p.strokeWeight(1);
  p.rect(476, 214, 514, 256, 2);

  drawWallChart(p);

  // 空气里的尘埃，不是代码雨。
  p.noStroke();
  for (const d of DUST) {
    fillHex(p, d.light ? C.mint : C.creamDim, d.a);
    p.ellipse(d.x, d.y, d.r, d.r);
  }

  // 桌面：上沿一条暗青反光，下面是大面积桌体。
  fillHex(p, C.desk, 1);
  p.rect(0, 588, 1000, 412);
  fillHex(p, C.deskTop, 0.92);
  p.rect(0, 584, 1000, 20);
  fillHex(p, C.wallLight, 0.08);
  p.rect(0, 584, 1000, 2);
  fillHex(p, C.bgDeep, 0.38);
  p.rect(0, 604, 1000, 18);

  for (let i = 0; i < 34; i++) {
    const y = 620 + i * 11;
    strokeHex(p, i % 3 === 0 ? C.edge : C.brassDark, 0.03);
    p.strokeWeight(0.8);
    p.line(0, y, 1000, y + (hash2(i, 1, 71) - 0.5) * 4);
  }

  // 屏幕/绘图仪在桌面上的低 alpha 反光。
  p.noStroke();
  fillHex(p, C.mint, 0.018);
  p.ellipse(744, 640, 430, 48);
  fillHex(p, C.ember, 0.011);
  p.ellipse(660, 692, 250, 38);
  fillHex(p, C.cream, 0.01);
  p.ellipse(340, 642, 260, 22);

  p.pop();
}

// ---------- CRT 外壳 / 屏幕 ----------

function drawCrtShell(p) {
  const { x, y, w, h } = CRT;
  p.push();
  p.noStroke();

  fillHex(p, C.bgDeep, 0.62);
  p.rect(x + 10, y + 14, w, h, 12);
  fillHex(p, C.cabinetDeep, 1);
  p.rect(x, y, w, h, 12);
  fillHex(p, C.cabinet, 0.98);
  p.rect(x + 5, y + 5, w - 10, h - 10, 9);
  fillHex(p, C.wallLight, 0.06);
  p.rect(x + 12, y + 9, w - 24, 7, 4);

  fillHex(p, C.cabinetLight, 0.18);
  p.rect(x + 12, y + 24, 5, h - 48);
  fillHex(p, C.cabinetDeep, 0.46);
  p.rect(x + w - 17, y + 24, 5, h - 48);

  strokeHex(p, C.brassDark, 0.4);
  p.strokeWeight(1.1);
  p.line(x + 28, y + 18, x + 192, y + 18);
  p.line(x + w - 202, y + 18, x + w - 28, y + 18);

  // 屏幕凹槽
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.98);
  p.rect(SCREEN.x - 16, SCREEN.y - 14, SCREEN.w + 32, SCREEN.h + 28, 8);
  strokeHex(p, C.edge, 0.3);
  p.strokeWeight(1.1);
  p.noFill();
  p.rect(SCREEN.x - 16, SCREEN.y - 14, SCREEN.w + 32, SCREEN.h + 28, 8);

  // 屏幕以上铭牌
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(x + 274, y + 17, 122, 7, 2);
  fillHex(p, C.brassDark, 0.5);
  p.rect(x + 280, y + 19, 64, 1.1);
  fillHex(p, C.mint, 0.24);
  p.rect(x + 350, y + 19, 12, 1.1);
  fillHex(p, C.emberHot, 0.7);
  p.ellipse(x + w - 32, y + 16, 3.2, 3.2);
  fillHex(p, C.ember, 0.08);
  p.ellipse(x + w - 32, y + 16, 12, 12);

  // 屏幕以下、纸带以上的旋钮/通风带。
  fillHex(p, C.cabinetDeep, 0.82);
  p.rect(x + 28, y + h - 68, w - 56, 24, 2);
  for (let i = 0; i < 4; i++) {
    const kx = x + 62 + i * 62;
    const ky = y + h - 56;
    p.noStroke();
    fillHex(p, C.bgDeep, 0.5);
    p.ellipse(kx + 1.5, ky + 2, 20, 20);
    fillHex(p, C.cabinetLight, 0.72);
    p.ellipse(kx, ky, 18, 18);
    strokeHex(p, C.brassDark, 0.45);
    p.strokeWeight(0.8);
    p.ellipse(kx, ky, 13, 13);
    const a = -0.9 + i * 0.55;
    strokeHex(p, C.creamDim, 0.42);
    p.strokeWeight(1);
    p.line(kx, ky, kx + Math.cos(a) * 6, ky + Math.sin(a) * 6);
  }
  p.noStroke();
  for (let i = 0; i < 10; i++) {
    fillHex(p, C.cabinetDeep, 0.6);
    p.rect(x + 54 + i * 9, y + h - 22, 5, 1.4);
  }

  for (const [sx, sy] of [
    [x + 15, y + 15],
    [x + w - 15, y + 15],
    [x + 15, y + h - 15],
    [x + w - 15, y + h - 15]
  ]) {
    screw(p, sx, sy, 2.4);
  }

  // 底座
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(x + 22, y + h, 44, 6, 2);
  p.rect(x + w - 66, y + h, 44, 6, 2);
  p.pop();
}

function drawScreenGlass(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.glass, 1);
  p.rect(SCREEN.x + 1, SCREEN.y + 1, SCREEN.w - 2, SCREEN.h - 2, 5);
  screenWash(p, 1);

  // 屏幕细网格
  p.strokeWeight(0.6);
  for (let x = SCREEN.x + 22; x < SCREEN.x + SCREEN.w - 8; x += 22) {
    strokeHex(p, C.mint, 0.028);
    p.line(x, SCREEN.y + 4, x, SCREEN.y + SCREEN.h - 4);
  }
  for (let y = SCREEN.y + 22; y < SCREEN.y + SCREEN.h - 8; y += 22) {
    strokeHex(p, C.mint, 0.028);
    p.line(SCREEN.x + 4, y, SCREEN.x + SCREEN.w - 4, y);
  }
  p.pop();
}

function drawScreenFinish(p) {
  p.push();
  p.noStroke();

  // 扫描线
  p.strokeWeight(0.8);
  for (let y = SCREEN.y + 4; y < SCREEN.y + SCREEN.h - 3; y += 3.4) {
    strokeHex(p, C.phosphor, 0.024);
    p.line(SCREEN.x + 2, y, SCREEN.x + SCREEN.w - 2, y);
  }

  // 玻璃反光
  p.noStroke();
  fillHex(p, C.cream, 0.016);
  p.beginShape();
  p.vertex(SCREEN.x + 34, SCREEN.y);
  p.vertex(SCREEN.x + 110, SCREEN.y);
  p.vertex(SCREEN.x + 41, SCREEN.y + SCREEN.h);
  p.vertex(SCREEN.x + 6, SCREEN.y + SCREEN.h);
  p.endShape(p.CLOSE);
  fillHex(p, C.mint, 0.014);
  p.beginShape();
  p.vertex(SCREEN.x + 290, SCREEN.y);
  p.vertex(SCREEN.x + 328, SCREEN.y);
  p.vertex(SCREEN.x + 252, SCREEN.y + SCREEN.h);
  p.vertex(SCREEN.x + 220, SCREEN.y + SCREEN.h);
  p.endShape(p.CLOSE);

  // 四角余辉
  p.noFill();
  strokeHex(p, C.mint, 0.16);
  p.strokeWeight(1);
  p.line(SCREEN.x + 10, SCREEN.y + 10, SCREEN.x + 28, SCREEN.y + 10);
  p.line(SCREEN.x + 10, SCREEN.y + 10, SCREEN.x + 10, SCREEN.y + 26);
  p.line(SCREEN.x + SCREEN.w - 10, SCREEN.y + SCREEN.h - 10, SCREEN.x + SCREEN.w - 30, SCREEN.y + SCREEN.h - 10);
  p.line(SCREEN.x + SCREEN.w - 10, SCREEN.y + SCREEN.h - 10, SCREEN.x + SCREEN.w - 10, SCREEN.y + SCREEN.h - 28);

  // 暗角
  strokeHex(p, C.bgDeep, 0.42);
  p.strokeWeight(8);
  p.rect(SCREEN.x + 4, SCREEN.y + 4, SCREEN.w - 8, SCREEN.h - 8, 4);
  strokeHex(p, C.mint, 0.05);
  p.strokeWeight(0.8);
  p.rect(SCREEN.x + 7, SCREEN.y + 7, SCREEN.w - 14, SCREEN.h - 14, 3);
  p.pop();
}

// ---------- 散点图 / 两条曲线 ----------

function drawPlotGrid(p, alpha) {
  p.push();
  p.noStroke();
  fillHex(p, '#04120e', 0.5 * alpha);
  p.rect(PLOT.x, PLOT.y, PLOT.w, PLOT.h, 2);

  p.strokeWeight(0.6);
  for (let i = 0; i <= 6; i++) {
    const x = PLOT.x + (PLOT.w * i) / 6;
    strokeHex(p, C.mint, (i === 0 || i === 6 ? 0.14 : 0.05) * alpha);
    p.line(x, PLOT.y, x, PLOT.y + PLOT.h);
  }
  for (let i = 0; i <= 4; i++) {
    const y = PLOT.y + (PLOT.h * i) / 4;
    strokeHex(p, C.mint, (i === 0 || i === 4 ? 0.14 : 0.05) * alpha);
    p.line(PLOT.x, y, PLOT.x + PLOT.w, y);
  }

  strokeHex(p, C.cream, 0.42 * alpha);
  p.strokeWeight(1.1);
  p.line(PLOT.x, PLOT.y + PLOT.h, PLOT.x + PLOT.w, PLOT.y + PLOT.h);
  p.line(PLOT.x, PLOT.y, PLOT.x, PLOT.y + PLOT.h);
  strokeHex(p, C.creamDim, 0.18 * alpha);
  p.strokeWeight(0.7);
  p.line(PLOT.x + PLOT.w, PLOT.y, PLOT.x + PLOT.w, PLOT.y + PLOT.h);
  p.line(PLOT.x, PLOT.y, PLOT.x + PLOT.w, PLOT.y);

  // 小而可读的轴刻度。
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(4.5);
  fillHex(p, C.creamDim, 0.5 * alpha);
  p.text('0', PLOT.x, PLOT.y + PLOT.h + 5);
  p.text('.5', PLOT.x + PLOT.w * 0.5, PLOT.y + PLOT.h + 5);
  p.text('1', PLOT.x + PLOT.w, PLOT.y + PLOT.h + 5);

  p.textAlign(p.RIGHT, p.CENTER);
  p.text('0', PLOT.x - 6, PLOT.y + PLOT.h);
  p.text('.5', PLOT.x - 6, PLOT.y + PLOT.h * 0.5);
  p.text('1', PLOT.x - 6, PLOT.y + 1);

  // 刻度短线
  p.strokeWeight(0.7);
  for (let i = 0; i <= 4; i++) {
    const y = PLOT.y + (PLOT.h * i) / 4;
    strokeHex(p, C.creamDim, 0.3 * alpha);
    p.line(PLOT.x - 4, y, PLOT.x, y);
  }
  p.pop();
}

function drawTrainingPoints(p, hold, out) {
  for (let i = 0; i < TRAIN.length; i++) {
    const tp = TRAIN[i];
    const grab = smoothstep(2.12 + i * 0.052, 2.36 + i * 0.052, hold);
    const lift = out * (10 + hash2(i, 5, 211) * 30);
    const px = nx(tp.x);
    const py = ny(tp.y) - lift;
    const a = (1 - out * 0.5) * (0.8 + 0.2 * grab);
    const halo = 0.045 + grab * 0.09;
    p.push();
    p.noStroke();
    fillHex(p, tp.kind === 0 ? C.mint : C.emberHot, halo * a);
    p.ellipse(px, py, 13 + grab * 8, 13 + grab * 8);

    if (tp.kind === 0) {
      fillHex(p, C.mint, 0.92 * a);
      p.ellipse(px, py, 6.4, 6.4);
      fillHex(p, C.mintPale, 0.6 * a);
      p.ellipse(px - 0.9, py - 0.9, 2.2, 2.2);
    } else {
      p.noFill();
      strokeHex(p, C.emberHot, 0.95 * a);
      p.strokeWeight(1.2);
      p.ellipse(px, py, 7, 7);
      p.noStroke();
      fillHex(p, C.emberCore, 0.65 * a);
      p.ellipse(px, py, 2, 2);
    }

    if (grab > 0.02) {
      p.noFill();
      strokeHex(p, tp.kind === 0 ? C.phosphor : C.emberCore, 0.24 * grab * a);
      p.strokeWeight(0.7);
      p.ellipse(px, py, 10.5, 10.5);
    }
    p.pop();
  }
}

function drawKnot(p, hold, out) {
  const knotIn = smoothstep(2.5, 2.86, hold) * (1 - out);
  if (knotIn <= 0.002) return;

  const flex = smoothstep(1.9, 2.75, hold);
  const baseX = nx(0.628);
  const baseY = ny(blendedY(0.628, flex));
  const cx = nx(0.652);
  const cy = ny(0.432);
  const rx = 9.2 * knotIn;
  const ry = 8.6 * knotIn;

  const pts = [[baseX, baseY]];
  for (let i = 0; i <= 30; i++) {
    const u = i / 30;
    const a = Math.PI * 0.5 + u * TAU * 1.22;
    const rr = 1 + 0.24 * Math.sin(a * 2.7 + 0.6);
    pts.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]);
  }

  p.push();
  p.noFill();
  strokeHex(p, C.bgDeep, 0.55 * knotIn);
  p.strokeWeight(4);
  polyline(p, pts);
  strokeHex(p, C.mint, 0.85 * knotIn);
  p.strokeWeight(2);
  polyline(p, pts);
  strokeHex(p, C.phosphor, 0.4 * knotIn);
  p.strokeWeight(0.8);
  polyline(p, pts);

  // 打结处的火星。
  const step = Math.floor(hold * 10);
  p.noStroke();
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.7;
    const rr = 6.5 + hash2(i, step, 221) * 7;
    fillHex(p, i % 2 ? C.emberHot : C.mint, 0.24 * knotIn);
    p.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85, 1.5, 1.5);
  }
  p.pop();
}

function drawTestPoint(p, hold, out) {
  const drop = smoothstep(2.38, 2.72, hold);
  if (drop <= 0.002) return;

  const settle = smoothstep(2.66, 2.78, hold);
  const yNorm = 1.1 + (TEST.y - 1.1) * drop - 0.018 * Math.sin(settle * Math.PI);
  const px = nx(TEST.x);
  const py = ny(yNorm) - out * 18;
  const fail = smoothstep(2.86, 2.97, hold);
  const now = clamp(hold - 2.72, 0, 0.28);

  p.push();

  // 从上方落下的残影。
  if (drop < 0.995) {
    p.noFill();
    strokeHex(p, C.emberHot, (1 - drop) * 0.24);
    p.strokeWeight(1);
    for (let i = 0; i < 5; i++) {
      const y0 = py - 8 - i * 9;
      p.line(px - 2.5, y0, px + 2.5, y0 - 4);
    }
  }

  // 落点涟漪（定格时冻结在纸面上）。
  if (now > 0.002) {
    p.noFill();
    const rr = 5 + now * 22;
    strokeHex(p, C.ember, 0.24 * (1 - now / 0.34));
    p.strokeWeight(0.9);
    p.ellipse(px, ny(TEST.y), rr * 2, rr * 1.3);
    strokeHex(p, C.emberHot, 0.14 * (1 - now / 0.34));
    p.ellipse(px, ny(TEST.y), (rr + 5) * 2, (rr + 5) * 1.3);
  }

  // 新测试点：空心琥珀环，中间一点奶油色。
  p.noStroke();
  fillHex(p, C.ember, 0.09);
  p.ellipse(px, py, 20, 20);
  p.noFill();
  strokeHex(p, C.emberHot, 0.95);
  p.strokeWeight(1.5);
  p.ellipse(px, py, 9, 9);
  strokeHex(p, C.cream, 0.42);
  p.strokeWeight(0.7);
  p.ellipse(px, py, 6, 6);
  p.noStroke();
  fillHex(p, C.emberCore, 0.95);
  p.ellipse(px, py, 2.1, 2.1);
  fillHex(p, C.emberHot, 0.08);
  p.ellipse(px, py, 24, 24);

  // 判错的记号：红褐小叉，不写解释文字。
  if (fail > 0.002) {
    p.strokeWeight(1.5);
    strokeHex(p, C.bgDeep, 0.65 * fail);
    p.line(px - 4.2, py - 4.2, px + 4.2, py + 4.2);
    p.line(px + 4.2, py - 4.2, px - 4.2, py + 4.2);
    strokeHex(p, C.red, 0.9 * fail);
    p.strokeWeight(1.1);
    p.line(px - 4, py - 4, px + 4, py + 4);
    p.line(px + 4, py - 4, px - 4, py + 4);
    p.noFill();
    strokeHex(p, C.red, 0.28 * fail);
    p.strokeWeight(0.8);
    p.ellipse(px, py, 15, 15);
  }
  p.pop();
}

function drawScatterPlot(p, t) {
  const hold = Math.min(t, 3);
  const plotIn = smoothstep(0.15, 0.9, t);
  if (plotIn <= 0.002) return;

  const flex = smoothstep(1.9, 2.75, hold);
  const simpleIn = smoothstep(2.12, 2.42, hold);
  const out = smoothstep(4.15, 5.35, t);

  p.push();
  drawPlotGrid(p, plotIn);

  // 简单模型：奶油色虚线，始终平缓。
  if (simpleIn > 0.002) {
    const pts = [];
    for (let i = 0; i <= 92; i++) {
      const x = 0.015 + (0.97 * i) / 92;
      pts.push([nx(x), ny(smoothY(x))]);
    }
    strokeDashedPolyline(p, pts, 5.5, 4.5, C.cream, 0.52 * simpleIn * (1 - out * 0.6), 1.3);
  }

  // 过拟合曲线：从简单拟合逐步扭成穿过每个训练点的狂线。
  const pts = CURVE_XS.map((x) => [nx(x), ny(clamp(blendedY(x, flex), 0.02, 0.98))]);
  if (out < 0.98) {
    p.push();
    p.noFill();
    strokeHex(p, C.ember, 0.1 * (1 - out));
    p.strokeWeight(6);
    polyline(p, pts);
    strokeHex(p, C.bgDeep, 0.62 * (1 - out));
    p.strokeWeight(3.8);
    polyline(p, pts);
    strokeHex(p, C.mint, 0.86 * (1 - out));
    p.strokeWeight(2);
    polyline(p, pts);
    strokeHex(p, C.phosphor, 0.36 * (1 - out));
    p.strokeWeight(0.8);
    polyline(p, pts);
    p.pop();
  }

  drawTrainingPoints(p, hold, out);
  drawKnot(p, hold, out);
  drawTestPoint(p, hold, out);

  // 图内的静态余辉。
  p.noStroke();
  fillHex(p, C.mint, 0.025 * plotIn);
  p.ellipse(PLOT.x + PLOT.w * 0.58, PLOT.y + PLOT.h * 0.56, 170, 80);
  p.pop();
}

// ---------- 右下笔式绘图仪 / 直方图 ----------

function drawPlotter(p, t) {
  const paperIn = smoothstep(0.5, 1.15, t);
  const inA = smoothstep(0.45, 1.1, t);
  if (inA <= 0.002) return;

  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.58 * inA);
  p.rect(PLOTTER.x + 8, PLOTTER.y + 10, PLOTTER.w, PLOTTER.h, 7);
  fillHex(p, C.cabinetDeep, 0.98 * inA);
  p.rect(PLOTTER.x, PLOTTER.y, PLOTTER.w, PLOTTER.h, 6);
  fillHex(p, C.cabinet, 0.95 * inA);
  p.rect(PLOTTER.x + 4, PLOTTER.y + 4, PLOTTER.w - 8, PLOTTER.h - 8, 4);
  strokeHex(p, C.edge, 0.32 * inA);
  p.strokeWeight(1.1);
  p.noFill();
  p.rect(PLOTTER.x + 4, PLOTTER.y + 4, PLOTTER.w - 8, PLOTTER.h - 8, 4);

  // 出纸口
  fillHex(p, C.bgDeep, 0.92 * inA);
  p.rect(HIST.x - 2, HIST.y - 6, HIST.w + 4, HIST.h + 12, 3);

  // 绘图纸：从出纸口滑出来。
  const paperY = HIST.y - 10 * (1 - paperIn);
  const paperA = 0.94 * inA * (0.35 + 0.65 * paperIn);
  fillHex(p, C.bgDeep, 0.36 * paperA);
  p.rect(HIST.x + 2, paperY + 3, HIST.w, HIST.h, 1);
  fillHex(p, C.paper, paperA);
  p.rect(HIST.x, paperY, HIST.w, HIST.h, 1);
  fillHex(p, C.paperLight, 0.4 * paperA);
  p.rect(HIST.x, paperY, HIST.w, 20);
  fillHex(p, C.paperDark, 0.36 * paperA);
  p.rect(HIST.x, paperY + HIST.h - 3, HIST.w, 3);

  // 纸纤维
  p.strokeWeight(0.5);
  for (let i = 0; i < 18; i++) {
    const y = paperY + 8 + hash2(i, 1, 231) * (HIST.h - 16);
    strokeHex(p, C.paperDark, 0.1 * paperA);
    p.line(HIST.x + 4, y, HIST.x + HIST.w - 4, y);
  }

  // 顶部齿孔与绘图仪压纸轮。
  p.noStroke();
  for (let x = HIST.x + 6; x < HIST.x + HIST.w - 4; x += 12) {
    fillHex(p, C.paperDark, 0.28 * paperA);
    p.ellipse(x, paperY + 4, 1.4, 1.4);
  }
  fillHex(p, C.brassDeep, 0.95 * inA);
  p.ellipse(HIST.x + 32, PLOTTER.y + 8, 13, 13);
  p.ellipse(HIST.x + HIST.w - 32, PLOTTER.y + 8, 13, 13);
  fillHex(p, C.brassDark, 0.95 * inA);
  p.ellipse(HIST.x + 32, PLOTTER.y + 8, 9, 9);
  p.ellipse(HIST.x + HIST.w - 32, PLOTTER.y + 8, 9, 9);
  fillHex(p, C.brassLight, 0.35 * inA);
  p.ellipse(HIST.x + 30, PLOTTER.y + 6, 2.4, 2.4);
  p.ellipse(HIST.x + HIST.w - 34, PLOTTER.y + 6, 2.4, 2.4);
  strokeHex(p, C.brassDark, 0.6 * inA);
  p.strokeWeight(1.2);
  p.line(HIST.x - 4, PLOTTER.y + 8, HIST.x + HIST.w + 4, PLOTTER.y + 8);

  // 直方图。基线在纸面下方，钟形曲线压在竖条上。
  const baseY = paperY + HIST.h - 20;
  const barX0 = HIST.x + 18;
  const barW = 13;
  const gap = 5.5;
  const barMaxH = 72;
  const outlierIn = smoothstep(2.35, 2.66, t);

  p.strokeWeight(0.8);
  strokeHex(p, C.paperInk, 0.45 * paperA);
  p.line(HIST.x + 12, baseY, HIST.x + HIST.w - 10, baseY);
  for (let i = 0; i < HIST_BARS.length; i++) {
    const bar = HIST_BARS[i];
    const h = Math.max(2, bar.h * barMaxH * paperIn);
    const bx = barX0 + i * (barW + gap);
    const warm = bar.warm && outlierIn > 0.05;
    const col = warm ? C.ember : C.paperInk;
    fillHex(p, col, (warm ? 0.62 + outlierIn * 0.25 : 0.66) * paperA);
    p.rect(bx, baseY - h, barW, h, 0.5);
    fillHex(p, C.paperLight, 0.18 * paperA);
    p.rect(bx, baseY - h, barW, Math.min(4, h));
  }

  // 钟形曲线
  p.push();
  p.noFill();
  const bellPts = [];
  for (let i = 0; i <= 58; i++) {
    const x = barX0 - 2 + ((barW + gap) * HIST_BARS.length - gap + 4) * (i / 58);
    const mid = barX0 + ((barW + gap) * HIST_BARS.length - gap) * 0.5;
    const y = baseY - barMaxH * 0.94 * Math.exp(-((x - mid) * (x - mid)) / (2 * 36 * 36));
    bellPts.push([x, y]);
  }
  strokeHex(p, C.brassDark, 0.68 * paperA);
  p.strokeWeight(2.2);
  polyline(p, bellPts);
  strokeHex(p, C.ember, 0.82 * paperA);
  p.strokeWeight(1.2);
  polyline(p, bellPts);
  p.pop();

  // 轴刻度：小而可读。
  p.push();
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.RIGHT, p.CENTER);
  p.textSize(4.6);
  fillHex(p, C.paperInk, 0.55 * paperA);
  p.text('0', HIST.x + 10, baseY);
  p.text('5', HIST.x + 10, baseY - barMaxH * 0.5);
  p.text('10', HIST.x + 10, baseY - barMaxH);
  p.textAlign(p.CENTER, p.TOP);
  p.text('-3', barX0 + 4, baseY + 4);
  p.text('0', barX0 + ((barW + gap) * HIST_BARS.length - gap) * 0.5, baseY + 4);
  p.text('3', HIST.x + HIST.w - 20, baseY + 4);
  p.pop();

  // 输错的那一档画一个小三角标记。
  if (outlierIn > 0.02) {
    const idx = 9;
    const bx = barX0 + idx * (barW + gap) + barW * 0.5;
    const by = baseY - HIST_BARS[idx].h * barMaxH - 9;
    p.noStroke();
    fillHex(p, C.ember, 0.8 * outlierIn * paperA);
    p.triangle(bx - 3, by - 4, bx + 3, by - 4, bx, by + 1);
  }

  // 绘图纸底部的撕口。
  p.noFill();
  strokeHex(p, C.paperDark, 0.35 * paperA);
  p.strokeWeight(0.8);
  p.beginShape();
  for (let i = 0; i <= 16; i++) {
    const x = HIST.x + (HIST.w * i) / 16;
    p.vertex(x, paperY + HIST.h + (i % 2 ? 0 : 1.6));
  }
  p.endShape();

  // 绘图仪四角螺钉与右端笔架。
  for (const [sx, sy] of [
    [PLOTTER.x + 12, PLOTTER.y + 12],
    [PLOTTER.x + PLOTTER.w - 12, PLOTTER.y + 12],
    [PLOTTER.x + 12, PLOTTER.y + PLOTTER.h - 12],
    [PLOTTER.x + PLOTTER.w - 12, PLOTTER.y + PLOTTER.h - 12]
  ]) {
    screw(p, sx, sy, 2);
  }
  fillHex(p, C.brassDeep, 0.9 * inA);
  p.rect(PLOTTER.x + PLOTTER.w - 46, PLOTTER.y + 20, 28, 8, 2);
  fillHex(p, C.brassDark, 0.8 * inA);
  p.rect(PLOTTER.x + PLOTTER.w - 40, PLOTTER.y + 22, 14, 3, 1);
  strokeHex(p, C.creamDim, 0.4 * inA);
  p.strokeWeight(1);
  p.line(PLOTTER.x + PLOTTER.w - 26, PLOTTER.y + 24, PLOTTER.x + PLOTTER.w - 18, PLOTTER.y + 42);

  p.pop();
}

// ---------- 左侧旧纸带 / 卡片 / 线缆 ----------

function drawPaperReel(p, t) {
  const reel = { x: 86, y: 608, r: 44 };
  const feed = smoothstep(0.05, 0.6, t);
  if (feed <= 0.002) return;

  p.push();
  p.noStroke();

  // 从纸卷接到纸带的窄条，先画，后面纸带会盖住上半截。
  fillHex(p, C.paperDark, 0.45);
  p.beginShape();
  p.vertex(reel.x - 12, reel.y - 26);
  p.vertex(reel.x + 11, reel.y - 27);
  p.vertex(64, 528);
  p.vertex(38, 528);
  p.endShape(p.CLOSE);
  fillHex(p, C.paper, 0.7);
  p.beginShape();
  p.vertex(reel.x - 8, reel.y - 29);
  p.vertex(reel.x + 7, reel.y - 30);
  p.vertex(62, 526);
  p.vertex(41, 526);
  p.endShape(p.CLOSE);

  // 纸卷
  fillHex(p, C.bgDeep, 0.45);
  p.ellipse(reel.x + 4, reel.y + 5, reel.r * 2.2, reel.r * 2.2);
  fillHex(p, C.brassDeep, 0.9);
  p.ellipse(reel.x, reel.y, reel.r * 2 + 8, reel.r * 2 + 8);
  fillHex(p, C.paperDark, 0.95);
  p.ellipse(reel.x, reel.y, reel.r * 2, reel.r * 2);
  fillHex(p, C.paper, 0.86);
  p.ellipse(reel.x, reel.y, reel.r * 1.78, reel.r * 1.78);
  for (let i = 0; i < 7; i++) {
    p.noFill();
    strokeHex(p, C.paperDark, 0.14);
    p.strokeWeight(0.7);
    p.ellipse(reel.x, reel.y, reel.r * (1.78 - i * 0.18), reel.r * (1.78 - i * 0.18));
  }
  p.noStroke();
  fillHex(p, C.brassDark, 0.98);
  p.ellipse(reel.x, reel.y, 15, 15);
  fillHex(p, C.brassLight, 0.5);
  p.ellipse(reel.x - 1.5, reel.y - 1.8, 5, 5);
  fillHex(p, C.cabinetDeep, 0.9);
  p.ellipse(reel.x, reel.y, 4, 4);

  // 支架
  fillHex(p, C.brassDeep, 0.92);
  p.rect(reel.x - 5, reel.y + reel.r + 1, 10, 28, 2);
  p.rect(reel.x - 16, reel.y + reel.r + 24, 32, 6, 2);
  p.pop();
}

function drawCardStack(p, stack) {
  p.push();
  p.translate(stack.x, stack.y);
  p.rotate(stack.rot);
  p.noStroke();
  const w = stack.w;
  const h = stack.h;
  fillHex(p, C.bgDeep, 0.45);
  p.rect(-w / 2 + 4, -h / 2 + 6, w, h, 2);

  for (let i = 0; i < stack.count; i++) {
    const ox = (i - stack.count / 2) * 0.9;
    const oy = -i * 2.15;
    fillHex(p, i === stack.count - 1 ? C.paper : '#b8aa7d', 0.92);
    p.rect(-w / 2 + ox, -h / 2 + oy, w, h, 1.5);
    fillHex(p, C.paperLight, 0.3);
    p.rect(-w / 2 + ox, -h / 2 + oy, w, 3);
    fillHex(p, C.paperDark, 0.35);
    p.rect(-w / 2 + ox, h / 2 + oy - 2.4, w, 2.4);
  }

  // 顶卡：齿孔、标题带、两条样本线。
  const ty = -h / 2 - (stack.count - 1) * 2.15;
  for (let i = 0; i < 10; i++) {
    fillHex(p, C.bgDeep, 0.52);
    p.rect(-w / 2 + 8 + i * (w - 16) / 9 - 1.5, ty + 5, 3, 3, 0.5);
  }
  fillHex(p, C.teal, 0.45);
  p.rect(-w / 2 + 8, ty + 12, w * 0.34, 4, 1);
  fillHex(p, C.paperInk, 0.38);
  p.rect(-w / 2 + 8, ty + 21, w * 0.56, 1.4);
  p.rect(-w / 2 + 8, ty + 26, w * 0.42, 1.4);
  fillHex(p, C.ember, 0.5);
  p.ellipse(w / 2 - 11, ty + h - 9, 2.2, 2.2);
  p.pop();
}

function drawDeskProps(p, t) {
  // 墙上的线缆与桌面粗电缆都放在设备后面。
  drawCable(p, 126, 604, 512, 568, 26, C.cabinetDeep, 0.52, 6);
  drawCable(p, 132, 610, 506, 574, 20, C.teal, 0.24, 2.2);
  drawCable(p, 938, 566, 986, 624, 18, C.cabinetDeep, 0.5, 5);
  drawCable(p, 942, 570, 990, 628, 12, C.wallLight, 0.18, 1.4);

  drawPaperReel(p, t);
  for (const stack of CARD_STACKS) drawCardStack(p, stack);

  // 台面上的一块掩膜胶带，把一张纸固定住。
  p.push();
  p.translate(468, 664);
  p.rotate(-0.12);
  p.noStroke();
  fillHex(p, '#d9cea6', 0.35);
  p.rect(-20, -5, 40, 10, 1);
  fillHex(p, C.creamDim, 0.18);
  p.rect(-18, -3, 36, 1.2);
  p.pop();
}

// ---------- 纸带路 ----------

function drawTapeSupport(p, x) {
  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.55);
  p.rect(x - 4, 528, 9, 62);
  fillHex(p, C.brassDeep, 0.92);
  p.rect(x - 3, 528, 7, 60, 1.5);
  fillHex(p, C.brassDark, 0.72);
  p.rect(x - 2, 532, 2, 52);
  fillHex(p, C.brassLight, 0.3);
  p.ellipse(x, 529, 9, 5);
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(x - 9, 586, 18, 4, 1.5);
  p.pop();
}

function drawTapeRoad(p, t) {
  const tq = clamp(t, 0, 6);
  const feed = smoothstep(0.0, 0.55, tq);
  const exit = smoothstep(4.15, 5.45, tq);
  const paperX1 = 18 + 982 * feed;

  p.push();
  p.noStroke();

  // 先用深色咬住默认路带 470–530。
  fillHex(p, '#071b16', 1);
  p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  fillHex(p, '#0a241d', 0.95);
  p.rect(0, ROAD_TOP + 3, 1000, ROAD_BOTTOM - ROAD_TOP - 6);
  fillHex(p, C.bgDeep, 0.8);
  p.rect(0, ROAD_TOP, 1000, 4);
  p.rect(0, ROAD_BOTTOM - 4, 1000, 4);
  fillHex(p, C.brassDark, 0.46);
  p.rect(0, ROAD_TOP + 4, 1000, 1.1);
  fillHex(p, C.edge, 0.46);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 1.1);

  // 纸带下方的支撑，先把支架画在纸带后面。
  drawTapeSupport(p, 470);
  drawTapeSupport(p, 966);

  if (paperX1 > 1) {
    // 纸带主体：奶油色样本纸带，宽 52，含上下齿孔。
    fillHex(p, C.paperDark, 0.6 * (1 - exit * 0.35));
    p.rect(0, 474, paperX1, 52);
    fillHex(p, C.paper, 0.93 * (1 - exit * 0.52));
    p.rect(0, 475, paperX1, 50);
    fillHex(p, C.paperLight, 0.5 * (1 - exit * 0.4));
    p.rect(0, 475, paperX1, 1.2);
    fillHex(p, C.paperDark, 0.5 * (1 - exit * 0.4));
    p.rect(0, 524.4, paperX1, 1.2);

    // 纸带上的淡绿坐标网格。
    p.strokeWeight(0.5);
    for (let x = 0; x < paperX1; x += 18) {
      strokeHex(p, C.teal, 0.13 * (1 - exit * 0.6));
      p.line(x, 476, x, 524);
    }
    for (let y = 480; y < 524; y += 12) {
      strokeHex(p, C.teal, 0.13 * (1 - exit * 0.6));
      p.line(0, y, paperX1, y);
    }
    strokeHex(p, C.paperDark, 0.32 * (1 - exit * 0.6));
    p.strokeWeight(0.6);
    p.line(0, 500, paperX1, 500);

    // 齿孔（下面切回填充，先收掉描边）
    p.noStroke();
    for (const hole of TAPE_HOLES) {
      if (hole.x > paperX1) continue;
      fillHex(p, '#12251d', hole.a * (1 - exit * 0.55));
      p.ellipse(hole.x, hole.y, hole.r * 2, hole.r * 2);
      fillHex(p, C.paperLight, 0.3 * (1 - exit * 0.55));
      p.ellipse(hole.x - 0.25, hole.y - 0.25, hole.r * 0.65, hole.r * 0.65);
    }

    // 样本点 + 0/1 标签
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(5.2);
    for (const sample of TAPE_SAMPLES) {
      if (sample.x > paperX1) continue;
      const lit = sample.warm ? C.ember : C.mint;
      fillHex(p, lit, 0.06 * (1 - exit * 0.6));
      p.ellipse(sample.x, sample.y, 11, 6);
      fillHex(p, lit, 0.9 * (1 - exit * 0.6));
      p.ellipse(sample.x, sample.y, sample.r * 2, sample.r * 2);
      fillHex(p, C.paperLight, 0.4 * (1 - exit * 0.6));
      p.ellipse(sample.x - 0.35, sample.y - 0.35, sample.r * 0.7, sample.r * 0.7);
      fillHex(p, sample.warm ? C.brassDark : C.paperInk, 0.82 * (1 - exit * 0.6));
      p.text(sample.bit, sample.x, 507);
    }

    // 从第 11 版块终端总线接过来的一段暗色过渡。
    if (feed > 0.98) {
      linearWash(
        p,
        0,
        476,
        88,
        500,
        [
          [0, 'rgba(5,18,16,0.86)'],
          [0.45, 'rgba(6,22,20,0.34)'],
          [1, 'rgba(6,22,20,0)']
        ],
        0,
        474,
        96,
        52
      );
    }
  }

  // 左端进纸口：黄铜滚轮 + 汇入的几根终端线。
  p.noFill();
  for (let i = 0; i < 5; i++) {
    strokeHex(p, i === 2 ? C.brass : C.mint, (i === 2 ? 0.3 : 0.18) * (1 - exit * 0.6));
    p.strokeWeight(i === 2 ? 1.6 : 0.9);
    p.beginShape();
    p.vertex(-14, 456 + i * 22);
    p.vertex(6, 472 + i * 10);
    p.vertex(24, 488 + i * 6);
    p.endShape();
  }
  p.noStroke();
  fillHex(p, C.brassDeep, 0.98);
  p.rect(20, 472, 24, 56, 3);
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(24, 477, 16, 46, 2);
  fillHex(p, C.brassLight, 0.28);
  p.rect(26, 478, 2, 44);
  fillHex(p, C.brassDark, 0.95);
  p.ellipse(34, 481, 10, 10);
  p.ellipse(34, 519, 10, 10);
  fillHex(p, C.brassLight, 0.36);
  p.ellipse(32, 479, 3, 3);
  p.ellipse(32, 517, 3, 3);

  // 出口：纸带变宽成层叠张量带，接第 13 版块。
  if (exit > 0.002) {
    fillHex(p, C.dataBg, 0.56 * exit);
    p.rect(0, ROAD_TOP + 2, 1000, 56);
    const layers = [476, 484, 492, 500, 508, 516, 524];
    p.strokeWeight(1);
    for (let i = 0; i < layers.length; i++) {
      strokeHex(p, i % 2 ? C.dataBlue : C.dataDeep, 0.34 * exit);
      p.line(650, layers[i], 1000, layers[i]);
    }
    p.strokeWeight(0.8);
    for (let i = 0; i < 18; i++) {
      const bx = 690 + i * 17;
      const q = hash2(i, 7, 131);
      const ty = 500 - exit * (10 + Math.floor(q * 4) * 8) - 2;
      strokeHex(p, C.dataBlue, 0.18 * exit);
      p.line(bx, 500, bx, ty);
      p.noStroke();
      fillHex(p, i % 3 ? C.dataBlue : '#e6ebff', 0.36 * exit);
      p.ellipse(bx, ty, 2, 2);
    }
    strokeHex(p, C.dataBlue, 0.36 * exit);
    p.strokeWeight(1.1);
    p.line(0, 500, 1000, 500);
  }

  p.pop();
}

// ---------- 主角：概率代币 / 钟形砝码 ----------

function drawEmberCore(p, x, y, scale, flash, alpha) {
  p.push();
  p.translate(x, y);
  p.noStroke();
  fillHex(p, C.ember, (0.08 + 0.08 * flash) * alpha);
  p.ellipse(0, 0, 26 * scale, 26 * scale);
  fillHex(p, C.ember, (0.18 + 0.12 * flash) * alpha);
  p.ellipse(0, 0, 15 * scale, 15 * scale);
  fillHex(p, C.ember, 0.9 * alpha);
  p.ellipse(0, 0, 8.2 * scale, 8.2 * scale);
  fillHex(p, C.emberHot, alpha);
  p.ellipse(-0.4 * scale, -0.6 * scale, 5 * scale, 5 * scale);
  fillHex(p, C.emberCore, alpha);
  p.ellipse(-0.8 * scale, -1.0 * scale, 2.2 * scale, 2.2 * scale);
  if (flash > 0.02) {
    p.noFill();
    strokeHex(p, C.emberHot, 0.26 * flash * alpha);
    p.strokeWeight(0.8);
    p.ellipse(0, 0, 19 * scale, 19 * scale);
  }
  p.pop();
}

function drawCoinTickRing(p, roll) {
  p.push();
  p.rotate(roll);
  for (let i = 0; i < 18; i++) {
    const a = i * (TAU / 18);
    const r0 = 19.2;
    const r1 = i % 3 === 0 ? 22.4 : 21.2;
    strokeHex(p, i % 3 === 0 ? C.brassLight : C.brass, i % 3 === 0 ? 0.62 : 0.34);
    p.strokeWeight(i % 3 === 0 ? 0.9 : 0.7);
    const c = Math.cos(a);
    const s = Math.sin(a);
    p.line(c * r0, s * r0, c * r1, s * r1);
  }
  p.pop();
}

function drawCoinFront(p, roll, flash) {
  p.push();
  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, 47, 47);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, -0.4, 43, 43);
  fillHex(p, '#0a211b', 0.98);
  p.ellipse(0, 0, 36, 36);

  p.noFill();
  strokeHex(p, C.brass, 0.75);
  p.strokeWeight(1.2);
  p.ellipse(0, 0, 39.5, 39.5);
  strokeHex(p, C.mint, 0.26);
  p.strokeWeight(0.7);
  p.ellipse(0, 0, 33, 33);

  // 钟形曲线（采样折线，不用 bezier）。
  const bell = (x) => 9 - 15 * Math.exp(-(x * x) / (2 * 6 * 6));
  p.noStroke();
  fillHex(p, C.mint, 0.08);
  p.beginShape();
  p.vertex(-13, 9);
  for (let i = 0; i <= 20; i++) {
    const x = -13 + (26 * i) / 20;
    p.vertex(x, bell(x));
  }
  p.vertex(13, 9);
  p.endShape(p.CLOSE);
  p.noFill();
  strokeHex(p, C.mint, 0.82);
  p.strokeWeight(1.1);
  p.beginShape();
  for (let i = 0; i <= 20; i++) {
    const x = -13 + (26 * i) / 20;
    p.vertex(x, bell(x));
  }
  p.endShape();

  strokeHex(p, C.mint, 0.32);
  p.strokeWeight(0.6);
  p.line(-13, 10, 13, 10);
  for (let i = 0; i <= 6; i++) {
    const x = -12 + i * 4;
    p.line(x, 10, x, 10.8 + (i % 3 === 0 ? 0.8 : 0));
  }

  // 0/1 概率刻度（正面也有，方便静态帧读）。
  p.push();
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(4.6);
  fillHex(p, C.cream, 0.78);
  p.text('0', -13.5, 15);
  p.text('1', 13.5, 15);
  p.textStyle(p.NORMAL);
  p.pop();

  drawEmberCore(p, 0, 0, 1, flash, 1);

  drawCoinTickRing(p, roll);
  p.noFill();
  strokeHex(p, C.brassLight, 0.55);
  p.strokeWeight(1);
  p.ellipse(0, 0, 45, 45);
  strokeHex(p, C.mint, 0.18);
  p.strokeWeight(0.7);
  p.ellipse(0, 0, 42, 42);
  strokeHex(p, C.cream, 0.18);
  p.strokeWeight(1);
  p.arc(0, 0, 44, 44, -2.4, -0.5);
  p.pop();
}

function drawCoinBack(p, roll, flash) {
  p.push();
  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, 47, 47);
  fillHex(p, '#2a2014', 1);
  p.ellipse(0, -0.4, 43, 43);
  fillHex(p, '#1c1711', 1);
  p.ellipse(0, 0, 36, 36);

  p.noFill();
  strokeHex(p, C.brass, 0.78);
  p.strokeWeight(1.2);
  p.ellipse(0, 0, 39.5, 39.5);
  strokeHex(p, C.ember, 0.22);
  p.strokeWeight(0.7);
  p.ellipse(0, 0, 33, 33);

  // 背面顶部也刻一条小钟形曲线，保证两面都读得出概率。
  strokeHex(p, C.mint, 0.24);
  p.strokeWeight(0.7);
  p.beginShape();
  for (let i = 0; i <= 16; i++) {
    const x = -11 + (22 * i) / 16;
    p.vertex(x, -2 - 8.5 * Math.exp(-(x * x) / (2 * 5.2 * 5.2)));
  }
  p.endShape();
  strokeHex(p, C.mint, 0.16);
  p.strokeWeight(0.5);
  p.line(-11, -2, 11, -2);

  // 0 / 1
  p.push();
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(10);
  fillHex(p, C.cream, 0.88);
  p.text('0', -12.5, 8);
  p.text('1', 12.5, 8);
  p.textStyle(p.NORMAL);
  p.pop();

  // 概率刻度桥与指针
  p.strokeWeight(0.6);
  strokeHex(p, C.brassLight, 0.38);
  for (let i = 0; i <= 8; i++) {
    const x = -11 + i * 2.75;
    p.line(x, 13.5, x, 15 + (i % 4 === 0 ? 0.8 : 0));
  }
  strokeHex(p, C.emberHot, 0.72);
  p.strokeWeight(1.1);
  p.line(0, 0, Math.cos(-0.62) * 13, Math.sin(-0.62) * 13);
  p.noStroke();
  fillHex(p, C.emberCore, 0.8);
  p.ellipse(Math.cos(-0.62) * 13, Math.sin(-0.62) * 13, 2.2, 2.2);

  drawEmberCore(p, 0, 0, 0.92, flash, 1);

  drawCoinTickRing(p, roll);
  p.noFill();
  strokeHex(p, C.brassLight, 0.55);
  p.strokeWeight(1);
  p.ellipse(0, 0, 45, 45);
  strokeHex(p, C.ember, 0.2);
  p.strokeWeight(0.7);
  p.ellipse(0, 0, 42, 42);
  p.pop();
}

function drawActorToken(p, raw, state) {
  const t = clamp(raw, 0, 6);
  const hold = Math.min(t, 3);
  const appear = smoothstep(0, 0.38, raw);
  const exit = smoothstep(4.1, 5.4, raw);
  const bob = Math.sin(hold * TAU) * 1.1;
  const cy = 474 + bob;
  const roll = hold * 2.6 + 0.4;
  // 两拍 1s：0.5s 翻一次面；localT=1.5 是 0/1 背面，localT=3.0 停在钟形正面。
  const flip = 0.5 - 0.5 * Math.cos(hold * TAU);
  const sx = Math.max(0.045, Math.abs(Math.cos(flip * Math.PI)));
  const edge = 1 - sx;
  const faceBack = flip > 0.5;
  const flash = smoothstep(2.86, 2.97, raw) * (1 - smoothstep(3.5, 3.9, raw));
  const step = Math.floor(hold * 10);
  const scale = (0.76 + 0.24 * appear) * (1 - 0.1 * exit);
  const sideLit = smoothstep(2.25, 2.55, hold) * (1 - smoothstep(4.05, 4.6, raw));

  // drawActor 直接用世界坐标 state.x，不减版块偏移。
  p.push();
  p.translate(state.x, cy);
  p.scale(scale, scale * (1 - 0.42 * exit));
  p.noStroke();

  // 纸带上的投影与压痕
  fillHex(p, C.bgDeep, 0.34 * appear);
  p.ellipse(3, 26, 58, 11);
  fillHex(p, C.ember, 0.05 * appear);
  p.ellipse(0, 24, 34, 12);
  p.noFill();
  strokeHex(p, C.paperDark, 0.58 * appear);
  p.strokeWeight(1.1);
  p.arc(0, 25, 36, 9, 0, Math.PI);
  strokeHex(p, C.paperLight, 0.55 * appear);
  p.strokeWeight(0.8);
  p.arc(0, 25.5, 30, 7, 0.1, Math.PI - 0.1);

  // 停住时旁边的样本点亮起
  if (sideLit > 0.002) {
    p.noStroke();
    for (const [dx, col] of [
      [-29, C.mint],
      [28, C.emberHot]
    ]) {
      fillHex(p, col, 0.07 * sideLit);
      p.ellipse(dx, 23, 13, 5);
      fillHex(p, col, 0.9 * sideLit);
      p.ellipse(dx, 23, 2.5, 1.8);
    }
  }

  // 钟形砝码的底座法兰
  p.noStroke();
  fillHex(p, C.bgDeep, 0.5 * appear);
  p.ellipse(0, 22.5, 36, 8);
  fillHex(p, C.brassDeep, 0.95 * appear);
  p.ellipse(0, 21, 31, 7);
  fillHex(p, C.brass, 0.45 * appear);
  p.ellipse(0, 20.2, 24, 4);

  // 顶部提环
  p.noFill();
  strokeHex(p, C.brassDark, 0.9 * appear);
  p.strokeWeight(2.2);
  p.ellipse(0, -24, 10, 12);
  strokeHex(p, C.brassLight, 0.3 * appear);
  p.strokeWeight(0.7);
  p.ellipse(0, -24, 7, 9);

  // 翻面：整枚圆片做水平压缩。
  p.push();
  p.scale(sx, 1);
  if (faceBack) drawCoinBack(p, roll, flash);
  else drawCoinFront(p, roll, flash);
  p.pop();

  // 边缘朝向镜头时的铜边与火星。
  if (edge > 0.24) {
    p.push();
    p.noFill();
    strokeHex(p, C.brass, 0.6 * appear);
    p.strokeWeight(1.4);
    p.ellipse(0, 0, 2.4, 44);
    strokeHex(p, C.mint, 0.3 * appear);
    p.strokeWeight(0.7);
    p.ellipse(0, 0, 1.2, 40);
    p.pop();
    p.noStroke();
    for (let i = 0; i < 7; i++) {
      const a = i * (TAU / 7) + roll * 0.7;
      const rr = 26 + hash2(i, step, 141) * 7;
      const px = Math.cos(a) * rr * (0.25 + 0.75 * sx);
      const py = Math.sin(a) * rr * 0.8;
      fillHex(p, i % 2 ? C.mint : C.emberHot, edge * (0.13 + hash2(i, step, 142) * 0.32));
      p.ellipse(px, py, 1.1 + hash2(i, step, 143) * 1.2, 1.1 + hash2(i, step, 143) * 1.2);
    }
  }

  // 火种闪一下
  if (flash > 0.02) {
    p.noStroke();
    fillHex(p, C.ember, 0.08 * flash);
    p.ellipse(0, 0, 64, 64);
    p.noFill();
    strokeHex(p, C.emberHot, 0.28 * flash);
    p.strokeWeight(1);
    p.ellipse(0, 0, 50, 50);
    strokeHex(p, C.emberCore, 0.2 * flash);
    p.ellipse(0, 0, 56, 56);
  }

  // 离场：压成几层权重片。
  if (exit > 0.02) {
    p.noStroke();
    fillHex(p, C.ember, 0.05 * exit);
    p.ellipse(0, 22, 58, 12);
    for (let i = 0; i < 3; i++) {
      fillHex(p, i === 1 ? C.brassLight : C.mint, 0.16 * exit);
      p.ellipse(0, -6 + i * 6, 48, 2.2);
    }
    fillHex(p, C.brassDark, 0.55 * exit);
    p.ellipse(0, 22, 50, 6);
  }

  p.pop();
}

// ---------- 标题 / 氛围 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 184;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, '#f1e6c4', 0.78 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.mintPale, 0.35 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 1.2, 1);
  fillHex(p, C.creamDim, 0.3 * alpha);
  p.rect(x - w / 2 + 2, y + h / 2 - 2, w - 4, 1, 0.5);
  p.noFill();
  strokeHex(p, C.brassLight, 0.4 * alpha);
  p.strokeWeight(0.9);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

function drawAtmosphere(p) {
  linearWash(
    p,
    0,
    170,
    0,
    780,
    [
      [0, 'rgba(1,7,6,0.3)'],
      [0.22, 'rgba(1,7,6,0)'],
      [0.76, 'rgba(1,7,6,0)'],
      [1, 'rgba(0,3,2,0.34)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.push();
  p.noStroke();
  fillHex(p, C.mint, 0.012);
  p.ellipse(760, 360, 520, 360);
  fillHex(p, C.ember, 0.008);
  p.ellipse(620, 500, 380, 70);
  p.pop();
}

// ---------- 场景 ----------

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();

    drawRoom(p, t);
    drawDeskProps(p, t);
    drawCrtShell(p);
    drawScreenGlass(p);
    drawScatterPlot(p, t);
    drawScreenFinish(p);
    drawPlotter(p, t);
    drawAtmosphere(p);

    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (showTitle && titleAlpha > 0.002) {
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
    drawTapeRoad(p, t);
    p.pop();
  },

  drawActor(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    drawActorToken(p, t, state);
    p.pop();
  }
};
