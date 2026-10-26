import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 16 多模态原生统一：深蓝信号汇流空间 + 四路信号 + 多面棱镜 + 共享嵌入星座。
// 静态重点：localT≈1.5（标题、混合信号带、四路信号进场、第一组星座点亮）
// 与 localT≈3.0（四路方形信号压到同一颗光点、视频跟到、圆形错配、?、定格约 1s）。
const TAU = Math.PI * 2;
const ROAD_TOP = 467;
const ROAD_BOTTOM = 533;
const ROAD_MID = 500;

const META = {
  id: 16,
  cn: '多模态原生统一',
  en: 'Native Multimodal Unification',
  era: '2025-2026',
  group: 'data'
};

const C = {
  bg: '#060a16',
  bgDeep: '#03060e',
  bgLow: '#040812',
  panel: '#0a1226',
  panelLight: '#0e1a33',
  face: '#0c1830',
  faceLow: '#081226',
  navy: '#1a2750',
  navyLight: '#263b70',
  navyDeep: '#101c3a',
  line: '#2c4380',
  edge: '#3a57a0',
  cyan: '#63dfff',
  cyanSoft: '#9eeaff',
  cyanDim: '#2c7fa8',
  cyanDeep: '#12384f',
  ink: '#e6ebff',
  dim: '#8fa3c8',
  cream: '#f0e2bf',
  creamDim: '#c9bd9f',
  amber: '#cf9b5c',
  amberSoft: '#e2bd8a',
  rose: '#c68b98',
  roseSoft: '#dfaeb8',
  violet: '#a397cf',
  violetSoft: '#c3b9e2',
  mint: '#7cc7ae',
  mintSoft: '#a7ddcd',
  steel: '#8ba3c7',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa'
};

const PRISM = {
  top: [674, 266],
  upperLeft: [614, 304],
  left: [606, 384],
  bottom: [674, 438],
  lowerRight: [734, 402],
  upperRight: [744, 314],
  center: [674, 356]
};

// 四路信号从不同高度进入棱镜左面。
const STREAMS = [
  {
    id: 'image',
    kind: 'image',
    color: C.rose,
    edge: C.roseSoft,
    // 图像从标题区上方绕过来，不压住标题留白。
    path: [
      [64, 242],
      [236, 224],
      [458, 238],
      [612, 312]
    ],
    aperture: [612, 312],
    out: [741, 336],
    phase: 0.08,
    seed: 161
  },
  {
    id: 'audio',
    kind: 'audio',
    color: C.amber,
    edge: C.amberSoft,
    // 音频从标题区下方进入，路径沿 y≈430 以上走。
    path: [
      [22, 472],
      [238, 452],
      [430, 430],
      [607, 345]
    ],
    aperture: [607, 345],
    out: [733, 357],
    phase: 0.31,
    seed: 162
  },
  {
    id: 'text',
    kind: 'text',
    color: C.violet,
    edge: C.violetSoft,
    // 文本从标题区右侧的上方垂下。
    path: [
      [430, 230],
      [528, 238],
      [588, 292],
      [607, 377]
    ],
    aperture: [607, 377],
    out: [736, 381],
    phase: 0.55,
    seed: 163
  },
  {
    id: 'video',
    kind: 'video',
    color: C.mint,
    edge: C.mintSoft,
    // 视频从左下贴着混合带汇入。
    path: [
      [24, 574],
      [230, 558],
      [448, 508],
      [638, 407]
    ],
    aperture: [638, 407],
    out: [724, 403],
    phase: 0.77,
    seed: 164
  }
];

// 共享嵌入星座：一组固定的点云 + 一颗“同一光点”。
const STAR = { x: 832, y: 384 };
const CONST_ANCHORS = [
  { x: 770, y: 322, g: 0, r: 1.7 },
  { x: 790, y: 302, g: 0, r: 1.2 },
  { x: 812, y: 328, g: 0, r: 1.5 },
  { x: 832, y: 306, g: 0, r: 1.2 },
  { x: 854, y: 334, g: 0, r: 1.8 },
  { x: 888, y: 438, g: 1, r: 1.2 },
  { x: 914, y: 458, g: 1, r: 1.8 },
  { x: 894, y: 488, g: 1, r: 1.4 },
  { x: 926, y: 502, g: 1, r: 1.2 },
  { x: 784, y: 548, g: 2, r: 1.4 },
  { x: 806, y: 574, g: 2, r: 1.8 },
  { x: 836, y: 556, g: 2, r: 1.2 },
  { x: 860, y: 592, g: 2, r: 1.5 },
  { x: 892, y: 570, g: 2, r: 1.2 }
];
const CONST_LINES = [
  [[770, 322], [790, 302]],
  [[790, 302], [812, 328]],
  [[812, 328], [832, 306]],
  [[832, 306], [854, 334]],
  [[854, 334], [STAR.x, STAR.y]],
  [[888, 438], [914, 458]],
  [[914, 458], [894, 488]],
  [[894, 488], [926, 502]],
  [[888, 438], [STAR.x, STAR.y]],
  [[784, 548], [806, 574]],
  [[806, 574], [836, 556]],
  [[836, 556], [860, 592]],
  [[860, 592], [892, 570]],
  [[784, 548], [STAR.x, STAR.y]]
];

const CONST_DOTS = (() => {
  const rng = mulberry32(0x16c0de);
  const list = [];
  for (let i = 0; i < 34; i++) {
    const x = 754 + rng() * 196;
    const y = 288 + rng() * 338;
    if (Math.hypot(x - STAR.x, y - STAR.y) < 42) continue;
    list.push({
      x,
      y,
      r: 0.55 + rng() * 1.15,
      a: 0.08 + rng() * 0.2,
      g: y < 372 ? 0 : y > 512 ? 2 : 1
    });
  }
  return list;
})();

const DUST = (() => {
  const rng = mulberry32(0x16d057);
  const list = [];
  for (let i = 0; i < 108; i++) {
    list.push({
      x: rng() * 1000,
      y: 184 + rng() * 622,
      r: 0.45 + rng() * 1.35,
      a: 0.014 + rng() * 0.045,
      cool: rng() > 0.2,
      warm: rng() > 0.92
    });
  }
  return list;
})();

function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

function linearWash(p, x0, y0, x1, y1, stops, x, y, w, h) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// 曲线上采样折线。全部走 p.vertex，不碰 p5 2.x 的 bezier/curve 内部点。
function cubicPoint(path, u) {
  const k = clamp(u, 0, 1);
  const v = 1 - k;
  const x =
    v * v * v * path[0][0] +
    3 * v * v * k * path[1][0] +
    3 * v * k * k * path[2][0] +
    k * k * k * path[3][0];
  const y =
    v * v * v * path[0][1] +
    3 * v * v * k * path[1][1] +
    3 * v * k * k * path[2][1] +
    k * k * k * path[3][1];
  return [x, y];
}

function strokeCubic(p, path, color, alpha, weight, n = 34) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (let i = 0; i <= n; i++) {
    const [x, y] = cubicPoint(path, i / n);
    p.vertex(x, y);
  }
  p.endShape();
  p.pop();
}

function strokeArc(p, cx, cy, rx, ry, a0, a1, color, alpha, weight, n = 24) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    p.vertex(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  p.endShape();
  p.pop();
}

function polyShape(p, points, fill, alpha, edge, edgeAlpha, weight = 1) {
  if (alpha <= 0.002) return;
  p.push();
  p.noStroke();
  fillHex(p, fill, alpha);
  p.beginShape();
  for (const [x, y] of points) p.vertex(x, y);
  p.endShape(p.CLOSE);
  if (edge && edgeAlpha > 0.002) {
    p.noFill();
    strokeHex(p, edge, edgeAlpha);
    p.strokeWeight(weight);
    p.beginShape();
    for (const [x, y] of points) p.vertex(x, y);
    p.endShape(p.CLOSE);
  }
  p.pop();
}

// 高光定格窗口里内部流动也停住 0.9s，让“卡一下”读得出来。
function flowTime(t) {
  if (t <= 3) return t;
  if (t <= 3.9) return 3;
  return t - 0.9;
}

function convergenceLock(t) {
  const hold = Math.min(t, 3);
  return smoothstep(2.15, 2.95, hold) * (1 - smoothstep(3.86, 4.48, t));
}

function flashAt(t) {
  const hold = Math.min(t, 3);
  return smoothstep(2.78, 2.94, hold) * (1 - smoothstep(3.02, 3.46, t));
}

// ---------- 空间底色 ----------

