import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 18 Agent 与长程任务：深蓝工作空间 + 环形 Agent 轨道 + 工具带 + 记忆架 + 待办清单。
// 静态重点：localT≈1.5（标题、工具带、环的左弧、记忆架/待办开始进场）
// 与 localT≈3.0（工具失败→重试、记忆亮、上下文变长、待办勾选、环闭合、完成脉冲、火种闪）。
const TAU = Math.PI * 2;
const ROAD_TOP = 466;
const ROAD_BOTTOM = 534;
const ROAD_MID = 500;

// 环略扁，底弧压进 y≈500 的工具带；闭合口在左下，正好接主角。
const RING = { cx: 672, cy: 378, rx: 186, ry: 128, gap: 2.13 };
const TOOL_ANGLES = [2.5, 2.98, 3.48, 4.06, 4.66, 5.3, 5.85];
const MEM = { x: 884, y: 258, w: 92, h: 206 };
const TODO = { x: 484, y: 596, w: 300, h: 140 };
const BITS = '01011010010110100101101001011010';

const META = {
  id: 18,
  cn: 'Agent 与长程任务',
  en: 'Agents & Long-Horizon Tasks',
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
  faceTop: '#14284f',
  faceLow: '#081226',
  navy: '#1a2750',
  navyLight: '#263b70',
  navyDeep: '#101c3a',
  line: '#2c4380',
  edge: '#3a57a0',
  steel: '#8ba3c7',
  steelDark: '#445a7a',
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
  mint: '#7fe0c0',
  red: '#c05a46',
  redDim: '#72372b',
  violet: '#9d8cff'
};

// 固定的工作空间尘埃与上下文微粒，全部由固定种子预生成。
const DUST = (() => {
  const rng = mulberry32(0x18a9e7);
  const list = [];
  for (let i = 0; i < 76; i++) {
    list.push({
      x: rng() * 1000,
      y: 224 + rng() * 548,
      r: 0.5 + rng() * 1.6,
      a: 0.015 + rng() * 0.045,
      warm: rng() > 0.86
    });
  }
  return list;
})();

