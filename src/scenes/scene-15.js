import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 15 大模型规模化与开源：全屏参数墙/数据中心 + 开放参数箱 + 缩放曲线。
// 静态重点：localT≈1.5（标题、参数墙、传送带、第一组箱子、曲线开始爬）
// 与 localT≈3.0（箱盖打开、里面还是小黑箱、复制箱滑出、参数墙增亮、曲线陡升、约 1s 定格）。
const TAU = Math.PI * 2;
const ROAD_TOP = 467;
const ROAD_BOTTOM = 533;
const ROAD_MID = 500;

const META = {
  id: 15,
  cn: '大模型规模化与开源',
  en: 'Large-Scale Models & Open Source',
  era: '2020-2024',
  group: 'data'
};

const C = {
  bg: '#060a16',
  bgDeep: '#03060e',
  bgLow: '#040812',
  panel: '#0a1226',
  panelLight: '#0e1a33',
  face: '#0c1830',
  faceTop: '#14284f',
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
  cream: '#f0e2bf',
  creamDim: '#c9bd9f',
  amber: '#d98a45',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa',
  violet: '#9d8cff',
  mint: '#7fe0c0',
  steel: '#8ba3c7'
};

const WALL = { x: 568, y: 236, w: 372, h: 354 };
const WALL_GRID = { x: 582, y: 264, w: 344, h: 310, cols: 18, rows: 14 };
const CURVE = { x: 700, y: 602, w: 240, h: 140 };
const ARRAY = { x: 596, y: 618, w: 92, h: 118 };
const DOCK_X = 500;
// 复制箱相对主角的落位；它们与主角同乘一条传送带，世界 x 一起前进。
const COPY_OFFSETS = [72, 128, 184];
const BITS = '01011010010110100101101001011010';

// 固定尘埃与空气里的数据点，全部由固定种子预生成。
const DUST = (() => {
  const rng = mulberry32(0x15a15e);
  const list = [];
  for (let i = 0; i < 96; i++) {
    list.push({
      x: rng() * 1000,
      y: 176 + rng() * 640,
      r: 0.5 + rng() * 1.4,
      a: 0.015 + rng() * 0.04,
      cool: rng() > 0.25
    });
  }
  return list;
})();

const FLOW = (() => {
  const rng = mulberry32(0x15f10);
  const list = [];
  for (let i = 0; i < 22; i++) {
    list.push({
      x: 480 + rng() * 470,
      span: 210 + rng() * 240,
      speed: 10 + rng() * 24,
      len: 3 + rng() * 9,
      a: 0.03 + rng() * 0.08,
      warm: rng() > 0.82
    });
  }
  return list;
})();

const CARGO = [
  { x: 132, s: 0.46, warm: 0.1, base: 494 },
  { x: 132, s: 0.34, warm: 0.55, base: 480 },
  { x: 174, s: 0.4, warm: 0.15, base: 494 },
  { x: 208, s: 0.34, warm: 0.2, base: 494 }
];

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

// 只用 p.vertex 折线/多边形，避开 p5 2.x 对贝塞尔闭合形状的空内部点问题。
function quadShape(p, points, fill, alpha, edge, edgeAlpha, weight = 1) {
  if (alpha <= 0.002) return;
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
}

function bolt(p, x, y, r = 2.4, alpha = 1) {
  p.noStroke();
  fillHex(p, C.bgDeep, 0.8 * alpha);
  p.ellipse(x + 0.6, y + 0.7, r * 2.1, r * 2.1);
  fillHex(p, C.navyLight, 0.9 * alpha);
  p.ellipse(x, y, r * 2, r * 2);
  fillHex(p, C.cyanSoft, 0.28 * alpha);
  p.ellipse(x - r * 0.35, y - r * 0.35, r * 0.9, r * 0.7);
}

// ---------- 数据中心房间 ----------

function drawRack(p, x, y, w, h, seed, alpha) {
  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.5 * alpha);
  p.rect(x + 4, y + 5, w, h, 3);
  fillHex(p, C.panel, 0.96 * alpha);
  p.rect(x, y, w, h, 3);
  fillHex(p, C.bgLow, 0.92 * alpha);
  p.rect(x + 4, y + 4, w - 8, h - 8, 2);

  const rows = Math.max(1, Math.floor((h - 16) / 24));
  for (let r = 0; r < rows; r++) {
    const ry = y + 10 + r * 24;
    fillHex(p, C.panelLight, 0.5 * alpha);
    p.rect(x + 9, ry, w - 18, 17, 1);
    fillHex(p, C.bgDeep, 0.64 * alpha);
    p.rect(x + 12, ry + 3, w - 24, 11, 1);
    p.noStroke();
    for (let k = 0; k < 3; k++) {
      fillHex(p, C.navyLight, 0.22 * alpha);
      p.rect(x + 15, ry + 5 + k * 3, w - 30, 0.7);
    }
    for (let k = 0; k < 3; k++) {
      const on = hash2(r, k, seed) > 0.44;
      if (!on) continue;
      fillHex(p, k === 2 ? C.cyan : C.cyanSoft, (0.22 + hash2(r, k, seed + 1) * 0.4) * alpha);
      p.ellipse(x + w - 15, ry + 5 + k * 4, 1.7, 1.7);
    }
    if (r % 3 === 0) {
      fillHex(p, C.amber, 0.48 * alpha);
      p.ellipse(x + 12.5, ry + 5, 1.5, 1.5);
    }
  }

  fillHex(p, C.bgDeep, 0.72 * alpha);
  p.rect(x + 8, y + h, 16, 4, 1);
  p.rect(x + w - 24, y + h, 16, 4, 1);
  p.noFill();
  strokeHex(p, C.line, 0.28 * alpha);
  p.strokeWeight(1);
  p.rect(x + 4, y + 4, w - 8, h - 8, 2);
  p.pop();
}

function drawAirflow(p, t) {
  const flowT = t < 3 ? t : t < 4 ? 3 : t - 1;
  p.push();
  p.noStroke();
  for (const d of FLOW) {
    const y = 244 + ((flowT * d.speed + hash2(Math.round(d.x), 1, 155) * d.span) % d.span);
    fillHex(p, d.warm ? C.amber : C.cyan, d.a);
    p.rect(d.x, y, 1.2, d.len, 0.6);
    if (d.warm) {
      fillHex(p, C.ember, d.a * 0.4);
      p.rect(d.x - 1, y + d.len * 0.3, 3.2, 2, 1);
    }
  }
  // 参数墙左侧的竖直数据柱，短脉冲而不是代码雨。
  for (let i = 0; i < 5; i++) {
    const x = 552 + i * 4;
    const yy = 266 + ((flowT * (18 + i * 4) + hash2(i, 3, 156) * 288) % 288);
    fillHex(p, C.cyan, 0.06 + hash2(i, 4, 156) * 0.07);
    p.rect(x, yy, 1, 5 + i * 2, 0.5);
  }
  // 传送带上方的水平数据包
  for (let i = 0; i < 9; i++) {
    const span = 740;
    const x = 210 + ((flowT * (24 + i * 3) + hash2(i, 5, 157) * span) % span);
    const y = 438 + (i % 3) * 7;
    fillHex(p, i % 4 === 0 ? C.amber : C.cyan, 0.05 + hash2(i, 6, 157) * 0.06);
    p.rect(x, y, 5 + hash2(i, 7, 157) * 12, 1.2, 0.6);
  }
  p.pop();
}

