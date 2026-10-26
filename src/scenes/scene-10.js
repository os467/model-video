import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 10 感知机：1950s 模拟实验台 + 示波器散点/判定线 + 权重线束 + 铜坠阈值节点。
// 静态重点：localT≈1.5（标题、示波器点阵、线束）与 localT≈3.0
// （判定线卡在对角线、两组点各错一个、小 ?、铜坠停摆、火种闪一下）。
const TAU = Math.PI * 2;

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const META = {
  id: 10,
  cn: '感知机',
  en: 'The Perceptron',
  era: '1958',
  group: 'electronic'
};

const C = {
  bench: '#061614',
  benchDeep: '#040f0d',
  benchLight: '#0a211c',
  panel: '#123c32',
  panelDark: '#0b2823',
  panelLight: '#1b4c40',
  panelEdge: '#2a6254',
  phosphor: '#2fe0a4',
  mint: '#8ff5cf',
  mintPale: '#ccffe9',
  amber: '#e8a24a',
  amberHot: '#ffd08a',
  amberDeep: '#a8632a',
  cream: '#f0debc',
  creamDim: '#cbb287',
  brassDeep: '#4e3317',
  brassDark: '#6e4a22',
  brass: '#b8863c',
  brassLight: '#d8a75a',
  copper: '#b87333',
  copperLight: '#e0a36a',
  copperDark: '#6a3d1c',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe0a0',
  err: '#e0643c',
  glass: '#041411',
  glassDark: '#02100d',
  paper: '#d8cca6',
  paperDark: '#b4a683',
  paperLight: '#ece2c2',
  cable: '#0a241e',
  cableLight: '#1a4a3d'
};

const BAND_TOP = 470;
const BAND_BOTTOM = 530;
const ROAD_CENTER = 498;
const ACTOR_Y = 470;

const SCOPE = { x: 544, y: 224, w: 400, h: 240 };
const GLASS = { x: 562, y: 242, w: 360, h: 202 };
const PLOT = { cx: 742, cy: 343 };
const PANEL = { x: 622, y: 600, w: 322, h: 144 };
const DIAL = { x: 866, y: 658, r: 36 };

const WIRE_OFFSETS = [-21, -7, 7, 21];
const WIRE_TIGHT = [-6, -2, 2, 6];

// XOR 式四象限：
// 空心薄荷 = 线下（y > x-399），实心琥珀 = 线上（y < x-399）。
// 两个 outlier 各错一个：左上空心落进琥珀侧，左下琥珀落进空心侧。
const DOTS = [
  { x: 684, y: 261, kind: 'hollow', r: 4.3, err: true },
  { x: 800, y: 425, kind: 'hollow', r: 4.2 },
  { x: 810, y: 428, kind: 'hollow', r: 2.5 },
  { x: 792, y: 433, kind: 'hollow', r: 2.2 },
  { x: 800, y: 261, kind: 'solid', r: 3.9 },
  { x: 791, y: 265, kind: 'solid', r: 2.5 },
  { x: 808, y: 253, kind: 'solid', r: 2.2 },
  { x: 684, y: 425, kind: 'solid', r: 3.9, err: true }
];

const HARNESS_WEIGHTS = [
  { wire: 0, xs: [252, 372, 704] },
  { wire: 1, xs: [300, 566, 812] },
  { wire: 2, xs: [276, 436, 676] },
  { wire: 3, xs: [328, 620, 764] }
];

const BOLTS = [
  [58, 232],
  [492, 208],
  [58, 764],
  [960, 208],
  [960, 764],
  [494, 752]
];

const ACTOR_PENDANTS = [
  { a: 0.52, len: 15, bead: 3.4 },
  { a: 1.05, len: 12, bead: 2.8 },
  { a: 2.09, len: 13, bead: 3.0 },
  { a: 2.62, len: 16, bead: 3.2 }
];

// 第二小节定格 1s：2.9–3.9 全部动作冻结在 2.9 的姿态，4s 后退出。
function freezeTime(raw) {
  if (raw <= 2.9) return raw;
  if (raw <= 3.9) return 2.9;
  return raw - 1;
}

function wrapPi(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r < -Math.PI) r += TAU;
  return r;
}

function drawScrew(p, x, y, r, alpha) {
  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.7 * alpha);
  p.ellipse(x + 0.8, y + 1, r * 2 + 2, r * 2 + 2);
  fillHex(p, C.brassDark, alpha);
  p.ellipse(x, y, r * 2, r * 2);
  fillHex(p, C.brass, 0.9 * alpha);
  p.ellipse(x - 0.4, y - 0.4, r * 1.55, r * 1.55);
  fillHex(p, C.brassLight, 0.45 * alpha);
  p.ellipse(x - r * 0.45, y - r * 0.45, r * 0.6, r * 0.6);
  strokeHex(p, C.glassDark, 0.8 * alpha);
  p.strokeWeight(Math.max(0.7, r * 0.32));
  p.line(x - r * 0.75, y, x + r * 0.75, y);
  p.pop();
}

// ---------- 台面 ----------

function drawBenchSurface(p, bandOnly) {
  p.push();
  p.noStroke();
  fillHex(p, C.bench, 1);
  if (bandOnly) {
    p.rect(0, BAND_TOP, 1000, BAND_BOTTOM - BAND_TOP);
  } else {
    p.rect(0, 0, 1000, 1000);

    // 示波器与纸带后面的暗青环境光，全部压在路面带之外。
    fillHex(p, C.panel, 0.16);
    p.ellipse(770, 334, 470, 250);
    fillHex(p, C.panelLight, 0.04);
    p.ellipse(700, 302, 290, 150);
    fillHex(p, C.panel, 0.12);
    p.ellipse(148, 664, 320, 230);

    // 台面旧渍/金属屑：只放在带外，drawRoad 补带时不用重复。
    for (let i = 0; i < 24; i++) {
      const x = 30 + hash2(i, 11, 101) * 940;
      const y = i % 2 === 0
        ? 470 - 14 - hash2(i, 12, 101) * 220
        : 552 + hash2(i, 12, 101) * 190;
      if (x > 136 && x < 464 && y > 266 && y < 446) continue;
      fillHex(p, i % 5 === 0 ? C.panelLight : C.benchDeep, 0.05 + hash2(i, 13, 101) * 0.06);
      p.ellipse(x, y, 10 + hash2(i, 14, 101) * 58, 3 + hash2(i, 15, 101) * 12);
    }
    for (let i = 0; i < 22; i++) {
      const x = 26 + hash2(i, 21, 131) * 948;
      const y = i % 2 === 0
        ? 250 + hash2(i, 22, 131) * 190
        : 566 + hash2(i, 22, 131) * 150;
      if (x > 136 && x < 464 && y > 266 && y < 446) continue;
      fillHex(p, C.creamDim, 0.05 + hash2(i, 23, 131) * 0.08);
      p.ellipse(x, y, 1.2 + hash2(i, 24, 131) * 2.2, 0.9 + hash2(i, 24, 131) * 1.4);
    }
  }

  // 淡网格。drawRoad 用同一组线补带，避免出现默认路面横带。
  p.strokeWeight(1);
  strokeHex(p, C.panelLight, 0.024);
  if (bandOnly) {
    for (let x = 0; x <= 1000; x += 64) p.line(x, BAND_TOP, x, BAND_BOTTOM);
    for (let y = 448; y <= 640; y += 64) {
      if (y >= BAND_TOP && y <= BAND_BOTTOM) p.line(0, y, 1000, y);
    }
  } else {
    for (let x = 0; x <= 1000; x += 64) p.line(x, 0, x, 1000);
    for (let y = 0; y <= 1000; y += 64) p.line(0, y, 1000, y);
  }
  p.pop();
}

function drawBenchBolts(p) {
  for (let i = 0; i < BOLTS.length; i++) {
    const [x, y] = BOLTS[i];
    drawScrew(p, x, y, i % 2 === 0 ? 6 : 5, 0.9);
  }
}