const CTX_PTS = [
  [-24, 278],
  [60, 252],
  [140, 242],
  [226, 250],
  [312, 262],
  [398, 254],
  [484, 238],
  [566, 230],
  [644, 236],
  [720, 245],
  [792, 252],
  [884, 270]
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

function ringPoint(theta, out = 0) {
  return [
    RING.cx + (RING.rx + out) * Math.cos(theta),
    RING.cy + (RING.ry + out) * Math.sin(theta)
  ];
}

// 只用采样点折线画弧，避开 p5 2.x 的 bezierVertex/curveVertex 空内部点问题。
function drawArcLine(p, a0, a1, out, color, alpha, weight, steps = 96) {
  if (a1 <= a0 || alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const [x, y] = ringPoint(a, out);
    p.vertex(x, y);
  }
  p.endShape();
  p.pop();
}

function partialPolyline(points, progress) {
  if (progress <= 0.001) return [];
  const n = points.length - 1;
  const u = clamp(progress, 0, 1) * n;
  const full = Math.floor(u);
  const out = [];
  for (let i = 0; i <= full; i++) out.push(points[i]);
  if (full < n) {
    const f = u - full;
    const [x0, y0] = points[full];
    const [x1, y1] = points[full + 1];
    out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
  }
  return out;
}

function drawPolyline(p, pts, color, alpha, weight, closed = false) {
  if (pts.length < 2 || alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  for (const [x, y] of pts) p.vertex(x, y);
  if (closed) p.endShape(p.CLOSE);
  else p.endShape();
  p.pop();
}

function drawCheck(p, x, y, size, progress, alpha, color) {
  if (progress <= 0.002 || alpha <= 0.002) return;
  const q = clamp(progress, 0, 1);
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(1.4);
  p.strokeCap(p.ROUND);
  if (q < 0.48) {
    const f = q / 0.48;
    p.line(x - size * 0.48, y, x - size * 0.48 + size * 0.36 * f, y + size * 0.34 * f);
  } else {
    p.line(x - size * 0.48, y, x - size * 0.12, y + size * 0.34);
    const f = (q - 0.48) / 0.52;
    p.line(
      x - size * 0.12,
      y + size * 0.34,
      x - size * 0.12 + size * 0.66 * f,
      y + size * 0.34 - size * 0.72 * f
    );
  }
  p.strokeCap(p.SQUARE);
  p.pop();
}

function drawCross(p, x, y, size, alpha, color) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(1.5);
  p.strokeCap(p.ROUND);
  p.line(x - size * 0.38, y - size * 0.38, x + size * 0.38, y + size * 0.38);
  p.line(x + size * 0.38, y - size * 0.38, x - size * 0.38, y + size * 0.38);
  p.strokeCap(p.SQUARE);
  p.pop();
}

// ---------- 背景 ----------

function drawBackground(p, t) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  fillHex(p, C.navy, 0.2);
  p.rect(0, 222, 1000, 356);
  fillHex(p, C.bgLow, 0.62);
  p.rect(0, 566, 1000, 230);

  linearWash(
    p,
    0,
    210,
    0,
    790,
    [
      [0, 'rgba(2,5,13,0.44)'],
      [0.22, 'rgba(3,8,20,0.05)'],
      [0.58, 'rgba(0,0,0,0)'],
      [0.84, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.56)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 很淡的工作台网格，只做空间感，不做产品界面。
  p.push();
  p.strokeWeight(0.7);
  for (let x = 466; x <= 1000; x += 42) {
    strokeHex(p, C.navyLight, x % 126 === 88 ? 0.09 : 0.04);
    p.line(x, 232, x, 772);
  }
  for (let y = 242; y <= 772; y += 42) {
    strokeHex(p, C.navyLight, y % 126 === 74 ? 0.075 : 0.035);
    p.line(456, y, 1000, y);
  }
  strokeHex(p, C.line, 0.1);
  p.strokeWeight(1);
  p.line(0, 232, 912, 232);
  p.line(0, 572, 1000, 572);
  p.pop();

  // 高环绕行轨迹的余光。
  p.noStroke();
  fillHex(p, C.cyan, 0.024);
  p.ellipse(RING.cx, RING.cy, 552, 360);
  fillHex(p, C.navyLight, 0.055);
  p.ellipse(RING.cx, RING.cy, 438, 302);
  fillHex(p, C.ember, 0.012);
  p.ellipse(566, 496, 292, 86);
  fillHex(p, C.cyan, 0.01);
  p.ellipse(520, 664, 330, 150);

  // 远处的工具影子，只做剪影，不出现品牌。
  p.push();
  p.translate(136, 688);
  p.rotate(-0.48);
  p.scale(1.9);
  drawToolGlyph(p, 0, 0.028, C.steel);
  p.pop();
  p.push();
  p.translate(954, 664);
  p.rotate(0.62);
  p.scale(1.55);
  drawToolGlyph(p, 1, 0.025, C.steel);
  p.pop();

  // 尘埃与上下文微粒。
  for (const d of DUST) {
    fillHex(p, d.warm ? C.creamDim : C.cyanSoft, d.a);
    p.ellipse(d.x, d.y, d.r, d.r);
  }
  p.pop();
}

// ---------- 长上下文 ----------

function drawContextRibbon(p, t) {
  const hold = Math.min(t, 3);
  const grow = smoothstep(0.35, 2.35, hold);
  const memLit = smoothstep(2.5, 2.88, hold);
  const fade = 1 - 0.62 * smoothstep(4.15, 5.55, t);
  const pts = partialPolyline(CTX_PTS, grow);
  if (pts.length < 2) return;

  p.push();
  // 上下两条边 + 一条亮芯，读成一条很长的纸带。
  for (const [dy, color, alpha, weight] of [
    [-4.2, C.cyanDim, 0.14, 1.3],
    [4.2, C.cyanDim, 0.1, 1.1],
    [0, C.cyan, 0.34, 0.9]
  ]) {
    const shifted = pts.map(([x, y]) => [x, y + dy * (1 + 0.12 * Math.sin(x * 0.018))]);
    drawPolyline(p, shifted, color, alpha * fade, weight);
  }

  // 窄带里的刻度和上下文小点。
  p.noFill();
  for (let i = 0; i < 28; i++) {
    const a = i / 28;
    if (a > grow) break;
    const q = partialPolyline(CTX_PTS, a + 0.001);
    const pt = q[q.length - 1];
    if (!pt) continue;
    const warm = memLit > 0.2 && a > 0.78;
    strokeHex(p, warm ? C.emberHot : C.cyan, (0.12 + 0.2 * hash2(i, 7)) * fade);
    p.strokeWeight(0.7);
    p.line(pt[0], pt[1] - 4, pt[0], pt[1] + 4);
    if (i % 4 === 0) {
      fillHex(p, warm ? C.ember : C.cyanSoft, (0.22 + 0.2 * hash2(i, 9)) * fade);
      p.ellipse(pt[0], pt[1], 2.2, 2.2);
    }
  }
  p.pop();

  // 记忆卡亮起后，上下文又绕上轨道外圈一段。
  const wrap = smoothstep(2.55, 2.96, hold);
  if (wrap > 0.002) {
    const a0 = 5.38;
    const a1 = a0 + 3.55 * wrap;
    const fade2 = fade * (0.65 + 0.35 * (1 - smoothstep(4.6, 5.6, t)));
    drawArcLine(p, a0, a1, 17, C.ember, 0.12 * fade2, 4.5, 84);
    drawArcLine(p, a0, a1, 17, C.cream, 0.32 * fade2, 1, 84);
    for (let k = 0; k < 9; k++) {
      const a = a0 + (a1 - a0) * (k / 9);
      const [x, y] = ringPoint(a, 17);
      p.noStroke();
      fillHex(p, k % 3 === 0 ? C.emberHot : C.cyanSoft, 0.36 * fade2);
      p.ellipse(x, y, 2.2, 2.2);
    }
  }
}

// ---------- 记忆架 ----------

function drawMemoryGlyph(p, i, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, i === 2 ? C.emberHot : C.cyanSoft, alpha);
  p.strokeWeight(0.85);
  if (i % 5 === 0) {
    p.ellipse(0, 0, 7, 7);
    p.line(-1.5, 0, 1.5, 0);
  } else if (i % 5 === 1) {
    p.line(-4, -3, 4, -3);
    p.line(-3, 0, 3, 0);
    p.line(-1.5, 3, 1.5, 3);
  } else if (i % 5 === 2) {
    p.triangle(-4, 3, 0, -4, 4, 3);
    p.line(-2, 3, 2, 3);
  } else if (i % 5 === 3) {
    p.rect(-4, -3, 8, 6, 1);
    p.line(-4, 0, 4, 0);
  } else {
    p.ellipse(0, 0, 8, 8);
    p.line(0, 0, 4, 0);
  }
  p.pop();
}

function drawMemoryShelf(p, t) {
  const reveal = smoothstep(1.18, 1.74, t);
  if (reveal <= 0.002) return;
  const lit = smoothstep(2.48, 2.86, t);
  const fade = 1 - 0.72 * smoothstep(4.2, 5.6, t);

  // 环上沿的薄记忆架，在 localT 1.5 也能先露一截。
  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.42 * reveal * fade);
  p.rect(694, 237, 186, 20, 2);
  fillHex(p, C.panel, 0.84 * reveal * fade);
  p.rect(696, 239, 182, 17, 1.5);
  for (let i = 0; i < 5; i++) {
    const x = 701 + i * 34;
    fillHex(p, C.bgLow, 0.9 * reveal * fade);
    p.rect(x, 242, 28, 11, 1);
    p.noFill();
    strokeHex(p, i === 2 ? C.ember : C.cyanDim, (0.22 + (i === 2 ? lit * 0.45 : 0)) * reveal * fade);
    p.strokeWeight(0.7);
    p.rect(x, 242, 28, 11, 1);
    p.noStroke();
    fillHex(p, i === 2 ? C.emberHot : C.cyanSoft, (0.12 + 0.16 * hash2(i, 14)) * reveal * fade);
    p.rect(x + 4, 245, 10 + hash2(i, 15) * 8, 1);
    p.rect(x + 4, 248, 6 + hash2(i, 16) * 5, 1);
  }
  p.pop();

  p.push();
  const x = MEM.x;
  const y = MEM.y;
  const w = MEM.w;
  const h = MEM.h;
  p.noStroke();
  fillHex(p, C.bgDeep, 0.52 * reveal * fade);
  p.rect(x + 5, y + 6, w, h, 4);
  fillHex(p, C.panel, 0.95 * reveal * fade);
  p.rect(x, y, w, h, 4);
  fillHex(p, C.bgLow, 0.97 * reveal * fade);
  p.rect(x + 3, y + 3, w - 6, h - 6, 3);

  // 顶栏与侧轨。
  fillHex(p, C.navyDeep, 0.92 * reveal * fade);
  p.rect(x + 9, y + 7, w - 18, 16, 2);
  for (let i = 0; i < 5; i++) {
    fillHex(p, i === 2 ? C.amber : C.cyan, (0.18 + hash2(i, 21) * 0.2) * reveal * fade);
    p.rect(x + 15 + i * 8, y + 13, 3.6, 1.5, 0.5);
  }
  fillHex(p, C.navyDeep, 0.95 * reveal * fade);
  p.rect(x + 5, y + 28, 3, h - 36);
  p.rect(x + w - 8, y + 28, 3, h - 36);

  // 五层记忆抽屉。只放抽象符号与短编号。
  for (let i = 0; i < 5; i++) {
    const dy = y + 30 + i * 33;
    const active = i === 2;
    const slide = active ? 9 * lit : 0;
    const a = reveal * fade;
    fillHex(p, C.panelLight, 0.54 * a);
    p.rect(x + 11, dy, w - 24, 27, 1.5);
    fillHex(p, C.bgLow, 0.9 * a);
    p.rect(x + 13, dy + 2, w - 28, 23, 1);
    p.noFill();
    strokeHex(p, active ? C.ember : C.line, (active ? 0.52 + 0.3 * lit : 0.3) * a);
    p.strokeWeight(0.8);
    p.rect(x + 13, dy + 2, w - 28, 23, 1);

    p.push();
    p.translate(x + 27 - slide, dy + 13.5);
    drawMemoryGlyph(p, i, (active ? 0.6 + 0.35 * lit : 0.26) * a);
    p.pop();

    p.noStroke();
    for (let k = 0; k < 3; k++) {
      fillHex(
        p,
        active && lit > 0.2 ? C.emberHot : C.cyanSoft,
        (active ? 0.2 + 0.26 * lit : 0.12) * a
      );
      p.rect(x + 43 - slide, dy + 8 + k * 5, 16 + hash2(i, k + 25) * 15, 1.2);
    }
    p.textFont('monospace');
    p.textAlign(p.RIGHT, p.CENTER);
    p.textSize(5.2);
    fillHex(p, C.creamDim, 0.34 * a);
    p.text(String(i + 1).padStart(2, '0'), x + w - 14, dy + 15);

    if (active && lit > 0.02) {
      // 抽屉被拉开的一小段，带暖琥珀完成/记忆信号。
      p.noStroke();
      fillHex(p, C.ember, 0.07 * lit * a);
      p.ellipse(x + 26, dy + 14, 64, 28);
      fillHex(p, C.emberHot, (0.24 + 0.3 * lit) * a);
      p.rect(x + 14 - slide, dy + 22, w - 30, 1.2);
      fillHex(p, C.ember, 0.36 * lit * a);
      p.rect(x + 14 - slide, dy + 23, w - 34, 2.4);
    }
  }

  // 螺钉与底部支撑。
  p.noStroke();
  for (const [sx, sy] of [
    [x + 9, y + 9],
    [x + w - 9, y + 9],
    [x + 9, y + h - 9],
    [x + w - 9, y + h - 9]
  ]) {
    fillHex(p, C.navyDeep, 0.9 * reveal * fade);
    p.ellipse(sx, sy, 3.8, 3.8);
    fillHex(p, C.cyanSoft, 0.2 * reveal * fade);
    p.ellipse(sx - 0.5, sy - 0.5, 1.3, 1.3);
  }
  fillHex(p, C.bgDeep, 0.7 * reveal * fade);
  p.rect(x + 10, y + h, 18, 4, 1);
  p.rect(x + w - 28, y + h, 18, 4, 1);

  // 环与记忆架之间的两根短信号线。
  p.noFill();
  strokeHex(p, lit > 0.05 ? C.ember : C.cyanDim, (0.18 + 0.25 * lit) * reveal * fade);
  p.strokeWeight(0.8);
  p.line(851, 318, x, 320);
  p.line(851, 338, x, 341);

  p.pop();
}