function drawRoom(p, t) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  // 远景分层：上方机架暗带、中段蓝黑、下方地面。
  fillHex(p, C.navy, 0.16);
  p.rect(0, 206, 1000, 392);
  fillHex(p, C.panel, 0.24);
  p.rect(0, 592, 1000, 250);
  fillHex(p, C.bgDeep, 0.48);
  p.rect(0, 816, 1000, 184);

  linearWash(
    p,
    0,
    170,
    0,
    850,
    [
      [0, 'rgba(2,5,13,0.46)'],
      [0.22, 'rgba(3,8,20,0.08)'],
      [0.6, 'rgba(0,0,0,0)'],
      [0.82, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.58)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 顶部灯带与横向线槽
  for (let i = 0; i < 4; i++) {
    const x = 64 + i * 116;
    fillHex(p, C.navyLight, 0.18);
    p.rect(x, 182, 76, 3, 1);
    fillHex(p, C.cyan, 0.055);
    p.rect(x + 4, 185, 68, 5, 2);
  }
  p.noFill();
  strokeHex(p, C.line, 0.32);
  p.strokeWeight(1.2);
  p.line(0, 218, 488, 218);
  strokeHex(p, C.navyLight, 0.2);
  p.strokeWeight(0.7);
  p.line(0, 222, 470, 222);
  for (let x = 34; x < 480; x += 74) {
    strokeHex(p, C.line, 0.26);
    p.strokeWeight(1);
    p.line(x, 214, x, 224);
  }

  // 左右两侧的机架。中间 x≈150–450 / y≈280–430 是标题留白。
  drawRack(p, 16, 252, 92, 208, 1511, 0.9);
  drawRack(p, 482, 238, 68, 338, 1512, 0.78);
  drawRack(p, 12, 596, 108, 188, 1513, 0.52);

  // 地面：极淡的格栅与线槽，避免下半幅空掉。
  p.noFill();
  strokeHex(p, C.navyLight, 0.1);
  p.strokeWeight(1);
  for (const y of [596, 652, 724, 806, 892]) {
    p.line(0, y, 1000, y);
  }
  strokeHex(p, C.line, 0.08);
  for (const x of [74, 210, 348, 462, 986]) {
    p.line(x, 556, x, 916);
  }
  // 机架底部落影与地面反光
  p.noStroke();
  fillHex(p, C.bgDeep, 0.36);
  p.ellipse(118, 760, 210, 42);
  fillHex(p, C.cyan, 0.012);
  p.ellipse(780, 690, 460, 170);
  fillHex(p, C.ember, 0.008);
  p.ellipse(500, 560, 380, 110);

  drawAirflow(p, t);

  // 空气尘埃
  for (const d of DUST) {
    fillHex(p, d.cool ? C.cyanSoft : C.creamDim, d.a);
    p.ellipse(d.x, d.y, d.r, d.r);
  }
  p.pop();
}

// ---------- 参数墙 ----------

function drawParamWall(p, t) {
  const reveal = Math.min(t, 3);
  const boost =
    smoothstep(2.55, 3.0, reveal) * (1 - 0.45 * smoothstep(4.15, 5.5, t));
  const dim = 1 - 0.26 * smoothstep(4.4, 5.6, t);

  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.55);
  p.rect(WALL.x + 6, WALL.y + 8, WALL.w, WALL.h, 4);

  fillHex(p, C.panel, 0.98 * dim);
  p.rect(WALL.x, WALL.y, WALL.w, WALL.h, 4);
  fillHex(p, C.bgLow, 0.98);
  p.rect(WALL.x + 4, WALL.y + 4, WALL.w - 8, WALL.h - 8, 3);

  // 顶栏：状态灯、散热槽、无文字的编号刻痕。
  fillHex(p, C.navyDeep, 0.92 * dim);
  p.rect(WALL.x + 10, WALL.y + 8, WALL.w - 20, 20, 2);
  for (let i = 0; i < 7; i++) {
    fillHex(p, i === 4 ? C.amber : C.cyan, 0.16 + hash2(i, 31, 151) * 0.3);
    p.rect(WALL.x + 18 + i * 10, WALL.y + 15, 4, 2, 0.6);
  }
  for (let i = 0; i < 13; i++) {
    fillHex(p, C.navyLight, 0.36 * dim);
    p.rect(WALL.x + 142 + i * 12, WALL.y + 14, 6, 1.2);
    p.rect(WALL.x + 142 + i * 12, WALL.y + 19, 3, 1);
  }
  p.noFill();
  strokeHex(p, C.line, 0.42 * dim);
  p.strokeWeight(1);
  p.line(WALL.x + 14, WALL.y + 27, WALL.x + WALL.w - 14, WALL.y + 27);

  // 网格底板
  fillHex(p, C.bgDeep, 0.92);
  p.rect(WALL_GRID.x - 4, WALL_GRID.y - 4, WALL_GRID.w + 8, WALL_GRID.h + 8, 2);
  p.noFill();
  strokeHex(p, C.navyLight, 0.22 * dim);
  p.strokeWeight(1);
  p.rect(WALL_GRID.x - 4, WALL_GRID.y - 4, WALL_GRID.w + 8, WALL_GRID.h + 8, 2);

  const gw = WALL_GRID.w / WALL_GRID.cols;
  const gh = WALL_GRID.h / WALL_GRID.rows;

  // 每 5 列一条竖向总线，让墙读成机柜而不是噪点。
  p.noFill();
  for (let col = 0; col <= WALL_GRID.cols; col += 5) {
    const x = WALL_GRID.x + col * gw;
    strokeHex(p, C.line, (0.12 + boost * 0.1) * dim);
    p.strokeWeight(0.7);
    p.line(x, WALL_GRID.y, x, WALL_GRID.y + WALL_GRID.h);
  }

  for (let row = 0; row < WALL_GRID.rows; row++) {
    for (let col = 0; col < WALL_GRID.cols; col++) {
      const cx = WALL_GRID.x + (col + 0.5) * gw;
      const cy = WALL_GRID.y + (row + 0.5) * gh;
      const h1 = hash2(col, row, 151);
      const h2 = hash2(col, row, 152);
      const h3 = hash2(col, row, 153);
      const litAt = 0.3 + h1 * 1.75 + row * 0.012;
      const lit = smoothstep(litAt, litAt + 0.24, reveal);
      const warm = h2 > 0.915;
      const size = 10 + (h3 > 0.84 ? 2 : 0);

      // 暗槽
      p.noStroke();
      fillHex(p, C.navyDeep, 0.56 * dim);
      p.rect(cx - size / 2 - 0.6, cy - size / 2 - 0.6, size + 1.2, size + 1.2, 1);

      const a = (0.1 + 0.55 * h2) * lit + 0.13 * boost + 0.02;
      if (a > 0.012) {
        fillHex(p, warm ? C.amber : C.cyan, Math.min(0.88, a) * dim);
        p.rect(cx - size / 2, cy - size / 2, size, size, 1);
        if (lit > 0.2) {
          fillHex(p, C.ink, 0.1 * lit * dim);
          p.rect(cx - size / 2 + 1, cy - size / 2 + 1, size - 2, 1, 0.5);
        }
      }
      // 参数块的编号刻痕，只有短线，没有真实文字。
      if (h3 > 0.5) {
        strokeHex(p, warm ? C.cream : C.steel, (0.12 + 0.16 * lit) * dim);
        p.strokeWeight(0.6);
        p.line(cx + size / 2 - 4, cy - 1, cx + size / 2 - 1, cy - 1);
        p.line(cx + size / 2 - 3, cy + 2, cx + size / 2 - 1, cy + 2);
      }
    }
  }

  // 四角螺钉与底部线槽
  p.noStroke();
  for (const [sx, sy] of [
    [WALL.x + 10, WALL.y + 10],
    [WALL.x + WALL.w - 10, WALL.y + 10],
    [WALL.x + 10, WALL.y + WALL.h - 10],
    [WALL.x + WALL.w - 10, WALL.y + WALL.h - 10]
  ]) {
    bolt(p, sx, sy, 2.2, dim);
  }
  for (let i = 0; i < 7; i++) {
    fillHex(p, C.navyDeep, 0.8 * dim);
    p.rect(WALL.x + 22 + i * 48, WALL.y + WALL.h - 5, 24, 2);
  }

  // 高光：整墙增亮、三条扫描带、来自底部开放箱的暖光。
  if (boost > 0.002) {
    fillHex(p, C.cyan, 0.032 * boost * dim);
    p.rect(WALL.x + 6, WALL.y + 6, WALL.w - 12, WALL.h - 12, 3);
    for (const y of [316, 402, 486]) {
      fillHex(p, C.cyanSoft, 0.05 * boost * dim);
      p.rect(WALL.x + 10, y, WALL.w - 20, 1.2);
      fillHex(p, C.cyan, 0.02 * boost * dim);
      p.rect(WALL.x + 10, y + 1.2, WALL.w - 20, 4);
    }
    fillHex(p, C.ember, 0.045 * boost * dim);
    p.ellipse(WALL.x + 132, WALL.y + 286, 230, 124);
    fillHex(p, C.emberHot, 0.02 * boost * dim);
    p.ellipse(WALL.x + 132, WALL.y + 276, 96, 46);
  }

  p.noFill();
  strokeHex(p, C.line, 0.52 * dim);
  p.strokeWeight(1.2);
  p.rect(WALL.x, WALL.y, WALL.w, WALL.h, 4);
  strokeHex(p, C.cyan, 0.16 * dim);
  p.strokeWeight(0.8);
  p.rect(WALL.x + 3, WALL.y + 3, WALL.w - 6, WALL.h - 6, 3);
  p.pop();
}