// ---------- 示波器 ----------

function drawScopeHousing(p) {
  p.push();
  p.noStroke();

  fillHex(p, C.glassDark, 0.55);
  p.rect(SCOPE.x + 8, SCOPE.y + 11, SCOPE.w, SCOPE.h, 13);
  fillHex(p, C.panelDark, 1);
  p.rect(SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h, 12);
  fillHex(p, C.panel, 0.96);
  p.rect(SCOPE.x + 2, SCOPE.y + 2, SCOPE.w - 4, SCOPE.h - 4, 10);
  fillHex(p, C.panelLight, 0.1);
  p.rect(SCOPE.x + 8, SCOPE.y + 5, SCOPE.w - 16, 9, 4);
  fillHex(p, C.benchDeep, 0.3);
  p.rect(SCOPE.x + 8, SCOPE.y + SCOPE.h - 19, SCOPE.w - 16, 13, 4);

  // 黄铜玻璃框
  fillHex(p, C.brassDeep, 0.95);
  p.rect(GLASS.x - 7, GLASS.y - 7, GLASS.w + 14, GLASS.h + 14, 9);
  fillHex(p, C.brassDark, 0.85);
  p.rect(GLASS.x - 4, GLASS.y - 4, GLASS.w + 8, GLASS.h + 8, 7);
  fillHex(p, C.benchDeep, 1);
  p.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h, 5);
  p.noFill();
  strokeHex(p, C.brassLight, 0.34);
  p.strokeWeight(1);
  p.rect(GLASS.x - 5.5, GLASS.y - 5.5, GLASS.w + 11, GLASS.h + 11, 8);

  // 顶栏铭牌与旋钮
  p.noStroke();
  fillHex(p, C.brassDark, 0.9);
  p.rect(690, 229, 104, 9, 2);
  fillHex(p, C.brassLight, 0.28);
  p.rect(692, 230, 100, 1.4, 1);
  drawScrew(p, 566, 234, 3.2, 0.9);
  drawScrew(p, 918, 234, 3.2, 0.9);
  drawScrew(p, 566, 454, 3.2, 0.9);
  drawScrew(p, 918, 454, 3.2, 0.9);
  p.pop();
}

function drawScopeLamps(p, t) {
  const mintOn = smoothstep(1.18, 1.55, t);
  const errOn = smoothstep(2.58, 2.84, t);
  const lampX = [630, 666, 702, 738, 774, 810];
  const errIndex = [1, 4];

  p.push();
  p.noFill();
  for (let i = 0; i < lampX.length; i++) {
    const x = lampX[i];
    const y = 454;
    const isErr = errIndex.includes(i);
    const lit = isErr ? errOn : mintOn;
    const col = isErr ? C.err : C.phosphor;

    p.noStroke();
    fillHex(p, C.glassDark, 0.85);
    p.ellipse(x, y, 11, 11);
    fillHex(p, C.brassDeep, 1);
    p.ellipse(x, y, 9.2, 9.2);
    fillHex(p, C.brassDark, 0.9);
    p.ellipse(x, y, 7.4, 7.4);

    if (lit > 0.01) {
      fillHex(p, col, 0.08 * lit);
      p.ellipse(x, y, 15, 15);
      fillHex(p, col, 0.3 * lit);
      p.ellipse(x, y, 7, 7);
      fillHex(p, isErr ? C.amberHot : C.mintPale, 0.92 * lit);
      p.ellipse(x - 0.4, y - 0.5, 4.4, 4.4);
    } else {
      fillHex(p, C.glass, 0.9);
      p.ellipse(x, y, 5, 5);
    }
    p.noFill();
    strokeHex(p, C.brassLight, 0.3);
    p.strokeWeight(0.8);
    p.ellipse(x, y, 9.6, 9.6);
  }
  p.pop();
}

function drawScopeGlass(p, raw) {
  const t = freezeTime(raw);
  const appear = smoothstep(0.42, 1.06, t);

  p.push();
  p.noStroke();
  fillHex(p, C.glass, 1);
  p.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h, 4);

  // 荧光底辉：低 alpha 叠加，不用 blur。
  fillHex(p, C.phosphor, 0.035);
  p.ellipse(PLOT.cx, PLOT.cy, 330, 176);
  fillHex(p, C.phosphor, 0.022);
  p.ellipse(PLOT.cx, PLOT.cy, 232, 122);
  fillHex(p, C.phosphor, 0.02);
  p.ellipse(PLOT.cx, PLOT.cy, 120, 70);

  // 玻璃四边内阴影
  fillHex(p, C.glassDark, 0.6);
  p.rect(GLASS.x, GLASS.y, GLASS.w, 5);
  p.rect(GLASS.x, GLASS.y + GLASS.h - 5, GLASS.w, 5);
  p.rect(GLASS.x, GLASS.y, 5, GLASS.h);
  p.rect(GLASS.x + GLASS.w - 5, GLASS.y, 5, GLASS.h);

  // 网格
  p.strokeWeight(1);
  for (let x = PLOT.cx - 168; x <= PLOT.cx + 168; x += 24) {
    const major = Math.abs(x - PLOT.cx) < 0.5;
    strokeHex(p, C.phosphor, major ? 0.16 : 0.075);
    p.line(x, GLASS.y + 6, x, GLASS.y + GLASS.h - 6);
  }
  for (let y = PLOT.cy - 96; y <= PLOT.cy + 96; y += 24) {
    const major = Math.abs(y - PLOT.cy) < 0.5;
    strokeHex(p, C.phosphor, major ? 0.16 : 0.075);
    p.line(GLASS.x + 6, y, GLASS.x + GLASS.w - 6, y);
  }
  // 中心十字
  strokeHex(p, C.mint, 0.25);
  p.strokeWeight(0.9);
  p.line(PLOT.cx - 5, PLOT.cy, PLOT.cx + 5, PLOT.cy);
  p.line(PLOT.cx, PLOT.cy - 5, PLOT.cx, PLOT.cy + 5);

  // 细扫描线 + 一条移动扫描线
  p.strokeWeight(1);
  for (let y = GLASS.y + 2; y < GLASS.y + GLASS.h - 2; y += 3) {
    strokeHex(p, C.mintPale, 0.0128);
    p.line(GLASS.x + 4, y, GLASS.x + GLASS.w - 4, y);
  }
  const scanY = GLASS.y + 10 + ((t * 92) % (GLASS.h - 20));
  p.noStroke();
  fillHex(p, C.phosphor, 0.03 * appear);
  p.rect(GLASS.x + 4, scanY - 4, GLASS.w - 8, 8);
  strokeHex(p, C.mint, 0.075 * appear);
  p.strokeWeight(1.2);
  p.line(GLASS.x + 4, scanY, GLASS.x + GLASS.w - 4, scanY);

  drawScopeDots(p, t, appear);
  drawDecisionLine(p, raw, t);
  drawQuestionMark(p, raw);

  // 玻璃反光：两条很淡的斜带。
  p.noStroke();
  fillHex(p, C.mintPale, 0.014);
  p.beginShape();
  p.vertex(572, 344);
  p.vertex(650, 248);
  p.vertex(684, 248);
  p.vertex(606, 344);
  p.endShape(p.CLOSE);
  fillHex(p, C.mintPale, 0.009);
  p.beginShape();
  p.vertex(586, 388);
  p.vertex(686, 248);
  p.vertex(706, 248);
  p.vertex(606, 388);
  p.endShape(p.CLOSE);

  p.pop();
}