// ---------- 待办清单 ----------

function drawTodo(p, t) {
  const reveal = smoothstep(1.12, 1.72, t);
  if (reveal <= 0.002) return;
  const hold = Math.min(t, 3);
  const rise = (1 - reveal) * 16;
  const paperW = 288 + 16 * smoothstep(2.3, 2.9, hold);
  const paperH = 128;
  const fade = 1 - 0.6 * smoothstep(4.2, 5.6, t);

  p.push();
  p.translate(TODO.x, TODO.y + rise);
  p.rotate(-0.014);
  p.noStroke();

  // 影子与纸面。
  fillHex(p, C.bgDeep, 0.46 * reveal * fade);
  p.rect(6, 8, paperW, paperH, 3);
  fillHex(p, C.cream, 0.84 * reveal * fade);
  p.rect(0, 0, paperW, paperH, 2.5);
  fillHex(p, C.ink, 0.17 * reveal * fade);
  p.rect(2, 2, paperW - 4, 9, 1);
  fillHex(p, C.navy, 0.11 * reveal * fade);
  p.rect(0, paperH - 8, paperW, 8, 1.5);

  // 顶部条：进度格与折角。
  fillHex(p, C.navyDeep, 0.86 * reveal * fade);
  p.rect(0, 0, paperW, 19, 2);
  for (let i = 0; i < 8; i++) {
    fillHex(p, i < 5 ? C.amber : C.navyLight, (i < 5 ? 0.66 : 0.55) * reveal * fade);
    p.rect(13 + i * 16, 8, 8, 3, 1);
  }
  fillHex(p, C.creamDim, 0.45 * reveal * fade);
  p.triangle(paperW - 17, 0, paperW, 0, paperW, 17);
  fillHex(p, C.navyDeep, 0.8 * reveal * fade);
  p.triangle(paperW - 15, 2, paperW - 2, 2, paperW - 2, 15);

  // 左边距刻线与 5 条待办行。
  p.push();
  p.noFill();
  strokeHex(p, C.amber, 0.22 * reveal * fade);
  p.strokeWeight(0.8);
  p.line(30, 27, 30, paperH - 16);
  p.pop();

  for (let i = 0; i < 5; i++) {
    const rowIn = smoothstep(1.32 + i * 0.075, 1.62 + i * 0.075, t);
    if (rowIn <= 0.002) continue;
    const y = 36 + i * 18;
    const tickAt = 2.52 + i * 0.085;
    const tick = clamp((hold - tickAt) / 0.13, 0, 1);
    const ticked = tick > 0.65;
    const rowA = rowIn * fade;

    // 复选框
    p.push();
    p.noFill();
    strokeHex(p, ticked ? C.amber : C.redDim, (ticked ? 0.85 : 0.46) * rowA);
    p.strokeWeight(1);
    p.rect(40, y - 4, 9, 9, 1);
    p.pop();

    // 短任务条，不写长文字。
    p.noStroke();
    fillHex(p, ticked ? C.navy : C.steelDark, (ticked ? 0.6 : 0.4) * rowA);
    p.rect(56, y + 1, 72 + hash2(i, 33) * 82, 1.6);
    fillHex(p, C.navy, 0.22 * rowA);
    p.rect(56, y + 5, 32 + hash2(i, 34) * 28, 1);

    // 勾
    drawCheck(p, 44.5, y + 0.5, 9, tick, 0.94 * fade, C.amber);
    if (tick > 0.05) {
      p.push();
      p.noStroke();
      fillHex(p, C.amber, 0.045 * tick * fade);
      p.ellipse(44.5, y - 0.5, 22, 13);
      p.pop();
    }

    // 完成数量刻痕
    p.push();
    p.noFill();
    strokeHex(p, C.creamDim, 0.2 * rowA);
    p.strokeWeight(0.6);
    p.line(32, y + 1, 35, y + 1);
    p.pop();
  }

  // 清单继续变长：一张从右下角继续展开的新纸带，带一个空勾选框和加号。
  const tail = smoothstep(2.82, 2.98, hold) * (1 - smoothstep(4.2, 5.0, t));
  if (tail > 0.002) {
    p.push();
    p.translate(paperW - 76, paperH - 18);
    p.rotate(0.055);
    p.noStroke();
    fillHex(p, C.cream, 0.72 * tail);
    p.rect(0, 0, 92, 19, 1.5);
    fillHex(p, C.navy, 0.12 * tail);
    p.rect(0, 14, 92, 5, 1);
    p.noFill();
    strokeHex(p, C.amber, 0.55 * tail);
    p.strokeWeight(0.9);
    p.rect(8, 4, 10, 10, 1);
    strokeHex(p, C.navy, 0.35 * tail);
    p.line(38, 8, 84, 8);
    p.line(56, 11.5, 74, 11.5);
    strokeHex(p, C.amber, 0.62 * tail);
    p.strokeWeight(1);
    p.line(36, 12, 39, 12);
    p.line(37.5, 10.5, 37.5, 13.5);
    p.pop();
  }

  p.pop();
}

