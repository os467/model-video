import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 17 推理模型与强化学习：全屏深蓝推理空间 + 右侧分叉推理树 + 价值曲线 + 分叉步骤牌主角。
// 静态重点：localT≈1.5（标题、分叉轨道、推理树进场、主角滑入）
// 与 localT≈3.0（死路打叉、回退、自指回环、旁支、奖励星、价值曲线陡升、脉冲停住、火种闪）。
const TAU = Math.PI * 2;
const ROAD_TOP = 467;
const ROAD_BOTTOM = 533;
const ROAD_MID = 500;

const META = {
  id: 17,
  cn: '推理模型与强化学习',
  en: 'Reasoning Models & Reinforcement Learning',
  era: '2025',
  group: 'data'
};

const C = {
  bg: '#060a16',
  bgDeep: '#03060e',
  bgLow: '#040812',
  panel: '#0a1226',
  panelLight: '#0e1a33',
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
  cream: '#f0e2bf',
  creamDim: '#c9bd9f',
  amber: '#d98a45',
  gold: '#f2c14e',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa',
  violet: '#9d8cff',
  mint: '#7fe0c0',
  steel: '#8ba3c7',
  wrong: '#c05a46',
  wrongDim: '#72372b'
};

// 推理树的关键节点。全部是抽象步骤牌/几何节点，不写真实题目或长思维链。
const ROOT = { x: 566, y: 460 };
const FORK = { x: 640, y: 426 };
const UPPER = [
  { x: 694, y: 408, label: '2' },
  { x: 752, y: 380, label: '3' }
];
const DEAD = { x: 822, y: 352 };
const LOWER = [
  { x: 696, y: 452, label: '3' },
  { x: 752, y: 438, label: '1' }
];
const LOOP = { x: 802, y: 438, r: 20 };
const SIDE = { x: 846, y: 416 };
const STAR = { x: 900, y: 392 };

const CURVE = { x: 650, y: 600, w: 294, h: 142 };
const PLOT = { x0: 678, x1: 922, top: 622, bottom: 714 };

// 价值/奖励曲线的控制点：先随正确步骤上升，死路掉下，回退后平走，发现旁支时陡升。
const VALUE_KNOTS = [
  { u: 0.0, v: 0.12 },
  { u: 0.16, v: 0.3 },
  { u: 0.3, v: 0.37 },
  { u: 0.4, v: 0.21 },
  { u: 0.48, v: 0.13 },
  { u: 0.58, v: 0.23 },
  { u: 0.7, v: 0.2 },
  { u: 0.78, v: 0.31 },
  { u: 0.88, v: 0.68 },
  { u: 1.0, v: 0.96 }
];

const DUST = (() => {
  const rng = mulberry32(0x17a17e);
  const list = [];
  for (let i = 0; i < 104; i++) {
    list.push({
      x: rng() * 1000,
      y: 176 + rng() * 640,
      r: 0.5 + rng() * 1.4,
      a: 0.012 + rng() * 0.045,
      cool: rng() > 0.3
    });
  }
  return list;
})();