function drawSpace(p, t) {
  const ft = flowTime(t);
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  // 远景层：信号空间而不是机柜/媒体墙。
  fillHex(p, C.navy, 0.16);
  p.rect(0, 204, 1000, 416);
  fillHex(p, C.panel, 0.2);
  p.rect(0, 620, 1000, 238);
  fillHex(p, C.bgDeep, 0.42);
  p.rect(0, 850, 1000, 150);

  linearWash(
    p,
    0,
    160,
    0,
    860,
    [
      [0, 'rgba(2,5,13,0.46)'],
      [0.22, 'rgba(3,8,20,0.06)'],
      [0.62, 'rgba(0,0,0,0)'],
      [0.82, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.52)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 极淡的汇流网格：竖线更弱，横线只留几条。
  p.strokeWeight(0.7);
  for (let x = 20; x < 1000; x += 48) {
    strokeHex(p, C.line, x % 96 === 20 ? 0.045 : 0.024);
    p.line(x, 206, x, 792);
  }
  for (let y = 220; y < 792; y += 46) {
    strokeHex(p, C.navyLight, y % 92 === 36 ? 0.045 : 0.022);
    p.line(0, y, 1000, y);
  }
  strokeHex(p, C.cyan, 0.055);
  p.strokeWeight(0.8);
  p.line(0, 266, 1000, 266);
  p.line(0, 434, 1000, 434);
  p.line(0, 584, 1000, 584);

  // 棱镜周围的信号轨道：几段宽椭圆，只留很淡的弧。
  for (let k = 0; k < 3; k++) {
    strokeArc(
      p,
      PRISM.center[0] - 8,
      PRISM.center[1] + 4,
      146 + k * 34,
      96 + k * 24,
      -2.55 + k * 0.18,
      0.52 + k * 0.14,
      k === 1 ? C.violet : C.cyan,
      0.026 - k * 0.004,
      0.8,
      42
    );
  }

  // 远处的四色信号轨迹，只作为空气里的方向感。
  for (let k = 0; k < 4; k++) {
    const y = 304 + k * 66;
    const drift = Math.sin(ft * 0.32 + k * 1.3) * 8;
    strokeHex(p, k === 0 ? C.rose : k === 1 ? C.amber : k === 2 ? C.violet : C.mint, 0.035);
    p.strokeWeight(0.7);
    p.beginShape();
    for (let i = 0; i <= 22; i++) {
      const u = i / 22;
      p.vertex(20 + u * 520, y + drift * u + Math.sin(u * Math.PI * 2 + k) * 5);
    }
    p.endShape();
  }

  // 低 alpha 叠层光晕，不做 blur。
  p.noStroke();
  fillHex(p, C.cyan, 0.014);
  p.ellipse(744, 430, 440, 300);
  fillHex(p, C.cyan, 0.012);
  p.ellipse(854, 394, 246, 300);
  fillHex(p, C.violet, 0.008);
  p.ellipse(690, 330, 200, 220);
  fillHex(p, C.ember, 0.008);
  p.ellipse(520, 520, 300, 66);

  // 空气尘埃。
  for (const d of DUST) {
    fillHex(p, d.warm ? C.emberHot : d.cool ? C.cyanSoft : C.creamDim, d.a);
    p.ellipse(d.x, d.y, d.r, d.r);
    if (d.r > 1.35 && d.cool) {
      fillHex(p, C.cyan, d.a * 0.35);
      p.ellipse(d.x, d.y, d.r * 3.4, d.r * 3.4);
    }
  }
  p.pop();
}

// ---------- 共享嵌入星座 ----------

function drawConstellationBase(p, t, lock) {
  const revealA = smoothstep(0.4, 1.25, t);
  const revealB = smoothstep(1.6, 2.4, t);
  const revealC = smoothstep(1.95, 2.75, t);
  const groupReveal = [revealA, revealB, revealC];
  const fade = 1 - 0.28 * smoothstep(4.5, 5.8, t);

  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.012);
  p.ellipse(844, 438, 330, 382);
  fillHex(p, C.violet, 0.008);
  p.ellipse(810, 438, 250, 300);

  // 先画细连线，再画点。
  p.strokeWeight(0.65);
  for (let i = 0; i < CONST_LINES.length; i++) {
    const [a, b] = CONST_LINES[i];
    const g = a[1] < 372 ? 0 : a[1] > 512 ? 2 : 1;
    const ra = groupReveal[g] * fade;
    strokeHex(p, i === 4 || i === 8 || i === 13 ? C.cyan : C.steel, 0.07 * ra + lock * 0.035);
    p.line(a[0], a[1], b[0], b[1]);
  }

  // 背景散点。
  p.noStroke();
  for (const d of CONST_DOTS) {
    const ra = groupReveal[d.g] * fade;
    fillHex(p, d.g === 1 ? C.cyanSoft : C.steel, d.a * ra);
    p.ellipse(d.x, d.y, d.r, d.r);
  }

  // 星座主锚点。
  for (const s of CONST_ANCHORS) {
    const ra = groupReveal[s.g] * fade;
    p.noStroke();
    fillHex(p, s.g === 0 ? C.cyanSoft : s.g === 1 ? C.creamDim : C.violetSoft, 0.16 * ra);
    p.ellipse(s.x, s.y, s.r * 3.6, s.r * 3.6);
    fillHex(p, s.g === 0 ? C.cyan : s.g === 1 ? C.cream : C.violetSoft, (0.5 + 0.28 * lock) * ra);
    p.ellipse(s.x, s.y, s.r, s.r);
    if (s.g === 0) {
      strokeHex(p, C.cyan, 0.24 * ra);
      p.strokeWeight(0.6);
      p.line(s.x - 4, s.y, s.x + 4, s.y);
      p.line(s.x, s.y - 4, s.x, s.y + 4);
    }
  }

  // 同一光点的底座：平时只是一个小节点，高光时被四路信号压亮。
  const starReveal = smoothstep(0.8, 1.9, t) * fade;
  fillHex(p, C.cyan, (0.03 + 0.08 * lock) * starReveal);
  p.ellipse(STAR.x, STAR.y, 42 + lock * 18, 42 + lock * 18);
  fillHex(p, C.cyanSoft, (0.12 + 0.25 * lock) * starReveal);
  p.ellipse(STAR.x, STAR.y, 9 + lock * 2, 9 + lock * 2);
  fillHex(p, C.ink, (0.42 + 0.45 * lock) * starReveal);
  p.ellipse(STAR.x, STAR.y, 2.8, 2.8);
  p.pop();
}

// ---------- 四路信号流 ----------

function drawImageGlyph(p, x, y, s, alpha, rot = 0) {
  p.push();
  p.translate(x, y);
  p.rotate(rot);
  p.noStroke();
  fillHex(p, C.bgLow, 0.72 * alpha);
  p.rect(-s / 2 + 1.4, -s / 2 + 1.8, s, s, 1.3);
  fillHex(p, C.rose, 0.16 * alpha);
  p.rect(-s / 2, -s / 2, s, s, 1.2);
  fillHex(p, C.roseSoft, 0.3 * alpha);
  p.beginShape();
  p.vertex(-s * 0.34, s * 0.3);
  p.vertex(-s * 0.03, -s * 0.08);
  p.vertex(s * 0.28, s * 0.3);
  p.endShape(p.CLOSE);
  fillHex(p, C.rose, 0.85 * alpha);
  p.triangle(-s * 0.34, s * 0.3, -s * 0.08, s * 0.02, s * 0.1, s * 0.3);
  fillHex(p, C.cream, 0.58 * alpha);
  p.ellipse(s * 0.18, -s * 0.2, s * 0.17, s * 0.17);
  p.noFill();
  strokeHex(p, C.roseSoft, 0.82 * alpha);
  p.strokeWeight(0.85);
  p.rect(-s / 2, -s / 2, s, s, 1.2);
  p.pop();
}

function drawAudioGlyph(p, x, y, s, alpha, rot = 0) {
  p.push();
  p.translate(x, y);
  p.rotate(rot);
  p.noStroke();
  fillHex(p, C.bgLow, 0.72 * alpha);
  p.rect(-s / 2 + 1.4, -s / 2 + 1.8, s, s, 1.3);
  fillHex(p, C.amber, 0.14 * alpha);
  p.rect(-s / 2, -s / 2, s, s, 1.2);
  p.noFill();
  strokeHex(p, C.amberSoft, 0.85 * alpha);
  p.strokeWeight(0.85);
  p.rect(-s / 2, -s / 2, s, s, 1.2);
  strokeHex(p, C.amber, 0.9 * alpha);
  p.strokeWeight(0.9);
  p.beginShape();
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const wx = -s * 0.34 + u * s * 0.68;
    const wy = Math.sin(u * TAU * 1.25 + 0.5) * s * 0.2;
    p.vertex(wx, wy);
  }
  p.endShape();
  p.noStroke();
  fillHex(p, C.amberSoft, 0.5 * alpha);
  p.rect(-s * 0.34, s * 0.26, s * 0.68, 0.8);
  p.pop();
}