// ---------- 环与工具节点 ----------

function drawToolGlyph(p, i, alpha, tint = C.steel) {
  if (alpha <= 0.002) return;
  const kind = ((i % 8) + 8) % 8;
  p.push();
  p.strokeCap(p.ROUND);
  p.strokeWeight(1.1);
  p.noFill();

  if (kind === 0) {
    // 锤：铜柄 + 钢头
    p.rotate(-0.58);
    strokeHex(p, C.amber, 0.88 * alpha);
    p.line(0, 7, 0, -3.5);
    fillHex(p, tint, 0.34 * alpha);
    strokeHex(p, tint, alpha);
    p.rect(-6.5, -7.2, 13, 4.6, 1);
  } else if (kind === 1) {
    // 扳手：开口剪影
    strokeHex(p, C.creamDim, 0.9 * alpha);
    p.line(-5, 7, 4, -3);
    strokeHex(p, C.steel, alpha);
    p.line(1.5, -5, 5.5, -7);
    p.line(4, -2.5, 7.5, -2.5);
    p.ellipse(-6, 7, 4, 4);
  } else if (kind === 2) {
    // 文件夹
    fillHex(p, C.amber, 0.18 * alpha);
    strokeHex(p, C.creamDim, 0.82 * alpha);
    p.beginShape();
    p.vertex(-7, -4);
    p.vertex(-1, -4);
    p.vertex(1, -6);
    p.vertex(7, -6);
    p.vertex(7, 5);
    p.vertex(-7, 5);
    p.endShape(p.CLOSE);
    p.line(-5, -1, 5, -1);
  } else if (kind === 3) {
    // 终端窗
    fillHex(p, C.cyanDeep, 0.32 * alpha);
    strokeHex(p, tint, 0.85 * alpha);
    p.rect(-7.5, -5.6, 15, 11.2, 1);
    p.line(-7.5, -2.5, 7.5, -2.5);
    strokeHex(p, C.cyan, 0.82 * alpha);
    p.line(-4.5, 0, -2, 2.2);
    p.line(-2, 2.2, -4.5, 4.2);
    p.line(1, 4, 5, 4);
  } else if (kind === 4) {
    // 画笔
    p.rotate(0.62);
    strokeHex(p, C.amber, 0.82 * alpha);
    p.line(0, -6, 0, 2);
    fillHex(p, C.mint, 0.3 * alpha);
    strokeHex(p, C.mint, 0.9 * alpha);
    p.triangle(-3, 2, 3, 2, 0, 7);
    strokeHex(p, C.cream, 0.7 * alpha);
    p.line(-2, -6, 2, -6);
  } else if (kind === 5) {
    // 放大镜
    strokeHex(p, tint, 0.9 * alpha);
    p.ellipse(-1.5, -2, 9, 9);
    strokeHex(p, C.amber, 0.8 * alpha);
    p.line(3, 3, 7, 7);
    strokeHex(p, C.cyanSoft, 0.35 * alpha);
    p.ellipse(-2.5, -3, 4, 4);
  } else if (kind === 6) {
    // 尺子
    fillHex(p, C.cyanDeep, 0.25 * alpha);
    strokeHex(p, C.creamDim, 0.82 * alpha);
    p.rect(-8, -4, 16, 8, 0.8);
    for (let k = 0; k < 5; k++) {
      p.line(-5.5 + k * 3, -4, -5.5 + k * 3, k % 2 ? -1.5 : 0);
    }
  } else {
    // 叠放卡片/纸带卷
    fillHex(p, C.bgDeep, 0.55 * alpha);
    strokeHex(p, C.cyanDim, 0.82 * alpha);
    p.rect(-6.5, -4.5, 12, 8, 1);
    strokeHex(p, C.creamDim, 0.6 * alpha);
    p.rect(-5, -6.2, 12, 8, 1);
    strokeHex(p, C.amber, 0.68 * alpha);
    p.rect(-3.2, -7.8, 12, 8, 1);
  }
  p.strokeCap(p.SQUARE);
  p.pop();
}

function drawRingBody(p, t) {
  const fade = 1 - 0.68 * smoothstep(4.15, 5.62, t);
  const close = smoothstep(2.72, 2.94, Math.min(t, 3));
  const gapHalf = 0.002 + (1 - close) * 0.15;
  const a0 = RING.gap + gapHalf;
  const a1 = RING.gap + TAU - gapHalf;
  const done = smoothstep(2.9, 3.0, Math.min(t, 3));

  // 轨道底座的宽描边 + 两侧细轨。全部是采样折线。
  drawArcLine(p, a0, a1, 0, C.cyan, (0.045 + 0.035 * done) * fade, 18, 120);
  drawArcLine(p, a0, a1, 0, C.cyanDeep, 0.72 * fade, 8, 120);
  drawArcLine(p, a0, a1, 0, C.navyDeep, 0.95 * fade, 4.4, 120);
  drawArcLine(p, a0, a1, 0, C.cyan, (0.38 + 0.3 * done) * fade, 1.5, 120);
  drawArcLine(p, a0, a1, 7, C.cream, (0.07 + 0.12 * done) * fade, 0.7, 120);
  drawArcLine(p, a0, a1, -7, C.navyLight, 0.4 * fade, 0.8, 120);

  // 轨道上的小刻度与铆钉。
  p.push();
  for (let i = 0; i < 44; i++) {
    const a = RING.gap + (i / 44) * TAU;
    if (Math.abs(((a - RING.gap + TAU) % TAU)) < gapHalf) continue;
    const major = i % 5 === 0;
    const [x0, y0] = ringPoint(a, -8);
    const [x1, y1] = ringPoint(a, major ? 8 : 5);
    strokeHex(p, major ? C.cyanSoft : C.steel, (major ? 0.2 : 0.1) * fade);
    p.strokeWeight(0.65);
    p.line(x0, y0, x1, y1);
    if (major) {
      const [bx, by] = ringPoint(a, 0);
      fillHex(p, i === 0 ? C.amber : C.navyDeep, 0.78 * fade);
      p.ellipse(bx, by, 4, 4);
      fillHex(p, i === 0 ? C.emberHot : C.cyanSoft, 0.34 * fade);
      p.ellipse(bx - 0.5, by - 0.5, 1.4, 1.4);
    }
  }
  p.pop();

  // 环心的工作台光，没有机器人也没有产品窗口。
  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.018 * fade);
  p.ellipse(RING.cx, RING.cy + 24, 254, 146);
  fillHex(p, C.navyLight, 0.045 * fade);
  p.ellipse(RING.cx, RING.cy + 44, 290, 112);
  fillHex(p, C.ember, 0.012 * fade);
  p.ellipse(RING.cx + 16, RING.cy + 54, 150, 58);
  p.pop();

  // 完成脉冲：2.78s 后沿环走完一圈，3.0s 时整环亮起。
  const pulse = smoothstep(2.74, 2.99, Math.min(t, 3));
  if (pulse > 0.002) {
    const head = RING.gap + pulse * TAU;
    const tail = 0.46;
    drawArcLine(p, head - tail, head, 0, C.cyanSoft, 0.32 * fade, 9, 64);
    drawArcLine(p, head - tail, head, 0, C.cream, 0.78 * fade, 1.8, 64);
    for (let k = 0; k < 10; k++) {
      const a = head - (k / 10) * tail;
      const [x, y] = ringPoint(a, 0);
      p.push();
      p.noStroke();
      fillHex(p, k % 3 === 0 ? C.emberHot : C.cyanSoft, (0.4 + 0.28 * (1 - k / 10)) * fade);
      p.ellipse(x, y, 2.8 - k * 0.12, 2.8 - k * 0.12);
      p.pop();
    }
  }

  if (done > 0.002) {
    drawArcLine(p, RING.gap, RING.gap + TAU, 0, C.cyanSoft, 0.17 * done * fade, 2.4, 120);
    p.push();
    p.noStroke();
    for (let i = 0; i < 8; i++) {
      const [x, y] = ringPoint(RING.gap + (i / 8) * TAU, 0);
      fillHex(p, i % 2 === 0 ? C.emberHot : C.cream, 0.44 * done * fade);
      p.ellipse(x, y, 2.4, 2.4);
      fillHex(p, i % 2 === 0 ? C.ember : C.cyan, 0.055 * done * fade);
      p.ellipse(x, y, 13, 13);
    }
    p.pop();
  }
}