function drawScopeDots(p, t, appear) {
  if (appear <= 0.002) return;
  const step = Math.floor(t * 11);
  const err = smoothstep(2.62, 2.84, t);

  for (let i = 0; i < DOTS.length; i++) {
    const d = DOTS[i];
    const flicker = 0.8 + 0.2 * hash2(i, step, 31);
    const a = appear * flicker;

    p.push();
    p.noStroke();
    if (d.kind === 'solid') {
      fillHex(p, C.amber, 0.055 * a);
      p.ellipse(d.x, d.y, d.r * 5.4, d.r * 5.4);
      fillHex(p, C.amber, 0.09 * a);
      p.ellipse(d.x, d.y, d.r * 2.9, d.r * 2.9);
      fillHex(p, C.amber, 0.94 * a);
      p.ellipse(d.x, d.y, d.r * 2, d.r * 2);
      fillHex(p, C.amberHot, 0.85 * a);
      p.ellipse(d.x - 0.4, d.y - 0.5, d.r * 1.15, d.r * 1.15);
      fillHex(p, C.cream, 0.55 * a);
      p.ellipse(d.x - 0.8, d.y - 0.9, d.r * 0.4, d.r * 0.4);
    } else {
      fillHex(p, C.phosphor, 0.04 * a);
      p.ellipse(d.x, d.y, d.r * 5.2, d.r * 5.2);
      p.noFill();
      strokeHex(p, C.mint, 0.95 * a);
      p.strokeWeight(1.35);
      p.ellipse(d.x, d.y, d.r * 2, d.r * 2);
      strokeHex(p, C.mintPale, 0.25 * a);
      p.strokeWeight(0.7);
      p.ellipse(d.x, d.y, d.r * 2.9, d.r * 2.9);
    }
    p.pop();

    if (d.err && err > 0.01) {
      p.push();
      p.noFill();
      strokeHex(p, C.err, 0.82 * err * a);
      p.strokeWeight(1.15);
      const rr = d.r + 5.6;
      for (let k = 0; k < 8; k++) {
        const s0 = k * (TAU / 8) + 0.16;
        p.arc(d.x, d.y, rr * 2, rr * 2, s0, s0 + 0.34);
      }
      strokeHex(p, C.amberHot, 0.5 * err * a);
      p.strokeWeight(0.85);
      p.line(d.x + rr + 2, d.y, d.x + rr + 6, d.y);
      p.line(d.x - rr - 2, d.y, d.x - rr - 6, d.y);
      p.pop();
    }
  }
}

// 判定线：先偏在一侧，学习时加速旋转，2.86s 卡在 45° 对角线。
function decisionPose(raw) {
  const t = freezeTime(raw);
  const appear = smoothstep(0.48, 1.02, t);
  const slide = smoothstep(1.8, 2.36, t);
  const d = -86 * (1 - slide);

  let angle;
  if (t <= 1.75) {
    angle = -0.34 + 0.12 * smoothstep(0.75, 1.75, t);
  } else if (t < 2.5) {
    const u = (t - 1.75) / 0.75;
    angle = -0.22 + TAU * 1.15 * u * u * u;
  } else {
    const a0 = -0.22 + TAU * 1.15;
    const target = Math.PI / 4 + Math.PI * Math.round((a0 - Math.PI / 4) / Math.PI);
    const u = smoothstep(2.5, 2.86, t);
    angle = a0 + (target - a0) * u + Math.sin(u * Math.PI) * 0.06 * (1 - u);
  }
  return { angle, d, appear, t };
}

function lineChord(pose) {
  const nx = -Math.sin(pose.angle);
  const ny = Math.cos(pose.angle);
  const px = PLOT.cx + nx * pose.d;
  const py = PLOT.cy + ny * pose.d;
  const dx = Math.cos(pose.angle);
  const dy = Math.sin(pose.angle);
  const left = GLASS.x + 4;
  const right = GLASS.x + GLASS.w - 4;
  const top = GLASS.y + 4;
  const bottom = GLASS.y + GLASS.h - 4;
  const pts = [];

  if (Math.abs(dx) > 1e-6) {
    for (const xEdge of [left, right]) {
      const tt = (xEdge - px) / dx;
      const y = py + dy * tt;
      if (y >= top && y <= bottom) pts.push([xEdge, y, tt]);
    }
  }
  if (Math.abs(dy) > 1e-6) {
    for (const yEdge of [top, bottom]) {
      const tt = (yEdge - py) / dy;
      const x = px + dx * tt;
      if (x >= left && x <= right) pts.push([x, yEdge, tt]);
    }
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a[2] - b[2]);
  return [pts[0], pts[pts.length - 1]];
}

function drawDecisionLine(p, raw, t) {
  const pose = decisionPose(raw);
  if (pose.appear <= 0.002) return;
  const chord = lineChord(pose);
  if (!chord) return;

  const retract = smoothstep(4.05, 5.1, raw);
  let a = chord[0];
  let b = chord[1];
  if (retract > 0.001) {
    a = [
      a[0] + (PLOT.cx - a[0]) * retract * 0.94,
      a[1] + (PLOT.cy - a[1]) * retract * 0.94
    ];
    b = [
      b[0] + (PLOT.cx - b[0]) * retract * 0.94,
      b[1] + (PLOT.cy - b[1]) * retract * 0.94
    ];
  }

  const fade = pose.appear * (1 - smoothstep(4.35, 5.25, raw) * 0.82);
  p.push();
  p.strokeCap(p.ROUND);

  strokeHex(p, C.phosphor, 0.07 * fade);
  p.strokeWeight(7.5);
  p.line(a[0], a[1], b[0], b[1]);
  strokeHex(p, C.phosphor, 0.2 * fade);
  p.strokeWeight(3.2);
  p.line(a[0], a[1], b[0], b[1]);
  strokeHex(p, C.mintPale, 0.92 * fade);
  p.strokeWeight(1.1);
  p.line(a[0], a[1], b[0], b[1]);
  strokeHex(p, C.phosphor, 0.35 * fade);
  p.strokeWeight(0.7);
  p.line(a[0] + 1, a[1], b[0] + 1, b[1]);

  // 法向小箭头：指向实心琥珀的一侧。
  const mx = (a[0] + b[0]) * 0.5;
  const my = (a[1] + b[1]) * 0.5;
  let nx = -Math.sin(pose.angle);
  let ny = Math.cos(pose.angle);
  const tx = 800 - mx;
  const ty = 261 - my;
  if (nx * tx + ny * ty < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ex = mx + nx * 19;
  const ey = my + ny * 19;
  strokeHex(p, C.mint, 0.38 * fade);
  p.strokeWeight(1);
  p.line(mx, my, ex, ey);
  p.noStroke();
  fillHex(p, C.mint, 0.42 * fade);
  p.triangle(
    ex + nx * 4.6,
    ey + ny * 4.6,
    ex - nx * 1.8 - ny * 3,
    ey - ny * 1.8 + nx * 3,
    ex - nx * 1.8 + ny * 3,
    ey - ny * 1.8 - nx * 3
  );

  // 线端砝码：挂在上端，像一枚小铅锤。
  const upper = a[1] <= b[1] ? a : b;
  const lower = a[1] <= b[1] ? b : a;
  strokeHex(p, C.brassDark, 0.85 * fade);
  p.strokeWeight(1);
  p.line(upper[0], upper[1], upper[0], upper[1] + 8);
  p.noStroke();
  fillHex(p, C.glassDark, 0.9 * fade);
  p.ellipse(upper[0], upper[1] + 11.2, 8.4, 8.4);
  fillHex(p, C.brassDark, fade);
  p.ellipse(upper[0], upper[1] + 11, 6.8, 6.8);
  fillHex(p, C.brass, fade);
  p.ellipse(upper[0] - 0.4, upper[1] + 10.6, 5.2, 5.2);
  fillHex(p, C.brassLight, 0.6 * fade);
  p.ellipse(upper[0] - 1.3, upper[1] + 9.5, 1.7, 1.7);

  // 下端黄铜帽
  const lx = lower[0];
  const ly = lower[1];
  fillHex(p, C.brassDark, 0.85 * fade);
  p.ellipse(lx, ly - 2.4, 5.6, 5.6);
  fillHex(p, C.brassLight, 0.45 * fade);
  p.ellipse(lx - 0.5, ly - 3, 2.2, 2.2);

  p.pop();
}

function drawQuestionMark(p, raw) {
  const a = smoothstep(2.7, 2.94, raw) * (1 - smoothstep(4.7, 5.45, raw));
  if (a <= 0.01) return;
  p.push();
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.RIGHT, p.BOTTOM);
  p.textSize(18);
  fillHex(p, C.mint, 0.1 * a);
  p.text('?', 909, 437.5);
  fillHex(p, C.mintPale, 0.84 * a);
  p.text('?', 908, 436.5);
  p.pop();
}