const GHOST_NODES = (() => {
  const rng = mulberry32(0x17b0e5);
  const list = [];
  for (let i = 0; i < 15; i++) {
    list.push({
      x: 490 + rng() * 446,
      y: 246 + rng() * 342,
      w: 13 + rng() * 24,
      h: 9 + rng() * 13,
      rot: (rng() - 0.5) * 0.36,
      a: 0.55 + rng() * 0.45
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

function radialWash(p, cx, cy, r0, r1, stops) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
}

function panel(p, x, y, w, h, r, fill, alpha, edge, edgeAlpha, weight = 1) {
  p.noStroke();
  fillHex(p, fill, alpha);
  p.rect(x, y, w, h, r);
  if (edge && edgeAlpha > 0.002) {
    p.noFill();
    strokeHex(p, edge, edgeAlpha);
    p.strokeWeight(weight);
    p.rect(x, y, w, h, r);
  }
}

// 只用采样点折线，避开 p5 2.x 对贝塞尔闭合形状的空内部点问题。
function pathLine(p, pts, color, alpha, weight = 1.2, under = 0.55) {
  if (alpha <= 0.002 || pts.length < 2) return;
  p.push();
  p.noFill();
  if (under > 0.002) {
    strokeHex(p, C.bgDeep, under * alpha);
    p.strokeWeight(weight + 2.4);
    p.beginShape();
    for (const [x, y] of pts) p.vertex(x, y);
    p.endShape();
  }
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (const [x, y] of pts) p.vertex(x, y);
  p.endShape();
  p.pop();
}

function dashedPath(p, pts, color, alpha, weight = 1, dash = 5, gap = 4) {
  if (alpha <= 0.002 || pts.length < 2) return;
  p.push();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const ux = dx / len;
    const uy = dy / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      p.line(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
    }
  }
  p.pop();
}

function arrowHead(p, x, y, angle, size, color, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.noStroke();
  fillHex(p, color, alpha);
  p.triangle(0, 0, -size, -size * 0.52, -size, size * 0.52);
  p.pop();
}

function diamond(p, cx, cy, size, fill, alpha, edge, edgeAlpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.translate(cx, cy);
  p.rotate(Math.PI / 4);
  p.noStroke();
  fillHex(p, fill, alpha);
  p.rect(-size / 2, -size / 2, size, size, 0.8);
  if (edge && edgeAlpha > 0.002) {
    p.noFill();
    strokeHex(p, edge, edgeAlpha);
    p.strokeWeight(0.8);
    p.rect(-size / 2, -size / 2, size, size, 0.8);
  }
  p.pop();
}

function drawCross(p, cx, cy, size, color, alpha, weight = 1.1) {
  if (alpha <= 0.002) return;
  p.push();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.line(cx - size, cy - size, cx + size, cy + size);
  p.line(cx + size, cy - size, cx - size, cy + size);
  p.pop();
}

function drawCheck(p, cx, cy, size, color, alpha, weight = 1.1) {
  if (alpha <= 0.002) return;
  p.push();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.line(cx - size, cy, cx - size * 0.2, cy + size * 0.7);
  p.line(cx - size * 0.2, cy + size * 0.7, cx + size, cy - size * 0.7);
  p.pop();
}

function drawStepCard(p, cx, cy, w, h, label, alpha, lit = 1, warm = false, glow = 0.05) {
  if (alpha <= 0.002) return;
  const edge = warm ? C.amber : C.cyan;
  const textColor = lit > 0.52 ? C.ink : C.steel;
  p.push();
  p.translate(cx, cy);

  p.noStroke();
  fillHex(p, C.bgDeep, 0.58 * alpha);
  p.rect(-w / 2 + 2, -h / 2 + 3, w, h, 2);
  if (glow > 0.002) {
    fillHex(p, edge, glow * alpha);
    p.rect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 3);
  }
  fillHex(p, C.panel, 0.97 * alpha);
  p.rect(-w / 2, -h / 2, w, h, 2);
  fillHex(p, C.bgLow, 0.94 * alpha);
  p.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 1.4);

  p.noFill();
  strokeHex(p, edge, (0.34 + 0.48 * lit) * alpha);
  p.strokeWeight(1);
  p.rect(-w / 2, -h / 2, w, h, 2);
  strokeHex(p, edge, 0.16 * alpha);
  p.strokeWeight(0.6);
  p.rect(-w / 2 + 2.6, -h / 2 + 2.6, w - 5.2, h - 5.2, 1.2);

  p.noStroke();
  fillHex(p, edge, 0.22 * alpha);
  p.rect(-w / 2 + 5, -h / 2 + 4, 5, 1, 0.4);
  fillHex(p, warm ? C.gold : C.cyanSoft, (0.35 + 0.5 * lit) * alpha);
  p.ellipse(w / 2 - 5.5, -h / 2 + 5, 1.8, 1.8);

  p.textFont('monospace');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(Math.min(8.6, h * 0.45));
  fillHex(p, textColor, 0.82 * alpha);
  p.text(label, 0, 1);
  p.textStyle(p.NORMAL);
  p.pop();
}

function drawRewardStar(p, cx, cy, alpha, hold) {
  if (alpha <= 0.002) return;
  const lock = Math.min(hold, 3);
  p.push();
  p.translate(cx, cy);

  // 低 alpha 层叠光晕，不用大半径 blur。
  p.noStroke();
  fillHex(p, C.ember, 0.055 * alpha);
  p.ellipse(0, 0, 76, 76);
  fillHex(p, C.gold, 0.075 * alpha);
  p.ellipse(0, 0, 42, 42);
  fillHex(p, C.gold, 0.06 * alpha);
  p.ellipse(0, 0, 25, 25);

  p.rotate(-Math.PI / 2 + Math.sin(lock * 2.1) * 0.025);
  p.noStroke();
  fillHex(p, C.gold, 0.96 * alpha);
  p.beginShape();
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16;
    const r = i % 2 === 0 ? 10.5 : 4.4;
    p.vertex(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.endShape(p.CLOSE);

  p.noFill();
  strokeHex(p, C.emberCore, 0.82 * alpha);
  p.strokeWeight(0.8);
  p.beginShape();
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16;
    const r = i % 2 === 0 ? 10.5 : 4.4;
    p.vertex(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.endShape(p.CLOSE);

  p.noStroke();
  fillHex(p, C.cream, 0.96 * alpha);
  p.ellipse(0, 0, 3.4, 3.4);
  fillHex(p, C.emberHot, 0.9 * alpha);
  p.ellipse(0, 0, 1.6, 1.6);

  strokeHex(p, C.emberHot, 0.42 * alpha);
  p.strokeWeight(0.8);
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + 0.22;
    p.line(Math.cos(a) * 14, Math.sin(a) * 14, Math.cos(a) * 20, Math.sin(a) * 20);
  }
  p.pop();
}

function drawForkPulse(p, cx, cy, hold, alpha) {
  if (alpha <= 0.002) return;
  const freeze = smoothstep(2.82, 3.0, hold);
  const phase = Math.min(hold, 2.82) * 1.25;
  p.push();
  p.noFill();
  for (let i = 0; i < 4; i++) {
    const r = 15 + i * 11 + Math.sin(phase * 1.7 + i * 0.8) * 2.2 * (1 - freeze);
    const a0 = -Math.PI * 0.82 + i * 0.34 + phase * 0.12 * (1 - freeze);
    const sweep = Math.PI * 1.32;
    const col = i === 1 ? C.cream : C.cyan;
    strokeHex(p, col, (0.15 - i * 0.022 + freeze * 0.025) * alpha);
    p.strokeWeight(i === 0 ? 1.15 : 0.8);
    p.beginShape();
    for (let j = 0; j <= 22; j++) {
      const a = a0 + (sweep * j) / 22;
      p.vertex(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.82);
    }
    p.endShape();
  }
  if (freeze > 0.02) {
    strokeHex(p, C.cyanSoft, 0.14 * freeze * alpha);
    p.strokeWeight(0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI / 4;
      p.line(
        cx + Math.cos(a) * 10,
        cy + Math.sin(a) * 10,
        cx + Math.cos(a) * 14,
        cy + Math.sin(a) * 14
      );
    }
  }
  p.pop();
}

function drawRoadPulse(p, hold, alpha) {
  if (alpha <= 0.002) return;
  const freeze = smoothstep(2.82, 3.0, hold);
  const phase = Math.min(hold, 2.82) * 1.2;
  p.push();
  p.noFill();
  for (let i = 0; i < 3; i++) {
    const r = 10 + i * 7 + Math.sin(phase * 1.6 + i) * 1.4 * (1 - freeze);
    strokeHex(p, i === 1 ? C.cream : C.cyan, (0.12 - i * 0.022) * alpha);
    p.strokeWeight(0.8);
    p.beginShape();
    for (let j = 0; j <= 20; j++) {
      const a = (j / 20) * TAU;
      p.vertex(ROOT.x + Math.cos(a) * r, ROAD_MID + Math.sin(a) * r * 0.38);
    }
    p.endShape();
  }
  p.pop();
}

// ---------- 背景：推理图纸 ----------

function drawGhostMaze(p, t) {
  const a = smoothstep(0.12, 1.2, t) * (1 - 0.65 * smoothstep(4.2, 5.6, t));
  if (a <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, C.cyan, 0.024 * a);
  p.strokeWeight(0.8);
  p.ellipse(792, 424, 308, 226);
  p.ellipse(812, 420, 190, 142);
  p.ellipse(760, 448, 430, 110);

  let prev = null;
  for (let i = 0; i < GHOST_NODES.length; i++) {
    const n = GHOST_NODES[i];
    if (prev && hash2(i, 7, 171) > 0.42) {
      strokeHex(p, C.line, 0.035 * a * n.a);
      p.strokeWeight(0.6);
      p.line(prev.x, prev.y, n.x, n.y);
    }
    p.push();
    p.translate(n.x, n.y);
    p.rotate(n.rot);
    p.noStroke();
    fillHex(p, C.panel, 0.2 * a * n.a);
    p.rect(-n.w / 2, -n.h / 2, n.w, n.h, 1.2);
    p.noFill();
    strokeHex(p, i % 4 === 0 ? C.cream : C.cyan, 0.045 * a * n.a);
    p.strokeWeight(0.6);
    p.rect(-n.w / 2, -n.h / 2, n.w, n.h, 1.2);
    p.noStroke();
    fillHex(p, i % 5 === 0 ? C.amber : C.cyanDim, 0.08 * a * n.a);
    p.ellipse(-n.w / 2 + 3.5, -n.h / 2 + 3, 1.4, 1.4);
    p.pop();
    prev = n;
  }

  // 极淡的施工箭头，像推理图纸上的方向标记。
  const traces = [
    [56, 646, 176, 646],
    [206, 694, 318, 694],
    [512, 282, 612, 282],
    [700, 248, 790, 248],
    [812, 574, 900, 574]
  ];
  for (let i = 0; i < traces.length; i++) {
    const [x0, y0, x1, y1] = traces[i];
    strokeHex(p, i % 2 ? C.creamDim : C.cyan, 0.035 * a);
    p.strokeWeight(0.8);
    p.line(x0, y0, x1, y1);
    arrowHead(p, x1, y1, 0, 4.4, i % 2 ? C.creamDim : C.cyan, 0.05 * a);
  }
  p.pop();
}

function drawBackdrop(p, t) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  fillHex(p, C.navy, 0.16);
  p.rect(0, 192, 1000, 436);
  fillHex(p, C.panel, 0.22);
  p.rect(0, 618, 1000, 220);
  fillHex(p, C.bgDeep, 0.5);
  p.rect(0, 828, 1000, 172);

  linearWash(
    p,
    0,
    166,
    0,
    844,
    [
      [0, 'rgba(2,5,13,0.46)'],
      [0.22, 'rgba(3,8,20,0.05)'],
      [0.62, 'rgba(0,0,0,0)'],
      [0.84, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.55)']
    ],
    0,
    0,
    1000,
    1000
  );

  radialWash(p, 770, 428, 20, 420, [
    [0, 'rgba(99,223,255,0.035)'],
    [0.5, 'rgba(44,67,128,0.015)'],
    [1, 'rgba(0,0,0,0)']
  ]);

  // 全屏很淡的推理图纸网格。
  p.strokeWeight(0.7);
  for (let x = 0; x <= 1000; x += 40) {
    strokeHex(p, C.line, x % 200 === 0 ? 0.032 : 0.016);
    p.line(x, 210, x, 792);
  }
  for (let y = 210; y <= 792; y += 40) {
    strokeHex(p, C.line, (y - 210) % 200 === 0 ? 0.03 : 0.014);
    p.line(0, y, 1000, y);
  }

  // 右侧推理树底图：略强一点的网格和辅助线，仍不抢标题区。
  p.strokeWeight(0.7);
  for (let x = 480; x <= 960; x += 40) {
    strokeHex(p, C.cyan, x % 160 === 0 ? 0.032 : 0.018);
    p.line(x, 224, x, 616);
  }
  for (let y = 240; y <= 616; y += 40) {
    strokeHex(p, C.cyan, 0.016);
    p.line(480, y, 960, y);
  }
  strokeHex(p, C.line, 0.022);
  p.strokeWeight(0.8);
  p.line(470, 616, 928, 240);
  p.line(516, 240, 940, 588);
  p.line(480, 452, 960, 452);

  // 图纸边缘的刻度短线。
  strokeHex(p, C.cyan, 0.06);
  p.strokeWeight(0.7);
  for (let x = 500; x <= 940; x += 40) {
    p.line(x, 224, x, 228);
    p.line(x, 612, x, 616);
  }

  drawGhostMaze(p, t);

  // 空气尘埃。
  p.noStroke();
  for (const d of DUST) {
    fillHex(p, d.cool ? C.cyanSoft : C.creamDim, d.a);
    p.ellipse(d.x, d.y, d.r, d.r);
  }

  fillHex(p, C.cyan, 0.012);
  p.ellipse(760, 418, 500, 340);
  fillHex(p, C.amber, 0.008);
  p.ellipse(884, 436, 230, 180);
  p.pop();
}

// ---------- 右侧推理树 ----------

function drawTree(p, t, hold) {
  const treeIn = smoothstep(0.24, 1.38, t);
  const upperIn = smoothstep(0.55, 1.38, t);
  const dead = smoothstep(2.22, 2.5, hold);
  const back = smoothstep(2.5, 2.78, hold);
  const lowerIn = smoothstep(2.55, 2.88, hold);
  const loopIn = smoothstep(2.62, 2.9, hold);
  const sideIn = smoothstep(2.78, 2.98, hold);
  const starIn = smoothstep(2.84, 3.0, hold);
  const exit = smoothstep(4.3, 5.7, t);
  const fade = 1 - 0.72 * exit;

  p.push();
  p.translate(20 * exit, -8 * exit);

  // 从轨道节点伸出的主干。
  pathLine(
    p,
    [
      [ROOT.x, ROOT.y],
      [588, 448],
      [616, 436],
      [FORK.x, FORK.y]
    ],
    C.cyan,
    0.48 * treeIn * fade,
    1.4
  );
  diamond(p, ROOT.x, ROOT.y, 8, C.panel, 0.95, C.cyan, 0.42 * treeIn * fade);

  // 关键分支的低频同心脉冲：第 2 小节结束时停住。
  drawForkPulse(p, FORK.x, FORK.y, hold, treeIn * fade);
  diamond(p, FORK.x, FORK.y, 13, C.panelLight, 0.98, C.cyanSoft, 0.72 * treeIn * fade);
  p.push();
  p.noStroke();
  fillHex(p, C.amber, 0.72 * treeIn * fade);
  p.ellipse(FORK.x, FORK.y, 4.2, 4.2);
  fillHex(p, C.ember, 0.08 * treeIn * fade);
  p.ellipse(FORK.x, FORK.y, 16, 16);
  p.pop();

  // 上路：通向死路，后面变暗并打叉。
  const upperA = upperIn * treeIn * fade;
  const upperDim = 1 - 0.62 * dead;
  pathLine(
    p,
    [
      [FORK.x, FORK.y],
      [664, 418],
      [UPPER[0].x, UPPER[0].y]
    ],
    C.cyanDim,
    0.42 * upperA * upperDim,
    1.1
  );
  pathLine(
    p,
    [
      [UPPER[0].x, UPPER[0].y],
      [720, 392],
      [UPPER[1].x, UPPER[1].y]
    ],
    C.cyanDim,
    0.42 * upperA * upperDim,
    1.1
  );
  pathLine(
    p,
    [
      [UPPER[1].x, UPPER[1].y],
      [786, 364],
      [DEAD.x, DEAD.y]
    ],
    C.cyanDim,
    0.34 * upperA * upperDim,
    1.1
  );
  arrowHead(p, 718, 390, -2.55, 4.2, C.cyanDim, 0.36 * upperA * upperDim);
  arrowHead(p, 792, 362, -2.7, 4.2, C.cyanDim, 0.3 * upperA * upperDim);

  drawStepCard(p, UPPER[0].x, UPPER[0].y, 32, 23, UPPER[0].label, upperA * 0.92, upperDim, false, 0.04);
  drawStepCard(p, UPPER[1].x, UPPER[1].y, 32, 23, UPPER[1].label, upperA * 0.92, upperDim, false, 0.04);

  // 死路节点：变暗的圆 + 叉。
  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.82 * upperA);
  p.ellipse(DEAD.x, DEAD.y, 25, 25);
  fillHex(p, C.panel, 0.9 * upperA);
  p.ellipse(DEAD.x, DEAD.y, 18, 18);
  p.noFill();
  strokeHex(p, C.wrongDim, 0.5 * upperA);
  p.strokeWeight(1);
  p.ellipse(DEAD.x, DEAD.y, 18, 18);
  p.pop();
  if (dead > 0.002) {
    p.push();
    p.noStroke();
    fillHex(p, C.wrong, 0.055 * dead * upperA);
    p.ellipse(DEAD.x, DEAD.y, 48, 48);
    p.pop();
    drawCross(p, DEAD.x, DEAD.y, 7, C.wrong, 0.9 * dead * upperA, 1.4);
    drawCross(p, DEAD.x, DEAD.y, 3.4, C.emberHot, 0.6 * dead * upperA, 0.9);
    p.push();
    p.noFill();
    strokeHex(p, C.wrong, 0.28 * dead * upperA);
    p.strokeWeight(0.8);
    p.ellipse(DEAD.x, DEAD.y, 31, 31);
    p.pop();
  }

  // 回退：沿上路反向的虚线箭头。
  if (back > 0.002) {
    p.push();
    dashedPath(
      p,
      [
        [810, 366],
        [764, 398],
        [706, 426],
        [660, 443]
      ],
      C.cream,
      0.54 * back * upperA,
      1,
      4.5,
      4
    );
    arrowHead(p, 660, 443, 2.85, 4.8, C.emberHot, 0.72 * back * upperA);
    p.noStroke();
    fillHex(p, C.cream, 0.24 * back * upperA);
    p.ellipse(744, 410, 1.8, 1.8);
    p.ellipse(704, 430, 1.5, 1.5);
    p.pop();
  }

  // 下路：正确分支，暖色。
  const lowerA = lowerIn * treeIn * fade;
  pathLine(
    p,
    [
      [FORK.x, FORK.y],
      [662, 436],
      [LOWER[0].x, LOWER[0].y]
    ],
    C.amber,
    0.5 * lowerA,
    1.25
  );
  pathLine(
    p,
    [
      [LOWER[0].x, LOWER[0].y],
      [720, 446],
      [LOWER[1].x, LOWER[1].y]
    ],
    C.amber,
    0.5 * lowerA,
    1.25
  );
  arrowHead(p, 716, 446, 0.18, 4.2, C.emberHot, 0.42 * lowerA);

  drawStepCard(p, LOWER[0].x, LOWER[0].y, 32, 23, LOWER[0].label, lowerA * 0.96, 1, true, 0.055);
  drawStepCard(p, LOWER[1].x, LOWER[1].y, 32, 23, LOWER[1].label, lowerA * 0.96, 1, true, 0.055);

  // 自指回环：步骤牌又指回同一个分叉。用采样点画整圈，不用贝塞尔。
  if (loopIn > 0.002) {
    const loopPts = [];
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI + (i / 30) * TAU;
      loopPts.push([LOOP.x + Math.cos(a) * LOOP.r, LOOP.y + Math.sin(a) * LOOP.r]);
    }
    pathLine(p, loopPts, C.amber, 0.56 * lowerA * loopIn, 1.2);
    p.push();
    p.noFill();
    strokeHex(p, C.cream, 0.25 * lowerA * loopIn);
    p.strokeWeight(0.8);
    p.beginShape();
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * TAU;
      p.vertex(LOOP.x + Math.cos(a) * (LOOP.r - 3), LOOP.y + Math.sin(a) * (LOOP.r - 3));
    }
    p.endShape();
    p.pop();
    arrowHead(p, LOOP.x - LOOP.r, LOOP.y, -Math.PI / 2, 4.6, C.emberCore, 0.74 * lowerA * loopIn);
    p.push();
    p.noStroke();
    fillHex(p, C.bgDeep, 0.95 * lowerA * loopIn);
    p.ellipse(LOOP.x - LOOP.r, LOOP.y, 7, 7);
    fillHex(p, C.amber, 0.85 * lowerA * loopIn);
    p.ellipse(LOOP.x - LOOP.r, LOOP.y, 4, 4);
    fillHex(p, C.cream, 0.7 * lowerA * loopIn);
    p.ellipse(LOOP.x - LOOP.r, LOOP.y, 1.6, 1.6);
    p.pop();
  }

  // 旁支与奖励星：从回环旁发现小小岔路。
  if (sideIn > 0.002) {
    pathLine(
      p,
      [
        [LOOP.x + LOOP.r, LOOP.y],
        [SIDE.x, SIDE.y],
        [STAR.x, STAR.y]
      ],
      C.gold,
      0.6 * sideIn * lowerA,
      1.35
    );
    diamond(p, SIDE.x, SIDE.y, 7, C.panel, 0.95, C.gold, 0.58 * sideIn * lowerA);
    drawCheck(p, 868, 407, 4.6, C.gold, 0.8 * sideIn * lowerA, 1.1);
    arrowHead(p, 882, 398, -0.5, 4.4, C.gold, 0.55 * sideIn * lowerA);
  }

  if (starIn > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.gold, 0.24 * starIn * lowerA);
    p.strokeWeight(0.8);
    p.ellipse(STAR.x, STAR.y, 31, 31);
    p.pop();
    drawRewardStar(p, STAR.x, STAR.y, starIn * lowerA, hold);
  }

  p.pop();
}