function drawTextGlyph(p, x, y, s, alpha, glyph, rot = 0) {
  p.push();
  p.translate(x, y);
  p.rotate(rot);
  p.noStroke();
  fillHex(p, C.bgLow, 0.72 * alpha);
  p.rect(-s / 2 + 1.4, -s / 2 + 1.8, s, s, 1.3);
  fillHex(p, C.violet, 0.14 * alpha);
  p.rect(-s / 2, -s / 2, s, s, 1.2);
  fillHex(p, C.violetSoft, 0.15 * alpha);
  p.rect(-s * 0.32, -s * 0.3, s * 0.64, s * 0.11);
  p.rect(-s * 0.32, s * 0.2, s * 0.4, s * 0.1);
  p.noFill();
  strokeHex(p, C.violetSoft, 0.84 * alpha);
  p.strokeWeight(0.85);
  p.rect(-s / 2, -s / 2, s, s, 1.2);
  p.noStroke();
  p.textFont('monospace');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(s * 0.54);
  fillHex(p, C.cream, 0.86 * alpha);
  p.text(glyph, 0, s * 0.02);
  p.textStyle(p.NORMAL);
  p.pop();
}

function drawVideoGlyph(p, x, y, s, alpha, rot = 0) {
  const w = s * 1.5;
  const h = s * 0.66;
  p.push();
  p.translate(x, y);
  p.rotate(rot);
  p.noStroke();
  fillHex(p, C.bgLow, 0.74 * alpha);
  p.rect(-w / 2 + 1.5, -h / 2 + 1.8, w, h, 1.1);
  fillHex(p, C.mint, 0.14 * alpha);
  p.rect(-w / 2, -h / 2, w, h, 1);
  p.noFill();
  strokeHex(p, C.mintSoft, 0.82 * alpha);
  p.strokeWeight(0.8);
  p.rect(-w / 2, -h / 2, w, h, 1);
  for (let k = 0; k < 3; k++) {
    const fx = -w / 2 + 1.5 + k * (w - 3) / 3;
    fillHex(p, k === 1 ? C.mintSoft : C.mint, (0.18 + k * 0.035) * alpha);
    p.rect(fx, -h / 2 + 1.4, (w - 3) / 3 - 1, h - 2.8, 0.4);
  }
  fillHex(p, C.ink, 0.52 * alpha);
  p.triangle(w * 0.42, 0, w * 0.32, -2.2, w * 0.32, 2.2);
  fillHex(p, C.mintSoft, 0.4 * alpha);
  for (let k = 0; k < 4; k++) {
    p.rect(-w / 2 + 2 + k * (w - 4) / 4, -h / 2 - 1, 1, 0.7);
    p.rect(-w / 2 + 2 + k * (w - 4) / 4, h / 2 + 0.4, 1, 0.7);
  }
  p.pop();
}

function drawSignalPacket(p, kind, x, y, size, color, alpha, rot, seed) {
  if (alpha <= 0.003) return;
  if (kind === 'image') {
    drawImageGlyph(p, x, y, size, alpha, rot);
  } else if (kind === 'audio') {
    drawAudioGlyph(p, x, y, size, alpha, rot);
  } else if (kind === 'text') {
    drawTextGlyph(p, x, y, size, alpha, seed % 2 === 0 ? 'A' : '0', rot);
  } else {
    drawVideoGlyph(p, x, y, size, alpha, rot);
  }
}

function drawStreams(p, t, lock) {
  const ft = flowTime(t);
  const fade = 1 - 0.42 * smoothstep(4.5, 5.8, t);
  p.push();

  // 先铺一层很低 alpha 的汇流槽，四路从左侧/上方一起向棱镜收束。
  for (const s of STREAMS) {
    const reveal = smoothstep(0.16 + s.phase * 0.12, 1.08 + s.phase * 0.1, t);
    strokeCubic(p, s.path, C.bgDeep, 0.62 * reveal * fade, 5.2, 34);
    strokeCubic(p, s.path, s.color, (0.09 + 0.07 * lock) * reveal * fade, 1.5, 34);
    strokeCubic(p, s.path, s.edge, (0.07 + 0.08 * lock) * reveal * fade, 0.55, 34);

    // 信号流向棱镜的短刻线，像在管内推进。
    for (let k = 0; k < 7; k++) {
      const u0 = (k * 0.145 + ft * 0.025 + s.phase) % 1;
      if (u0 > 0.94) continue;
      const [x0, y0] = cubicPoint(s.path, u0);
      const [x1, y1] = cubicPoint(s.path, Math.min(1, u0 + 0.016));
      strokeHex(p, s.edge, (0.08 + 0.1 * hash2(k, 1, s.seed)) * reveal * fade);
      p.strokeWeight(0.7);
      p.line(x0, y0, x1, y1);
    }

    // 移动的几何信号包：图像方块、音频方形波形、字形方块、视频条带。
    const count = s.kind === 'video' ? 3 : 4;
    for (let k = 0; k < count; k++) {
      let u = (s.phase + k * (s.kind === 'video' ? 0.27 : 0.21) + ft * 0.045) % 1;
      if (u < 0.03 || u > 0.97) continue;
      const [x, y] = cubicPoint(s.path, u);
      const [ax, ay] = cubicPoint(s.path, Math.min(1, u + 0.018));
      const [bx, by] = cubicPoint(s.path, Math.max(0, u - 0.018));
      const rot = Math.atan2(ay - by, ax - bx) * 0.34;
      const a =
        (0.22 + 0.33 * hash2(k, 2, s.seed)) *
        smoothstep(0.45, 1.3, t) *
        fade *
        (0.72 + 0.28 * lock);
      const size = s.kind === 'video' ? 7.5 : 10.5;
      drawSignalPacket(p, s.kind, x, y, size, s.color, a, rot, k + s.seed);
    }

    // 入口小方口：高光时点亮。
    const ap = s.aperture;
    fillHex(p, C.bgDeep, 0.8 * reveal);
    p.rect(ap[0] - 4.4, ap[1] - 4.4, 8.8, 8.8, 1.2);
    p.noFill();
    strokeHex(p, s.edge, (0.34 + 0.52 * lock) * reveal);
    p.strokeWeight(0.9);
    p.rect(ap[0] - 4.4, ap[1] - 4.4, 8.8, 8.8, 1.2);
    if (lock > 0.02) {
      p.noStroke();
      fillHex(p, s.color, 0.09 * lock * reveal);
      p.ellipse(ap[0], ap[1], 18, 18);
    }
  }

  // 四路在棱镜左侧形成的束带节点。
  const bundleA = smoothstep(1.2, 2.4, t);
  if (bundleA > 0.01) {
    p.noFill();
    strokeHex(p, C.cyan, 0.11 * bundleA);
    p.strokeWeight(0.8);
    for (let i = 0; i < 4; i++) {
      const s = STREAMS[i];
      p.line(s.aperture[0] - 22, s.aperture[1] + (i - 1.5) * 1.5, s.aperture[0] + 1, s.aperture[1]);
    }
  }
  p.pop();
}

// ---------- 中央多面棱镜 ----------