function drawToolNode(p, angle, i, t) {
  const appear = smoothstep(1.14 + i * 0.045, 1.5 + i * 0.045, t);
  if (appear <= 0.002) return;
  const hold = Math.min(t, 3);
  const doneAt = [2.12, 2.38, 2.5, 2.61, 2.7, 2.79, 2.87][i] ?? 2.8;
  const lit = smoothstep(doneAt, doneAt + 0.11, hold);
  const fade = 1 - 0.78 * smoothstep(4.2, 5.7, t);
  const [cx, cy] = ringPoint(angle, 20);
  const [rx, ry] = ringPoint(angle, 0);
  const kindColor = i === 0 ? C.amber : i === 1 ? C.mint : i % 3 === 2 ? C.creamDim : C.cyanSoft;
  const a = appear * fade;

  p.push();
  p.noStroke();
  // 接轨短脚与节点光。
  p.push();
  p.noFill();
  strokeHex(p, kindColor, (0.24 + 0.25 * lit) * a);
  p.strokeWeight(0.8);
  p.line(rx, ry, cx, cy);
  p.pop();
  if (lit > 0.01) {
    fillHex(p, i === 0 ? C.ember : C.cyan, 0.06 * lit * a);
    p.ellipse(cx, cy, 54, 46);
  }

  // 步骤牌：暗底、细边、编号 + 工具几何剪影。
  fillHex(p, C.bgDeep, 0.55 * a);
  p.rect(cx - 19, cy - 16, 38, 34, 3.5);
  fillHex(p, C.panel, 0.96 * a);
  p.rect(cx - 18, cy - 17, 36, 32, 3);
  fillHex(p, C.bgLow, 0.92 * a);
  p.rect(cx - 16.5, cy - 15.5, 33, 29, 2.2);

  p.noFill();
  strokeHex(p, kindColor, (0.36 + 0.44 * lit) * a);
  p.strokeWeight(1);
  p.rect(cx - 18, cy - 17, 36, 32, 3);
  strokeHex(p, C.line, 0.32 * a);
  p.strokeWeight(0.6);
  p.rect(cx - 15, cy - 14, 30, 26, 2);
  if (lit > 0.02) {
    strokeHex(p, i === 0 ? C.emberHot : C.cream, 0.18 * lit * a);
    p.strokeWeight(0.7);
    p.line(cx - 12, cy + 12, cx + 12, cy + 12);
  }

  // 编号
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(5.2);
  fillHex(p, kindColor, (0.55 + 0.3 * lit) * a);
  p.text(String(i + 1).padStart(2, '0'), cx, cy - 11.5);

  // 工具剪影
  p.push();
  p.translate(cx, cy + 2.5);
  p.scale(0.82);
  drawToolGlyph(p, i, (0.64 + 0.34 * lit) * a, i === 0 ? C.steel : kindColor);
  p.pop();

  // 失败叉 / 重试勾
  if (i === 0) {
    const crossA = smoothstep(2.12, 2.28, hold) * (1 - 0.25 * smoothstep(3.0, 3.5, t));
    if (crossA > 0.002) {
      fillHex(p, C.bgDeep, 0.86 * crossA);
      p.rect(cx + 7, cy + 5, 12, 12, 2);
      p.noFill();
      strokeHex(p, C.emberHot, 0.48 * crossA);
      p.strokeWeight(0.7);
      p.rect(cx + 7, cy + 5, 12, 12, 2);
      drawCross(p, cx + 13, cy + 11, 7, 0.9 * crossA, C.emberHot);
      p.noStroke();
      fillHex(p, C.ember, 0.08 * crossA);
      p.ellipse(cx + 13, cy + 11, 22, 22);
    }
  } else if (i === 1) {
    const checkA = smoothstep(2.38, 2.55, hold) * (1 - 0.2 * smoothstep(3.0, 3.5, t));
    if (checkA > 0.002) {
      fillHex(p, C.bgDeep, 0.86 * checkA);
      p.rect(cx + 7, cy + 5, 12, 12, 2);
      p.noFill();
      strokeHex(p, C.mint, 0.5 * checkA);
      p.strokeWeight(0.7);
      p.rect(cx + 7, cy + 5, 12, 12, 2);
      drawCheck(p, cx + 13, cy + 11, 8, 1, 0.94 * checkA, C.mint);
      p.noStroke();
      fillHex(p, C.mint, 0.08 * checkA);
      p.ellipse(cx + 13, cy + 11, 22, 22);
    }
  }
  p.pop();
}

// ---------- 工具带 ----------

