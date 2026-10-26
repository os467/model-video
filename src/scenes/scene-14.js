import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 14 注意力机制：深蓝序列空间 + token 序列带 + Q/K/V 网格 + softmax 权重条。
// 静态重点：localT≈1.5（标题、token 卡、QKV 网格进场）与
// localT≈3.0（全部注意力光束钉在句点上、权重 99%、query 卡歪、火种闪、约 1s 定格）。
const ROAD_TOP = 470;
const ROAD_BOTTOM = 530;
const ROAD_MID = 500;
const TOKEN_W = 46;
const TOKEN_H = 38;
const PERIOD_INDEX = 7;
const TOKEN_COUNT = 8;

const META = {
  id: 14,
  cn: '注意力机制',
  en: 'Attention',
  era: '2017',
  group: 'data'
};

const C = {
  bg: '#060a16',
  bgDeep: '#03060f',
  bgPanel: '#071022',
  soft: '#1a2750',
  deepBlue: '#0a1330',
  cyan: '#63dfff',
  cyanDim: '#3a8fb8',
  cyanEdge: '#1c4a6e',
  ink: '#e6ebff',
  dim: '#8fa3c8',
  cream: '#f1e6c8',
  creamDim: '#c8bda2',
  amber: '#d08a3e',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa'
};

// 8 个抽象 token：单个字母、几何符号、问号、末尾小句点。没有真实句子。
const TOKENS = Object.freeze([
  { x: 430, glyph: 'A', kind: 'letter' },
  { x: 499, glyph: 'B', kind: 'letter' },
  { x: 568, glyph: '', kind: 'tri' },
  { x: 637, glyph: 'C', kind: 'letter' },
  { x: 706, glyph: '', kind: 'ring' },
  { x: 775, glyph: '?', kind: 'question' },
  { x: 844, glyph: '', kind: 'square' },
  { x: 913, glyph: '.', kind: 'period' }
]);

// 右上 Q/K/V 网格：3 行 × 8 列，最后一列与句点 token 同 x。
const QKV = {
  x: 650,
  y: 258,
  w: 282,
  h: 152,
  labelX: 672,
  cellX: 703,
  cellStep: 30,
  cellW: 22,
  cellH: 26,
  rowY: [297, 337, 377]
};

// 右侧 softmax 权重条。
const WB = {
  labelX: 756,
  x0: 772,
  x1: 930,
  headerY: 550,
  y0: 564,
  step: 15,
  h: 6
};

// softmax 的两端：进场时接近均匀，高光时把 99% 压到句点。
const PRE_W = (() => {
  const raw = [];
  let sum = 0;
  for (let i = 0; i < TOKEN_COUNT; i++) {
    const v = 0.4 + hash2(i, 51, 1414) * 1.3;
    raw.push(v);
    sum += v;
  }
  return raw.map((v) => v / sum);
})();

const POST_W = (() => {
  const raw = [];
  let sum = 0;
  for (let i = 0; i < TOKEN_COUNT - 1; i++) {
    const v = 0.5 + hash2(i, 52, 1414);
    raw.push(v);
    sum += v;
  }
  return raw.map((v) => (0.01 * v) / sum).concat([0.99]);
})();

// 背景数据微尘，固定种子，不与任何时间或随机源关联。
const DUST = (() => {
  const rng = mulberry32(0x14a77e);
  const list = [];
  for (let i = 0; i < 96; i++) {
    list.push({
      x: rng() * 1000,
      y: 226 + rng() * 532,
      r: 0.5 + rng() * 1.5,
      a: 0.018 + rng() * 0.045,
      warm: rng() > 0.88,
      bright: rng() > 0.7
    });
  }
  return list;
})();

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