function drawPrismBody(p, reveal, lock, flash, stall, floatY) {
  const top = [PRISM.top[0], PRISM.top[1] + floatY];
  const ul = [PRISM.upperLeft[0], PRISM.upperLeft[1] + floatY];
  const left = [PRISM.left[0], PRISM.left[1] + floatY];
  const bottom = [PRISM.bottom[0], PRISM.bottom[1] + floatY];
  const lr = [PRISM.lowerRight[0], PRISM.lowerRight[1] + floatY];
  const ur = [PRISM.upperRight[0], PRISM.upperRight[1] + floatY];
  const center = [PRISM.center[0], PRISM.center[1] + floatY];

  // 外表壳
  polyShape(
    p,
    [top, ur, lr, bottom, left, ul],
    C.face,
    0.58 * reveal,
    C.edge,
    0.5 * reveal,
    1
  );

  // 面片：四色都很低饱和，只在棱镜内部分区。
  polyShape(p, [top, ul, center], C.violet, 0.075 * reveal, C.violetSoft, 0.26 * reveal, 0.8);
  polyShape(p, [top, center, ur], C.rose, 0.06 * reveal, C.roseSoft, 0.22 * reveal, 0.8);
  polyShape(p, [ul, left, center], C.amber, 0.07 * reveal, C.amberSoft, 0.23 * reveal, 0.8);
  polyShape(p, [ur, center, lr], C.mint, 0.055 * reveal, C.mintSoft, 0.2 * reveal, 0.8);
  polyShape(p, [left, bottom, center], C.mint, 0.05 * reveal, C.mintSoft, 0.19 * reveal, 0.8);
  polyShape(p, [center, bottom, lr], C.amber, 0.055 * reveal, C.amberSoft, 0.19 * reveal, 0.8);
  polyShape(p, [center, ul, left], C.cyan, 0.05 * reveal, C.cyan, 0.22 * reveal, 0.8);

  // 棱镜里的汇流路径：四个入口全部走向中心。
  const inAlpha = (0.1 + 0.48 * lock) * reveal;
  for (let i = 0; i < STREAMS.length; i++) {
    const s = STREAMS[i];
    strokeHex(p, s.color, inAlpha);
    p.strokeWeight(0.85 + lock * 0.35);
    p.line(s.aperture[0], s.aperture[1] + floatY, center[0], center[1]);
    p.line(center[0], center[1], s.out[0], s.out[1] + floatY);
  }

  // 轻微厚度：右侧薄边。
  p.noFill();
  strokeHex(p, C.cyan, 0.18 * reveal);
  p.strokeWeight(0.7);
  p.line(ur[0] + 4, ur[1] - 2, lr[0] + 4, lr[1] - 2);
  p.line(lr[0] + 4, lr[1] - 2, bottom[0] + 4, bottom[1] - 3);
  strokeHex(p, C.navyLight, 0.32 * reveal);
  p.strokeWeight(1);
  p.line(left[0] - 4, left[1] - 2, ul[0] - 4, ul[1] - 2);
  p.line(ul[0] - 4, ul[1] - 2, top[0] - 2, top[1] - 2);

  // 镜面环 / 内部刻度。环是 2D 椭圆，低 alpha。
  p.push();
  p.translate(center[0], center[1]);
  p.noFill();
  strokeHex(p, C.cyan, 0.15 * reveal);
  p.strokeWeight(0.8);
  p.ellipse(0, 0, 64, 48);
  p.rotate(-0.34);
  strokeHex(p, C.cyanSoft, 0.1 * reveal);
  p.strokeWeight(0.7);
  p.ellipse(0, 0, 86, 24);
  p.rotate(0.68);
  strokeHex(p, C.violetSoft, 0.085 * reveal);
  p.ellipse(0, 0, 74, 20);
  p.pop();

  // 核心：冷却的集束点，与主角的暖火种区分；高光时闪一下。
  p.noStroke();
  fillHex(p, C.bgDeep, 0.88 * reveal);
  p.ellipse(center[0], center[1], 25, 25);
  fillHex(p, C.cyan, (0.11 + 0.18 * lock) * reveal);
  p.ellipse(center[0], center[1], 20 + lock * 3, 20 + lock * 3);
  fillHex(p, C.cyanSoft, (0.3 + 0.35 * lock) * reveal);
  p.ellipse(center[0], center[1], 7.5, 7.5);
  fillHex(p, C.ink, (0.72 + 0.2 * lock) * reveal);
  p.ellipse(center[0] - 0.4, center[1] - 0.5, 2.8 + flash * 1.2, 2.8 + flash * 1.2);
  if (flash > 0.02) {
    fillHex(p, C.cyan, 0.09 * flash * reveal);
    p.ellipse(center[0], center[1], 64 * (0.6 + flash * 0.4), 64 * (0.6 + flash * 0.4));
    p.noFill();
    strokeHex(p, C.cyanSoft, 0.2 * flash * reveal);
    p.strokeWeight(0.8);
    for (let i = 0; i < 5; i++) {
      const a = i * (TAU / 5) + 0.3;
      p.line(
        center[0] + Math.cos(a) * 16,
        center[1] + Math.sin(a) * 16,
        center[0] + Math.cos(a) * (28 + hash2(i, 1, 166) * 14),
        center[1] + Math.sin(a) * (28 + hash2(i, 1, 166) * 14)
      );
    }
    p.noStroke();
  }

  // 卡顿的错位环：只出现在高光窗口，和星旁的小 ? 一起读成“压错了一次”。
  if (stall > 0.02) {
    p.push();
    p.translate(center[0], center[1]);
    p.noFill();
    strokeHex(p, C.cream, 0.24 * stall * reveal);
    p.strokeWeight(0.8);
    p.ellipse(3.5, -1.5, 48, 48);
    strokeHex(p, C.cyan, 0.2 * stall * reveal);
    p.ellipse(-2, 2.5, 37, 37);
    p.line(-25, -14, -19, -18);
    p.line(20, 15, 25, 19);
    p.pop();
  }

  // 外框最后压一遍。
  p.noFill();
  strokeHex(p, C.cyan, (0.52 + 0.2 * lock) * reveal);
  p.strokeWeight(1.2);
  p.beginShape();
  for (const [x, y] of [top, ur, lr, bottom, left, ul]) p.vertex(x, y);
  p.endShape(p.CLOSE);
  strokeHex(p, C.cyanSoft, 0.12 * reveal);
  p.strokeWeight(0.6);
  p.beginShape();
  for (const [x, y] of [top, ur, lr, bottom, left, ul]) p.vertex(x, y);
  p.endShape(p.CLOSE);
}

function drawPrism(p, t) {
  const hold = Math.min(t, 3);
  const reveal = smoothstep(0.15, 1.15, t);
  const lock = convergenceLock(t);
  const flash = flashAt(t);
  const stall = smoothstep(2.7, 2.96, hold) * (1 - smoothstep(3.72, 4.2, t));
  const floatY = Math.sin(flowTime(t) * 2.2) * 1.2 * (1 - stall);

  p.push();
  p.noStroke();
  // 棱镜背后的低位光晕。
  fillHex(p, C.cyan, 0.012 * reveal);
  p.ellipse(684, 400, 270, 240);
  fillHex(p, C.violet, 0.009 * reveal);
  p.ellipse(658, 340, 190, 160);
  fillHex(p, C.ember, 0.006 * reveal);
  p.ellipse(640, 452, 150, 50);

  // 下方的细光柱，连接到混合带。
  if (reveal > 0.03) {
    fillHex(p, C.cyan, 0.028 * reveal);
    p.beginShape();
    p.vertex(650, 430 + floatY);
    p.vertex(696, 430 + floatY);
    p.vertex(706, 472);
    p.vertex(640, 472);
    p.endShape(p.CLOSE);
    strokeHex(p, C.cyan, 0.1 * reveal);
    p.strokeWeight(0.7);
    p.line(665, 436 + floatY, 660, 470);
    p.line(683, 436 + floatY, 690, 470);
  }

  drawPrismBody(p, reveal, lock, flash, stall, floatY);

  // 四个入口 / 出口的小方口。
  for (let i = 0; i < STREAMS.length; i++) {
    const s = STREAMS[i];
    const ax = s.aperture[0];
    const ay = s.aperture[1] + floatY;
    p.noStroke();
    fillHex(p, C.bgDeep, 0.9 * reveal);
    p.rect(ax - 4.2, ay - 4.2, 8.4, 8.4, 1);
    p.noFill();
    strokeHex(p, s.color, (0.45 + 0.45 * lock) * reveal);
    p.strokeWeight(0.9);
    p.rect(ax - 4.2, ay - 4.2, 8.4, 8.4, 1);
    p.noStroke();
    fillHex(p, s.edge, (0.42 + 0.45 * lock) * reveal);
    p.ellipse(ax, ay, 2.1, 2.1);

    const ox = s.out[0];
    const oy = s.out[1] + floatY;
    fillHex(p, C.bgDeep, 0.86 * reveal);
    p.rect(ox - 3.3, oy - 3.3, 6.6, 6.6, 0.8);
    p.noFill();
    strokeHex(p, s.edge, (0.3 + 0.4 * lock) * reveal);
    p.strokeWeight(0.7);
    p.rect(ox - 3.3, oy - 3.3, 6.6, 6.6, 0.8);
  }

  // 定格窗口里的“停止”刻度，不写文字。
  if (stall > 0.02) {
    p.noFill();
    strokeHex(p, C.cream, 0.2 * stall);
    p.strokeWeight(1);
    p.line(702, 250, 710, 258);
    p.line(710, 250, 702, 258);
    p.line(746, 464, 754, 470);
  }
  p.pop();
}

// ---------- 出口：同一光点 / 圆形错配 ----------