// ---------- 缩放曲线 ----------

// u∈[0,1]：前段缓、后段陡的缩放曲线。采样后用 p.vertex 画，不用 bezier。
function curveValue(u) {
  return 0.06 + 0.18 * u + 0.16 * u * u + 0.6 * smoothstep(0.58, 1, u);
}

function curveY(u, top, bottom) {
  return bottom - curveValue(u) * (bottom - top);
}

function drawCurvePath(p, x0, x1, top, bottom, uMax, color, alpha, weight) {
  if (uMax <= 0.001 || alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  const n = Math.max(2, Math.ceil(72 * uMax));
  for (let i = 0; i <= n; i++) {
    const u = (uMax * i) / n;
    p.vertex(x0 + (x1 - x0) * u, curveY(u, top, bottom));
  }
  p.endShape();
  p.pop();
}

function drawParamArray(p, t) {
  const hold = Math.min(t, 3);
  const prog = smoothstep(0.55, 2.95, hold);
  const boost = smoothstep(2.55, 3.0, hold) * (1 - 0.5 * smoothstep(4.2, 5.4, t));

  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.5);
  p.rect(ARRAY.x + 4, ARRAY.y + 5, ARRAY.w, ARRAY.h, 4);
  fillHex(p, C.panel, 0.94);
  p.rect(ARRAY.x, ARRAY.y, ARRAY.w, ARRAY.h, 4);
  fillHex(p, C.bgLow, 0.96);
  p.rect(ARRAY.x + 4, ARRAY.y + 4, ARRAY.w - 8, ARRAY.h - 8, 3);

  // 顶部刻痕
  for (let i = 0; i < 6; i++) {
    fillHex(p, i === 3 ? C.amber : C.cyan, 0.15 + hash2(i, 41, 158) * 0.25);
    p.rect(ARRAY.x + 12 + i * 11, ARRAY.y + 9, 5, 2, 0.6);
  }

  // 4×4 参数块阵列：点亮数量随曲线进度增长。
  const lit = Math.floor(prog * 16 + 0.0001);
  const cell = 10;
  const gapX = (ARRAY.w - 20 - cell * 4) / 3;
  const gapY = (ARRAY.h - 32 - cell * 4) / 3;
  for (let idx = 0; idx < 16; idx++) {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const x = ARRAY.x + 10 + col * (cell + gapX);
    const y = ARRAY.y + 22 + row * (cell + gapY);
    const on = idx < lit;
    const warm = idx % 9 === 0;
    fillHex(p, on ? (warm ? C.amber : C.cyan) : C.navyDeep, on ? 0.62 + boost * 0.18 : 0.62);
    p.rect(x, y, cell, cell, 1);
    if (on) {
      fillHex(p, C.ink, 0.14 + boost * 0.1);
      p.rect(x + 1, y + 1, cell - 2, 1, 0.5);
      fillHex(p, warm ? C.emberHot : C.cyanSoft, 0.08 + boost * 0.12);
      p.ellipse(x + cell / 2, y + cell / 2, cell + 8, cell + 8);
    }
  }

  // 与缩放曲线面板的一小段连接线
  p.noFill();
  strokeHex(p, C.cyan, 0.18 + 0.16 * boost);
  p.strokeWeight(0.8);
  p.line(ARRAY.x + ARRAY.w - 3, ARRAY.y + 24, CURVE.x - 2, CURVE.y + 44);
  p.noStroke();
  if (prog > 0.92) {
    fillHex(p, C.emberHot, 0.6);
    p.ellipse(ARRAY.x + ARRAY.w - 4, ARRAY.y + 26, 2.2, 2.2);
    fillHex(p, C.ember, 0.09);
    p.ellipse(ARRAY.x + ARRAY.w - 4, ARRAY.y + 26, 10, 10);
  }

  p.noFill();
  strokeHex(p, C.line, 0.48);
  p.strokeWeight(1);
  p.rect(ARRAY.x, ARRAY.y, ARRAY.w, ARRAY.h, 4);
  p.pop();
}