function drawScope(p, raw) {
  drawScopeHousing(p);
  drawScopeGlass(p, raw);
  drawScopeLamps(p, freezeTime(raw));
}

// ---------- 右下：权重旋钮 / 阈值表盘 ----------

function drawSmallKnob(p, x, y, r, angle, ticks, seed, wobble) {
  p.push();
  p.translate(x, y);

  p.noStroke();
  fillHex(p, C.glassDark, 0.6);
  p.ellipse(2, 3, r * 2 + 7, r * 2 + 7);

  // 刻度
  p.strokeWeight(0.8);
  for (let i = 0; i < ticks; i++) {
    const a = -2.35 + (i / (ticks - 1)) * 4.7;
    const major = i % 3 === 0;
    strokeHex(p, major ? C.creamDim : C.panelEdge, major ? 0.55 : 0.35);
    p.line(
      Math.cos(a) * (r + 4),
      Math.sin(a) * (r + 4),
      Math.cos(a) * (r + (major ? 9 : 6.5)),
      Math.sin(a) * (r + (major ? 9 : 6.5))
    );
  }

  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, r * 2 + 4, r * 2 + 4);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, r * 2, r * 2);
  fillHex(p, C.brass, 0.9);
  p.ellipse(0, -0.5, r * 1.72, r * 1.72);
  fillHex(p, '#0d1512', 1);
  p.ellipse(0, 0, r * 1.5, r * 1.5);
  fillHex(p, C.panelDark, 0.7);
  p.ellipse(0, -0.4, r * 1.25, r * 1.25);
  p.noFill();
  strokeHex(p, C.brassLight, 0.4);
  p.strokeWeight(1);
  p.ellipse(0, 0, r * 1.7, r * 1.7);

  const a = angle + wobble;
  p.push();
  p.rotate(a);
  strokeHex(p, C.glassDark, 0.85);
  p.strokeWeight(3.4);
  p.line(0, 0, r - 2, 0);
  strokeHex(p, C.cream, 0.95);
  p.strokeWeight(1.6);
  p.line(2, 0, r - 2, 0);
  strokeHex(p, C.amber, 0.9);
  p.strokeWeight(2.2);
  p.line(r - 5.5, 0, r - 1.5, 0);
  p.pop();

  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, 8, 8);
  fillHex(p, C.brass, 1);
  p.ellipse(-0.4, -0.5, 5.6, 5.6);
  fillHex(p, C.brassLight, 0.55);
  p.ellipse(-1.3, -1.5, 2, 2);
  fillHex(p, C.glassDark, 0.8);
  p.rect(-0.6, -1.6, 1.2, 3.2, 0.4);

  if (seed % 2 === 0) {
    fillHex(p, C.phosphor, 0.3);
    p.ellipse(r + 8, -r - 4, 2.4, 2.4);
  }
  p.pop();
}

function drawThresholdDial(p, angle) {
  p.push();
  p.translate(DIAL.x, DIAL.y);

  p.noStroke();
  fillHex(p, C.glassDark, 0.55);
  p.ellipse(3, 4, DIAL.r * 2 + 12, DIAL.r * 2 + 10);

  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, DIAL.r * 2 + 8, DIAL.r * 2 + 8);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, DIAL.r * 2 + 3, DIAL.r * 2 + 3);
  fillHex(p, C.brass, 0.98);
  p.ellipse(0, 0, DIAL.r * 2, DIAL.r * 2);
  fillHex(p, C.brassLight, 0.2);
  p.ellipse(-3, -4, DIAL.r * 1.6, DIAL.r * 1.6);
  fillHex(p, '#0c1411', 1);
  p.ellipse(0, 0, DIAL.r * 1.56, DIAL.r * 1.56);

  // 刻度：转满 300°，留一个下端缺口。
  for (let i = 0; i < 25; i++) {
    const a = 2.25 + (i / 24) * 5.35;
    const major = i % 4 === 0;
    strokeHex(p, major ? C.cream : C.creamDim, major ? 0.7 : 0.4);
    p.strokeWeight(major ? 1.3 : 0.8);
    p.line(
      Math.cos(a) * (DIAL.r - 6),
      Math.sin(a) * (DIAL.r - 6),
      Math.cos(a) * (DIAL.r - (major ? 13 : 10)),
      Math.sin(a) * (DIAL.r - (major ? 13 : 10))
    );
  }

  p.push();
  p.rotate(angle);
  strokeHex(p, C.glassDark, 0.9);
  p.strokeWeight(4.2);
  p.line(0, 0, DIAL.r - 9, 0);
  strokeHex(p, C.cream, 1);
  p.strokeWeight(2);
  p.line(3, 0, DIAL.r - 9, 0);
  fillHex(p, C.err, 0.95);
  p.noStroke();
  p.triangle(DIAL.r - 4, 0, DIAL.r - 11, -3.4, DIAL.r - 11, 3.4);
  p.pop();

  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, 15, 15);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, 12, 12);
  fillHex(p, C.brass, 1);
  p.ellipse(-0.6, -0.7, 8, 8);
  fillHex(p, C.brassLight, 0.55);
  p.ellipse(-2, -2.2, 3, 3);
  fillHex(p, C.glassDark, 0.9);
  p.rect(-0.8, -2.4, 1.6, 4.8, 0.6);

  p.noFill();
  strokeHex(p, C.brassLight, 0.36);
  p.strokeWeight(1.1);
  p.arc(0, 0, DIAL.r * 1.72, DIAL.r * 1.72, Math.PI * 1.02, Math.PI * 1.58);
  strokeHex(p, C.benchDeep, 0.6);
  p.strokeWeight(1);
  p.arc(0, 0, DIAL.r * 1.9, DIAL.r * 1.9, Math.PI * 0.08, Math.PI * 0.55);
  p.pop();
}

function drawJumper(p) {
  const a = [670, 714];
  const b = [722, 714];
  p.push();
  p.strokeCap(p.ROUND);
  const path = [
    [670, 714],
    [674, 696],
    [688, 687],
    [704, 689],
    [718, 702],
    [722, 714]
  ];
  for (const [w, col, alpha] of [
    [6.4, C.glassDark, 0.8],
    [4.2, C.ember, 0.9],
    [2.2, C.emberHot, 0.55],
    [0.9, C.cream, 0.4]
  ]) {
    strokeHex(p, col, alpha);
    p.strokeWeight(w);
    p.beginShape();
    for (const [x, y] of path) p.vertex(x, y);
    p.endShape();
  }

  for (let i = 0; i < 2; i++) {
    const [x, y] = i === 0 ? a : b;
    p.noStroke();
    fillHex(p, C.glassDark, 0.7);
    p.ellipse(x + 1, y + 2, 14, 14);
    fillHex(p, C.brassDeep, 1);
    p.ellipse(x, y, 12, 12);
    fillHex(p, C.brass, 1);
    p.ellipse(x - 0.4, y - 0.5, 9, 9);
    fillHex(p, i === 0 ? C.amber : C.phosphor, 0.7);
    p.ellipse(x, y, 6.4, 6.4);
    fillHex(p, C.glassDark, 1);
    p.ellipse(x, y, 2.4, 2.4);
    fillHex(p, C.brassLight, 0.5);
    p.ellipse(x - 2.4, y - 2.6, 1.8, 1.6);
  }
  p.pop();
}