function drawConvergence(p, t) {
  const hold = Math.min(t, 3);
  const lock = convergenceLock(t);
  const appear = smoothstep(1.9, 2.55, t);
  const fade = 1 - smoothstep(4.15, 5.15, t);
  const arrive = smoothstep(2.0, 2.86, hold);
  const videoArrive = smoothstep(2.22, 3.0, hold);
  const circleArrive = smoothstep(2.55, 3.0, hold);
  if (lock <= 0.002 || appear <= 0.002) return;

  const holdFade = appear * fade;
  p.push();
  p.noStroke();

  // 四条输出光束从棱镜右侧汇到同一颗光点。
  for (let i = 0; i < STREAMS.length; i++) {
    const s = STREAMS[i];
    const path = [
      [s.out[0], s.out[1]],
      [s.out[0] + 24, s.out[1] + (i - 1.5) * 4],
      [STAR.x - 30, STAR.y + (i - 1.5) * 9],
      [STAR.x, STAR.y]
    ];
    strokeCubic(p, path, s.color, (0.07 + 0.2 * lock) * holdFade, 0.9, 24);
    // 输出口到星点的小方光，锁定时收成同一点。
    const e = smoothstep(0.28, 1, arrive);
    const [sx, sy] = cubicPoint(path, e);
    const glyphAlpha = (0.22 + 0.55 * lock) * holdFade * (1 - lock * 0.78);
    const rot = -0.12 + i * 0.06;
    const size = 8.5;
    if (i === 0) {
      drawImageGlyph(p, sx, sy, size, glyphAlpha, rot);
    } else if (i === 1) {
      drawAudioGlyph(p, sx, sy, size, glyphAlpha, rot);
    } else if (i === 2) {
      drawTextGlyph(p, sx, sy, size, glyphAlpha, i % 2 ? 'B' : 'A', rot);
    } else {
      drawVideoGlyph(p, sx, sy, size * 0.9, glyphAlpha, rot);
    }
  }

  // 视频条带稍微晚到，贴在光点右侧。
  if (videoArrive > 0.005) {
    const vx = STAR.x - 3 + videoArrive * 18;
    const vy = STAR.y + 2 + videoArrive * 11;
    p.push();
    p.translate(vx, vy);
    p.rotate(0.16 - 0.06 * videoArrive);
    fillHex(p, C.mint, 0.08 * videoArrive * holdFade);
    p.rect(-14, -5, 28, 10, 2);
    p.noFill();
    strokeHex(p, C.mintSoft, 0.5 * videoArrive * holdFade);
    p.strokeWeight(0.75);
    p.rect(-14, -5, 28, 10, 2);
    for (let k = 0; k < 3; k++) {
      p.noStroke();
      fillHex(p, k === 1 ? C.mintSoft : C.mint, (0.24 + 0.18 * k) * videoArrive * holdFade);
      p.rect(-12 + k * 8.7, -3.2, 6.4, 6.4, 0.6);
    }
    fillHex(p, C.cream, 0.55 * videoArrive * holdFade);
    p.triangle(11.5, 0, 8.5, -2.4, 8.5, 2.4);
    p.pop();
  }

  // 同一颗光点：四个方形信号压成一枚四色小方块。
  const composite = smoothstep(2.45, 2.95, hold);
  if (composite > 0.01) {
    const a = composite * holdFade;
    p.push();
    p.translate(STAR.x, STAR.y);
    // 压缩残影：三圈方框略错位，表现“不是同一个东西，却被压到同一处”。
    p.noFill();
    strokeHex(p, C.roseSoft, 0.2 * a);
    p.strokeWeight(0.7);
    p.rect(-8.8, -8.2, 17.6, 17.6, 1.4);
    strokeHex(p, C.violetSoft, 0.16 * a);
    p.rect(-6.8, -7.8, 16.2, 16.2, 1.2);
    strokeHex(p, C.amberSoft, 0.14 * a);
    p.rect(-7.4, -8.8, 16.8, 16.8, 1.1);

    // 四色复合方块。
    p.noStroke();
    fillHex(p, C.bgDeep, 0.88 * a);
    p.rect(-7.4, -7.4, 14.8, 14.8, 1.6);
    fillHex(p, C.rose, 0.58 * a);
    p.rect(-6.4, -6.4, 6.1, 6.1, 0.5);
    fillHex(p, C.amber, 0.58 * a);
    p.rect(0.3, -6.4, 6.1, 6.1, 0.5);
    fillHex(p, C.violet, 0.58 * a);
    p.rect(-6.4, 0.3, 6.1, 6.1, 0.5);
    fillHex(p, C.mint, 0.58 * a);
    p.rect(0.3, 0.3, 6.1, 6.1, 0.5);
    fillHex(p, C.cream, 0.75 * a);
    p.ellipse(0, 0, 2.3, 2.3);
    p.noFill();
    strokeHex(p, C.cream, 0.75 * a);
    p.strokeWeight(0.9);
    p.rect(-7.4, -7.4, 14.8, 14.8, 1.6);
    // 小刻度：图像/字形/波形/影格四个角标。
    p.strokeWeight(0.55);
    strokeHex(p, C.roseSoft, 0.7 * a);
    p.line(-6.2, -5.1, -2.2, -5.1);
    strokeHex(p, C.violetSoft, 0.7 * a);
    p.line(-5.9, 1.3, -3.1, 1.3);
    p.line(-4.5, 2.8, -4.5, 4.7);
    strokeHex(p, C.amberSoft, 0.7 * a);
    p.beginShape();
    p.vertex(1.2, 4.3);
    p.vertex(2.4, 2.3);
    p.vertex(3.4, 4.3);
    p.vertex(4.5, 2.9);
    p.endShape();
    strokeHex(p, C.mintSoft, 0.7 * a);
    p.rect(2.0, -4.7, 3.0, 2.1, 0.3);
    p.pop();
  }

  // 圆形信号也来到同一点：压成一个圆环，旁边出现错位环和小 ?。
  if (circleArrive > 0.005) {
    const ca = circleArrive * holdFade;
    p.push();
    p.translate(STAR.x - 3 + 2 * circleArrive, STAR.y + 1 - 2 * circleArrive);
    p.noFill();
    strokeHex(p, C.cream, 0.65 * ca);
    p.strokeWeight(1);
    p.ellipse(0, 0, 10.5, 10.5);
    strokeHex(p, C.cyan, 0.35 * ca);
    p.ellipse(0, 0, 14.5, 14.5);
    p.noStroke();
    fillHex(p, C.cream, 0.4 * ca);
    p.ellipse(0, 0, 2.2, 2.2);
    p.pop();

    const ringA = 0.38 * lock * holdFade;
    p.push();
    p.translate(STAR.x + 2, STAR.y - 1);
    p.noFill();
    strokeHex(p, C.creamDim, ringA);
    p.strokeWeight(0.9);
    // 两段开口圆弧拼出错位环，不用 bezier/arc 闭合形状。
    p.beginShape();
    for (let i = 0; i <= 18; i++) {
      const a = -0.3 + (i / 18) * Math.PI * 1.3;
      p.vertex(Math.cos(a) * 15.5, Math.sin(a) * 16.2);
    }
    p.endShape();
    p.beginShape();
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 1.15 + (i / 12) * Math.PI * 0.55;
      p.vertex(Math.cos(a) * 15.5, Math.sin(a) * 16.2);
    }
    p.endShape();
    strokeHex(p, C.cyan, 0.22 * lock * holdFade);
    p.beginShape();
    for (let i = 0; i <= 14; i++) {
      const a = 0.9 + (i / 14) * Math.PI * 1.1;
      p.vertex(Math.cos(a) * 21 + 1.8, Math.sin(a) * 21 - 1.5);
    }
    p.endShape();
    p.pop();

    // 小问号。只一个符号，不做解释文字。
    const qa = smoothstep(2.82, 3.0, hold) * fade;
    if (qa > 0.01) {
      p.textFont('monospace');
      p.textStyle(p.BOLD);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(14);
      fillHex(p, C.cream, 0.78 * qa);
      p.text('?', STAR.x + 28, STAR.y - 22);
      p.textStyle(p.NORMAL);
      p.noFill();
      strokeHex(p, C.cream, 0.16 * qa);
      p.strokeWeight(0.45);
      p.line(STAR.x + 19, STAR.y - 16, STAR.x + 24, STAR.y - 18);
    }
  }

  // 星点亮时的低 alpha 光晕 + 四色余辉。
  if (lock > 0.01) {
    fillHex(p, C.cyan, 0.035 * lock * holdFade);
    p.ellipse(STAR.x, STAR.y, 54 + 12 * lock, 54 + 12 * lock);
    fillHex(p, C.cream, 0.028 * lock * holdFade);
    p.ellipse(STAR.x, STAR.y, 30, 30);
    for (let i = 0; i < 4; i++) {
      const s = STREAMS[i];
      const a = lock * holdFade;
      fillHex(p, s.color, 0.045 * a);
      p.ellipse(STAR.x + (i - 1.5) * 2.2, STAR.y + (i % 2 ? 1.5 : -1.5), 44, 22);
    }
  }
  p.pop();
}