function drawCurvePanel(p, t) {
  const hold = Math.min(t, 3);
  const prog = smoothstep(0.55, 2.95, hold);
  const boost = smoothstep(2.55, 3.0, hold) * (1 - 0.5 * smoothstep(4.2, 5.4, t));
  const px0 = CURVE.x + 30;
  const px1 = CURVE.x + CURVE.w - 14;
  const top = CURVE.y + 16;
  const bottom = CURVE.y + CURVE.h - 26;

  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.55);
  p.rect(CURVE.x + 5, CURVE.y + 6, CURVE.w, CURVE.h, 4);
  fillHex(p, C.panel, 0.96);
  p.rect(CURVE.x, CURVE.y, CURVE.w, CURVE.h, 4);
  fillHex(p, C.bgLow, 0.98);
  p.rect(CURVE.x + 4, CURVE.y + 4, CURVE.w - 8, CURVE.h - 8, 3);

  // 顶部状态灯
  for (let i = 0; i < 5; i++) {
    fillHex(p, i === 4 ? C.amber : C.cyan, 0.16 + hash2(i, 51, 159) * 0.28);
    p.rect(CURVE.x + 10 + i * 8, CURVE.y + 8, 3.5, 1.6, 0.5);
  }

  // 坐标纸网格
  p.noFill();
  p.strokeWeight(0.6);
  for (let x = px0; x <= px1; x += 18) {
    strokeHex(p, C.cyan, 0.035);
    p.line(x, top, x, bottom);
  }
  for (let y = top; y <= bottom; y += 16) {
    strokeHex(p, C.cyan, 0.035);
    p.line(px0, y, px1, y);
  }

  // 坐标轴
  strokeHex(p, C.creamDim, 0.34);
  p.strokeWeight(0.9);
  p.line(px0, top, px0, bottom);
  p.line(px0, bottom, px1, bottom);
  for (let x = px0; x <= px1; x += 18) {
    const major = Math.abs((x - px0) % 72) < 0.5;
    strokeHex(p, C.creamDim, major ? 0.26 : 0.12);
    p.line(x, bottom, x, bottom + (major ? 4 : 2));
  }
  for (let y = top; y <= bottom; y += 16) {
    strokeHex(p, C.creamDim, 0.1);
    p.line(px0 - 3, y, px0, y);
  }

  // 未来曲线的淡影 + 已爬到的亮段
  drawCurvePath(p, px0, px1, top, bottom, 1, C.cyan, 0.08 + boost * 0.06, 1);
  if (prog > 0.03) {
    // 曲线下面积：只用折线顶点闭合。
    p.noStroke();
    fillHex(p, C.cyan, 0.03 + boost * 0.02);
    p.beginShape();
    p.vertex(px0, bottom);
    const n = Math.max(2, Math.ceil(56 * prog));
    for (let i = 0; i <= n; i++) {
      const u = (prog * i) / n;
      p.vertex(px0 + (px1 - px0) * u, curveY(u, top, bottom));
    }
    p.vertex(px0 + (px1 - px0) * prog, bottom);
    p.endShape(p.CLOSE);

    drawCurvePath(p, px0, px1, top, bottom, prog, C.cyan, 0.08 + boost * 0.06, 4.5);
    drawCurvePath(p, px0, px1, top, bottom, prog, C.cyanSoft, 0.62 + boost * 0.2, 1.5);

    const ex = px0 + (px1 - px0) * prog;
    const ey = curveY(prog, top, bottom);
    p.noStroke();
    if (prog > 0.985) {
      // 末端陡坡：竖向虚线 + 暖色定点
      p.noFill();
      strokeHex(p, C.cream, 0.16 + boost * 0.14);
      p.strokeWeight(0.8);
      for (let y = top + 4; y < ey - 4; y += 6) {
        p.line(ex, y, ex, y + 3);
      }
      p.line(px0, ey, ex - 4, ey);
      p.noStroke();
      fillHex(p, C.emberHot, 0.7 + 0.2 * boost);
      p.ellipse(ex, ey, 4.2, 4.2);
      fillHex(p, C.emberCore, 0.9);
      p.ellipse(ex - 0.5, ey - 0.5, 1.8, 1.8);
      fillHex(p, C.ember, 0.12 + 0.08 * boost);
      p.ellipse(ex, ey, 22, 22);
      fillHex(p, C.cyan, 0.05 * boost);
      p.ellipse(px1 - 18, top + 18, 90, 44);
    } else {
      fillHex(p, C.cyan, 0.85);
      p.ellipse(ex, ey, 3.2, 3.2);
      fillHex(p, C.cyan, 0.12);
      p.ellipse(ex, ey, 14, 14);
    }
  }

  // 参数块数量小方格
  p.noStroke();
  const cellW = (px1 - px0) / 18;
  const litCount = Math.floor(prog * 18 + 0.0001);
  for (let i = 0; i < 18; i++) {
    const on = i < litCount;
    const x = px0 + i * cellW + 1;
    fillHex(p, on ? (i % 6 === 5 ? C.amber : C.cyan) : C.navyDeep, on ? 0.62 : 0.62);
    p.rect(x, bottom + 8, Math.max(2, cellW - 3), 4, 0.8);
    if (on) {
      fillHex(p, C.cyanSoft, 0.1 + boost * 0.08);
      p.rect(x, bottom + 7, Math.max(2, cellW - 3), 1);
    }
  }
  for (let i = 0; i < 5; i++) {
    fillHex(p, C.navyLight, 0.35);
    p.rect(CURVE.x + 12 + i * 18, CURVE.y + CURVE.h - 9, 10, 1);
  }

  p.noFill();
  strokeHex(p, C.line, 0.5);
  p.strokeWeight(1);
  p.rect(CURVE.x, CURVE.y, CURVE.w, CURVE.h, 4);
  strokeHex(p, C.cyan, 0.14 + boost * 0.1);
  p.strokeWeight(0.7);
  p.rect(CURVE.x + 3, CURVE.y + 3, CURVE.w - 6, CURVE.h - 6, 3);
  p.pop();
}

// ---------- 传送带 ----------

function drawBeltDock(p, hold, t) {
  const lit = smoothstep(2.4, 2.66, hold) * (1 - 0.35 * smoothstep(4.8, 5.8, t));
  p.push();
  p.noStroke();
  fillHex(p, C.navyDeep, 0.9);
  p.rect(DOCK_X - 38, 492, 76, 11, 2);
  fillHex(p, C.panelLight, 0.7);
  p.rect(DOCK_X - 34, 493, 68, 8, 1.5);
  fillHex(p, C.cyan, 0.1);
  p.rect(DOCK_X - 30, 494, 60, 1.2);
  p.noFill();
  strokeHex(p, C.cyan, 0.22 + lit * 0.2);
  p.strokeWeight(0.8);
  p.rect(DOCK_X - 38, 492, 76, 11, 2);

  // 四角锁扣
  const corners = [
    [DOCK_X - 37, 493],
    [DOCK_X + 33, 493],
    [DOCK_X - 37, 500],
    [DOCK_X + 33, 500]
  ];
  for (let i = 0; i < corners.length; i++) {
    const [x, y] = corners[i];
    p.noStroke();
    fillHex(p, C.bgDeep, 0.9);
    p.rect(x, y, 4.5, 3, 0.6);
    fillHex(p, i < 2 ? C.cyan : C.emberHot, 0.12 + lit * 0.72);
    p.rect(x + 0.8, y + 0.6, 2.8, 1.6, 0.5);
    if (lit > 0.05) {
      fillHex(p, i < 2 ? C.cyan : C.ember, 0.09 * lit);
      p.ellipse(x + 2.2, y + 1.5, 12, 8);
    }
  }
  if (lit > 0.02) {
    p.noStroke();
    fillHex(p, C.cyan, 0.035 * lit);
    p.ellipse(DOCK_X, 497, 110, 22);
  }
  p.pop();
}