// ---------- 右下价值 / 奖励曲线 ----------

function valueAt(u) {
  const q = clamp(u, 0, 1);
  for (let i = 1; i < VALUE_KNOTS.length; i++) {
    const a = VALUE_KNOTS[i - 1];
    const b = VALUE_KNOTS[i];
    if (q <= b.u) {
      const k = (q - a.u) / Math.max(0.0001, b.u - a.u);
      const s = k * k * (3 - 2 * k);
      return a.v + (b.v - a.v) * s;
    }
  }
  return VALUE_KNOTS[VALUE_KNOTS.length - 1].v;
}

function valueX(u) {
  return PLOT.x0 + clamp(u, 0, 1) * (PLOT.x1 - PLOT.x0);
}

function valueY(u) {
  return PLOT.bottom - valueAt(u) * (PLOT.bottom - PLOT.top);
}

function drawCurveSegment(p, uMax, color, alpha, weight) {
  if (uMax <= 0.002 || alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  const n = Math.max(2, Math.ceil(64 * uMax));
  for (let i = 0; i <= n; i++) {
    const u = (uMax * i) / n;
    p.vertex(valueX(u), valueY(u));
  }
  p.endShape();
  p.pop();
}

function drawValuePanel(p, t, hold) {
  const appear = smoothstep(0.42, 1.32, t) * (1 - 0.7 * smoothstep(4.4, 5.7, t));
  if (appear <= 0.002) return;
  const reveal = smoothstep(0.3, 2.95, hold);

  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.6 * appear);
  p.rect(CURVE.x + 5, CURVE.y + 6, CURVE.w, CURVE.h, 4);
  fillHex(p, C.panel, 0.98 * appear);
  p.rect(CURVE.x, CURVE.y, CURVE.w, CURVE.h, 4);
  fillHex(p, C.bgLow, 0.98 * appear);
  p.rect(CURVE.x + 4, CURVE.y + 4, CURVE.w - 8, CURVE.h - 8, 3);

  // 顶栏状态灯。
  for (let i = 0; i < 5; i++) {
    fillHex(p, i === 4 ? C.gold : C.cyan, (0.16 + hash2(i, 51, 173) * 0.28) * appear);
    p.rect(CURVE.x + 11 + i * 9, CURVE.y + 9, 4, 1.8, 0.5);
  }
  fillHex(p, C.navyDeep, 0.85 * appear);
  p.rect(CURVE.x + 224, CURVE.y + 8, 54, 4, 1);
  fillHex(p, C.cyan, 0.24 * appear);
  p.rect(CURVE.x + 228, CURVE.y + 9, 22 + 16 * reveal, 1.2, 0.5);

  // 坐标纸。
  p.noFill();
  p.strokeWeight(0.6);
  for (let x = PLOT.x0; x <= PLOT.x1; x += 20) {
    strokeHex(p, C.cyan, 0.035 * appear);
    p.line(x, PLOT.top, x, PLOT.bottom);
  }
  for (let y = PLOT.top; y <= PLOT.bottom; y += 15) {
    strokeHex(p, C.cyan, 0.035 * appear);
    p.line(PLOT.x0, y, PLOT.x1, y);
  }

  // 坐标轴与刻度。
  strokeHex(p, C.creamDim, 0.34 * appear);
  p.strokeWeight(0.9);
  p.line(PLOT.x0, PLOT.top, PLOT.x0, PLOT.bottom);
  p.line(PLOT.x0, PLOT.bottom, PLOT.x1, PLOT.bottom);
  for (let x = PLOT.x0; x <= PLOT.x1; x += 20) {
    const major = Math.abs((x - PLOT.x0) % 80) < 0.5;
    strokeHex(p, C.creamDim, (major ? 0.24 : 0.1) * appear);
    p.line(x, PLOT.bottom, x, PLOT.bottom + (major ? 4 : 2));
  }
  for (let y = PLOT.top; y <= PLOT.bottom; y += 15) {
    strokeHex(p, C.creamDim, 0.09 * appear);
    p.line(PLOT.x0 - 3, y, PLOT.x0, y);
  }

  // 未来曲线的淡影。
  drawCurveSegment(p, 1, C.cyan, 0.07 * appear, 1);

  if (reveal > 0.02) {
    // 曲线下面积，低 alpha 折线闭合。
    p.noStroke();
    fillHex(p, C.cyan, 0.033 * appear);
    p.beginShape();
    p.vertex(PLOT.x0, PLOT.bottom);
    const n = Math.max(2, Math.ceil(60 * reveal));
    for (let i = 0; i <= n; i++) {
      const u = (reveal * i) / n;
      p.vertex(valueX(u), valueY(u));
    }
    p.vertex(valueX(reveal), PLOT.bottom);
    p.endShape(p.CLOSE);

    drawCurveSegment(p, reveal, C.cyan, 0.15 * appear, 4.4);
    drawCurveSegment(p, reveal, C.cyanSoft, 0.72 * appear, 1.4);
    if (reveal > 0.78) {
      const u0 = 0.78;
      const seg = (reveal - u0) / (1 - u0);
      if (seg > 0.01) {
        p.push();
        p.noFill();
        strokeHex(p, C.gold, 0.7 * appear);
        p.strokeWeight(1.8);
        p.beginShape();
        const n = Math.max(2, Math.ceil(28 * seg));
        for (let i = 0; i <= n; i++) {
          const u = u0 + ((reveal - u0) * i) / n;
          p.vertex(valueX(u), valueY(u));
        }
        p.endShape();
        p.pop();
      }
    }

    // 曲线节点：分叉、死路、回环、奖励。
    const forkU = 0.3;
    if (reveal > forkU) {
      p.push();
      p.noFill();
      strokeHex(p, C.cyanSoft, 0.45 * appear);
      p.strokeWeight(0.8);
      p.ellipse(valueX(forkU), valueY(forkU), 6, 6);
      p.pop();
    }
    const deadU = 0.48;
    if (reveal > deadU) {
      drawCross(p, valueX(deadU), valueY(deadU), 3.2, C.wrong, 0.7 * appear, 0.9);
    }
    const loopU = 0.7;
    if (reveal > loopU) {
      p.push();
      p.noStroke();
      fillHex(p, C.amber, 0.7 * appear);
      p.rect(valueX(loopU) - 2, valueY(loopU) - 2, 4, 4, 0.5);
      p.pop();
    }

    const ex = valueX(reveal);
    const ey = valueY(reveal);
    if (reveal > 0.992) {
      // 末端陡升：竖向虚线 + 金色终点。
      p.push();
      p.noFill();
      strokeHex(p, C.cream, 0.16 * appear);
      p.strokeWeight(0.8);
      for (let y = PLOT.top + 3; y < ey - 4; y += 6) {
        p.line(ex, y, ex, y + 3);
      }
      p.line(PLOT.x0, ey, ex - 4, ey);
      p.pop();
      p.push();
      p.noStroke();
      fillHex(p, C.emberHot, 0.78 * appear);
      p.ellipse(ex, ey, 5, 5);
      fillHex(p, C.cream, 0.95 * appear);
      p.ellipse(ex - 0.5, ey - 0.5, 2.2, 2.2);
      fillHex(p, C.ember, 0.11 * appear);
      p.ellipse(ex, ey, 28, 28);
      fillHex(p, C.gold, 0.045 * appear);
      p.ellipse(ex - 16, PLOT.top + 18, 92, 48);
      p.pop();
    } else {
      p.push();
      p.noStroke();
      fillHex(p, C.cyan, 0.9 * appear);
      p.ellipse(ex, ey, 3.4, 3.4);
      fillHex(p, C.cyan, 0.12 * appear);
      p.ellipse(ex, ey, 15, 15);
      p.pop();
    }
  }

  // 底部的小方块计数，只做抽象刻度。
  const cellW = (PLOT.x1 - PLOT.x0) / 18;
  const litCount = Math.floor(reveal * 18 + 0.0001);
  p.noStroke();
  for (let i = 0; i < 18; i++) {
    const on = i < litCount;
    const x = PLOT.x0 + i * cellW + 1;
    fillHex(p, on ? (i % 6 === 5 ? C.gold : C.cyan) : C.navyDeep, (on ? 0.62 : 0.58) * appear);
    p.rect(x, PLOT.bottom + 8, Math.max(2, cellW - 3), 4, 0.8);
    if (on) {
      fillHex(p, C.cyanSoft, 0.09 * appear);
      p.rect(x, PLOT.bottom + 7, Math.max(2, cellW - 3), 1);
    }
  }

  p.noFill();
  strokeHex(p, C.line, 0.5 * appear);
  p.strokeWeight(1);
  p.rect(CURVE.x, CURVE.y, CURVE.w, CURVE.h, 4);
  strokeHex(p, C.cyan, 0.14 * appear);
  p.strokeWeight(0.7);
  p.rect(CURVE.x + 3, CURVE.y + 3, CURVE.w - 6, CURVE.h - 6, 3);
  p.pop();
}