// ---------- 混合信号带 / 路 ----------

function drawImageLane(p, i, x, y, ft, color, alpha) {
  const s = 6.4;
  p.noStroke();
  fillHex(p, color, 0.16 * alpha);
  p.rect(x, y - s / 2, s, s, 0.8);
  fillHex(p, C.bgLow, 0.6 * alpha);
  p.rect(x + 0.8, y - s / 2 + 0.8, s - 1.6, s - 1.6, 0.4);
  if (i % 3 === 0) {
    fillHex(p, C.roseSoft, 0.5 * alpha);
    p.triangle(x + 1.2, y + 2.2, x + 3.4, y - 1.4, x + 5.1, y + 2.2);
    fillHex(p, C.cream, 0.28 * alpha);
    p.ellipse(x + 4.3, y - 1.5, 1.2, 1.2);
  } else if (i % 3 === 1) {
    p.noFill();
    strokeHex(p, C.roseSoft, 0.45 * alpha);
    p.strokeWeight(0.7);
    p.line(x + 1.4, y + 2.2, x + 4.8, y - 2.2);
    p.noStroke();
    fillHex(p, C.rose, 0.32 * alpha);
    p.rect(x + 1.4, y + 1.2, 2.2, 1.2);
  } else {
    fillHex(p, C.roseSoft, 0.4 * alpha);
    p.rect(x + 1.5, y - 2.4, 3.4, 4.8, 0.8);
    fillHex(p, C.bgLow, 0.5 * alpha);
    p.rect(x + 2.4, y - 1.5, 1.6, 3, 0.4);
  }
  p.noFill();
  strokeHex(p, color, 0.33 * alpha);
  p.strokeWeight(0.55);
  p.rect(x, y - s / 2, s, s, 0.8);
}

function drawAudioLane(p, alpha) {
  p.push();
  p.noFill();
  strokeHex(p, C.amber, 0.18 * alpha);
  p.strokeWeight(0.85);
  p.beginShape();
  for (let i = 0; i <= 70; i++) {
    const x = (i / 70) * 1000;
    const env = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(i * 0.39));
    p.vertex(x, 492.5 + Math.sin(i * 0.74) * 2.8 * env);
  }
  p.endShape();
  strokeHex(p, C.amberSoft, 0.1 * alpha);
  p.strokeWeight(0.55);
  p.beginShape();
  for (let i = 0; i <= 70; i++) {
    const x = (i / 70) * 1000;
    p.vertex(x, 492.5 + Math.sin(i * 0.74 + 0.7) * 2.2);
  }
  p.endShape();
  p.pop();
}

function drawTextLane(p, x, y, i, alpha) {
  const w = 8.5;
  const h = 7.2;
  p.noStroke();
  fillHex(p, C.bgLow, 0.6 * alpha);
  p.rect(x, y - h / 2, w, h, 0.7);
  p.noFill();
  strokeHex(p, C.violetSoft, 0.28 * alpha);
  p.strokeWeight(0.55);
  p.rect(x, y - h / 2, w, h, 0.7);
  p.noStroke();
  fillHex(p, C.violetSoft, 0.48 * alpha);
  if (i % 3 === 0) {
    p.rect(x + 1.4, y - 1.4, 3.8, 0.7);
    p.rect(x + 1.4, y + 0.4, 2.6, 0.7);
    p.rect(x + 1.4, y + 2.2, 4.6, 0.55);
  } else if (i % 3 === 1) {
    p.rect(x + 2.0, y - 2.0, 0.7, 4.2);
    p.rect(x + 3.3, y - 2.0, 3.1, 0.7);
    p.rect(x + 3.3, y + 0.1, 2.3, 0.65);
  } else {
    p.rect(x + 1.4, y - 2.2, 4.0, 0.65);
    p.rect(x + 1.4, y - 0.5, 1.1, 3.0);
    p.rect(x + 3.7, y - 0.5, 0.7, 3.0);
  }
}

function drawVideoLane(p, x, y, i, ft, alpha) {
  const w = 22;
  const h = 8;
  p.noStroke();
  fillHex(p, C.bgLow, 0.7 * alpha);
  p.rect(x, y - h / 2, w, h, 0.9);
  p.noFill();
  strokeHex(p, C.mintSoft, 0.28 * alpha);
  p.strokeWeight(0.55);
  p.rect(x, y - h / 2, w, h, 0.9);
  for (let k = 0; k < 3; k++) {
    const fx = x + 1.2 + k * 6.9;
    p.noStroke();
    fillHex(p, k === (i + Math.floor(ft)) % 3 ? C.mintSoft : C.mint, 0.28 * alpha);
    p.rect(fx, y - 2.6, 5.6, 5.2, 0.35);
    if (k === 1) {
      fillHex(p, C.ink, 0.3 * alpha);
      p.triangle(fx + 4.1, y, fx + 2.4, y - 1.4, fx + 2.4, y + 1.4);
    }
  }
  fillHex(p, C.mintSoft, 0.28 * alpha);
  for (let k = 0; k < 4; k++) {
    p.rect(x + 2 + k * 5.2, y - h / 2 - 1.1, 1.1, 0.65);
    p.rect(x + 2 + k * 5.2, y + h / 2 + 0.45, 1.1, 0.65);
  }
}