function drawBeltLeftMerge(p, t) {
  const hold = Math.min(t, 3);
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  const lines = [
    [-10, 438, 28, 464, 104, 480, C.cyan, 0.16],
    [-10, 452, 34, 476, 104, 491, C.cyanSoft, 0.12],
    [-10, 548, 30, 524, 104, 510, C.creamDim, 0.12],
    [-10, 562, 38, 534, 104, 520, C.cyan, 0.1]
  ];
  for (const [x0, y0, cx, cy, x1, y1, color, alpha] of lines) {
    strokeHex(p, color, alpha);
    p.strokeWeight(1.1);
    p.beginShape();
    p.vertex(x0, y0);
    p.vertex(cx, cy);
    p.vertex(x1, y1);
    p.endShape();
  }

  // 从第 14 版块接过来的 token 小卡，被压成扁的序列块。
  p.noStroke();
  for (let i = 0; i < 3; i++) {
    const x = 10 + i * 22;
    const y = 432 + i * 7;
    fillHex(p, C.navyDeep, 0.9);
    p.rect(x, y, 13, 9, 1);
    p.noFill();
    strokeHex(p, i === 1 ? C.emberHot : C.cyan, 0.34 + 0.1 * Math.sin(hold * 4 + i));
    p.strokeWeight(0.8);
    p.rect(x, y, 13, 9, 1);
    p.noStroke();
    fillHex(p, i === 1 ? C.ember : C.cyan, 0.5);
    p.rect(x + 2, y + 2, 5, 1);
    fillHex(p, C.cyanSoft, 0.22);
    p.rect(x + 2, y + 5, 7, 0.8);
  }
  p.strokeCap(p.ROUND);
  p.pop();
}

function drawBeltExit(p, t) {
  const exit = smoothstep(4.05, 5.4, t);
  if (exit <= 0.01) return;
  p.push();
  p.noFill();
  const colors = [C.cyan, C.creamDim, C.violet, C.mint];
  for (let k = 0; k < 4; k++) {
    const y0 = 478 + k * 13;
    strokeHex(p, colors[k], 0.3 * exit);
    p.strokeWeight(1.1);
    p.beginShape();
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const x = 772 + 228 * u;
      const y = y0 + Math.sin(u * Math.PI * 1.6 + k * 1.25) * 3.2 * u;
      p.vertex(x, y);
    }
    p.endShape();
  }
  // 薄片：在带沿上方展开，进入第 16 版块的多模态混合带。
  p.noStroke();
  for (let k = 0; k < 3; k++) {
    const y = 438 + k * 9;
    const a = (0.05 + k * 0.012) * exit;
    quadShape(
      p,
      [
        [846, y + 2],
        [1000, y - 4 + k * 2],
        [1000, y + 4 + k * 2],
        [852, y + 7]
      ],
      colors[k + 1],
      a,
      colors[k + 1],
      a * 1.4,
      0.7
    );
  }
  // 传送带边界在出口轻微抬起，但仍在 56–70 宽度内。
  p.noFill();
  strokeHex(p, C.cyan, 0.16 * exit);
  p.strokeWeight(1);
  p.line(760, ROAD_TOP + 1, 1000, ROAD_TOP - 2);
  p.line(760, ROAD_BOTTOM - 1, 1000, ROAD_BOTTOM + 2);
  p.pop();
}

function drawBelt(p, t) {
  const flowT = t < 3 ? t : t < 4 ? 3 : t - 1;
  p.push();
  p.noStroke();

  // 完全覆盖默认路带 y≈470–530，边缘略宽到 467–533。
  fillHex(p, C.bgDeep, 1);
  p.rect(0, ROAD_TOP - 1, 1000, ROAD_BOTTOM - ROAD_TOP + 2);
  fillHex(p, C.bgLow, 1);
  p.rect(0, ROAD_TOP + 2, 1000, ROAD_BOTTOM - ROAD_TOP - 4);

  // 两侧导轨
  fillHex(p, C.navyDeep, 1);
  p.rect(0, ROAD_TOP, 1000, 6);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 6);
  fillHex(p, C.line, 0.55);
  p.rect(0, ROAD_TOP + 1, 1000, 1);
  p.rect(0, ROAD_BOTTOM - 2, 1000, 1);
  fillHex(p, C.cyan, 0.2);
  p.rect(0, ROAD_TOP + 5, 1000, 0.8);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 0.8);

  // 带面内层
  fillHex(p, C.panel, 0.38);
  p.rect(0, ROAD_TOP + 6, 1000, ROAD_BOTTOM - ROAD_TOP - 12);

  // 移动的带面肋条
  const scroll = ((flowT * 38) % 12 + 12) % 12;
  p.strokeWeight(0.7);
  for (let x = -scroll; x < 1000; x += 12) {
    strokeHex(p, C.navyLight, 0.16);
    p.line(x, ROAD_TOP + 7, x, ROAD_BOTTOM - 7);
    strokeHex(p, C.cyan, 0.018);
    p.line(x + 1, ROAD_TOP + 8, x + 1, ROAD_BOTTOM - 8);
  }

  // 参数块槽位
  for (let i = 0; i < 18; i++) {
    const x = ((i * 62 - flowT * 38) % 1000 + 1000) % 1000;
    fillHex(p, C.bgDeep, 0.85);
    p.rect(x, 489, 27, 9, 1);
    p.noFill();
    strokeHex(p, C.navyLight, 0.28);
    p.strokeWeight(0.7);
    p.rect(x, 489, 27, 9, 1);
    p.noStroke();
    if (i % 3 === 0) {
      fillHex(p, i % 6 === 0 ? C.cyan : C.cyanSoft, 0.32);
      p.rect(x + 4, 491, 7, 5, 0.8);
      strokeHex(p, C.cyan, 0.4);
      p.strokeWeight(0.5);
      p.line(x + 5, 499, x + 11, 499);
    }
  }

  // 绑带：两条长带 + 稀疏的横向扣带
  fillHex(p, C.navy, 0.46);
  p.rect(0, 477, 1000, 4);
  p.rect(0, 520, 1000, 4);
  p.noFill();
  strokeHex(p, C.cyan, 0.18);
  p.strokeWeight(0.7);
  p.line(0, 478, 1000, 478);
  p.line(0, 522, 1000, 522);
  p.noStroke();
  for (let i = 0; i < 9; i++) {
    const x = ((i * 118 - flowT * 38) % 1000 + 1000) % 1000;
    fillHex(p, C.navyDeep, 0.55);
    p.rect(x, ROAD_TOP + 8, 3, ROAD_BOTTOM - ROAD_TOP - 16);
    fillHex(p, C.cyan, 0.14);
    p.rect(x + 1, 478, 1, 44);
    fillHex(p, C.steel, 0.24);
    p.rect(x - 2, 479, 7, 2, 0.5);
    p.rect(x - 2, 521, 7, 2, 0.5);
  }

  // 0/1 数据流：只占带面一条窄道，不是全屏代码雨。
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(6.3);
  const step = Math.floor(flowT * 10);
  for (let i = 0; i < 18; i++) {
    const speed = 16 + (i % 3) * 8;
    const x = ((i * 59 + flowT * speed) % 1000 + 1000) % 1000;
    const y = 507 + (i % 2) * 8 + hash2(i, 2, 163) * 2.5;
    const bit = BITS[(i * 3 + step) % BITS.length];
    fillHex(p, i % 6 === 0 ? C.amber : C.cyan, 0.13 + hash2(i, 3, 163) * 0.2);
    p.text(bit, x, y);
  }

  drawBeltDock(p, Math.min(t, 3), t);
  drawBeltLeftMerge(p, t);
  drawBeltExit(p, t);

  // 带沿高光与首尾接缝
  p.noFill();
  strokeHex(p, C.cream, 0.07);
  p.strokeWeight(0.6);
  p.line(0, ROAD_MID, 1000, ROAD_MID);
  strokeHex(p, C.line, 0.5);
  p.strokeWeight(1);
  p.rect(0, ROAD_TOP + 1, 1000, ROAD_BOTTOM - ROAD_TOP - 2, 1);
  p.pop();
}

// ---------- 箱子 ----------