// ---------- 推理轨道 ----------

function drawReasonRoad(p, t) {
  const hold = Math.min(t, 3);
  const roadIn = smoothstep(0, 0.75, t);
  const dead = smoothstep(2.22, 2.5, hold);
  const back = smoothstep(2.5, 2.8, hold);
  const lowerIn = smoothstep(2.55, 2.9, hold);
  const loopIn = smoothstep(2.62, 2.92, hold);
  const starIn = smoothstep(2.84, 3.0, hold);
  const ringIn = smoothstep(3.9, 5.35, t);
  const ghostRing = 0.05 * smoothstep(2.5, 3.0, hold) * (1 - ringIn);
  const merge = 1 - smoothstep(1.9, 3.0, t);

  p.push();
  p.noStroke();

  // 覆盖默认路带 y≈470–530。
  fillHex(p, C.bgDeep, 1);
  p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  fillHex(p, C.bgLow, 1);
  p.rect(0, ROAD_TOP + 2, 1000, ROAD_BOTTOM - ROAD_TOP - 4);
  fillHex(p, C.panel, 0.52);
  p.rect(0, ROAD_TOP + 5, 1000, ROAD_BOTTOM - ROAD_TOP - 10);

  // 带面里的极细编织纹。
  for (let y = ROAD_TOP + 8; y < ROAD_BOTTOM - 7; y += 4) {
    fillHex(p, C.navyLight, 0.055);
    p.rect(0, y, 1000, 0.6);
    fillHex(p, C.cyan, 0.012);
    p.rect(0, y + 1.4, 1000, 0.5);
  }

  // 两侧导轨。
  fillHex(p, C.navyDeep, 1);
  p.rect(0, ROAD_TOP, 1000, 6);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 6);
  fillHex(p, C.line, 0.55);
  p.rect(0, ROAD_TOP + 1, 1000, 1);
  p.rect(0, ROAD_BOTTOM - 2, 1000, 1);
  fillHex(p, C.cyan, 0.2);
  p.rect(0, ROAD_TOP + 5, 1000, 0.8);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 0.8);

  // 并行细线：推理带的触面。
  const lanes = [480, 488, 500, 512, 520];
  for (let i = 0; i < lanes.length; i++) {
    const y = lanes[i];
    strokeHex(p, i === 2 ? C.cream : i % 2 ? C.cyan : C.cyanDim, (i === 2 ? 0.1 : 0.13) * roadIn);
    p.strokeWeight(i === 2 ? 0.8 : 0.6);
    p.line(0, y, 1000, y);
  }

  // 横向短刻痕。
  for (let i = 0; i < 9; i++) {
    const x = 32 + i * 116;
    fillHex(p, C.navyDeep, 0.6);
    p.rect(x, ROAD_TOP + 9, 3, ROAD_BOTTOM - ROAD_TOP - 18);
    fillHex(p, C.cyan, 0.09);
    p.rect(x + 1, ROAD_TOP + 10, 0.8, ROAD_BOTTOM - ROAD_TOP - 20);
    fillHex(p, C.steel, 0.2);
    p.rect(x - 2, ROAD_TOP + 10, 7, 1.6, 0.4);
    p.rect(x - 2, ROAD_BOTTOM - 12, 7, 1.6, 0.4);
  }

  // 移动的短虚线，保持方向感。
  const off = ((t * 30) % 88 + 88) % 88;
  for (let i = 0; i < 12; i++) {
    const x = (i * 88 + off) % 1000;
    fillHex(p, i % 4 === 0 ? C.gold : C.cyan, 0.19 * roadIn);
    p.rect(x, 496.5, 7, 1.2, 0.5);
  }

  // 轨道上的步骤牌：1/2/3。
  const steps = [
    { x: 110, n: '1', at: 0.22 },
    { x: 262, n: '2', at: 0.3 },
    { x: 414, n: '3', at: 0.38 },
    { x: 632, n: '2', at: 0.46 },
    { x: 790, n: '1', at: 0.54 },
    { x: 918, n: '3', at: 0.62 }
  ];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const a = smoothstep(s.at, s.at + 0.28, t) * (1 - 0.7 * smoothstep(4.6, 5.8, t));
    if (a <= 0.002) continue;
    p.noStroke();
    fillHex(p, C.bgDeep, 0.86 * a);
    p.rect(s.x - 13, 507, 26, 11, 1.5);
    p.noFill();
    strokeHex(p, C.cyan, 0.28 * a);
    p.strokeWeight(0.6);
    p.rect(s.x - 13, 507, 26, 11, 1.5);
    p.noStroke();
    fillHex(p, C.cyanSoft, 0.08 * a);
    p.rect(s.x - 11, 508, 22, 1, 0.4);
    p.textFont('monospace');
    p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(6.4);
    fillHex(p, C.cyanSoft, 0.72 * a);
    p.text(s.n, s.x, 512.6);
    p.textStyle(p.NORMAL);
  }

  // 前进箭头。
  const arrowXs = [58, 182, 338, 476, 704, 862, 960];
  for (let i = 0; i < arrowXs.length; i++) {
    const a = 0.16 * roadIn * (1 - 0.5 * smoothstep(4.6, 5.8, t));
    arrowHead(p, arrowXs[i], 500, 0, 4.6, i % 3 === 0 ? C.cream : C.cyan, a);
  }

  // 分叉节点：从轨道上沿接向推理树。
  pathLine(p, [[ROOT.x, ROAD_MID], [ROOT.x, ROOT.y]], C.cyan, 0.42 * roadIn, 1.2, 0.4);
  drawRoadPulse(p, hold, roadIn);
  diamond(p, ROOT.x, ROAD_MID, 9, C.panel, 0.98, C.cyan, 0.62 * roadIn);
  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.75 * roadIn);
  p.ellipse(ROOT.x, ROAD_MID, 3.2, 3.2);
  fillHex(p, C.cyan, 0.07 * roadIn);
  p.ellipse(ROOT.x, ROAD_MID, 22, 8);
  p.pop();

  // 上路死路支线：先亮后暗、打叉。
  pathLine(
    p,
    [
      [ROOT.x, ROAD_MID],
      [592, 490],
      [620, 482],
      [650, 479]
    ],
    C.cyanDim,
    (0.36 - 0.16 * dead) * roadIn,
    1.1
  );
  arrowHead(p, 650, 479, -0.2, 4.2, C.cyanDim, (0.34 - 0.14 * dead) * roadIn);
  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.9 * roadIn);
  p.ellipse(658, 478, 10, 10);
  fillHex(p, C.panel, 0.92 * roadIn);
  p.ellipse(658, 478, 6, 6);
  p.noFill();
  strokeHex(p, C.wrongDim, 0.44 * roadIn);
  p.strokeWeight(0.7);
  p.ellipse(658, 478, 6, 6);
  p.pop();
  if (dead > 0.002) {
    drawCross(p, 658, 478, 4, C.wrong, 0.8 * dead * roadIn, 1);
    if (back > 0.002) {
      dashedPath(
        p,
        [
          [650, 486],
          [616, 494],
          [582, 500]
        ],
        C.cream,
        0.44 * back * roadIn,
        0.9,
        3.8,
        3.2
      );
      arrowHead(p, 574, 501, 2.9, 4.2, C.emberHot, 0.55 * back * roadIn);
    }
  }

  // 下路自指回环的小图示。
  if (loopIn > 0.002) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = -Math.PI * 0.4 + (i / 24) * TAU * 0.82;
      pts.push([790 + Math.cos(a) * 16, 499 + Math.sin(a) * 7]);
    }
    pathLine(p, pts, C.amber, 0.44 * loopIn * lowerIn, 1, 0.35);
    arrowHead(p, 801, 492, 0.2, 4, C.emberCore, 0.55 * loopIn * lowerIn);
  }

  // 正确路径末端的金色奖励小节点。
  if (starIn > 0.002) {
    p.push();
    p.noStroke();
    fillHex(p, C.ember, 0.08 * starIn);
    p.ellipse(884, 500, 30, 12);
    fillHex(p, C.gold, 0.9 * starIn);
    p.beginShape();
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 - Math.PI / 2;
      const r = i % 2 === 0 ? 5.5 : 2.2;
      p.vertex(884 + Math.cos(a) * r, 500 + Math.sin(a) * r);
    }
    p.endShape(p.CLOSE);
    fillHex(p, C.cream, 0.9 * starIn);
    p.ellipse(884, 500, 1.8, 1.8);
    p.pop();
  }

  // 左侧：第 16 版块四色混合信号带收成步骤牌。
  if (merge > 0.002) {
    const mergeA = merge * roadIn;
    const bands = [
      { pts: [[0, 422], [20, 456], [48, 486], [74, 500]], color: C.cyan },
      { pts: [[0, 450], [22, 472], [50, 492], [76, 500]], color: C.cream },
      { pts: [[0, 550], [22, 524], [50, 508], [78, 500]], color: C.violet },
      { pts: [[0, 578], [24, 548], [52, 516], [80, 500]], color: C.mint }
    ];
    for (let i = 0; i < bands.length; i++) {
      pathLine(p, bands[i].pts, bands[i].color, (0.2 - i * 0.015) * mergeA, 1, 0.25);
      arrowHead(p, 78, 500, i < 2 ? 0.25 : -0.25, 3.8, bands[i].color, 0.22 * mergeA);
      p.push();
      p.noStroke();
      fillHex(p, C.bgDeep, 0.7 * mergeA);
      p.rect(8 + i * 9, 464 + i * 18, 8, 6, 1);
      p.noFill();
      strokeHex(p, bands[i].color, 0.35 * mergeA);
      p.strokeWeight(0.7);
      p.rect(8 + i * 9, 464 + i * 18, 8, 6, 1);
      p.pop();
    }
    drawStepCard(p, 88, 500, 24, 17, '', 0.68 * mergeA, 0.75, false, 0.03);
    p.push();
    p.noFill();
    strokeHex(p, C.cyan, 0.5 * mergeA);
    p.strokeWeight(0.9);
    p.line(84, 500, 90, 494);
    p.line(84, 500, 90, 506);
    p.pop();
  }

  // 结尾：步骤牌接成环，把轨道交给第 18 版块。
  if (ghostRing > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.cyan, ghostRing);
    p.strokeWeight(0.8);
    p.ellipse(958, ROAD_MID, 54, 54);
    p.pop();
  }
  if (ringIn > 0.002) {
    p.push();
    p.noStroke();
    fillHex(p, C.bgDeep, 0.86 * ringIn);
    p.rect(906, ROAD_TOP, 94, ROAD_BOTTOM - ROAD_TOP);
    p.noFill();
    strokeHex(p, C.navyDeep, 0.98 * ringIn);
    p.strokeWeight(17);
    p.ellipse(958, ROAD_MID, 54, 54);
    strokeHex(p, C.line, 0.7 * ringIn);
    p.strokeWeight(1.2);
    p.ellipse(958, ROAD_MID, 54, 54);
    strokeHex(p, C.cyan, 0.4 * ringIn);
    p.strokeWeight(0.8);
    p.ellipse(958, ROAD_MID, 46, 46);
    strokeHex(p, C.cream, 0.16 * ringIn);
    p.strokeWeight(0.7);
    p.ellipse(958, ROAD_MID, 62, 62);
    p.line(902, ROAD_MID, 931, ROAD_MID);
    p.pop();

    // 环上的四块小步骤牌。
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI;
      const cx = 958 + Math.cos(a) * 27;
      const cy = ROAD_MID + Math.sin(a) * 27;
      p.push();
      p.noStroke();
      fillHex(p, C.bgDeep, 0.9 * ringIn);
      p.rect(cx - 6, cy - 5, 12, 10, 1.2);
      p.noFill();
      strokeHex(p, i % 2 ? C.amber : C.cyan, 0.62 * ringIn);
      p.strokeWeight(0.8);
      p.rect(cx - 6, cy - 5, 12, 10, 1.2);
      p.noStroke();
      fillHex(p, i % 2 ? C.gold : C.cyanSoft, 0.6 * ringIn);
      p.rect(cx - 3.5, cy - 2, 7, 1.2, 0.4);
      p.rect(cx - 2, cy + 0.8, 4, 1, 0.4);
      p.pop();
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI + 0.35;
      arrowHead(
        p,
        958 + Math.cos(a) * 27,
        ROAD_MID + Math.sin(a) * 27,
        a + Math.PI / 2,
        3.6,
        C.cyan,
        0.4 * ringIn
      );
    }
  }

  // 带沿高光与中央扫描线。
  p.noFill();
  strokeHex(p, C.cream, 0.055 * roadIn);
  p.strokeWeight(0.6);
  p.line(0, ROAD_MID, 900, ROAD_MID);
  strokeHex(p, C.line, 0.5);
  p.strokeWeight(1);
  p.rect(0, ROAD_TOP + 1, 1000, ROAD_BOTTOM - ROAD_TOP - 2, 1);
  p.pop();
}