function drawKnobPanel(p, raw) {
  const t = freezeTime(raw);
  const pose = decisionPose(raw);
  const spinWobble =
    smoothstep(2.1, 2.5, raw) * (1 - smoothstep(2.82, 3.0, raw));
  const dialAngle = wrapPi(pose.angle);

  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.5);
  p.rect(PANEL.x + 6, PANEL.y + 8, PANEL.w, PANEL.h, 9);
  fillHex(p, C.panelDark, 1);
  p.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 8);
  fillHex(p, C.panel, 0.94);
  p.rect(PANEL.x + 3, PANEL.y + 3, PANEL.w - 6, PANEL.h - 6, 6);
  fillHex(p, C.panelLight, 0.08);
  p.rect(PANEL.x + 10, PANEL.y + 6, PANEL.w - 20, 7, 3);
  fillHex(p, C.benchDeep, 0.28);
  p.rect(PANEL.x + 8, PANEL.y + PANEL.h - 16, PANEL.w - 16, 10, 3);

  // 拉丝
  p.strokeWeight(0.7);
  for (let i = 0; i < 17; i++) {
    const x = PANEL.x + 10 + i * 18.5;
    strokeHex(p, C.panelLight, 0.05);
    p.line(x, PANEL.y + 16, x + 3, PANEL.y + PANEL.h - 18);
  }
  p.noFill();
  strokeHex(p, C.brassDeep, 0.7);
  p.strokeWeight(1.3);
  p.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 8);
  strokeHex(p, C.brassLight, 0.2);
  p.strokeWeight(0.8);
  p.line(PANEL.x + 12, PANEL.y + 1.5, PANEL.x + PANEL.w - 12, PANEL.y + 1.5);

  drawScrew(p, PANEL.x + 12, PANEL.y + 12, 3, 0.9);
  drawScrew(p, PANEL.x + PANEL.w - 12, PANEL.y + 12, 3, 0.9);
  drawScrew(p, PANEL.x + 12, PANEL.y + PANEL.h - 12, 3, 0.9);
  drawScrew(p, PANEL.x + PANEL.w - 12, PANEL.y + PANEL.h - 12, 3, 0.9);

  const knobAngles = [-0.82, 0.24, 1.38];
  for (let i = 0; i < 3; i++) {
    const wob = Math.sin(raw * 7 + i * 2.1) * 0.12 * spinWobble;
    drawSmallKnob(p, 660 + i * 55, 640, 16, knobAngles[i], 9, i, wob);
  }

  drawThresholdDial(p, dialAngle);
  drawJumper(p);

  // 表盘上方的小指示窗
  p.noStroke();
  fillHex(p, C.glassDark, 0.9);
  p.rect(842, 610, 46, 18, 3);
  fillHex(p, C.phosphor, 0.08 + 0.06 * Math.sin(t * 2.2) * 0.5);
  p.rect(845, 613, 40, 12, 2);
  strokeHex(p, C.phosphor, 0.35);
  p.strokeWeight(0.7);
  p.line(848, 619, 882, 619);
  p.pop();
}

// ---------- 左侧数据纸带 ----------

function tapeSampleAt(samples, s) {
  if (s <= 0) return samples[0];
  const last = samples[samples.length - 1];
  if (s >= last.s) return last;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].s >= s) {
      const a = samples[i - 1];
      const b = samples[i];
      const u = (s - a.s) / Math.max(1e-6, b.s - a.s);
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        nx: a.nx + (b.nx - a.nx) * u,
        ny: a.ny + (b.ny - a.ny) * u,
        s
      };
    }
  }
  return last;
}

const TAPE = (() => {
  const pts = [];
  for (let i = 0; i <= 44; i++) {
    const u = i / 44;
    const x = 134 + 358 * u;
    const y = 630 - 30 * u + 9 * Math.sin(Math.PI * u);
    pts.push([x, y]);
  }
  const samples = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    if (i > 0) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    samples.push({ x: pts[i][0], y: pts[i][1], nx: -dy, ny: dx, s: acc });
  }
  return samples;
})();

const TAPE_HOLES = (() => {
  const holes = [];
  const total = TAPE[TAPE.length - 1].s;
  let k = 0;
  for (let s = 7; s < total - 5; s += 10.5) {
    const q = tapeSampleAt(TAPE, s);
    for (const side of [-5.15, 5.15]) {
      holes.push({
        x: q.x + q.nx * side,
        y: q.y + q.ny * side,
        r: 0.95,
        a: 0.65
      });
    }
  }
  for (let s = 13; s < total - 7; s += 31.5) {
    const q = tapeSampleAt(TAPE, s);
    const lanes = [-3.3, -1.65, 0, 1.65, 3.3];
    for (let l = 0; l < lanes.length; l++) {
      if (hash2(k, l, 91) < 0.46) continue;
      holes.push({
        x: q.x + q.nx * lanes[l],
        y: q.y + q.ny * lanes[l],
        r: 0.82,
        a: 0.55
      });
    }
    k++;
  }
  return holes;
})();

function drawTapeStrip(p) {
  p.push();
  p.noStroke();
  const half = 7.5;

  // 纸带在台面上的薄影
  fillHex(p, C.glassDark, 0.3);
  p.beginShape();
  for (const q of TAPE) p.vertex(q.x + 2 + q.nx * half, q.y + 3 + q.ny * half);
  for (let i = TAPE.length - 1; i >= 0; i--) {
    const q = TAPE[i];
    p.vertex(q.x + 2 - q.nx * half, q.y + 3 - q.ny * half);
  }
  p.endShape(p.CLOSE);

  fillHex(p, C.paper, 0.9);
  p.beginShape();
  for (const q of TAPE) p.vertex(q.x + q.nx * half, q.y + q.ny * half);
  for (let i = TAPE.length - 1; i >= 0; i--) {
    const q = TAPE[i];
    p.vertex(q.x - q.nx * half, q.y - q.ny * half);
  }
  p.endShape(p.CLOSE);

  // 上沿受光，下沿压暗
  p.noFill();
  strokeHex(p, C.paperLight, 0.5);
  p.strokeWeight(0.8);
  p.beginShape();
  for (const q of TAPE) p.vertex(q.x + q.nx * (half - 1.1), q.y + q.ny * (half - 1.1));
  p.endShape();
  strokeHex(p, C.paperDark, 0.9);
  p.strokeWeight(0.9);
  p.beginShape();
  for (const q of TAPE) p.vertex(q.x - q.nx * half, q.y - q.ny * half);
  p.endShape();
  strokeHex(p, C.paperDark, 0.7);
  p.strokeWeight(0.7);
  p.beginShape();
  for (const q of TAPE) p.vertex(q.x + q.nx * half, q.y + q.ny * half);
  p.endShape();

  p.noStroke();
  for (const hole of TAPE_HOLES) {
    fillHex(p, C.benchDeep, hole.a);
    p.ellipse(hole.x, hole.y, hole.r * 2, hole.r * 2);
  }
  p.pop();
}