// 全局统一的高光包络：2.1s 开始收束，2.86s 到 99%，4s 后释放。
function attentionLock(t) {
  const time = clamp(t, 0, 6);
  const hold = Math.min(time, 3);
  return smoothstep(2.1, 2.86, hold) * (1 - smoothstep(4.0, 4.8, time));
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

function dashedV(p, x, y0, y1, color, alpha, dash = 4, gap = 5) {
  if (alpha <= 0.002) return;
  strokeHex(p, color, alpha);
  p.strokeWeight(0.9);
  for (let y = y0; y < y1; y += dash + gap) {
    p.line(x, y, x, Math.min(y1, y + dash));
  }
}

// ---------- token 符号 / 卡片 ----------

function drawTokenGlyph(p, token, x, y, size, alpha, color) {
  if (alpha <= 0.002) return;
  p.push();
  p.translate(x, y);

  if (token.kind === 'letter' || token.kind === 'question') {
    p.noStroke();
    p.textFont('monospace');
    p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(size);
    fillHex(p, color, alpha);
    p.text(token.glyph, 0, 0.5);
    p.textStyle(p.NORMAL);
  } else if (token.kind === 'tri') {
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(Math.max(0.7, size * 0.08));
    const r = size * 0.42;
    p.triangle(0, -r, r * 0.92, r * 0.72, -r * 0.92, r * 0.72);
  } else if (token.kind === 'ring') {
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(Math.max(0.7, size * 0.08));
    p.ellipse(0, 0, size * 0.88, size * 0.88);
    p.noStroke();
    fillHex(p, color, alpha * 0.6);
    p.ellipse(0, 0, size * 0.18, size * 0.18);
  } else if (token.kind === 'square') {
    p.push();
    p.rotate(Math.PI / 4);
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(Math.max(0.7, size * 0.08));
    p.rect(-size * 0.32, -size * 0.32, size * 0.64, size * 0.64, 1);
    p.pop();
  } else {
    // period：小句点，高光时被琥珀色钉住。
    p.noStroke();
    fillHex(p, color, alpha * 0.3);
    p.ellipse(0, size * 0.2, size * 0.72, size * 0.72);
    fillHex(p, color, alpha);
    p.ellipse(0, size * 0.2, size * 0.26, size * 0.26);
  }

  p.pop();
}

function drawTokenCard(p, token, i, t) {
  const appear = smoothstep(0.28 + i * 0.1, 0.62 + i * 0.1, t);
  if (appear <= 0.003) return;

  const lock = attentionLock(t);
  const comp = smoothstep(4.02 + i * 0.035, 4.72 + i * 0.035, t);
  const lit = smoothstep(0.4 + i * 0.1, 0.68 + i * 0.1, t);
  const warm = i === PERIOD_INDEX ? lock : 0;
  const dim = i === PERIOD_INDEX ? 1 : 1 - 0.32 * lock;

  const x = token.x - (1 - appear) * 22;
  const w = TOKEN_W + comp * 8;
  const h = TOKEN_H * (0.84 + 0.16 * appear) * (1 - 0.38 * comp);
  const a = appear * (1 - 0.12 * comp);
  const border = warm > 0.3 ? C.emberHot : C.cyan;

  p.push();
  p.translate(x, ROAD_MID);

  // 卡片的低 alpha 光晕：token 薄片“发光”而不是现代 UI 卡片。
  p.noStroke();
  fillHex(p, warm > 0.3 ? C.ember : C.cyan, (0.025 + 0.04 * lit + 0.07 * warm) * a);
  p.rect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 7);

  // 落影与卡体。
  fillHex(p, C.bgDeep, 0.42 * a);
  p.rect(-w / 2 + 2.5, -h / 2 + 3.5, w, h, 4);
  fillHex(p, C.bgPanel, 0.96 * a);
  p.rect(-w / 2, -h / 2, w, h, 4);
  fillHex(p, '#0c1c3a', 0.92 * a);
  p.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 3);

  // 上半部玻璃反光。
  fillHex(p, C.cyan, 0.045 * a);
  p.rect(-w / 2 + 3, -h / 2 + 3, w - 6, Math.max(4, (h - 6) * 0.42), 2);
  strokeHex(p, C.cyan, 0.2 * a);
  p.strokeWeight(0.7);
  p.line(-w / 2 + 5, -h / 2 + 3.5, w / 2 - 5, -h / 2 + 3.5);

  // 边框：未选中细青边，句点在高光时变成琥珀。
  p.noFill();
  strokeHex(p, border, (0.32 + 0.3 * lit) * dim * a + warm * 0.22);
  p.strokeWeight(warm > 0.3 ? 1.5 : 1.1);
  p.rect(-w / 2, -h / 2, w, h, 4);
  strokeHex(p, warm > 0.3 ? C.cream : C.cyanDim, 0.2 * dim * a);
  p.strokeWeight(0.7);
  p.rect(-w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5, 2);

  // 卡片内的小符号（压缩成参数块时符号退场）。
  drawTokenGlyph(
    p,
    token,
    0,
    0,
    token.kind === 'period' ? 18 : 15,
    a * dim * (1 - comp * 0.82) * (0.72 + 0.28 * lit),
    warm > 0.3 ? C.emberCore : C.ink
  );

  // 句点被钉住时的琥珀锁定框与四角刻度。
  if (warm > 0.02) {
    p.noFill();
    strokeHex(p, C.emberHot, 0.34 * warm * a);
    p.strokeWeight(1);
    p.rect(-w / 2 - 3.5, -h / 2 - 3.5, w + 7, h + 7, 5);
    strokeHex(p, C.emberCore, 0.16 * warm * a);
    p.strokeWeight(0.8);
    p.rect(-w / 2 - 6.5, -h / 2 - 6.5, w + 13, h + 13, 7);
    p.noStroke();
    fillHex(p, C.emberCore, 0.55 * warm * a);
    for (const [dx, dy] of [
      [-w / 2 - 3.5, -h / 2 - 3.5],
      [w / 2 + 3.5, -h / 2 - 3.5],
      [-w / 2 - 3.5, h / 2 + 3.5],
      [w / 2 + 3.5, h / 2 + 3.5]
    ]) {
      p.ellipse(dx, dy, 2.2, 2.2);
    }
  }

  // 离场：token 卡压成带刻线/铆钉的参数块。
  if (comp > 0.02) {
    p.noFill();
    strokeHex(p, C.cyanDim, 0.22 * comp * a);
    p.strokeWeight(0.7);
    p.line(-w / 2 + 5, -h / 2 + 4, -w / 2 + 5, h / 2 - 4);
    p.line(w / 2 - 5, -h / 2 + 4, w / 2 - 5, h / 2 - 4);
    p.line(-w / 2 + 4, 0, w / 2 - 4, 0);
    p.noStroke();
    fillHex(p, C.cream, 0.22 * comp * a);
    for (const [dx, dy] of [
      [-w / 2 + 5, -h / 2 + 4],
      [w / 2 - 5, -h / 2 + 4],
      [-w / 2 + 5, h / 2 - 4],
      [w / 2 - 5, h / 2 - 4]
    ]) {
      p.ellipse(dx, dy, 1.8, 1.8);
    }
  }

  p.pop();
}