// ---------- 主角：分叉步骤牌 / 推理节点 ----------

function drawActorCard(p, rawT, state) {
  const t = clamp(rawT, 0, 6);
  const hold = Math.min(t, 3);
  const appear = smoothstep(0, 0.42, t);
  const chooseUp = smoothstep(1.62, 1.9, hold) * (1 - smoothstep(2.3, 2.52, hold));
  const deadArm = smoothstep(2.3, 2.56, hold);
  const chooseDown = smoothstep(2.6, 2.87, hold);
  const back = smoothstep(2.48, 2.74, hold) * (1 - 0.45 * smoothstep(3.9, 4.5, t));
  const flash = smoothstep(2.86, 3.0, hold) * (1 - smoothstep(3.88, 4.4, t));
  const settle = smoothstep(2.72, 3.0, hold);
  const exit = smoothstep(4.25, 5.5, t);
  const moving = 1 - smoothstep(2.3, 2.72, hold);
  const shake =
    smoothstep(2.28, 2.4, hold) * (1 - smoothstep(2.54, 2.7, hold)) * Math.sin(hold * 64) * 2.4;
  const bob = Math.sin(hold * 5.6) * 1.1 * (1 - settle);
  const tilt = -0.018 + 0.052 * chooseDown - 0.034 * chooseUp + Math.sin(hold * 2.7) * 0.008 * (1 - settle);
  const scale = (0.88 + 0.12 * appear) * (1 - 0.26 * exit);
  const bodyAlpha = appear * (1 - 0.58 * exit);

  p.push();
  p.translate(state.x, ROAD_MID);
  p.scale(scale);
  p.translate(shake, -bob);
  p.noStroke();

  // 轨道接触节点。
  fillHex(p, C.cyan, 0.055 * appear);
  p.ellipse(0, 0, 62, 17);
  p.noFill();
  strokeHex(p, C.cream, (0.32 + 0.2 * settle) * appear);
  p.strokeWeight(0.9);
  p.ellipse(0, 0, 24, 8);
  strokeHex(p, C.amber, 0.16 * flash);
  p.strokeWeight(0.8);
  p.ellipse(0, 0, 12 + 26 * flash, 4 + 9 * flash);
  p.noStroke();
  fillHex(p, C.cream, 0.9 * appear);
  p.ellipse(0, 0, 5, 2.8);
  fillHex(p, C.emberHot, 0.82 * appear);
  p.ellipse(0, 0, 2.4, 1.5);

  // 滑行残影：停下后消失。
  if (moving > 0.02) {
    for (let k = 0; k < 3; k++) {
      fillHex(p, C.cyan, (0.07 - k * 0.017) * moving * bodyAlpha);
      p.rect(-42 - k * 16, -60 + k * 13, 16, 2.2, 1);
      p.rect(-38 - k * 14, -32 - k * 5, 12, 1.4, 0.7);
    }
  }

  // 回退：角色头顶的一小段反向虚线。
  if (back > 0.002) {
    p.push();
    dashedPath(
      p,
      [
        [52, -78],
        [30, -88],
        [8, -86]
      ],
      C.cream,
      0.5 * back * bodyAlpha,
      1,
      3.4,
      2.8
    );
    arrowHead(p, 8, -86, 3.05, 4.2, C.emberHot, 0.62 * back * bodyAlpha);
    p.pop();
  }

  // 卡片本体。
  p.push();
  p.translate(0, -42);
  p.rotate(tilt);

  // 低 alpha 层叠光晕。
  fillHex(p, C.cyan, (0.035 + 0.025 * chooseUp) * bodyAlpha);
  p.rect(-38, -29, 76, 58, 5);
  fillHex(p, C.amber, 0.03 * (chooseDown + flash) * bodyAlpha);
  p.rect(-40, -31, 80, 62, 5);
  fillHex(p, C.bgDeep, 0.42 * bodyAlpha);
  p.ellipse(4, 26, 70, 12);

  // 两侧短轨道。
  const leftRailA = (0.26 + 0.5 * chooseUp) * (1 - 0.6 * deadArm) * bodyAlpha;
  pathLine(
    p,
    [
      [-32, -9],
      [-44, -15],
      [-54, -15]
    ],
    C.cyan,
    leftRailA,
    1,
    0.35
  );
  arrowHead(p, -54, -15, Math.PI, 3.8, C.cyanSoft, leftRailA * 1.3);
  p.noStroke();
  fillHex(p, C.cyan, leftRailA * 1.2);
  p.ellipse(-54, -15, 3.2, 3.2);

  const rightRailA = (0.24 + 0.55 * chooseDown) * bodyAlpha;
  pathLine(
    p,
    [
      [32, -2],
      [44, 4],
      [54, 4]
    ],
    C.amber,
    rightRailA,
    1,
    0.35
  );
  arrowHead(p, 54, 4, 0, 3.8, C.emberCore, rightRailA * 1.3);
  p.noStroke();
  fillHex(p, C.amber, rightRailA * 1.2);
  p.ellipse(54, 4, 3.2, 3.2);

  // 卡面。
  fillHex(p, C.panel, 0.98 * bodyAlpha);
  p.rect(-32, -22, 64, 44, 3.5);
  fillHex(p, C.bgLow, 0.96 * bodyAlpha);
  p.rect(-30, -20, 60, 40, 2.4);
  fillHex(p, C.cyanDeep, 0.3 * bodyAlpha);
  p.rect(-28, -18, 56, 5, 1.4);
  fillHex(p, C.navyDeep, 0.55 * bodyAlpha);
  p.rect(-28, 13, 56, 5, 1.4);

  p.noFill();
  strokeHex(p, C.cyan, (0.66 + 0.18 * (chooseUp + chooseDown)) * bodyAlpha);
  p.strokeWeight(1.25);
  p.rect(-32, -22, 64, 44, 3.5);
  strokeHex(p, C.cyanDim, 0.38 * bodyAlpha);
  p.strokeWeight(0.7);
  p.rect(-29.5, -19.5, 59, 39, 2.2);

  // 四角小铆钉。
  p.noStroke();
  for (const [rx, ry] of [
    [-27, -17],
    [27, -17],
    [-27, 17],
    [27, 17]
  ]) {
    fillHex(p, C.bgDeep, 0.85 * bodyAlpha);
    p.ellipse(rx, ry, 4.2, 4.2);
    fillHex(p, C.cyanSoft, 0.36 * bodyAlpha);
    p.ellipse(rx - 0.6, ry - 0.6, 1.3, 1.1);
  }

  // 分叉箭头：两臂从火种分出，选中哪边哪边亮。
  const leftArmA = (0.42 + 0.36 * chooseUp) * (1 - 0.7 * deadArm) * bodyAlpha;
  const rightArmA = (0.42 + 0.45 * chooseDown) * bodyAlpha;
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  strokeHex(p, C.cyanSoft, leftArmA);
  p.strokeWeight(1.3);
  p.beginShape();
  p.vertex(0, -1);
  p.vertex(-7, -7);
  p.vertex(-14, -12);
  p.endShape();
  arrowHead(p, -14, -12, -2.55, 3.8, C.cyanSoft, leftArmA * 1.2);
  strokeHex(p, chooseDown > 0.3 ? C.emberCore : C.cyan, chooseDown > 0.3 ? rightArmA : rightArmA * 0.9);
  p.strokeWeight(1.3);
  p.beginShape();
  p.vertex(0, -1);
  p.vertex(7, -7);
  p.vertex(14, -12);
  p.endShape();
  arrowHead(p, 14, -12, -0.59, 3.8, chooseDown > 0.3 ? C.emberCore : C.cyan, rightArmA * 1.2);
  p.pop();

  if (deadArm > 0.002) {
    drawCross(p, -17, -15, 2.6, C.wrong, 0.8 * deadArm * bodyAlpha, 0.9);
  }

  // 中心暖赭火种：与第 16 版块同一颗。
  p.noStroke();
  fillHex(p, C.bgDeep, 0.95 * bodyAlpha);
  p.ellipse(0, 2, 15, 15);
  fillHex(p, C.ember, 0.32 * bodyAlpha);
  p.ellipse(0, 2, 11.5, 11.5);
  fillHex(p, C.emberHot, 0.95 * bodyAlpha);
  p.ellipse(-0.4, 1.6 - flash * 0.6, 6.2, 6.8);
  fillHex(p, C.emberCore, 0.96 * bodyAlpha);
  p.ellipse(-1, 1 - flash * 0.8, 2.4, 2.7);
  p.noFill();
  strokeHex(p, C.emberHot, (0.28 + 0.36 * flash) * bodyAlpha);
  p.strokeWeight(0.8);
  p.ellipse(0, 2, 17 + flash * 3, 17 + flash * 3);

  // 当前步骤编号，只出现很小的 1/2/3。
  p.noStroke();
  p.textFont('monospace');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(7);
  fillHex(p, chooseDown > 0.5 ? C.cream : C.cyanSoft, 0.52 * bodyAlpha);
  p.text(chooseDown > 0.5 ? '3' : '2', 23, 15);
  p.textStyle(p.NORMAL);

  // 卡面扫描纹。
  p.noFill();
  strokeHex(p, C.cyan, 0.08 * bodyAlpha);
  p.strokeWeight(0.6);
  p.line(-26, -12, -19, -12);
  p.line(-26, 10, -21, 10);
  p.pop();

  // 从牌底接到轨道节点。
  p.strokeCap(p.ROUND);
  strokeHex(p, C.navyDeep, 0.9 * bodyAlpha);
  p.strokeWeight(2.2);
  p.line(-4, -20, -4, -2);
  p.line(4, -20, 4, -2);
  strokeHex(p, C.cyanSoft, 0.28 * bodyAlpha);
  p.strokeWeight(0.9);
  p.line(-4, -19, -4, -4);
  p.line(4, -19, 4, -4);
  p.strokeCap(p.ROUND);

  // 火种闪 + 停住的脉冲：定格约 1s。
  if (flash > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.amber, 0.16 * flash * bodyAlpha);
    p.strokeWeight(0.8);
    p.ellipse(0, -42, 38 + 5 * flash, 38 + 5 * flash);
    strokeHex(p, C.cream, 0.1 * flash * bodyAlpha);
    p.ellipse(0, -42, 52 + 7 * flash, 52 + 7 * flash);
    strokeHex(p, C.emberHot, 0.45 * flash * bodyAlpha);
    p.strokeWeight(0.9);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.3;
      p.line(
        Math.cos(a) * 22,
        -42 + Math.sin(a) * 22,
        Math.cos(a) * (30 + 3 * flash),
        -42 + Math.sin(a) * (30 + 3 * flash)
      );
    }
    p.pop();
    p.noStroke();
    fillHex(p, C.ember, 0.045 * flash * bodyAlpha);
    p.ellipse(0, -42, 82, 82);
    fillHex(p, C.gold, 0.035 * flash * bodyAlpha);
    p.ellipse(0, -42, 46, 46);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.37 + 0.4;
      fillHex(p, i % 2 ? C.emberCore : C.gold, 0.3 * flash * bodyAlpha);
      p.ellipse(Math.cos(a) * (26 + i * 4), -42 + Math.sin(a) * (20 + i * 3), 1.8, 1.8);
    }
  }

  // 离场：缩成一颗小火种。
  if (exit > 0.3) {
    const dot = smoothstep(4.4, 5.5, t);
    p.push();
    p.noStroke();
    fillHex(p, C.emberCore, 0.82 * dot);
    p.ellipse(0, -40, 5.2 - dot * 2.2, 5.2 - dot * 2.2);
    fillHex(p, C.ember, 0.12 * dot);
    p.ellipse(0, -40, 30, 30);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + Math.floor(t * 10) * 0.07;
      fillHex(p, i % 2 ? C.cyan : C.emberHot, 0.22 * dot);
      p.ellipse(Math.cos(a) * (20 + i * 8), -40 + Math.sin(a) * (12 + i * 4), 1.6, 1.6);
    }
    p.pop();
  }

  p.pop();
}

// ---------- 气氛 / 标题 ----------

function drawAtmosphere(p) {
  linearWash(
    p,
    0,
    168,
    0,
    838,
    [
      [0, 'rgba(2,5,13,0.34)'],
      [0.22, 'rgba(2,5,13,0)'],
      [0.76, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.38)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.01);
  p.ellipse(790, 404, 480, 330);
  fillHex(p, C.ember, 0.007);
  p.ellipse(590, 520, 360, 80);
  p.pop();
}

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 180;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, C.cream, 0.8 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.cyanSoft, 0.3 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 2, 1);
  fillHex(p, C.navy, 0.14 * alpha);
  p.rect(x - w / 2 + 2, y + h / 2 - 2, w - 4, 1);
  p.noFill();
  strokeHex(p, C.cyan, 0.35 * alpha);
  p.strokeWeight(0.9);
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
    drawBackdrop(p, t);
    drawTree(p, t, hold);
    drawValuePanel(p, t, hold);
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
    drawReasonRoad(p, t);
    p.pop();
  },

  drawActor(p, state) {
    const rawT = clamp(state.localT || 0, 0, 6);
    p.push();
    drawActorCard(p, rawT, state);
    p.pop();
  }
};