function drawTapeReel(p) {
  const cx = 104;
  const cy = 654;
  const R = 42;
  p.push();
  p.translate(cx, cy);

  p.noStroke();
  fillHex(p, C.glassDark, 0.55);
  p.ellipse(4, 6, R * 2.24, R * 2.02);
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, R * 2 + 8, R * 2 + 8);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, R * 2 + 3, R * 2 + 3);
  fillHex(p, C.paperDark, 1);
  p.ellipse(0, 0, R * 2, R * 2);
  fillHex(p, C.paper, 1);
  p.ellipse(0, 0, R * 1.9, R * 1.9);

  p.noFill();
  for (let k = 0; k < 6; k++) {
    strokeHex(p, k % 2 === 0 ? C.paperDark : C.paperLight, 0.32);
    p.strokeWeight(0.8);
    p.ellipse(0, 0, R * 1.78 - k * 12, R * 1.78 - k * 12);
  }
  for (let k = 0; k < 9; k++) {
    const a = k * (TAU / 9) + 0.2;
    strokeHex(p, C.paperDark, 0.16);
    p.strokeWeight(0.7);
    p.line(Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
  }

  p.noStroke();
  fillHex(p, C.glassDark, 0.9);
  p.ellipse(0, 0, 22, 22);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, 18, 18);
  fillHex(p, C.brass, 1);
  p.ellipse(-0.5, -0.6, 13, 13);
  fillHex(p, C.brassLight, 0.45);
  p.ellipse(-2.4, -2.8, 6, 6);
  fillHex(p, C.glassDark, 1);
  p.ellipse(0, 0, 4.6, 4.6);
  for (let k = 0; k < 3; k++) {
    const a = k * (TAU / 3) + 0.4;
    fillHex(p, C.brassDeep, 0.9);
    p.ellipse(Math.cos(a) * 7.4, Math.sin(a) * 7.4, 3, 3);
  }
  p.pop();
}

function drawTapeReader(p) {
  const x = 496;
  const y = 582;
  const w = 64;
  const h = 46;
  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.5);
  p.rect(x + 4, y + 6, w, h, 6);
  fillHex(p, C.panelDark, 1);
  p.rect(x, y, w, h, 6);
  fillHex(p, C.panel, 0.95);
  p.rect(x + 3, y + 3, w - 6, h - 6, 4);
  fillHex(p, C.panelLight, 0.1);
  p.rect(x + 7, y + 5, w - 14, 5, 2);

  // 进带口
  fillHex(p, C.glassDark, 1);
  p.rect(x - 3, y + 13, 9, 18, 2);
  fillHex(p, C.brassDeep, 0.9);
  p.rect(x - 1, y + 15, 4, 14, 1);

  // 两个黄铜压轮
  for (const ry of [y + 15, y + 31]) {
    fillHex(p, C.glassDark, 0.9);
    p.ellipse(x + 8, ry, 8, 8);
    fillHex(p, C.brassDark, 1);
    p.ellipse(x + 8, ry, 6.4, 6.4);
    fillHex(p, C.brassLight, 0.5);
    p.ellipse(x + 7, ry - 0.6, 2.4, 2.4);
  }

  // 绿色指示灯 + 小旋钮
  fillHex(p, C.phosphor, 0.1);
  p.ellipse(x + 51, y + 12, 12, 12);
  fillHex(p, C.brassDeep, 1);
  p.ellipse(x + 51, y + 12, 7, 7);
  fillHex(p, C.phosphor, 0.85);
  p.ellipse(x + 51, y + 12, 4, 4);
  fillHex(p, C.mintPale, 0.6);
  p.ellipse(x + 50.3, y + 11.2, 1.4, 1.4);

  fillHex(p, C.brassDeep, 1);
  p.ellipse(x + 50, y + 32, 11, 11);
  fillHex(p, C.brassDark, 1);
  p.ellipse(x + 50, y + 32, 8.4, 8.4);
  fillHex(p, C.brass, 0.9);
  p.ellipse(x + 49.6, y + 31.6, 5.8, 5.8);
  strokeHex(p, C.cream, 0.7);
  p.strokeWeight(1);
  p.line(x + 50, y + 32, x + 53, y + 29.5);

  p.noFill();
  strokeHex(p, C.brassDeep, 0.7);
  p.strokeWeight(1);
  p.rect(x, y, w, h, 6);
  drawScrew(p, x + 7, y + 7, 2.2, 0.8);
  drawScrew(p, x + w - 7, y + 7, 2.2, 0.8);
  p.pop();
}

function drawReaderCable(p, bandOnly) {
  const paths = bandOnly
    ? [[[549.3, 530], [554, 520], [570, 494], [586, 474], [588.7, 470]]]
    : [
        [[528, 628], [548, 654], [584, 682], [620, 700]],
        [[528, 582], [540, 550], [554, 520], [570, 494], [586, 474], [594, 462]]
      ];
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  for (const path of paths) {
    for (const [w, col, alpha] of [
      [5.4, C.glassDark, 0.8],
      [3.6, C.cable, 1],
      [1.2, C.cableLight, 0.6]
    ]) {
      strokeHex(p, col, alpha);
      p.strokeWeight(w);
      p.beginShape();
      for (const [x, y] of path) p.vertex(x, y);
      p.endShape();
    }
  }
  p.pop();
}

// ---------- 路：权重线束 ----------

function harnessOffset(i, x) {
  const fan = smoothstep(104, 210, x);
  const tighten = smoothstep(918, 1000, x);
  const full = WIRE_OFFSETS[i] * fan;
  return full + (WIRE_TIGHT[i] - full) * tighten;
}

function wireY(i, x) {
  const tighten = smoothstep(918, 1000, x);
  const sag =
    Math.sin(x * 0.011 + i * 1.7) * 1.25 +
    Math.sin(x * 0.004 + i * 2.1) * 1.6;
  return ROAD_CENTER + harnessOffset(i, x) + sag * (1 - tighten * 0.75);
}

function traceWire(p, i) {
  p.beginShape();
  for (let x = 100; x <= 1000; x += 8) p.vertex(x, wireY(i, x));
  p.endShape();
}

function drawHarnessWires(p) {
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  for (let i = 0; i < 4; i++) {
    strokeHex(p, C.glassDark, 0.95);
    p.strokeWeight(6.8);
    traceWire(p, i);
    strokeHex(p, C.cable, 1);
    p.strokeWeight(4.8);
    traceWire(p, i);
    strokeHex(p, C.cableLight, 0.72);
    p.strokeWeight(2.5);
    traceWire(p, i);
    strokeHex(p, C.phosphor, 0.3);
    p.strokeWeight(1.0);
    traceWire(p, i);
    strokeHex(p, C.mint, 0.13);
    p.strokeWeight(0.7);
    p.beginShape();
    for (let x = 100; x <= 1000; x += 10) p.vertex(x, wireY(i, x) - 1.1);
    p.endShape();
  }
  p.pop();
}

function drawHarnessWeights(p, t) {
  for (let g = 0; g < HARNESS_WEIGHTS.length; g++) {
    const group = HARNESS_WEIGHTS[g];
    for (let k = 0; k < group.xs.length; k++) {
      const x = group.xs[k];
      const wy = wireY(group.wire, x);
      const len = 9 + hash2(group.wire, k, 7) * 10;
      const sway = Math.sin(t * 2.1 + x * 0.04 + group.wire * 1.3) * 0.1;
      const bx = x + Math.sin(sway) * len;
      const by = wy + Math.cos(sway) * len;
      const ring = hash2(group.wire, k, 13) > 0.64;

      // 入口的灯丝光晕分成几束，落在前几枚铜坠上。
      if (x < 360) {
        p.noStroke();
        fillHex(p, C.ember, 0.055 * (1 - smoothstep(150, 360, x)));
        p.ellipse(bx, by, 15, 15);
      }

      p.push();
      p.noFill();
      strokeHex(p, C.brassDeep, 0.85);
      p.strokeWeight(1);
      p.line(x, wy, bx, by);
      p.noStroke();
      fillHex(p, C.brassDark, 1);
      p.ellipse(x, wy, 4.8, 4.8);
      fillHex(p, C.brassLight, 0.4);
      p.ellipse(x - 0.7, wy - 0.8, 1.7, 1.7);

      fillHex(p, C.glassDark, 0.9);
      p.ellipse(bx, by, 8, 8);
      if (ring) {
        p.noFill();
        strokeHex(p, C.copperDark, 1);
        p.strokeWeight(2.4);
        p.ellipse(bx, by, 5.6, 5.6);
        strokeHex(p, C.copper, 1);
        p.strokeWeight(1.3);
        p.ellipse(bx - 0.2, by - 0.2, 4.6, 4.6);
        strokeHex(p, C.copperLight, 0.65);
        p.strokeWeight(0.7);
        p.arc(bx, by, 4.6, 4.6, Math.PI * 1.05, Math.PI * 1.7);
      } else {
        fillHex(p, C.copperDark, 1);
        p.ellipse(bx, by, 6.2, 6.2);
        fillHex(p, C.copper, 1);
        p.ellipse(bx - 0.3, by - 0.4, 4.8, 4.8);
        fillHex(p, C.copperLight, 0.8);
        p.ellipse(bx - 1.2, by - 1.3, 1.7, 1.7);
      }
      p.pop();
    }
  }
}