// ---------- 环境 ----------

function drawSpace(p, t) {
  const lock = attentionLock(t);

  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  // 深蓝序列空间的几块低频暗层与辉光。
  fillHex(p, C.soft, 0.055);
  p.ellipse(760, 338, 640, 340);
  fillHex(p, C.deepBlue, 0.34);
  p.rect(0, 196, 1000, 300);
  fillHex(p, C.cyan, 0.014);
  p.ellipse(760, 350, 460, 230);
  fillHex(p, C.amber, 0.012);
  p.ellipse(902, 500, 210, 96);
  fillHex(p, C.cyan, 0.01);
  p.ellipse(520, 500, 330, 110);

  linearWash(
    p,
    0,
    200,
    0,
    780,
    [
      [0, 'rgba(2,5,14,0.34)'],
      [0.26, 'rgba(4,10,24,0)'],
      [0.74, 'rgba(4,10,24,0)'],
      [1, 'rgba(1,3,9,0.5)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 很淡的序列网格。
  p.strokeWeight(0.6);
  for (let x = 0; x <= 1000; x += 50) {
    const major = x % 200 === 0;
    strokeHex(p, C.cyan, major ? 0.025 : 0.012);
    p.line(x, 220, x, 780);
  }
  for (let y = 220; y <= 780; y += 50) {
    const major = (y - 220) % 200 === 0;
    strokeHex(p, C.cyan, major ? 0.025 : 0.012);
    p.line(0, y, 1000, y);
  }
  p.noStroke();
  for (let x = 0; x <= 1000; x += 200) {
    for (let y = 220; y <= 780; y += 200) {
      fillHex(p, C.cyan, 0.055);
      p.ellipse(x, y, 1.5, 1.5);
    }
  }

  // 数据微尘；极少量暖琥珀，作为权重/火种的预告。
  for (const d of DUST) {
    fillHex(p, d.warm ? C.emberHot : C.cyan, d.a * (d.bright ? 1.35 : 1));
    p.ellipse(d.x, d.y, d.r, d.r);
  }

  // 每个 token 上方短短的序列位置线；句点在高光时变暖。
  for (let i = 0; i < TOKEN_COUNT; i++) {
    const warm = i === PERIOD_INDEX ? lock : 0;
    strokeHex(p, warm > 0.02 ? C.emberHot : C.cyan, 0.035 + warm * 0.11);
    p.strokeWeight(warm > 0.02 ? 1 : 0.7);
    p.line(TOKENS[i].x, 434, TOKENS[i].x, 468);
    p.line(TOKENS[i].x - 2.5, 468, TOKENS[i].x + 2.5, 468);
  }

  // 句点索引从 QKV 末列贯穿到权重条末行；路面段由 drawRoad 覆盖。
  const guideColor = lock > 0.02 ? C.emberHot : C.cyan;
  dashedV(p, TOKENS[PERIOD_INDEX].x, 412, 434, guideColor, 0.035 + 0.09 * lock, 4, 5);
  dashedV(p, TOKENS[PERIOD_INDEX].x, 532, 558, guideColor, 0.035 + 0.09 * lock, 4, 5);
}

function drawQKV(p, t) {
  const fadeIn = smoothstep(0.55, 1.2, t);
  const fadeOut = 1 - 0.7 * smoothstep(4.1, 5.2, t);
  const a = fadeIn * fadeOut;
  if (a <= 0.003) return;

  const lock = attentionLock(t);
  const capIn = smoothstep(0.85, 1.18, t);

  p.push();
  p.noStroke();

  // 面板落影与底。
  fillHex(p, C.bgDeep, 0.5 * a);
  p.rect(QKV.x + 5, QKV.y + 6, QKV.w, QKV.h, 7);
  fillHex(p, C.bgPanel, 0.88 * a);
  p.rect(QKV.x, QKV.y, QKV.w, QKV.h, 6);
  fillHex(p, C.soft, 0.12 * a);
  p.rect(QKV.x + 2, QKV.y + 2, QKV.w - 4, 20, 4);
  p.noFill();
  strokeHex(p, C.cyanEdge, 0.5 * a);
  p.strokeWeight(1);
  p.rect(QKV.x, QKV.y, QKV.w, QKV.h, 6);
  strokeHex(p, C.cyan, 0.08 * a);
  p.strokeWeight(0.7);
  p.rect(QKV.x + 3, QKV.y + 3, QKV.w - 6, QKV.h - 6, 4);

  // 顶部导轨：8 个位置的小刻度。
  strokeHex(p, C.cyan, 0.16 * a);
  p.strokeWeight(0.8);
  p.line(QKV.x + 16, QKV.y + 13, QKV.x + QKV.w - 16, QKV.y + 13);
  for (let col = 0; col < TOKEN_COUNT; col++) {
    const x = QKV.cellX + col * QKV.cellStep;
    const warm = col === TOKEN_COUNT - 1 ? lock : 0;
    strokeHex(p, warm > 0.02 ? C.emberHot : C.cyanDim, (0.18 + warm * 0.4) * a);
    p.strokeWeight(0.8);
    p.line(x, QKV.y + 9, x, QKV.y + 13);
  }

  const rowLabels = ['Q', 'K', 'V'];
  for (let row = 0; row < 3; row++) {
    const ry = QKV.rowY[row];

    // 行标签 Q/K/V。
    fillHex(p, C.bgDeep, 0.9 * a);
    p.rect(QKV.labelX - 12, ry - 12, 24, 24, 3);
    p.noFill();
    strokeHex(p, C.cyanDim, 0.5 * a);
    p.strokeWeight(0.9);
    p.rect(QKV.labelX - 12, ry - 12, 24, 24, 3);
    p.noStroke();
    p.textFont('monospace');
    p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(10);
    fillHex(p, C.cyan, 0.9 * a);
    p.text(rowLabels[row], QKV.labelX, ry + 0.5);
    p.textStyle(p.NORMAL);

    // 行底槽。
    strokeHex(p, C.cyan, 0.06 * a);
    p.strokeWeight(0.7);
    p.line(QKV.labelX + 18, ry + 14, QKV.cellX + 7 * QKV.cellStep + 12, ry + 14);

    for (let col = 0; col < TOKEN_COUNT; col++) {
      const cx = QKV.cellX + col * QKV.cellStep;
      const warm = col === TOKEN_COUNT - 1 ? lock : 0;
      const value = hash2(col, row, 1441);
      const cellA = a * capIn;

      p.noStroke();
      fillHex(p, warm > 0.1 ? C.ember : C.deepBlue, (0.55 + warm * 0.22) * cellA);
      p.rect(cx - QKV.cellW / 2, ry - QKV.cellH / 2, QKV.cellW, QKV.cellH, 2.5);
      p.noFill();
      strokeHex(p, warm > 0.1 ? C.emberHot : C.cyanEdge, (0.38 + warm * 0.35) * cellA);
      p.strokeWeight(0.7);
      p.rect(cx - QKV.cellW / 2, ry - QKV.cellH / 2, QKV.cellW, QKV.cellH, 2.5);

      if (row === 0) {
        // Q：光点。
        p.noStroke();
        fillHex(p, warm > 0.1 ? C.emberCore : C.cyan, (0.35 + value * 0.45) * cellA);
        p.ellipse(cx, ry, 1.8 + value * 2.2, 1.8 + value * 2.2);
      } else if (row === 1) {
        // K：短横线。
        strokeHex(p, warm > 0.1 ? C.emberCore : C.cyan, (0.3 + value * 0.42) * cellA);
        p.strokeWeight(0.9);
        p.line(cx - 3.5 - value * 2.5, ry, cx + 3.5 + value * 2.5, ry);
      } else {
        // V：小方块/双竖条。
        p.noStroke();
        fillHex(p, warm > 0.1 ? C.emberCore : C.creamDim, (0.26 + value * 0.42) * cellA);
        p.rect(cx - 2.2, ry - 2.2, 4.4, 4.4, 0.8);
        strokeHex(p, warm > 0.1 ? C.emberHot : C.cyanDim, 0.34 * cellA);
        p.strokeWeight(0.7);
        p.line(cx - 6, ry - 3, cx - 6, ry + 3);
        p.line(cx + 6, ry - 3, cx + 6, ry + 3);
      }
    }
  }

  // 面板底边的小统计点，不写文字。
  p.noStroke();
  for (let i = 0; i < 5; i++) {
    fillHex(p, i === 4 && lock > 0.3 ? C.emberHot : C.cyanDim, (0.16 + hash2(i, 71, 1441) * 0.2) * a);
    p.ellipse(QKV.x + 20 + i * 9, QKV.y + QKV.h - 12, 2, 2);
  }

  p.pop();
}

function drawWeightBars(p, t) {
  const fadeIn = smoothstep(0.9, 1.45, t);
  const fadeOut = 1 - 0.75 * smoothstep(4.1, 5.2, t);
  const a = fadeIn * fadeOut;
  if (a <= 0.003) return;

  const lock = attentionLock(t);
  const width = WB.x1 - WB.x0;
  const weights = PRE_W.map((pre, i) => pre * (1 - lock) + POST_W[i] * lock);
  const tilt = -0.08 * lock;

  p.push();
  p.translate((WB.x0 + WB.x1) * 0.5, 612);
  p.rotate(tilt);
  p.translate(-(WB.x0 + WB.x1) * 0.5, -612);

  // 标题行：softmax 与刻度基线。
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(7);
  fillHex(p, C.cyan, 0.62 * a);
  p.text('softmax', WB.x0, WB.headerY);
  strokeHex(p, C.cyan, 0.14 * a);
  p.strokeWeight(0.7);
  p.line(WB.x0, WB.headerY + 6, WB.x1, WB.headerY + 6);
  strokeHex(p, C.cyanDim, 0.12 * a);
  for (const q of [0, 0.5, 1]) {
    const x = WB.x0 + width * q;
    p.line(x, WB.headerY + 4, x, WB.headerY + 8);
  }
  // 0 / 0.5 / 1 的淡刻度线，读权重时不需要额外文字。
  strokeHex(p, C.cyanDim, 0.05 * a);
  p.strokeWeight(0.6);
  for (const q of [0, 0.5, 1]) {
    const x = WB.x0 + width * q;
    p.line(x, WB.headerY + 9, x, WB.y0 + (TOKEN_COUNT - 1) * WB.step + 5);
  }

  for (let i = 0; i < TOKEN_COUNT; i++) {
    const y = WB.y0 + i * WB.step;
    const w = weights[i];
    const warm = i === PERIOD_INDEX ? lock : 0;
    const fillW = Math.max(warm > 0.5 ? 3 : 1.4, width * w);
    const token = TOKENS[i];

    // 槽底。
    p.noStroke();
    fillHex(p, C.bgDeep, 0.78 * a);
    p.rect(WB.x0, y - WB.h / 2, width, WB.h, 2);
    p.noFill();
    strokeHex(p, C.cyanEdge, 0.36 * a);
    p.strokeWeight(0.6);
    p.rect(WB.x0, y - WB.h / 2, width, WB.h, 2);

    // 权重填充：句点那条是琥珀，其余青蓝。
    if (warm > 0.04) {
      fillHex(p, C.ember, 0.07 * a * warm);
      p.rect(WB.x0 - 2, y - WB.h / 2 - 2.5, fillW + 4, WB.h + 5, 3);
    }
    p.noStroke();
    fillHex(
      p,
      warm > 0.3 ? C.emberHot : C.cyan,
      (0.28 + Math.min(1, w * 3.2) * 0.55) * a * (i === PERIOD_INDEX ? 1 : 1 - 0.35 * lock)
    );
    p.rect(WB.x0, y - WB.h / 2, fillW, WB.h, 2);

    // token 小符号 + 与条连接的细线。
    drawTokenGlyph(
      p,
      token,
      WB.labelX,
      y,
      8,
      (0.36 + Math.min(1, w * 4) * 0.4) * a * (1 - 0.35 * lock * (i === PERIOD_INDEX ? 0 : 1)),
      warm > 0.3 ? C.emberCore : C.cyan
    );
    strokeHex(p, warm > 0.3 ? C.emberHot : C.cyanDim, 0.2 * a);
    p.strokeWeight(0.7);
    p.line(WB.labelX + 7, y, WB.x0 - 3, y);

    // 99% 只在高光时写出来，不写解释句。
    if (i === PERIOD_INDEX && lock > 0.55) {
      p.noStroke();
      p.textAlign(p.RIGHT, p.CENTER);
      p.textSize(7.5);
      p.textStyle(p.BOLD);
      fillHex(p, C.bgDeep, 0.92 * a * smoothstep(0.55, 0.8, lock));
      p.text('99%', WB.x1 - 4, y + 0.5);
      p.textStyle(p.NORMAL);
    }
  }

  p.pop();
}

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 190;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, '#dff4ff', 0.62 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.cream, 0.3 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1.5, w - 4, 1.2, 1);
  p.noFill();
  strokeHex(p, C.cyan, 0.5 * alpha);
  p.strokeWeight(0.9);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

// ---------- token 序列带 / 路 ----------

function drawBand(p, t) {
  const exit = smoothstep(4.05, 5.35, t);
  const widen = 7 * exit;
  const top = ROAD_TOP - widen;
  const bottom = ROAD_BOTTOM + widen;
  const height = bottom - top;

  p.push();
  p.noStroke();

  // 覆盖默认路面带 y=470..530，并保持 y=500 的中心线。
  fillHex(p, '#040914', 1);
  p.rect(0, top, 1000, height);
  fillHex(p, '#071124', 1);
  p.rect(0, top + 2.5, 1000, height - 5);
  fillHex(p, '#0a1830', 0.96);
  p.rect(0, ROAD_MID - 17, 1000, 34);
  fillHex(p, C.cyan, 0.022);
  p.rect(0, ROAD_MID - 14, 1000, 28);
  fillHex(p, C.bgDeep, 0.94);
  p.rect(0, top, 1000, 3);
  p.rect(0, bottom - 3, 1000, 3);

  strokeHex(p, C.cyan, 0.25);
  p.strokeWeight(1);
  p.line(0, top + 3, 1000, top + 3);
  p.line(0, bottom - 3.5, 1000, bottom - 3.5);
  strokeHex(p, C.soft, 0.4);
  p.strokeWeight(0.8);
  p.line(0, top + 5.5, 1000, top + 5.5);
  p.line(0, bottom - 6, 1000, bottom - 6);

  // 并行细线：token 序列带的触面。
  for (let k = 0; k < 6; k++) {
    const y = top + 11 + (k * (height - 22)) / 5;
    const center = k === 2 || k === 3;
    strokeHex(p, k % 3 === 0 ? C.cyanDim : C.cyan, center ? 0.12 : 0.06);
    p.strokeWeight(center ? 1 : 0.7);
    p.line(0, y, 1000, y);
  }
  strokeHex(p, C.cream, 0.045);
  p.strokeWeight(0.7);
  p.line(0, ROAD_MID + 0.5, 1000, ROAD_MID + 0.5);

  // 位置刻度。
  for (let x = 0; x <= 1000; x += 25) {
    const major = x % 100 === 0;
    strokeHex(p, C.cyan, major ? 0.13 : 0.055);
    p.strokeWeight(0.7);
    p.line(x, top + 4, x, top + (major ? 11 : 8));
    p.line(x, bottom - 4, x, bottom - (major ? 11 : 8));
  }

  // 左侧从第 13 版块张量带收进来的入口薄带。
  const entry = 1 - smoothstep(4.0, 5.0, t) * 0.6;
  p.noFill();
  for (let k = 0; k < 5; k++) {
    const y0 = 474 + k * 14;
    const y1 = 481 + k * 7.5;
    strokeHex(p, k === 2 ? C.cyan : C.cyanDim, (0.13 - Math.abs(k - 2) * 0.018) * entry);
    p.strokeWeight(k === 2 ? 1.1 : 0.8);
    p.beginShape();
    p.vertex(-40, y0 - 6);
    p.vertex(12, y0 - 2);
    p.vertex(70, y1);
    p.vertex(148, y1);
    p.endShape();
  }
  strokeHex(p, C.cyan, 0.12 * entry);
  p.strokeWeight(0.9);
  p.line(112, top + 6, 112, bottom - 6);
  for (let k = -2; k <= 2; k++) {
    p.line(108, ROAD_MID + k * 8, 116, ROAD_MID + k * 8);
  }

  // token 槽位（卡片下面的一层凹槽）。
  for (let i = 0; i < TOKEN_COUNT; i++) {
    const x = TOKENS[i].x;
    p.noStroke();
    fillHex(p, C.bgDeep, 0.55);
    p.rect(x - 27, ROAD_MID - 19, 54, 38, 5);
    p.noFill();
    strokeHex(p, i === PERIOD_INDEX ? C.ember : C.cyan, i === PERIOD_INDEX ? 0.1 : 0.08);
    p.strokeWeight(0.7);
    p.rect(x - 27, ROAD_MID - 19, 54, 38, 5);
  }

  // token 卡本体（在 drawRoad 里画，避免被带面覆盖）。
  for (let i = 0; i < TOKEN_COUNT; i++) {
    drawTokenCard(p, TOKENS[i], i, t);
  }

  // 位置编号，保持很小的字号，不成为长文本。
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(6.5);
  const lock = attentionLock(t);
  for (let i = 0; i < TOKEN_COUNT; i++) {
    fillHex(p, i === PERIOD_INDEX && lock > 0.3 ? C.emberHot : C.cyanDim, 0.2 + (i === PERIOD_INDEX ? lock * 0.16 : 0));
    p.text(String(i + 1).padStart(2, '0'), TOKENS[i].x, bottom - 7.5);
  }

  // 右端：序列带开始变成第 15 版块的参数传送带。
  if (exit > 0.01) {
    p.noFill();
    for (let k = 0; k < 2; k++) {
      const x = 948 + k * 34;
      strokeHex(p, k === 1 ? C.emberHot : C.amber, (0.1 + k * 0.03) * exit);
      p.strokeWeight(k === 1 ? 1.3 : 0.9);
      p.line(x, top + 6, x, bottom - 6);
      p.line(x - 4, top + 6, x + 4, top + 6);
      p.line(x - 4, bottom - 6, x + 4, bottom - 6);
    }
    p.noStroke();
    for (let k = 0; k < 2; k++) {
      fillHex(p, k === 1 ? C.ember : C.amber, 0.07 * exit);
      p.rect(942 + k * 34, top + 8, 13, height - 16, 2);
    }
    strokeHex(p, C.cream, 0.08 * exit);
    p.strokeWeight(0.8);
    for (let k = 0; k < 4; k++) {
      p.line(860 + k * 32, bottom - 10, 876 + k * 32, bottom - 10);
    }
  }

  p.pop();
}

// ---------- 主角：query token / 注意力头 ----------

function quadPoint(u, sx, sy, cx, cy, tx, ty) {
  const v = 1 - u;
  return {
    x: v * v * sx + 2 * v * u * cx + u * u * tx,
    y: v * v * sy + 2 * v * u * cy + u * u * ty
  };
}

function strokeBeam(p, sx, sy, cx, cy, tx, ty, color, alpha, weight) {
  if (alpha <= 0.003) return;
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (let k = 0; k <= 14; k++) {
    const pt = quadPoint(k / 14, sx, sy, cx, cy, tx, ty);
    p.vertex(pt.x, pt.y);
  }
  p.endShape();
}

function drawQueryActor(p, rawT, state) {
  const t = clamp(rawT, 0, 6);
  const hold = Math.min(t, 3);
  const lock = attentionLock(t);
  const weights = PRE_W.map((pre, i) => pre * (1 - lock) + POST_W[i] * lock);
  const appear = smoothstep(0, 0.42, t);
  const release = smoothstep(4.0, 4.78, t);
  const exit = smoothstep(4.05, 5.6, t);
  const pinned = smoothstep(2.48, 2.8, hold) * (1 - smoothstep(3.95, 4.65, t));
  const flash = smoothstep(2.86, 3.0, hold) * (1 - smoothstep(3.15, 3.45, hold));
  const cardA = appear * (1 - 0.65 * exit);
  if (cardA <= 0.003) return;

  // 世界 x 直接来自 state.x；只有计算“最近 token”时才用局部 x。
  const origin = (state.blockIndex - 1) * 1000;
  const localX = state.x - origin;
  const periodX = origin + TOKENS[PERIOD_INDEX].x;
  const bob = Math.sin(hold * Math.PI * 2) * 1.3 * (1 - pinned);
  const cardY = 452 + bob;
  const rot = -0.018 + Math.sin(hold * 7.5) * 0.008 + pinned * (-0.14 + Math.sin(hold * 17) * 0.012);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  // 停靠槽位：找离 query 最近的 token，靠近时亮起青色槽环。
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < TOKEN_COUNT; i++) {
    const d = Math.abs(localX - TOKENS[i].x);
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  const park = 1 - smoothstep(10, 27, best);
  const parkA = park * appear * (1 - exit);
  if (parkA > 0.01) {
    p.push();
    p.translate(origin + TOKENS[nearest].x, ROAD_MID);
    p.noFill();
    strokeHex(p, C.cyan, 0.34 * parkA);
    p.strokeWeight(1.2);
    p.rect(-25.5, -19.5, 51, 39, 5);
    strokeHex(p, C.cream, 0.26 * parkA);
    p.strokeWeight(0.8);
    for (const sx of [-1, 1]) {
      p.line(sx * 30, -8, sx * 30, 8);
      p.line(sx * 20, -24, sx * 24, -24);
      p.line(sx * 20, 24, sx * 24, 24);
    }
    p.noStroke();
    fillHex(p, C.cyan, 0.04 * parkA);
    p.rect(-29, -23, 58, 46, 7);
    p.pop();
  }

  // 注意力光束：8 条，从卡片边缘展开，最后全部收束到句点。
  const starts = [
    [27, -12],
    [27, -5],
    [27, 2],
    [27, 9],
    [20, 15],
    [10, 18],
    [-4, 18],
    [-18, 14]
  ];
  let mainBeam = null;

  for (let i = 0; i < TOKEN_COUNT; i++) {
    const spread = smoothstep(0.9 + i * 0.1, 1.3 + i * 0.1, hold) * appear;
    const startLocal = starts[i];
    const sx = state.x + cosR * startLocal[0] - sinR * startLocal[1];
    const sy = cardY + sinR * startLocal[0] + cosR * startLocal[1];

    const rawTargetX = origin + TOKENS[i].x;
    const scanX = rawTargetX + (periodX - rawTargetX) * lock;
    const scanY = ROAD_MID;
    const tx = scanX + (state.x - scanX) * release * 0.9;
    const ty = scanY + (cardY - scanY) * release * 0.9;

    const mx = (sx + tx) * 0.5;
    const my = (sy + ty) * 0.5;
    const bow = 11 + (i % 5) * 3.4 + (i === PERIOD_INDEX ? 7 : 0);
    const cx = mx + (i - 3.5) * 2.2 * (1 - lock);
    const cy = my - bow;

    // 线宽/亮度直接对应 softmax 权重；高光时其余 7 条变细但依然钉住句点。
    const w = weights[i];
    const gate = Math.max(spread * (1 - lock * 0.35), lock * 0.92);
    const alpha = (0.07 + Math.sqrt(w) * 0.36) * gate * appear * (1 - 0.72 * release);
    const lineW =
      (0.65 + Math.sqrt(w) * 1.6) * (0.92 + 0.16 * hash2(i, 43, 1414));

    if (i === PERIOD_INDEX) mainBeam = { sx, sy, cx, cy, tx, ty };

    if (i === PERIOD_INDEX) {
      strokeBeam(p, sx, sy, cx, cy, tx, ty, C.ember, alpha * 0.22, lineW + 5.5);
      strokeBeam(p, sx, sy, cx, cy, tx, ty, C.emberHot, alpha * 0.35, lineW + 2.5);
    }
    strokeBeam(
      p,
      sx,
      sy,
      cx,
      cy,
      tx,
      ty,
      i === PERIOD_INDEX ? C.emberHot : C.cyan,
      alpha,
      lineW
    );

    // 扫视阶段的落点小光点；锁定后由句点的大光斑接管。
    if (spread > 0.02 && lock < 0.9) {
      p.noStroke();
      fillHex(p, C.cyan, 0.16 * spread * (1 - lock) * appear);
      p.ellipse(tx, ty, 3.2, 2.2);
    }
  }

  // 句点上的锁定光斑：环 + 核心 + 四向短线。
  if (lock > 0.02) {
    const targetY = ROAD_MID + (cardY - ROAD_MID) * release * 0.9;
    const lx = periodX + (state.x - periodX) * release * 0.9;
    p.noStroke();
    fillHex(p, C.ember, 0.07 * lock * appear);
    p.ellipse(lx, targetY, 54, 26);
    fillHex(p, C.emberHot, 0.1 * lock * appear);
    p.ellipse(lx, targetY, 28, 14);
    fillHex(p, C.emberCore, 0.85 * lock * appear);
    p.ellipse(lx, targetY, 4.5, 4);
    p.noFill();
    strokeHex(p, C.emberHot, 0.35 * lock * appear);
    p.strokeWeight(0.9);
    p.ellipse(lx, targetY, 18, 9);
    strokeHex(p, C.cream, 0.22 * lock * appear);
    p.strokeWeight(0.7);
    p.line(lx - 13, targetY, lx - 7, targetY);
    p.line(lx + 7, targetY, lx + 13, targetY);
    p.line(lx, targetY - 8, lx, targetY - 4.5);
    p.line(lx, targetY + 4.5, lx, targetY + 8);
  }

  // 光尘被句点吸过去：确定性相位，不是随机粒子。
  if (mainBeam && lock > 0.05 && release < 0.95) {
    p.noStroke();
    for (let k = 0; k < 6; k++) {
      const u = (hold * 0.55 + k * 0.168) % 1;
      const pt = quadPoint(u, mainBeam.sx, mainBeam.sy, mainBeam.cx, mainBeam.cy, mainBeam.tx, mainBeam.ty);
      const jitter = (hash2(k, 81, 1414) - 0.5) * 6;
      fillHex(p, k % 2 === 0 ? C.emberHot : C.cyan, 0.2 * (1 - u) * lock * appear);
      p.ellipse(pt.x, pt.y + jitter, 1.3 + u * 1.4, 1.3 + u * 1.4);
    }
  }

  // 离场时收成一束右向参数线（不画第 15 版块内容）。
  if (release > 0.02) {
    const len = 62 * release * (1 - 0.35 * release);
    strokeHex(p, C.emberHot, 0.18 * release * appear);
    p.strokeWeight(1.5);
    p.line(state.x + 26, cardY, state.x + 26 + len, cardY);
    p.noStroke();
    fillHex(p, C.emberHot, 0.26 * release * appear);
    p.triangle(state.x + 26 + len, cardY, state.x + 20 + len, cardY - 3, state.x + 20 + len, cardY + 3);
  }

  // query 卡本体。
  const scale = (0.78 + 0.22 * appear) * (1 - 0.78 * exit);
  p.push();
  p.translate(state.x, cardY);
  p.rotate(rot);
  p.scale(scale);

  // 三棱薄片的侧边与光晕。
  p.noStroke();
  fillHex(p, C.cyan, 0.05 * cardA);
  p.triangle(20, -16, 35, -8, 20, 16);
  strokeHex(p, C.cyan, 0.2 * cardA);
  p.strokeWeight(0.8);
  p.line(20, -16, 35, -8);
  p.line(35, -8, 20, 16);

  fillHex(p, C.cyan, 0.035 * cardA);
  p.rect(-33, -25, 66, 50, 8);
  fillHex(p, C.ember, (0.025 + 0.04 * lock) * cardA);
  p.ellipse(0, 4, 38, 24);

  // 卡片主体。
  fillHex(p, C.bgDeep, 0.5 * cardA);
  p.rect(-26, -16.5, 56, 40, 5);
  fillHex(p, C.cyanEdge, 0.85 * cardA);
  p.rect(-28, -20, 56, 40, 5);
  fillHex(p, '#0a1732', 0.98 * cardA);
  p.rect(-26, -18, 52, 36, 4);
  fillHex(p, C.cyan, 0.04 * cardA);
  p.rect(-24, -16, 48, 13, 2);

  p.noFill();
  strokeHex(p, lock > 0.5 ? C.emberHot : C.cyan, (0.62 + 0.15 * lock) * cardA);
  p.strokeWeight(1.3);
  p.rect(-28, -20, 56, 40, 5);
  strokeHex(p, C.cyanDim, 0.3 * cardA);
  p.strokeWeight(0.7);
  p.rect(-25.4, -17.4, 50.8, 34.8, 3);

  // 正面 Q 与小箭头。
  p.noStroke();
  p.textFont('monospace');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(10);
  fillHex(p, C.cyan, 0.92 * cardA);
  p.text('Q', -23, -11);
  p.textStyle(p.NORMAL);
  strokeHex(p, C.cream, 0.6 * cardA);
  p.strokeWeight(0.9);
  p.line(8, -11, 19, -11);
  p.line(19, -11, 15, -14);
  p.line(19, -11, 15, -8);

  // 中心暖赭火种：与第 13 版块是同一颗。
  p.noStroke();
  fillHex(p, C.bgDeep, 0.95 * cardA);
  p.ellipse(0, 4, 18, 18);
  fillHex(p, C.ember, 0.32 * cardA);
  p.ellipse(0, 4, 15, 15);
  fillHex(p, C.emberHot, 0.95 * cardA);
  p.ellipse(-0.6, 3.5, 8, 9);
  fillHex(p, C.emberCore, 0.96 * cardA);
  p.ellipse(-1.2, 2.6, 3.2, 3.6);
  p.noFill();
  strokeHex(p, C.emberHot, 0.32 * cardA);
  p.strokeWeight(0.8);
  p.ellipse(0, 4, 22, 22);

  if (flash > 0.02) {
    p.noStroke();
    fillHex(p, C.emberHot, 0.07 * flash * cardA);
    p.ellipse(0, 4, 46, 46);
    fillHex(p, C.emberCore, 0.12 * flash * cardA);
    p.ellipse(0, 4, 28, 28);
    p.noFill();
    strokeHex(p, C.emberCore, 0.4 * flash * cardA);
    p.strokeWeight(1);
    p.ellipse(0, 4, 24 + flash * 4, 24 + flash * 4);
  }

  // 四角小刻度。
  p.noStroke();
  fillHex(p, C.cream, 0.4 * cardA);
  for (const [dx, dy] of [
    [-24, -16],
    [24, -16],
    [-24, 16],
    [24, 16]
  ]) {
    p.ellipse(dx, dy, 1.6, 1.6);
  }

  // 接触脚：卡片下沿对准 band 上沿。
  strokeHex(p, C.cyan, 0.35 * cardA);
  p.strokeWeight(1);
  p.line(0, 20, 0, 27);
  p.noStroke();
  fillHex(p, C.emberHot, 0.72 * cardA);
  p.ellipse(0, 27.5, 3.2, 1.6);

  p.pop();
}

// ---------- 导出 ----------

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();

    drawSpace(p, t);
    drawQKV(p, t);
    drawWeightBars(p, t);

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
    drawBand(p, t);
    p.pop();
  },

  drawActor(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    drawQueryActor(p, t, state);
    p.pop();
  }
};