function drawBeltBasics(p, t) {
  p.push();
  p.noStroke();
  // 完全覆盖默认路带 y≈470–530（这里略宽到 466–534，仍在 58–70 内）。
  fillHex(p, C.bgDeep, 1);
  p.rect(0, ROAD_TOP - 1, 1000, ROAD_BOTTOM - ROAD_TOP + 2);
  fillHex(p, '#0a1324', 1);
  p.rect(0, ROAD_TOP + 2, 1000, ROAD_BOTTOM - ROAD_TOP - 4);
  fillHex(p, C.panel, 0.58);
  p.rect(0, ROAD_TOP + 8, 1000, ROAD_BOTTOM - ROAD_TOP - 16);

  // 上下导轨
  fillHex(p, C.navyDeep, 1);
  p.rect(0, ROAD_TOP, 1000, 6);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 6);
  fillHex(p, C.line, 0.55);
  p.rect(0, ROAD_TOP + 1, 1000, 1);
  p.rect(0, ROAD_BOTTOM - 2, 1000, 1);
  fillHex(p, C.cyan, 0.2);
  p.rect(0, ROAD_TOP + 5, 1000, 0.8);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 0.8);

  // 带面肋条：速度压得很低，不是代码雨。
  const scroll = ((t * 24) % 14 + 14) % 14;
  p.strokeWeight(0.7);
  for (let x = -scroll; x < 1000; x += 14) {
    strokeHex(p, C.navyLight, 0.14);
    p.line(x, ROAD_TOP + 9, x, ROAD_BOTTOM - 9);
    strokeHex(p, C.cyan, 0.015);
    p.line(x + 1, ROAD_TOP + 10, x + 1, ROAD_BOTTOM - 10);
  }

  // 两条纵贯绑带
  fillHex(p, C.navy, 0.42);
  p.rect(0, 477, 1000, 3);
  p.rect(0, 520, 1000, 3);
  strokeHex(p, C.cyan, 0.14);
  p.strokeWeight(0.7);
  p.line(0, 478, 1000, 478);
  p.line(0, 522, 1000, 522);

  // 工具槽 / 步骤编号。小号字，只有编号和勾叉。
  const stepX = [42, 154, 266, 378, 502, 626, 750, 874];
  for (let i = 0; i < stepX.length; i++) {
    const x = stepX[i];
    const done = smoothstep(2.05 + i * 0.1, 2.25 + i * 0.1, Math.min(t, 3));
    fillHex(p, C.bgDeep, 0.86);
    p.rect(x, 492, 35, 15, 1.5);
    p.noFill();
    strokeHex(p, done > 0.5 ? C.amber : C.steelDark, (0.28 + 0.3 * done) * (1 - 0.6 * smoothstep(4.2, 5.6, t)));
    p.strokeWeight(0.7);
    p.rect(x, 492, 35, 15, 1.5);
    p.noStroke();
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(5.4);
    fillHex(p, C.creamDim, 0.45 + 0.35 * done);
    p.text(String(i + 1).padStart(2, '0'), x + 11, 500);
    if (done > 0.02) {
      drawCheck(p, x + 27, 500, 7.5, done, 0.65 * done, C.amber);
    } else {
      p.noFill();
      strokeHex(p, C.cyanDim, 0.3);
      p.strokeWeight(0.7);
      p.ellipse(x + 27, 500, 5, 5);
    }
  }

  // 0/1 反馈脉冲：只沿带面窄道，几颗而已。
  const step = Math.floor(Math.min(t, 3) * 10);
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(6);
  for (let i = 0; i < 13; i++) {
    const x = 58 + i * 72 + ((Math.min(t, 3) * (7 + (i % 3) * 4)) % 26);
    const bit = BITS[(i * 3 + step) % BITS.length];
    fillHex(p, i % 5 === 0 ? C.amber : C.cyan, 0.13 + hash2(i, 2, 18) * 0.15);
    p.text(bit, x, 516);
    if (i % 4 === 0) {
      fillHex(p, C.cyan, 0.05);
      p.ellipse(x, 516, 13, 6);
    }
  }

  // 失败→重试的两个反馈脉冲，靠近环的闭合口。
  const crossA = smoothstep(2.14, 2.3, Math.min(t, 3));
  const checkA = smoothstep(2.4, 2.57, Math.min(t, 3));
  if (crossA > 0.002) {
    p.push();
    p.noStroke();
    fillHex(p, C.ember, 0.06 * crossA);
    p.ellipse(505, 514, 26, 16);
    fillHex(p, C.bgDeep, 0.9 * crossA);
    p.rect(497, 507, 16, 14, 2);
    p.noFill();
    strokeHex(p, C.emberHot, 0.6 * crossA);
    p.strokeWeight(0.8);
    p.rect(497, 507, 16, 14, 2);
    drawCross(p, 505, 514, 8.5, 0.88 * crossA, C.emberHot);
    p.pop();
  }
  if (checkA > 0.002) {
    p.push();
    p.noStroke();
    fillHex(p, C.mint, 0.06 * checkA);
    p.ellipse(638, 514, 26, 16);
    fillHex(p, C.bgDeep, 0.9 * checkA);
    p.rect(630, 507, 16, 14, 2);
    p.noFill();
    strokeHex(p, C.mint, 0.6 * checkA);
    p.strokeWeight(0.8);
    p.rect(630, 507, 16, 14, 2);
    drawCheck(p, 638, 514, 9, 1, 0.92 * checkA, C.mint);
    p.pop();
  }

  // 右侧出口：带面开始向城市网格/屏幕边框过渡。
  const exit = smoothstep(4.15, 5.55, t);
  if (exit > 0.002) {
    fillHex(p, '#07111b', 0.78 * exit);
    p.rect(760, ROAD_TOP + 2, 240, ROAD_BOTTOM - ROAD_TOP - 4);
    strokeHex(p, C.cyan, 0.08 * exit);
    p.strokeWeight(0.6);
    for (let x = 770; x <= 1000; x += 18) p.line(x, ROAD_TOP + 4, x, ROAD_BOTTOM - 4);
    for (let y = ROAD_TOP + 12; y < ROAD_BOTTOM; y += 12) p.line(760, y, 1000, y);
    strokeHex(p, C.cream, 0.14 * exit);
    p.strokeWeight(0.8);
    p.line(760, ROAD_MID, 1000, ROAD_MID);
    p.line(900, ROAD_TOP + 4, 900, ROAD_BOTTOM - 4);
  }

  p.pop();
}