function drawIncomingCable(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.4);
  p.rect(0, 474, 94, 50, 8);

  p.noFill();
  p.strokeCap(p.BUTT);
  strokeHex(p, C.glassDark, 0.95);
  p.strokeWeight(44);
  p.line(0, 498, 86, 498);
  strokeHex(p, C.cable, 1);
  p.strokeWeight(38);
  p.line(0, 498, 86, 498);
  strokeHex(p, C.cableLight, 0.55);
  p.strokeWeight(31);
  p.line(0, 497, 84, 497);

  // 编织纹
  strokeHex(p, C.panelLight, 0.22);
  p.strokeWeight(0.9);
  for (let x = 4; x < 82; x += 11) {
    p.line(x, 482, x + 7, 514);
    p.line(x + 5, 482, x - 2, 514);
  }
  strokeHex(p, C.mint, 0.05);
  p.strokeWeight(0.7);
  for (let x = 4; x < 84; x += 16) {
    p.line(x, 484, x + 9, 512);
  }

  // 黄铜卡箍
  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.rect(34, 474, 16, 48, 4);
  fillHex(p, C.brassDark, 1);
  p.rect(36, 476, 12, 44, 3);
  fillHex(p, C.brassLight, 0.3);
  p.rect(36, 476, 12, 2, 1);
  drawScrew(p, 42, 482, 2.5, 0.85);
  drawScrew(p, 42, 514, 2.5, 0.85);

  // 分线靴
  fillHex(p, C.glassDark, 0.95);
  p.rect(82, 470, 30, 56, 6);
  fillHex(p, C.panel, 1);
  p.rect(84, 472, 26, 52, 5);
  fillHex(p, C.brassDeep, 1);
  p.ellipse(98, 498, 18, 40);
  fillHex(p, C.glassDark, 1);
  p.ellipse(99, 498, 13, 34);
  strokeHex(p, C.brassLight, 0.3);
  p.strokeWeight(0.8);
  p.noFill();
  p.rect(84.5, 472.5, 25, 51, 5);
  drawScrew(p, 92, 478, 2.2, 0.8);
  drawScrew(p, 104, 518, 2.2, 0.8);
  p.pop();
}

function drawHarnessClamp(p, x) {
  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.55);
  p.rect(x - 5, 474, 10, 50, 3);
  fillHex(p, C.brassDeep, 1);
  p.rect(x - 4, 474, 8, 50, 3);
  fillHex(p, C.brassDark, 1);
  p.rect(x - 2.5, 476, 5, 46, 2);
  fillHex(p, C.brassLight, 0.32);
  p.rect(x - 2.5, 476, 1.4, 46, 1);
  drawScrew(p, x, 480, 2.2, 0.85);
  drawScrew(p, x, 518, 2.2, 0.85);
  p.pop();
}

function drawFlatRibbon(p, raw) {
  const k = smoothstep(4.05, 5.15, raw);
  if (k <= 0.002) return;
  const x0 = 884;
  const x1 = 1000;
  const h = 14 + 30 * k;
  const top = ROAD_CENTER - h * 0.5;
  const span = h * 0.62;
  const y0 = ROAD_CENTER - span * 0.5;
  const step = span / 3;

  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.5 * k);
  p.rect(x0 + 3, top + 4, x1 - x0, h, 3);
  fillHex(p, C.cable, k);
  p.rect(x0, top, x1 - x0, h, 3);
  fillHex(p, C.panelDark, k);
  p.rect(x0 + 2, top + 2, x1 - x0 - 4, h - 4, 2);
  for (let i = 0; i < 4; i++) {
    const y = y0 + i * step;
    fillHex(p, i % 2 === 0 ? C.phosphor : C.mint, 0.24 * k);
    p.rect(x0 + 9, y - 0.6, x1 - x0 - 18, 1.2);
  }

  // 过渡黄铜梳
  fillHex(p, C.brassDeep, k);
  p.rect(x0 - 7, top - 4, 15, h + 8, 3);
  fillHex(p, C.brassDark, k);
  p.rect(x0 - 5, top - 2, 11, h + 4, 2);
  fillHex(p, C.brassLight, 0.35 * k);
  p.rect(x0 - 5, top - 2, 11, 1.6, 1);
  for (let i = 0; i < 4; i++) {
    fillHex(p, C.glassDark, 0.8 * k);
    p.ellipse(x0 + 1, y0 + i * step, 2.4, 2.4);
  }

  // 末端连接器
  fillHex(p, C.brassDeep, k);
  p.rect(986, top - 2, 14, h + 4, 2);
  fillHex(p, C.brassDark, k);
  p.rect(988, top, 12, h, 1.5);
  for (let i = 0; i < 4; i++) {
    fillHex(p, C.brassLight, 0.55 * k);
    p.rect(990, y0 + i * step - 0.65, 8, 1.3, 0.5);
  }
  p.pop();
}

// ---------- 主角：带铜坠的阈值节点 ----------

function drawActorPendants(p, t, exit, spin) {
  const tuck = 1 - exit * 0.78;
  for (let i = 0; i < ACTOR_PENDANTS.length; i++) {
    const pd = ACTOR_PENDANTS[i];
    const ax = Math.cos(pd.a) * 31;
    const ay = Math.sin(pd.a) * 31;
    const len = pd.len * tuck;
    const swing = Math.sin(t * TAU + i * 1.4) * 0.1 * (1 - exit);
    const bx = ax + Math.cos(Math.PI / 2 + swing) * len;
    const by = ay + Math.sin(Math.PI / 2 + swing) * len;
    const bead = pd.bead * (1 - exit * 0.45);

    if (spin > 0.015) {
      p.push();
      p.noFill();
      strokeHex(p, C.brassLight, 0.16 * spin);
      p.strokeWeight(1.2);
      p.arc(0, 0, (31 + pd.len) * 2, (31 + pd.len) * 2, pd.a - 1.1, pd.a + 0.45);
      p.pop();
    }

    p.push();
    p.noFill();
    strokeHex(p, C.brassDeep, 0.9);
    p.strokeWeight(1);
    p.line(ax, ay, bx, by);
    p.noStroke();
    fillHex(p, C.glassDark, 0.95);
    p.ellipse(bx, by, bead * 2.5, bead * 2.5);
    fillHex(p, C.copperDark, 1);
    p.ellipse(bx, by, bead * 2, bead * 2);
    fillHex(p, C.copper, 1);
    p.ellipse(bx - 0.4, by - 0.5, bead * 1.5, bead * 1.5);
    fillHex(p, C.copperLight, 0.8);
    p.ellipse(bx - bead * 0.4, by - bead * 0.45, bead * 0.5, bead * 0.5);
    p.pop();
  }
}