function drawBandBase(p, ft, exit) {
  p.push();
  p.noStroke();

  // 完全覆盖默认路带 y≈470–530，这里用 467–533 的混合信号带。
  fillHex(p, C.bgDeep, 1);
  p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  fillHex(p, C.bgLow, 0.98);
  p.rect(0, ROAD_TOP + 3, 1000, ROAD_BOTTOM - ROAD_TOP - 6);
  fillHex(p, C.panel, 0.44);
  p.rect(0, ROAD_TOP + 7, 1000, ROAD_BOTTOM - ROAD_TOP - 14);

  // 上下导轨。
  fillHex(p, C.navyDeep, 0.98);
  p.rect(0, ROAD_TOP, 1000, 6);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 6);
  fillHex(p, C.line, 0.52);
  p.rect(0, ROAD_TOP + 1, 1000, 1);
  p.rect(0, ROAD_BOTTOM - 2, 1000, 1);
  fillHex(p, C.cyan, 0.2);
  p.rect(0, ROAD_TOP + 6, 1000, 0.7);
  fillHex(p, C.mint, 0.12);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 0.7);

  // 带面移动肋条。
  const scroll = ((ft * 34) % 13 + 13) % 13;
  p.strokeWeight(0.65);
  for (let x = -scroll; x < 1000; x += 13) {
    strokeHex(p, C.navyLight, 0.13);
    p.line(x, ROAD_TOP + 7, x, ROAD_BOTTOM - 7);
    strokeHex(p, C.cyan, 0.015);
    p.line(x + 1, ROAD_TOP + 8, x + 1, ROAD_BOTTOM - 8);
  }

  // 四条并行材质。所有几何纹理由固定或时间确定性公式生成。
  const imageOffset = ((ft * 18) % 42 + 42) % 42;
  for (let i = 0, x = 20 - imageOffset; x < 1000; i++, x += 42) {
    if (x > -10) drawImageLane(p, i, x, 480, ft, C.rose, 0.64);
  }
  drawAudioLane(p, 0.72);
  const textOffset = ((ft * 22) % 57 + 57) % 57;
  for (let i = 0, x = 42 - textOffset; x < 1000; i++, x += 57) {
    if (x > -12) drawTextLane(p, x, 506.5, i, 0.6);
  }
  const videoOffset = ((ft * 26) % 78 + 78) % 78;
  for (let i = 0, x = 72 - videoOffset; x < 1000; i++, x += 78) {
    if (x > -25) drawVideoLane(p, x, 519, i, ft, 0.56);
  }

  // 路缘内侧的细线，把四类纹理收成同一根带。
  p.noFill();
  strokeHex(p, C.cream, 0.065);
  p.strokeWeight(0.55);
  p.line(0, ROAD_MID, 1000, ROAD_MID);
  strokeHex(p, C.navyLight, 0.26);
  p.strokeWeight(0.55);
  p.line(0, 487, 1000, 487);
  p.line(0, 513, 1000, 513);

  // 从第 15 版块参数传送带接过来的左侧短过渡。
  if (exit < 0.98) {
    const a = 1 - smoothstep(2.2, 3.4, ft);
    if (a > 0.01) {
      fillHex(p, C.navyDeep, 0.38 * a);
      p.rect(0, ROAD_TOP + 7, 120, ROAD_BOTTOM - ROAD_TOP - 14);
      p.noFill();
      strokeHex(p, C.amber, 0.16 * a);
      p.strokeWeight(0.7);
      for (let k = 0; k < 4; k++) {
        p.line(12 + k * 22, 476 + k * 2, 100 + k * 14, 492 + k * 2);
      }
      p.noStroke();
      for (let k = 0; k < 4; k++) {
        fillHex(p, k === 1 ? C.emberHot : C.cyan, 0.18 * a);
        p.rect(32 + k * 17, 484, 8, 3, 0.6);
      }
    }
  }

  // 出口：带面收成一条薄带 + 分叉，并放一枚小推理步骤牌，接第 17 版块。
  if (exit > 0.002) {
    const cut = 884;
    fillHex(p, C.bgDeep, 0.9 * exit);
    p.rect(cut, ROAD_TOP, 1000 - cut, ROAD_BOTTOM - ROAD_TOP);

    strokeHex(p, C.cyan, 0.2 * exit);
    p.strokeWeight(0.9);
    p.line(cut, ROAD_TOP + 2, cut, ROAD_BOTTOM - 2);
    for (let i = 0; i < 4; i++) {
      const s = STREAMS[i];
      strokeHex(p, s.color, 0.35 * exit);
      p.strokeWeight(0.75);
      p.beginShape();
      p.vertex(cut - 22, 480 + i * 13);
      p.vertex(cut + 18, 490 + i * 2);
      p.vertex(952, 497);
      p.endShape();
    }

    // 推理步骤牌。
    const cardX = 930;
    const cardY = 498;
    fillHex(p, C.bgDeep, 0.92 * exit);
    p.rect(cardX - 12, cardY - 9, 24, 18, 2);
    p.noFill();
    strokeHex(p, C.cyan, 0.54 * exit);
    p.strokeWeight(0.8);
    p.rect(cardX - 12, cardY - 9, 24, 18, 2);
    p.strokeWeight(0.55);
    strokeHex(p, C.cyanSoft, 0.28 * exit);
    p.rect(cardX - 8.5, cardY - 5.5, 17, 11, 1);
    p.line(cardX - 5, cardY - 2, cardX + 5, cardY - 2);
    p.line(cardX - 5, cardY + 1, cardX + 2, cardY + 1);
    p.noStroke();
    fillHex(p, C.emberHot, 0.7 * exit);
    p.ellipse(cardX + 7, cardY + 5, 2.4, 2.4);

    // 分叉轨道。
    strokeHex(p, C.cyan, 0.28 * exit);
    p.strokeWeight(0.8);
    p.beginShape();
    p.vertex(953, 499);
    p.vertex(970, 494);
    p.vertex(1000, 488);
    p.endShape();
    p.beginShape();
    p.vertex(953, 501);
    p.vertex(970, 506);
    p.vertex(1000, 512);
    p.endShape();
    strokeHex(p, C.creamDim, 0.18 * exit);
    p.strokeWeight(0.55);
    p.line(956, 500, 1000, 500);
    for (let i = 0; i < 3; i++) {
      fillHex(p, i === 1 ? C.emberHot : C.cyan, 0.3 * exit);
      p.ellipse(966 + i * 12, 500 + (i % 2 ? 4 : -3), 2.2, 2.2);
    }
  }

  // 外框。
  p.noFill();
  strokeHex(p, C.line, 0.55);
  p.strokeWeight(1);
  p.rect(0, ROAD_TOP + 1, 1000, ROAD_BOTTOM - ROAD_TOP - 2, 1);
  strokeHex(p, C.cyan, 0.1);
  p.strokeWeight(0.6);
  p.line(0, ROAD_TOP + 7, 1000, ROAD_TOP + 7);
  p.line(0, ROAD_BOTTOM - 7, 1000, ROAD_BOTTOM - 7);
  p.pop();
}

function drawSignalBand(p, t) {
  const ft = flowTime(t);
  const exit = smoothstep(4.08, 5.35, t);
  drawBandBase(p, ft, exit);
}

// ---------- 主角：多信号棱镜 / 编织结 ----------

function drawActorFilaments(p, state, t) {
  // 主角的薄带从混合带牵到中央棱镜底部；这是第 15 版块参数箱展开的延续。
  const blockOrigin = (state.blockIndex - 1) * 1000;
  const reveal = smoothstep(0.25, 1.25, t) * (1 - 0.5 * smoothstep(4.5, 5.6, t));
  if (reveal <= 0.01) return;
  const prismX = blockOrigin + 654;
  const prismY = 430;
  const colors = [C.rose, C.amber, C.violet, C.mint];
  const ends = [
    [prismX - 16, prismY + 3],
    [prismX - 5, prismY + 1],
    [prismX + 7, prismY + 1],
    [prismX + 18, prismY + 4]
  ];
  const lock = smoothstep(2.55, 2.9, Math.min(t, 3));
  p.push();
  p.noFill();
  for (let k = 0; k < 4; k++) {
    const startX = state.x + (k - 1.5) * 4;
    const startY = ROAD_MID - 23 - k * 1.4;
    const end = ends[k];
    const path = [
      [startX, startY],
      [startX + 44 + k * 3, startY - 24 - k * 2],
      [end[0] - 55, end[1] + 21 - k * 2],
      [end[0], end[1]]
    ];
    const alpha = (0.055 + k * 0.004) * reveal * (0.8 + lock * 0.2);
    strokeCubic(p, path, C.bgDeep, alpha * 1.7, 3.6, 28);
    strokeCubic(p, path, colors[k], alpha * 1.7, 0.85, 28);
    strokeCubic(p, path, k === 2 ? C.cyanSoft : colors[k], alpha * 0.8, 0.35, 28);
  }
  p.pop();
}