// 环在工具带上的下半弧、闭合扣与完成脉冲。画在 drawRoad 里，避免被带面盖住。
function drawRingBeltLayer(p, t) {
  const hold = Math.min(t, 3);
  const fade = 1 - 0.68 * smoothstep(4.15, 5.62, t);
  const close = smoothstep(2.72, 2.94, hold);
  const gapHalf = 0.002 + (1 - close) * 0.15;
  const lowA = Math.asin((ROAD_TOP - RING.cy) / RING.ry);
  const lowB = Math.PI - lowA;
  const segs = [];
  if (RING.gap - gapHalf > lowA) segs.push([lowA, Math.min(lowB, RING.gap - gapHalf)]);
  if (RING.gap + gapHalf < lowB) segs.push([Math.max(lowA, RING.gap + gapHalf), lowB]);

  for (const [a0, a1] of segs) {
    drawArcLine(p, a0, a1, 0, C.cyanDeep, 0.9 * fade, 8, 64);
    drawArcLine(p, a0, a1, 0, C.navyDeep, 0.95 * fade, 4.4, 64);
    drawArcLine(p, a0, a1, 0, C.cyan, (0.42 + 0.2 * smoothstep(2.9, 3, hold)) * fade, 1.5, 64);
    drawArcLine(p, a0, a1, 7, C.cream, 0.12 * fade, 0.7, 64);
  }

  // 环上的工具节点。全部画在带面上层，下弧节点不会被路带吞掉。
  for (let i = 0; i < TOOL_ANGLES.length; i++) {
    drawToolNode(p, TOOL_ANGLES[i], i, t);
  }

  // 闭合扣：左下起点，主角停在这里。
  if (close > 0.02) {
    const [cx, cy] = ringPoint(RING.gap, 0);
    p.push();
    p.noStroke();
    fillHex(p, C.ember, 0.08 * close * fade);
    p.ellipse(cx, cy, 44, 32);
    fillHex(p, C.bgDeep, 0.9 * close);
    p.ellipse(cx, cy, 13, 13);
    fillHex(p, C.emberHot, 0.9 * close);
    p.ellipse(cx, cy, 5, 5);
    fillHex(p, C.emberCore, 0.95 * close);
    p.ellipse(cx - 0.7, cy - 0.7, 2, 2);
    p.noFill();
    strokeHex(p, C.emberHot, 0.48 * close * fade);
    p.strokeWeight(1);
    p.ellipse(cx, cy, 21, 21);
    strokeHex(p, C.cream, 0.34 * close * fade);
    p.line(cx - 13, cy - 3, cx - 7, cy + 3);
    p.line(cx + 13, cy - 3, cx + 7, cy + 3);
    p.pop();
  }

  // 完整的完成脉冲也会经过下弧，重绘一遍让它连续。
  const pulse = smoothstep(2.74, 2.99, hold);
  if (pulse > 0.002) {
    const head = RING.gap + pulse * TAU;
    const tail = 0.46;
    const norm = (a) => ((a % TAU) + TAU) % TAU;
    p.push();
    p.noFill();
    strokeHex(p, C.cyanSoft, 0.34 * fade);
    p.strokeWeight(9);
    for (let k = 0; k < 24; k++) {
      const a0 = norm(head - (k / 24) * tail);
      const a1 = norm(head - ((k + 1) / 24) * tail);
      if (a0 < lowA || a0 > lowB || a1 < lowA || a1 > lowB) continue;
      const [x0, y0] = ringPoint(a0, 0);
      const [x1, y1] = ringPoint(a1, 0);
      p.line(x0, y0, x1, y1);
    }
    strokeHex(p, C.cream, 0.82 * fade);
    p.strokeWeight(1.6);
    for (let k = 0; k < 24; k++) {
      const a0 = norm(head - (k / 24) * tail);
      const a1 = norm(head - ((k + 1) / 24) * tail);
      if (a0 < lowA || a0 > lowB || a1 < lowA || a1 > lowB) continue;
      const [x0, y0] = ringPoint(a0, 0);
      const [x1, y1] = ringPoint(a1, 0);
      p.line(x0, y0, x1, y1);
    }
    p.pop();
    for (let k = 0; k < 10; k++) {
      const a = norm(head - (k / 10) * tail);
      if (a < lowA || a > lowB) continue;
      const [x, y] = ringPoint(a, 0);
      p.noStroke();
      fillHex(p, k % 3 === 0 ? C.emberHot : C.cyanSoft, 0.6 * fade);
      p.ellipse(x, y, 2.6, 2.6);
    }
  }
}

// 从第 17 版块接过来的分叉轨道：上段画在场景里，压进带面的部分在 drawRoad 里。
function drawBranchMerge(p, t) {
  const fade = 1 - 0.6 * smoothstep(4.2, 5.6, t);
  p.push();
  p.noFill();
  strokeHex(p, C.cyanDim, 0.22 * fade);
  p.strokeWeight(1.3);
  p.beginShape();
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const x = 300 + u * 170;
    const y = 438 + Math.sin(u * Math.PI * 0.8) * 13 + u * 16;
    p.vertex(x, y);
  }
  p.endShape();
  strokeHex(p, C.cyanSoft, 0.13 * fade);
  p.strokeWeight(1);
  p.beginShape();
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const x = 286 + u * 184;
    const y = 456 + Math.sin(u * Math.PI * 0.6 + 1.2) * 8 - u * 6;
    p.vertex(x, y);
  }
  p.endShape();

  // 分叉末端的步骤牌残影，接上环的闭合口。
  for (let i = 0; i < 3; i++) {
    const x = 376 + i * 44;
    const y = 438 + i * 7;
    p.noStroke();
    fillHex(p, C.bgDeep, 0.5 * fade);
    p.rect(x, y, 15, 10, 1.5);
    p.noFill();
    strokeHex(p, i === 2 ? C.ember : C.cyan, (0.2 + i * 0.06) * fade);
    p.strokeWeight(0.7);
    p.rect(x, y, 15, 10, 1.5);
    p.noStroke();
    fillHex(p, i === 2 ? C.emberHot : C.cyanSoft, 0.32 * fade);
    p.rect(x + 3, y + 3, 4 + i * 2, 1);
    p.rect(x + 3, y + 6, 6, 1);
  }
  p.pop();
}

// 出口：环/轨迹开始散成城市网格/屏幕边框；只做低 alpha 几何提示。
function drawExitHints(p, t) {
  const exit = smoothstep(4.15, 5.65, t);
  if (exit <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, C.cyan, 0.15 * exit);
  p.strokeWeight(0.8);
  // 屏幕边框
  p.line(806, 276, 1000, 276);
  p.line(806, 276, 806, 610);
  p.line(1000, 276, 1000, 610);
  p.line(806, 610, 1000, 610);
  // 网格
  for (let x = 824; x < 1000; x += 24) {
    strokeHex(p, C.cyanDim, 0.075 * exit);
    p.line(x, 294, x, 592);
  }
  for (let y = 300; y < 610; y += 24) {
    strokeHex(p, C.cyanDim, 0.06 * exit);
    p.line(806, y, 1000, y);
  }
  // 轨迹散成斜向光点
  p.strokeWeight(1);
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    const x = 850 + u * 146;
    const y = 348 + Math.sin(u * Math.PI * 1.4 + i) * 12 + u * 170;
    strokeHex(p, i % 3 === 0 ? C.emberHot : C.cyanSoft, 0.15 * exit);
    p.line(x, y, x + 4 + hash2(i, 71) * 8, y + 2);
  }
  p.pop();
}

// ---------- 标题与气氛 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 180;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, C.cream, 0.82 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.cyanSoft, 0.22 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 2, 1);
  fillHex(p, C.navy, 0.12 * alpha);
  p.rect(x - w / 2 + 2, y + h / 2 - 2, w - 4, 1);
  p.noFill();
  strokeHex(p, C.cyan, 0.38 * alpha);
  p.strokeWeight(0.9);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