function drawSmallCrate(p, x, baseY, scale, alpha, warm) {
  if (alpha <= 0.002) return;
  p.push();
  p.translate(x, baseY);
  p.scale(scale);
  p.noStroke();

  fillHex(p, C.bgDeep, 0.36 * alpha);
  p.ellipse(2, 1, 52, 9);

  // 底座
  fillHex(p, C.navyDeep, 0.9 * alpha);
  p.rect(-22, -3, 44, 4, 1);

  // 右侧面
  quadShape(
    p,
    [
      [18, -28],
      [26, -34],
      [26, -8],
      [18, 0]
    ],
    C.bgLow,
    0.98 * alpha,
    C.line,
    0.38 * alpha,
    1
  );

  // 正面
  p.noStroke();
  fillHex(p, C.face, 0.98 * alpha);
  p.rect(-20, -28, 40, 28, 2);
  fillHex(p, C.faceTop, 0.6 * alpha);
  p.rect(-18, -26, 36, 6, 1);
  fillHex(p, C.faceLow, 0.6 * alpha);
  p.rect(-18, -10, 36, 8, 1);

  // 顶盖与锁缝
  quadShape(
    p,
    [
      [-20, -28],
      [20, -28],
      [26, -34],
      [-14, -34]
    ],
    C.faceTop,
    0.98 * alpha,
    C.cyan,
    0.42 * alpha,
    1
  );
  p.noFill();
  strokeHex(p, warm > 0.3 ? C.emberHot : C.cream, 0.42 * alpha);
  p.strokeWeight(1);
  p.line(-14, -27, 18, -27);
  strokeHex(p, C.cyan, 0.46 * alpha);
  p.strokeWeight(1);
  p.rect(-20, -28, 40, 28, 2);

  // 四角锁扣与刻度
  p.noStroke();
  for (const [lx, ly] of [
    [-17, -25],
    [14, -25],
    [-17, -5],
    [14, -5]
  ]) {
    fillHex(p, C.bgDeep, 0.9 * alpha);
    p.rect(lx, ly, 4, 3, 0.6);
    fillHex(p, C.cyan, 0.35 * alpha);
    p.rect(lx + 0.8, ly + 0.7, 2.2, 1.2);
  }
  strokeHex(p, C.cyan, 0.26 * alpha);
  p.strokeWeight(0.6);
  for (let k = 0; k < 5; k++) {
    p.line(-12 + k * 5, -14, -12 + k * 5, -11);
  }
  p.noStroke();
  fillHex(p, C.steel, 0.34 * alpha);
  p.rect(-6, -20, 12, 1);
  p.rect(-4, -18, 8, 0.8);
  p.pop();
}

function drawDockAndCargo(p, blockStart, t, hold) {
  // 带上的第一组箱子：固定在世界坐标，不跟主角一起滑走；两只叠在一起。
  for (const c of CARGO) {
    drawSmallCrate(p, blockStart + c.x, c.base, c.s, 0.82, c.warm);
  }

  // 复制箱：从主角开盖处滑出，停在带面右侧；之后随主角一起向前滑。
  const retract = smoothstep(4.05, 4.95, t);
  const actorLocal = (t / 6) * 1000;
  for (let i = 0; i < COPY_OFFSETS.length; i++) {
    const target = actorLocal + COPY_OFFSETS[i];
    const pIn = smoothstep(2.66 + i * 0.05, 2.93 + i * 0.035, hold);
    if (pIn <= 0.001) continue;
    const ease = pIn * pIn * (3 - 2 * pIn);
    const origin = actorLocal + 24 + i * 4;
    const x = origin + (target - origin) * ease;
    const y = 498 - Math.sin(Math.PI * ease) * (9 + i * 2);
    const alpha = smoothstep(2.62 + i * 0.04, 2.8 + i * 0.04, hold) * (1 - retract);
    const scale = (0.92 - i * 0.07) * (0.55 + 0.45 * ease) * (1 - 0.78 * retract);
    drawSmallCrate(p, blockStart + x, y, scale, alpha, 0.25 + i * 0.08);

    if (retract > 0.02) {
      const dotA = retract * (1 - smoothstep(5.0, 5.5, t));
      p.push();
      p.noStroke();
      fillHex(p, i === 0 ? C.emberHot : C.cyan, 0.55 * dotA);
      p.ellipse(blockStart + target, 484 - 7 * retract, 2.6, 2.6);
      fillHex(p, i === 0 ? C.ember : C.cyan, 0.08 * dotA);
      p.ellipse(blockStart + target, 484 - 7 * retract, 14, 14);
      p.pop();
    }
  }
}

function drawInnerBlackBox(p, alpha, slit, flash) {
  if (alpha <= 0.002) return;
  p.push();
  p.noStroke();

  // 内箱落影与冷边
  fillHex(p, C.bgDeep, 0.8 * alpha);
  p.ellipse(0, -44, 38, 9);

  // 正面
  fillHex(p, '#03050a', 0.99 * alpha);
  p.rect(-15, -60, 30, 17, 1.5);
  fillHex(p, '#071022', 0.9 * alpha);
  p.rect(-13, -58, 26, 5, 1);

  // 右侧面
  quadShape(
    p,
    [
      [15, -60],
      [20, -64],
      [20, -48],
      [15, -43]
    ],
    '#02040a',
    0.98 * alpha,
    C.cyanDim,
    0.26 * alpha,
    0.8
  );

  // 顶盖：缝越开，盖沿越往上抬
  const lift = 3.2 * slit;
  quadShape(
    p,
    [
      [-10, -64],
      [20, -64],
      [18, -68 - lift],
      [-17, -68 - lift]
    ],
    C.faceTop,
    0.98 * alpha,
    C.cyan,
    0.34 * alpha,
    0.9
  );

  // 缝里还是黑箱：一条黑缝 + 更小的无标记方块
  if (slit > 0.02) {
    p.noStroke();
    fillHex(p, '#000000', 0.95 * slit * alpha);
    p.rect(-12, -65, 24, 3.6, 0.6);
    fillHex(p, '#010205', 0.98 * slit * alpha);
    p.rect(-4, -65.6, 8, 4.2, 0.5);
    p.noFill();
    strokeHex(p, C.emberHot, 0.34 * slit * alpha);
    p.strokeWeight(0.6);
    p.rect(-4, -65.6, 8, 4.2, 0.5);
    p.noStroke();
  }

  // 内箱正面小锁扣与刻度
  for (const [lx, ly] of [
    [-12, -58],
    [9, -58],
    [-12, -47],
    [9, -47]
  ]) {
    fillHex(p, C.bgDeep, 0.9 * alpha);
    p.rect(lx, ly, 3, 2, 0.4);
    fillHex(p, C.cyan, 0.24 * alpha);
    p.rect(lx + 0.6, ly + 0.5, 1.6, 0.8);
  }
  p.noFill();
  strokeHex(p, C.cyanDim, 0.4 * alpha);
  p.strokeWeight(0.8);
  p.rect(-15, -60, 30, 17, 1.5);
  strokeHex(p, C.cyan, 0.2 * alpha);
  p.strokeWeight(0.6);
  for (let k = 0; k < 5; k++) {
    p.line(-10 + k * 5, -48, -10 + k * 5, -46);
  }

  // 黑箱里唯一亮着的暖赭火种
  p.noStroke();
  fillHex(p, C.bgDeep, 0.98 * alpha);
  p.ellipse(0, -52, 10, 10);
  fillHex(p, C.ember, 0.36 * alpha);
  p.ellipse(0, -52, 8, 8);
  fillHex(p, C.emberHot, 0.95 * alpha);
  p.ellipse(-0.4, -52.4, 4.4, 4.8);
  fillHex(p, C.emberCore, 0.98 * alpha);
  p.ellipse(-0.8, -52.8, 1.7, 1.9);
  p.noFill();
  strokeHex(p, C.emberHot, (0.28 + flash * 0.3) * alpha);
  p.strokeWeight(0.8);
  p.ellipse(0, -52, 12 + flash * 2, 12 + flash * 2);

  p.pop();
}