function drawActorPrism(p, state, t) {
  const appear = smoothstep(0, 0.42, t);
  const hold = Math.min(t, 3);
  const freeze = smoothstep(2.72, 2.96, hold);
  const settle = smoothstep(4.2, 5.35, t);
  const animT = t >= 3.9 ? flowTime(t) : Math.min(t, 2.9999);
  const phase = animT - Math.floor(animT);
  const mergeRaw = 0.5 + 0.5 * Math.cos(phase * TAU);
  const merge = smoothstep(0.18, 0.86, mergeRaw);
  const wrap = Math.sin(phase * TAU);
  const flash = flashAt(t);
  const fade = 1 - 0.42 * smoothstep(5.25, 6, t);
  const ribbons = [C.rose, C.amber, C.violet, C.mint];
  const bases = [-19, -6.5, 6.5, 19];

  p.push();
  p.translate(state.x + Math.sin(phase * TAU) * 1.2, ROAD_MID);
  p.scale(0.9 + 0.1 * appear);
  p.noStroke();

  // 与带面的接触阴影 + 四色节点。
  fillHex(p, C.bgDeep, 0.52 * appear);
  p.ellipse(2, 2, 60, 12);
  fillHex(p, C.cyan, 0.032 * appear);
  p.ellipse(0, 0, 86, 18);
  for (let k = 0; k < 4; k++) {
    const lit = 0.16 + 0.66 * merge;
    fillHex(p, C.bgDeep, 0.84 * appear);
    p.rect(bases[k] - 3.2, -2.2, 6.4, 4.4, 0.8);
    fillHex(p, ribbons[k], lit * appear);
    p.rect(bases[k] - 2.2, -1.4, 4.4, 2.8, 0.5);
    if (merge > 0.08) {
      fillHex(p, ribbons[k], 0.08 * merge * appear);
      p.ellipse(bases[k], 0, 14, 7);
    }
  }

  // 滑行残影。
  if (merge < 0.9 && t < 4.3) {
    for (let k = 0; k < 3; k++) {
      const a = (0.05 - k * 0.011) * (1 - merge) * appear;
      fillHex(p, k === 0 ? C.rose : k === 1 ? C.violet : C.mint, a);
      p.rect(-30 - k * 12, -26 + k * 5, 10 + k * 5, 1.2, 0.5);
      p.rect(-25 - k * 9, -15 + k * 4, 7, 0.9, 0.4);
    }
  }

  // 腰部薄带：低 alpha 的“编织绳”横绕。
  p.push();
  p.noFill();
  for (let k = 0; k < 3; k++) {
    const rx = 21 - merge * 7 + Math.sin(phase * TAU + k) * 2;
    const ry = 5.5 - merge * 1.8;
    const cx = Math.sin(phase * TAU + k * 2.1) * 2;
    const cy = -22 - k * 7;
    strokeHex(p, C.bgDeep, 0.42 * appear);
    p.strokeWeight(3.6);
    p.beginShape();
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const a = wrap * 0.5 + u * TAU;
      p.vertex(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + Math.sin(u * Math.PI) * (1 - merge) * 2);
    }
    p.endShape();
    strokeHex(p, k === 1 ? C.creamDim : ribbons[k], (0.15 + 0.12 * merge) * appear);
    p.strokeWeight(1.1);
    p.beginShape();
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const a = wrap * 0.5 + u * TAU;
      p.vertex(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + Math.sin(u * Math.PI) * (1 - merge) * 2);
    }
    p.endShape();
  }
  p.pop();

  // 四条竖向薄带绕着火种，在 merge 时收束到中心。
  for (let k = 0; k < 4; k++) {
    const amp = 1.4 + (1 - merge) * 7.4;
    const ph = phase * TAU + k * 1.62;
    p.push();
    p.noFill();
    // 暗底，让薄带在深蓝上仍有体积。
    strokeHex(p, C.bgDeep, 0.62 * appear);
    p.strokeWeight(5.2);
    p.beginShape();
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      const y = 1.5 - u * 57;
      const x =
        bases[k] * (1 - u * 0.76) +
        Math.sin(u * Math.PI * 1.8 + ph) * amp * (0.28 + 0.72 * u) +
        (k - 1.5) * 1.4 * (1 - u);
      p.vertex(x, y);
    }
    p.endShape();
    strokeHex(p, ribbons[k], (0.22 + 0.1 * merge) * appear * fade);
    p.strokeWeight(1.55 + merge * 0.25);
    p.beginShape();
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      const y = 1.5 - u * 57;
      const x =
        bases[k] * (1 - u * 0.76) +
        Math.sin(u * Math.PI * 1.8 + ph) * amp * (0.28 + 0.72 * u) +
        (k - 1.5) * 1.4 * (1 - u);
      p.vertex(x, y);
    }
    p.endShape();
    strokeHex(p, k === 2 ? C.cyanSoft : ribbons[k], 0.18 * appear);
    p.strokeWeight(0.45);
    p.beginShape();
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      const y = 1.5 - u * 57;
      const x =
        bases[k] * (1 - u * 0.76) +
        Math.sin(u * Math.PI * 1.8 + ph) * amp * (0.28 + 0.72 * u) +
        (k - 1.5) * 1.4 * (1 - u);
      p.vertex(x - 0.5, y - 0.5);
    }
    p.endShape();
    p.pop();
  }

  // 小多面棱镜壳。
  p.noStroke();
  const nTop = [0, -64];
  const nLeft = [-24, -17];
  const nRight = [24, -17];
  const nBottom = [0, -7];
  const nCenter = [0, -34];
  polyShape(p, [nTop, nLeft, nCenter], C.violet, 0.055 * appear, C.violetSoft, 0.32 * appear, 0.8);
  polyShape(p, [nTop, nCenter, nRight], C.rose, 0.045 * appear, C.roseSoft, 0.28 * appear, 0.8);
  polyShape(p, [nLeft, nBottom, nCenter], C.amber, 0.05 * appear, C.amberSoft, 0.26 * appear, 0.8);
  polyShape(p, [nRight, nCenter, nBottom], C.mint, 0.04 * appear, C.mintSoft, 0.25 * appear, 0.8);
  p.noFill();
  strokeHex(p, C.cyan, (0.44 + 0.18 * freeze) * appear);
  p.strokeWeight(1);
  p.beginShape();
  p.vertex(nTop[0], nTop[1]);
  p.vertex(nRight[0], nRight[1]);
  p.vertex(nBottom[0], nBottom[1]);
  p.vertex(nLeft[0], nLeft[1]);
  p.endShape(p.CLOSE);
  strokeHex(p, C.cyanSoft, 0.16 * appear);
  p.strokeWeight(0.55);
  p.line(nTop[0], nTop[1] + 2, nCenter[0], nCenter[1]);
  p.line(nCenter[0], nCenter[1], nLeft[0] + 2, nLeft[1] - 1);
  p.line(nCenter[0], nCenter[1], nRight[0] - 2, nRight[1] - 1);
  p.line(nCenter[0], nCenter[1], nBottom[0], nBottom[1] - 1);

  // 火种：从第 15 版块同一颗暖赭色。
  p.noStroke();
  const coreY = -34;
  fillHex(p, C.ember, (0.05 + 0.08 * flash) * appear);
  p.ellipse(0, coreY, 34 + flash * 20, 34 + flash * 20);
  fillHex(p, C.emberHot, (0.1 + 0.16 * flash) * appear);
  p.ellipse(0, coreY, 15 + flash * 7, 15 + flash * 7);
  fillHex(p, C.bgDeep, 0.9 * appear);
  p.ellipse(0, coreY, 10, 10);
  fillHex(p, C.ember, 0.4 * appear);
  p.ellipse(0, coreY, 8, 8);
  fillHex(p, C.emberHot, 0.95 * appear);
  p.ellipse(-0.5, coreY - 0.5, 4.5, 4.9);
  fillHex(p, C.emberCore, 0.98 * appear);
  p.ellipse(-1, coreY - 1, 1.8, 2);
  p.noFill();
  strokeHex(p, C.emberHot, (0.26 + flash * 0.42) * appear);
  p.strokeWeight(0.75);
  p.ellipse(0, coreY, 12 + flash * 3, 12 + flash * 3);

  // 火种闪：几颗四色火星。
  if (flash > 0.02) {
    p.noStroke();
    for (let k = 0; k < 6; k++) {
      const a = k * (TAU / 6) + 0.37;
      const r = 15 + hash2(k, 71, 165) * 14;
      fillHex(p, k % 2 === 0 ? C.emberHot : ribbons[k % 4], 0.45 * flash * appear);
      p.ellipse(Math.cos(a) * r, coreY + Math.sin(a) * r * 0.72, 1.5, 1.5);
    }
  }

  // merge 时，四路薄带的端点压在带面四色小格上。
  if (merge > 0.06) {
    for (let k = 0; k < 4; k++) {
      strokeHex(p, ribbons[k], 0.22 * merge * appear);
      p.strokeWeight(0.55);
      p.line(bases[k] * 0.38, -5, bases[k], -1.6);
      p.noStroke();
      fillHex(p, ribbons[k], 0.42 * merge * appear);
      p.ellipse(bases[k], -1.2, 2.2, 1.3);
    }
  }

  // 结尾把薄带收成推理步骤牌的极淡外框（余下的交给第 17 版块）。
  if (settle > 0.01) {
    p.noFill();
    strokeHex(p, C.cyan, 0.13 * settle * appear);
    p.strokeWeight(0.7);
    p.rect(-17, -52, 34, 27, 2);
    strokeHex(p, C.creamDim, 0.1 * settle * appear);
    p.rect(-12, -47, 24, 15, 1);
    p.noStroke();
    fillHex(p, C.cyan, 0.08 * settle * appear);
    p.rect(-11, -44, 22, 1);
    p.rect(-11, -41, 14, 1);
    fillHex(p, C.emberHot, 0.22 * settle * appear);
    p.ellipse(12, -30, 2, 2);
  }
  p.pop();
}

function drawActorScene(p, state) {
  const t = clamp(state.localT || 0, 0, 6);
  p.push();
  drawActorFilaments(p, state, t);
  drawActorPrism(p, state, t);
  p.pop();
}

// ---------- 标题 / 气氛 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 180;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, C.cream, 0.78 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.cyanSoft, 0.28 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 2, 1);
  fillHex(p, C.navy, 0.14 * alpha);
  p.rect(x - w / 2 + 2, y + h / 2 - 2, w - 4, 1);
  p.noFill();
  strokeHex(p, C.cyan, 0.3 * alpha);
  p.strokeWeight(0.9);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

function drawAtmosphere(p) {
  linearWash(
    p,
    0,
    160,
    0,
    860,
    [
      [0, 'rgba(2,5,13,0.22)'],
      [0.24, 'rgba(2,5,13,0)'],
      [0.74, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.3)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.012);
  p.ellipse(886, 450, 410, 350);
  fillHex(p, C.violet, 0.007);
  p.ellipse(690, 330, 250, 220);
  fillHex(p, C.ember, 0.006);
  p.ellipse(530, 520, 320, 62);
  p.pop();
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const lock = convergenceLock(t);
    p.push();
    p.noStroke();
    drawSpace(p, t);
    drawConstellationBase(p, t, lock);
    drawStreams(p, t, lock);
    drawPrism(p, t);
    drawConvergence(p, t);
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
    p.noStroke();
    drawSignalBand(p, t);
    p.pop();
  },

  drawActor(p, state) {
    drawActorScene(p, state);
  }
};