function drawAtmosphere(p, t) {
  const fade = 1 - 0.5 * smoothstep(4.4, 5.8, t);
  linearWash(
    p,
    0,
    212,
    0,
    790,
    [
      [0, 'rgba(2,5,13,0.28)'],
      [0.24, 'rgba(2,5,13,0)'],
      [0.76, 'rgba(0,0,0,0)'],
      [1, 'rgba(1,3,9,0.24)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.push();
  p.noStroke();
  fillHex(p, C.cyan, 0.012 * fade);
  p.ellipse(650, 408, 500, 330);
  fillHex(p, C.ember, 0.007 * fade);
  p.ellipse(575, 508, 280, 62);
  p.pop();
}

// ---------- 主角：环形 Agent token ----------

function drawActorToken(p, state) {
  const t = clamp(state.localT || 0, 0, 6);
  const hold = Math.min(t, 3);
  const appear = smoothstep(0.25, 0.7, t);
  const ride = smoothstep(1.15, 2.45, hold);
  const settle = 1 - smoothstep(2.72, 2.92, hold);
  const beat = Math.sin(t * TAU);
  const wobble = Math.sin(t * TAU + 0.8);
  const failShake = smoothstep(2.14, 2.24, hold) * (1 - smoothstep(2.46, 2.7, hold));
  const flash = smoothstep(2.9, 3.02, t) * (1 - smoothstep(3.5, 4.25, t));
  const exitFade = 1 - 0.45 * smoothstep(4.5, 5.8, t);

  // 直接吃世界坐标 state.x；偏移只是环上停靠/呼吸的小量。
  const dx = 73 * ride + beat * 2.6 * settle;
  const contactY = ROAD_MID - 14 * ride + wobble * 1.3 * settle;
  const scale = (0.84 + 0.16 * appear) * (1 + 0.018 * flash) * exitFade;

  p.push();
  p.translate(state.x + dx, contactY);
  p.scale(scale);

  p.noStroke();
  // 接触阴影与停靠波纹
  fillHex(p, C.bgDeep, 0.5 * appear);
  p.ellipse(1, 1, 58, 11);
  fillHex(p, C.cyan, 0.075 * appear);
  p.ellipse(0, 0, 76, 13);
  fillHex(p, C.ember, 0.035 * appear);
  p.ellipse(0, -3, 46, 12);
  strokeHex(p, C.cyan, 0.3 * appear);
  p.strokeWeight(0.8);
  p.noFill();
  p.ellipse(0, 0, 36, 7);

  const ringY = -31;
  const rotor = wobble * 0.035 * settle + failShake * Math.sin(hold * 72) * 0.02;
  p.push();
  p.translate(0, ringY);
  p.rotate(rotor);

  // 主环：青蓝小环 / 轨道结。
  p.noStroke();
  fillHex(p, C.cyan, 0.055 * appear);
  p.ellipse(0, 0, 55, 57);
  fillHex(p, C.bgDeep, 0.94 * appear);
  p.ellipse(0, 0, 44, 46);
  fillHex(p, C.navyDeep, 0.8 * appear);
  p.ellipse(0, 0, 37, 39);
  strokeHex(p, C.cyan, 0.88 * appear);
  p.strokeWeight(3.1);
  p.noFill();
  p.ellipse(0, 0, 45, 47);
  strokeHex(p, C.cyanSoft, 0.45 * appear);
  p.strokeWeight(1);
  p.ellipse(0, 0, 51, 53);
  strokeHex(p, C.cream, 0.15 * appear);
  p.strokeWeight(0.7);
  p.ellipse(-1, -1, 40, 42);

  // 轨道结：两个交叉的小扣，像一个会自己绕圈的工作牌。
  strokeHex(p, C.cyan, 0.65 * appear);
  p.strokeWeight(1.5);
  p.line(-23, 12, 20, -14);
  p.line(-20, -14, 22, 12);
  strokeHex(p, C.creamDim, 0.36 * appear);
  p.strokeWeight(0.8);
  p.line(-16, 9, 14, -9);
  p.line(-14, -9, 16, 9);

  // 环内暖赭火种，和第 17 版块是同一颗。
  p.noStroke();
  fillHex(p, C.ember, (0.3 + 0.34 * flash) * appear);
  p.ellipse(0, 0, 17 + flash * 4, 18 + flash * 4);
  fillHex(p, C.emberHot, (0.9 + 0.1 * flash) * appear);
  p.ellipse(-0.6, -0.7, 8.2, 9.2);
  fillHex(p, C.emberCore, appear);
  p.ellipse(-1.2, -1.4, 3.2, 3.6);
  p.noFill();
  strokeHex(p, C.emberHot, (0.28 + 0.3 * flash) * appear);
  p.strokeWeight(0.8);
  p.ellipse(0, 0, 23 + flash * 5, 23 + flash * 5);

  // 环内的小刻度和一个沿环走的轨道点。
  p.push();
  p.rotate(t * 0.8);
  p.noStroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.2;
    fillHex(p, i === 0 ? C.emberHot : C.cyanSoft, 0.55 * appear);
    p.ellipse(Math.cos(a) * 18, Math.sin(a) * 17, 2.1, 2.1);
  }
  p.pop();
  p.pop();

  // 环外拖的一小段循环纸带，失败时会抖一下。
  const tapeWag = beat * 1.8 * settle + failShake * Math.sin(hold * 80) * 4;
  p.push();
  p.translate(-20, ringY + 5 + tapeWag);
  p.rotate(-0.1 + 0.06 * wobble * settle);
  p.noFill();
  strokeHex(p, C.cyanDim, 0.72 * appear);
  p.strokeWeight(3.4);
  p.beginShape();
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const x = -u * 39;
    const y = Math.sin(u * Math.PI * 1.25 + 0.2) * 5 - u * 8;
    p.vertex(x, y);
  }
  p.endShape();
  strokeHex(p, C.cream, 0.38 * appear);
  p.strokeWeight(1);
  p.beginShape();
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const x = -u * 39;
    const y = Math.sin(u * Math.PI * 1.25 + 0.2) * 5 - u * 8;
    p.vertex(x, y);
  }
  p.endShape();
  p.noStroke();
  for (let i = 0; i < 4; i++) {
    const u = 0.18 + i * 0.2;
    fillHex(p, i === 3 ? C.emberHot : C.cyanSoft, 0.45 * appear);
    p.rect(-u * 39, Math.sin(u * Math.PI * 1.25 + 0.2) * 5 - u * 8 - 1.4, 4.5, 1.4, 0.5);
  }
  p.pop();

  // 与带面/环轨的短接触线。
  p.push();
  p.noFill();
  strokeHex(p, C.cyan, 0.34 * appear);
  p.strokeWeight(1);
  p.line(-10, -4, -2, 0);
  p.line(10, -4, 2, 0);
  strokeHex(p, C.amber, 0.32 * appear);
  p.strokeWeight(0.8);
  p.line(0, -4, 0, -9);
  p.pop();

  // 定格时火种闪一下，并留一圈完成后的暖光。
  if (flash > 0.01) {
    p.push();
    p.noStroke();
    fillHex(p, C.ember, 0.06 * flash * appear);
    p.ellipse(0, ringY, 78, 78);
    fillHex(p, C.emberHot, 0.08 * flash * appear);
    p.ellipse(0, ringY, 40, 40);
    fillHex(p, C.cream, 0.04 * flash * appear);
    p.ellipse(0, ringY, 100, 34);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.92 + hold * 0.7;
      fillHex(p, i % 2 ? C.emberHot : C.emberCore, 0.38 * flash * appear);
      p.ellipse(Math.cos(a) * (28 + hash2(i, 81) * 12), ringY + Math.sin(a) * (25 + hash2(i, 82) * 10), 1.6, 1.6);
    }
    p.pop();
  }

  p.pop();
}

// ---------- 场景导出 ----------

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();
    drawBackground(p, t);
    drawContextRibbon(p, t);
    drawBranchMerge(p, t);
    drawMemoryShelf(p, t);
    drawRingBody(p, t);
    drawTodo(p, t);
    drawExitHints(p, t);
    drawAtmosphere(p, t);

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
    drawBeltBasics(p, t);
    drawBranchMerge(p, t);
    drawRingBeltLayer(p, t);
    p.pop();
  },

  drawActor(p, state) {
    p.push();
    drawActorToken(p, state);
    p.pop();
  }
};