function drawActorRing(p, roll) {
  p.push();
  p.noStroke();
  fillHex(p, C.glassDark, 0.55);
  p.ellipse(2, 4, 72, 72);
  fillHex(p, '#0b0f0d', 1);
  p.ellipse(0, 0, 68, 68);
  fillHex(p, C.brassDeep, 1);
  p.ellipse(0, 0, 64, 64);
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, -0.4, 57, 57);

  p.noFill();
  strokeHex(p, C.brass, 0.95);
  p.strokeWeight(6.6);
  p.ellipse(0, 0, 48, 48);
  strokeHex(p, C.brassLight, 0.5);
  p.strokeWeight(1.2);
  p.ellipse(0, 0, 52.5, 52.5);
  strokeHex(p, C.brassDeep, 0.7);
  p.strokeWeight(1.1);
  p.ellipse(0, 0, 44, 44);

  // 滚动的滚花与铆钉
  p.push();
  p.rotate(roll);
  for (let i = 0; i < 16; i++) {
    const a = i * (TAU / 16);
    strokeHex(p, C.brassLight, i % 4 === 0 ? 0.5 : 0.28);
    p.strokeWeight(i % 4 === 0 ? 1.4 : 0.9);
    p.line(
      Math.cos(a) * 28,
      Math.sin(a) * 28,
      Math.cos(a) * 33,
      Math.sin(a) * 33
    );
  }
  for (let i = 0; i < 3; i++) {
    const a = i * (TAU / 3) + 0.4;
    p.noStroke();
    fillHex(p, C.brassDark, 1);
    p.ellipse(Math.cos(a) * 27.5, Math.sin(a) * 27.5, 4.4, 4.4);
    fillHex(p, C.brassLight, 0.55);
    p.ellipse(Math.cos(a) * 27.5 - 0.7, Math.sin(a) * 27.5 - 0.7, 1.8, 1.8);
  }
  p.pop();

  p.noStroke();
  fillHex(p, '#0d1411', 1);
  p.ellipse(0, 0, 42, 42);
  fillHex(p, C.panelDark, 0.7);
  p.ellipse(0, 0, 37, 37);
  p.noFill();
  strokeHex(p, C.brassLight, 0.35);
  p.strokeWeight(1.1);
  p.ellipse(0, 0, 42, 42);
  strokeHex(p, C.brassLight, 0.55);
  p.strokeWeight(1.2);
  p.arc(0, 0, 60, 60, Math.PI * 1.04, Math.PI * 1.62);
  strokeHex(p, C.brassDeep, 0.6);
  p.strokeWeight(1.1);
  p.arc(0, 0, 66, 66, Math.PI * 0.05, Math.PI * 0.58);

  // 环下四个吊环
  for (const pd of ACTOR_PENDANTS) {
    const ax = Math.cos(pd.a) * 31;
    const ay = Math.sin(pd.a) * 31;
    p.noStroke();
    fillHex(p, C.brassDeep, 1);
    p.ellipse(ax, ay, 5.4, 5.4);
    fillHex(p, C.brassLight, 0.5);
    p.ellipse(ax - 0.6, ay - 0.7, 2, 2);
  }
  p.pop();
}

function drawActorPointer(p, angle, t, exit) {
  const spin = smoothstep(2.05, 2.45, t) * (1 - smoothstep(2.84, 3.04, t));
  const reach = 41 - exit * 25;
  p.push();
  if (spin > 0.02) {
    p.noFill();
    strokeHex(p, C.mint, 0.1 * spin);
    p.strokeWeight(2);
    p.arc(0, 0, 64, 64, angle - 0.75, angle - 0.06);
  }
  p.rotate(angle);
  strokeHex(p, C.glassDark, 0.9);
  p.strokeWeight(3.8);
  p.line(-8, 0, reach - 3, 0);
  strokeHex(p, C.cream, 0.92);
  p.strokeWeight(1.5);
  p.line(-6, 0, reach - 4, 0);
  p.noStroke();
  fillHex(p, C.cream, 0.92);
  p.triangle(reach - 4, -3.2, reach - 4, 3.2, reach + 4, 0);
  fillHex(p, C.brassDeep, 1);
  p.ellipse(-11, 0, 7.4, 7.4);
  fillHex(p, C.brass, 1);
  p.ellipse(-11, -0.4, 5.2, 5.2);
  fillHex(p, C.brassLight, 0.6);
  p.ellipse(-12, -1.2, 1.7, 1.7);
  p.pop();
}

function drawActorEmber(p, flash) {
  p.push();
  p.noStroke();
  fillHex(p, C.ember, 0.09 + 0.1 * flash);
  p.ellipse(0, 0, 32 + flash * 12, 32 + flash * 12);
  fillHex(p, C.ember, 0.2 + 0.12 * flash);
  p.ellipse(0, 0, 19 + flash * 7, 19 + flash * 7);
  fillHex(p, C.ember, 0.88);
  p.ellipse(0, 0, 10.5, 10.5);
  fillHex(p, C.emberHot, 1);
  p.ellipse(-0.6, -0.8, 6.4, 6.4);
  fillHex(p, C.emberCore, 1);
  p.ellipse(-1.1, -1.4, 2.9, 2.9);
  if (flash > 0.02) {
    p.noFill();
    strokeHex(p, C.emberHot, 0.24 * flash);
    p.strokeWeight(1);
    p.ellipse(0, 0, 25 + flash * 10, 25 + flash * 10);
  }
  p.pop();
}

function drawThresholdNode(p, state, raw) {
  const t = clamp(raw, 0, 6);
  const ft = freezeTime(t);
  const pose = decisionPose(t);
  const pointerAngle = wrapPi(pose.angle);
  const flash = smoothstep(2.78, 2.94, t) * (1 - smoothstep(3.35, 3.75, t));
  const exit = smoothstep(4.0, 5.35, t);
  const spin = smoothstep(2.05, 2.45, ft) * (1 - smoothstep(2.84, 3.04, ft));
  const roll = (ft * (1000 / 6)) / 34;
  const bob = Math.sin(ft * TAU) * 1.3;

  p.push();
  p.translate(state.x, ACTOR_Y + bob);
  p.noStroke();
  fillHex(p, C.glassDark, 0.45);
  p.ellipse(0, 33, 58, 10);
  fillHex(p, C.brassLight, 0.05);
  p.ellipse(0, 29, 32, 6);

  drawActorPendants(p, ft, exit, spin);
  drawActorRing(p, roll);
  drawActorPointer(p, pointerAngle, t, exit);
  drawActorEmber(p, flash);
  p.pop();
}

// ---------- 标题 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.noStroke();
  fillHex(p, C.mintPale, 0.76 * alpha);
  p.rect(252, 393, 96, 18, 2);
  fillHex(p, C.cream, 0.35 * alpha);
  p.rect(252, 393, 96, 4, 1.5);
  p.noFill();
  strokeHex(p, C.brassLight, 0.42 * alpha);
  p.strokeWeight(0.8);
  p.rect(252, 393, 96, 18, 2);
  p.pop();
}

// ---------- 场景 ----------

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();

    drawBenchSurface(p, false);
    drawBenchBolts(p);
    drawScope(p, t);
    drawTapeStrip(p);
    drawTapeReel(p);
    drawReaderCable(p, false);
    drawTapeReader(p);
    drawKnobPanel(p, t);

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
    const raw = clamp(state.localT || 0, 0, 6);
    const ft = freezeTime(raw);
    p.push();
    drawBenchSurface(p, true);
    p.noStroke();
    fillHex(p, C.glassDark, 0.24);
    p.rect(0, 514, 1000, 13);
    fillHex(p, C.glassDark, 0.16);
    p.rect(0, 472, 1000, 7);

    drawReaderCable(p, true);
    drawIncomingCable(p);
    drawHarnessWires(p);
    drawHarnessWeights(p, ft);
    drawHarnessClamp(p, 196);
    drawHarnessClamp(p, 858);
    drawFlatRibbon(p, raw);
    p.pop();
  },

  drawActor(p, state) {
    const raw = clamp(state.localT || 0, 0, 6);
    p.push();
    drawThresholdNode(p, state, raw);
    p.pop();
  }
};