function drawMainCrate(p, t, state) {
  const hold = Math.min(t, 3);
  const appear = smoothstep(0, 0.42, t);
  const close = smoothstep(4.2, 4.78, t);
  const open = smoothstep(2.62, 2.98, hold) * (1 - close);
  const slit = smoothstep(2.9, 3.0, hold) * (1 - smoothstep(4.18, 4.55, t));
  const lock = smoothstep(2.42, 2.66, hold) * (1 - 0.4 * smoothstep(4.5, 5.4, t));
  const flash = smoothstep(2.82, 2.98, hold) * (1 - smoothstep(4.1, 4.45, t));
  const zip = 1 - smoothstep(2.2, 2.7, hold);
  const bodyAlpha = appear * (1 - 0.55 * smoothstep(5.45, 6, t));
  const bob = Math.sin(hold * 8.2) * 1.1 * (1 - lock);
  const tilt = -0.012 + 0.022 * open + 0.005 * Math.sin(hold * 3.1) * (1 - lock);

  p.push();
  p.translate(state.x, ROAD_MID - bob);
  p.rotate(tilt);
  p.scale(0.9 + 0.1 * appear);

  p.noStroke();
  // 接触阴影与停靠暖光
  fillHex(p, C.bgDeep, 0.46 * bodyAlpha);
  p.ellipse(2, 2, 76, 13);
  fillHex(p, C.cyan, 0.035 * lock * bodyAlpha);
  p.ellipse(0, 0, 92, 18);
  if (lock > 0.02) {
    fillHex(p, C.ember, 0.04 * lock * bodyAlpha);
    p.ellipse(0, -20, 76, 54);
  }

  // 滑动残影
  if (zip > 0.01) {
    for (let k = 0; k < 3; k++) {
      const tx = -30 - k * 18;
      fillHex(p, C.cyan, (0.028 - k * 0.006) * zip * bodyAlpha);
      p.rect(tx - 5, -42 + k * 4, 10, 34 - k * 8, 1);
      p.noFill();
      strokeHex(p, C.cyanSoft, 0.05 * zip * bodyAlpha);
      p.strokeWeight(0.6);
      p.rect(tx - 5, -42 + k * 4, 10, 34 - k * 8, 1);
    }
    p.noStroke();
  }

  // 底部垫块与四角锁脚
  fillHex(p, C.navyDeep, 0.96 * bodyAlpha);
  p.rect(-26, -4, 52, 5, 1.5);
  fillHex(p, C.line, 0.42 * bodyAlpha);
  p.rect(-24, -4, 48, 1);
  for (const fx of [-24, 24]) {
    fillHex(p, C.navyDeep, 0.95 * bodyAlpha);
    p.rect(fx - 4, -1.5, 8, 4, 1);
    fillHex(p, lock > 0.4 ? C.cyan : C.cyanDim, 0.2 + 0.55 * lock);
    p.rect(fx - 2, 0, 4, 1, 0.4);
  }

  // 右侧面
  quadShape(
    p,
    [
      [32, -46],
      [45, -55],
      [45, -9],
      [32, 0]
    ],
    C.faceLow,
    0.98 * bodyAlpha,
    C.line,
    0.42 * bodyAlpha,
    1
  );
  fillHex(p, C.navyDeep, 0.65 * bodyAlpha);
  p.rect(35, -40, 5, 30);
  fillHex(p, C.cyan, 0.16 * bodyAlpha);
  p.rect(36, -34, 3, 1);

  // 正面
  p.noStroke();
  fillHex(p, C.face, 0.99 * bodyAlpha);
  p.rect(-32, -46, 64, 46, 2.5);
  fillHex(p, C.faceTop, 0.55 * bodyAlpha);
  p.rect(-30, -43, 60, 9, 1.5);
  fillHex(p, C.faceLow, 0.62 * bodyAlpha);
  p.rect(-30, -17, 60, 15, 1.5);
  p.noFill();
  strokeHex(p, C.cyan, 0.5 * bodyAlpha);
  p.strokeWeight(1.2);
  p.rect(-32, -46, 64, 46, 2.5);
  strokeHex(p, C.line, 0.6 * bodyAlpha);
  p.strokeWeight(0.8);
  p.rect(-29, -43, 58, 40, 1.5);

  // 开盖后的内部腔体（固定开口，盖板单独抬起）
  if (open > 0.01) {
    quadShape(
      p,
      [
        [-32, -46],
        [32, -46],
        [45, -55],
        [-19, -55]
      ],
      '#02050b',
      0.99 * bodyAlpha,
      C.cyanDim,
      0.35 * bodyAlpha,
      1
    );
    p.noStroke();
    fillHex(p, C.ember, 0.045 * open * bodyAlpha);
    p.ellipse(0, -48, 46, 26);
    fillHex(p, C.emberHot, 0.035 * open * bodyAlpha);
    p.ellipse(0, -50, 22, 15);
    p.noFill();
    strokeHex(p, C.navyLight, 0.4 * bodyAlpha);
    p.strokeWeight(0.7);
    p.line(-26, -47, -14, -53);
    p.line(26, -47, 38, -53);
  }

  // 盖板：闭合时是顶面，打开时沿后沿翻起。
  const lfL = -32 + 5 * open;
  const lfR = 32 + 5 * open;
  const lfY = -46 - 38 * open;
  quadShape(
    p,
    [
      [-19, -55],
      [45, -55],
      [lfR, lfY],
      [lfL, lfY]
    ],
    C.faceTop,
    0.99 * bodyAlpha,
    C.cyan,
    0.52 * bodyAlpha,
    1.2
  );
  p.noFill();
  strokeHex(p, C.line, 0.85 * bodyAlpha);
  p.strokeWeight(1);
  p.line(-19, -55, 45, -55);
  strokeHex(p, C.navyLight, 0.8 * bodyAlpha);
  p.strokeWeight(2.4);
  p.line(lfL, lfY, lfR, lfY);
  if (open > 0.04) {
    strokeHex(p, C.emberHot, 0.13 * open * bodyAlpha);
    p.strokeWeight(1.8);
    p.line(lfL + 3, lfY + 2, lfR - 3, lfY + 2);
    p.noStroke();
    fillHex(p, C.cyan, 0.04 * open * bodyAlpha);
    p.rect(lfL + 6, lfY + 3, Math.max(4, lfR - lfL - 12), 1.2, 0.5);
  }

  // 盖子闭合时，暖火种从缝里漏出一线
  if (open < 0.35) {
    const seam = (1 - open / 0.35) * 0.75 * bodyAlpha;
    strokeHex(p, C.emberHot, seam * 0.7);
    p.strokeWeight(1.2);
    p.line(-23, -45.2, 25, -45.2);
    p.noStroke();
    fillHex(p, C.ember, 0.06 * seam);
    p.ellipse(0, -44, 34, 9);
  }

  // 内层黑箱
  const innerAlpha = smoothstep(2.72, 2.98, hold) * (1 - smoothstep(4.15, 4.6, t)) * bodyAlpha;
  if (innerAlpha > 0.005 && open > 0.04) {
    p.push();
    p.translate(1, (1 - innerAlpha) * 10);
    drawInnerBlackBox(p, innerAlpha, slit, flash);
    p.pop();
  }

  // 正面锁扣、刻度、铆钉
  for (let i = 0; i < 4; i++) {
    p.noStroke();
    const lx = i % 2 === 0 ? -26 : 24;
    const ly = i < 2 ? -39 : -7;
    fillHex(p, C.navyDeep, 0.95 * bodyAlpha);
    p.rect(lx - 3, ly - 2, 7, 5, 1);
    p.noFill();
    strokeHex(p, i < 2 ? C.cyan : C.emberHot, (0.3 + 0.5 * lock) * bodyAlpha);
    p.strokeWeight(0.7);
    p.rect(lx - 3, ly - 2, 7, 5, 1);
    p.noStroke();
    fillHex(p, i < 2 ? C.cyan : C.emberHot, (0.15 + 0.7 * lock) * bodyAlpha);
    p.rect(lx - 1, ly - 0.5, 3, 1.6, 0.5);
    if (lock > 0.1) {
      fillHex(p, i < 2 ? C.cyan : C.ember, 0.09 * lock * bodyAlpha);
      p.ellipse(lx + 0.5, ly + 0.5, 13, 9);
    }
  }

  // 中央锁扣
  fillHex(p, C.bgDeep, 0.9 * bodyAlpha);
  p.rect(-6, -26, 12, 9, 1.5);
  p.noFill();
  strokeHex(p, C.cyan, 0.42 * bodyAlpha);
  p.strokeWeight(0.8);
  p.rect(-6, -26, 12, 9, 1.5);
  strokeHex(p, C.steel, 0.5 * bodyAlpha);
  p.strokeWeight(0.8);
  p.line(-3.5, -23, 3.5, -23);
  p.line(-2.5, -20.5, 2.5, -20.5);
  p.noStroke();
  if (lock > 0.1) {
    fillHex(p, C.emberHot, 0.1 + 0.75 * lock * bodyAlpha);
    p.ellipse(0, -21.5, 1.8, 1.8);
  }

  // 正面参数刻度
  p.noFill();
  strokeHex(p, C.cyan, 0.3 * bodyAlpha);
  p.strokeWeight(0.6);
  for (let k = 0; k < 9; k++) {
    const x = -20 + k * 5;
    const h = k % 3 === 0 ? 4 : 2.5;
    p.line(x, -14, x, -14 + h);
  }
  strokeHex(p, C.creamDim, 0.18 * bodyAlpha);
  p.strokeWeight(0.6);
  p.line(-22, -8, 22, -8);
  p.line(-18, -11, -2, -11);
  p.line(2, -11, 18, -11);

  // 四角竖向注意力绑带
  for (const bx of [-30, 28]) {
    strokeHex(p, C.cyan, 0.13 * bodyAlpha);
    p.strokeWeight(1);
    p.line(bx, -42, bx, -3);
    strokeHex(p, C.navyLight, 0.28 * bodyAlpha);
    p.strokeWeight(0.6);
    p.line(bx + 1.5, -40, bx + 1.5, -4);
  }

  // 定格时的一圈冷光与火种闪
  if (flash > 0.01) {
    p.noStroke();
    fillHex(p, C.ember, 0.05 * flash * bodyAlpha);
    p.ellipse(0, -50, 70, 70);
    fillHex(p, C.emberHot, 0.07 * flash * bodyAlpha);
    p.ellipse(0, -52, 32, 32);
    fillHex(p, C.ember, 0.025 * flash * bodyAlpha);
    p.ellipse(0, -82, 24, 76);
    for (let i = 0; i < 6; i++) {
      const a = i * (TAU / 6) + hold * 0.5;
      const r = 22 + hash2(i, 71, 160) * 18;
      fillHex(p, i % 2 === 0 ? C.emberHot : C.emberCore, 0.4 * flash * bodyAlpha);
      p.ellipse(Math.cos(a) * r, -50 + Math.sin(a) * r * 0.7, 1.6, 1.6);
    }
  }
  p.pop();
}

// 结尾展开：参数块向第 16 版块放出多束图文音视频信号线/薄片。
function drawUnfoldFan(p, state, blockStart, t) {
  const u0 = smoothstep(4.3, 5.45, t);
  if (u0 <= 0.01) return;
  const x0 = state.x + 28;
  const x1 = blockStart + 1000;
  const ex = x0 + (x1 - x0) * u0;
  if (ex - x0 < 10) return;

  const lanes = [
    { color: C.cyan, y0: ROAD_MID - 38, y1: 476 },
    { color: C.creamDim, y0: ROAD_MID - 25, y1: 491 },
    { color: C.violet, y0: ROAD_MID - 13, y1: 505 },
    { color: C.mint, y0: ROAD_MID - 1, y1: 519 }
  ];

  p.push();
  p.noFill();
  for (let k = 0; k < lanes.length; k++) {
    const lane = lanes[k];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const x = x0 + (ex - x0) * u;
      const y = lane.y0 + (lane.y1 - lane.y0) * u + Math.sin(u * Math.PI * 1.4 + k * 1.1) * 4 * u;
      pts.push([x, y]);
    }
    strokeHex(p, lane.color, 0.08 * u0);
    p.strokeWeight(5);
    p.beginShape();
    for (const [x, y] of pts) p.vertex(x, y);
    p.endShape();
    strokeHex(p, lane.color, 0.45 * u0);
    p.strokeWeight(1.2);
    p.beginShape();
    for (const [x, y] of pts) p.vertex(x, y);
    p.endShape();
  }

  // 两片薄薄的信号切片
  for (let k = 0; k < 2; k++) {
    const lane = lanes[k + 1];
    const a = 0.06 * u0;
    quadShape(
      p,
      [
        [x0 + (ex - x0) * 0.1, lane.y0 - 2],
        [x0 + (ex - x0) * 0.42, lane.y1 - 1],
        [x0 + (ex - x0) * 0.42, lane.y1 + 3],
        [x0 + (ex - x0) * 0.1, lane.y0 + 2]
      ],
      lane.color,
      a,
      lane.color,
      a * 1.5,
      0.6
    );
  }
  p.pop();
}

// ---------- 气氛与标题 ----------

function drawAtmosphere(p) {
  linearWash(
    p,
    0,
    160,
    0,
    860,
    [
      [0, 'rgba(2,5,13,0.3)'],
      [0.22, 'rgba(2,5,13,0)'],
      [0.74, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.34)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.012);
  p.ellipse(788, 420, 470, 340);
  fillHex(p, C.ember, 0.008);
  p.ellipse(520, 520, 360, 90);
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
    p.push();
    p.noStroke();
    drawRoom(p, t);
    drawParamWall(p, t);
    drawParamArray(p, t);
    drawCurvePanel(p, t);
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
    drawBelt(p, t);
    p.pop();
  },

  drawActor(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const hold = Math.min(t, 3);
    const blockStart = (state.blockIndex - 1) * 1000;
    p.push();
    p.noStroke();
    drawDockAndCargo(p, blockStart, t, hold);
    drawMainCrate(p, t, state);
    drawUnfoldFan(p, state, blockStart, t);
    p.pop();
  }
};
