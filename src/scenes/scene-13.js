import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 13 深度神经网络：深蓝数据空间 + 七层节点平面 + 张量带 + 梯度方块。
// 静态重点：localT≈1.5（标题、张量带、七层网络、特征小图、梯度方块）
// 与 localT≈3.0（误差反向、层节点翻红/重排、一层矫枉过正、损失尖峰、
// 输出标签翻面、方块停在层间、火种闪、约 1s 定格）。
const TAU = Math.PI * 2;
const ROAD_TOP = 470;
const ROAD_BOTTOM = 530;
const ROAD_MID = 500;

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const META = {
  id: 13,
  cn: '深度神经网络',
  en: 'Deep Neural Networks',
  era: '2010s',
  group: 'data'
};

const C = {
  bg: '#060a16',
  bgDeep: '#03050e',
  bgLift: '#091126',
  glass: '#081127',
  glassDeep: '#050b1b',
  navy: '#1a2750',
  navyMid: '#111b3b',
  navyLight: '#25396f',
  edge: '#2e4680',
  line: '#3b5995',
  mist: '#7fa8e8',
  cyan: '#63dfff',
  cyanSoft: '#9beaff',
  cyanPale: '#d4f7ff',
  cyanDeep: '#2b8dba',
  ink: '#e6ebff',
  cream: '#f0dfb8',
  creamDim: '#cdbb95',
  amber: '#e8a24a',
  amberHot: '#ffc46b',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa',
  error: '#ff6f57',
  errorHot: '#ff9a69',
  errorDeep: '#8f3529'
};

// 七层节点平面从左上向右下收敛。x 间距 64，节点始终留在 y≈310–452，
// 平面下沿则进入张量带，读成“网络从数据流里长出来”。
const LAYERS = [
  { x: 472, count: 7, top: 282, bottom: 536, nodeTop: 312, nodeBottom: 452, label: '01' },
  { x: 536, count: 8, top: 290, bottom: 522, nodeTop: 318, nodeBottom: 450, label: '02' },
  { x: 600, count: 7, top: 300, bottom: 508, nodeTop: 328, nodeBottom: 448, label: '03' },
  { x: 663, count: 6, top: 312, bottom: 496, nodeTop: 340, nodeBottom: 446, label: '04' },
  { x: 724, count: 5, top: 324, bottom: 484, nodeTop: 352, nodeBottom: 444, label: '05' },
  { x: 783, count: 5, top: 336, bottom: 476, nodeTop: 364, nodeBottom: 442, label: '06' },
  { x: 840, count: 4, top: 350, bottom: 468, nodeTop: 378, nodeBottom: 440, label: '07' }
];

// 每一层取一个节点，串起从输入到输出、再从输出反向冲回的高亮路径。
const PATH_INDEX = [3, 3, 3, 2, 2, 2, 1];

const INPUT_FRAME = { x: 24, y: 290, w: 112, h: 114 };
const INPUT_TILES = [
  { x: 34, y: 302, w: 44, h: 44, type: 0 },
  { x: 82, y: 302, w: 44, h: 44, type: 1 },
  { x: 34, y: 350, w: 44, h: 44, type: 2 },
  { x: 82, y: 350, w: 44, h: 44, type: 3 }
];

const OUT = { cx: 906, cy: 372, w: 66, h: 48 };
const OUT_ROWS = [
  { cy: 412, kind: 1, sym: 1 },
  { cy: 428, kind: 0, sym: 0 },
  { cy: 444, kind: 2, sym: 2 }
];

const LOSS = { x: 664, y: 588, w: 282, h: 156 };
const PLOT = { x: 684, y: 622, w: 244, h: 96 };

// 固定尘埃，全部由固定种子生成；不使用代码雨或逐像素循环。
const DUST = (() => {
  const rng = mulberry32(0x13d0a7);
  const list = [];
  for (let i = 0; i < 104; i++) {
    list.push({
      x: rng() * 1000,
      y: 200 + rng() * 610,
      r: 0.45 + rng() * 1.35,
      a: 0.018 + rng() * 0.05,
      phase: rng() * TAU,
      soft: rng() > 0.6
    });
  }
  return list;
})();

// 张量带上的压扁数据片。
const FLAKES = (() => {
  const rng = mulberry32(0x7e45a1);
  const list = [];
  for (let i = 0; i < 76; i++) {
    const lane = Math.floor(rng() * 7);
    list.push({
      x: rng() * 1000,
      y: 479 + lane * 6.8,
      w: 2 + rng() * 13,
      h: 0.7 + rng() * 1.8,
      a: 0.07 + rng() * 0.2,
      warm: rng() > 0.94
    });
  }
  return list;
})();

function linearWash(p, x0, y0, x1, y1, stops, x, y, w, h) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawArrow(p, x, y, angle, size, color, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.noStroke();
  fillHex(p, color, alpha);
  p.triangle(0, 0, -size, -size * 0.52, -size, size * 0.52);
  p.pop();
}

function dashedLine(p, x0, y0, x1, y1, alpha, color = C.cyan, weight = 0.9) {
  if (alpha <= 0.002) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const dash = 4.2;
  const gap = 3.4;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    p.line(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
  }
  p.pop();
}

function layerReveal(i, t) {
  const delay = (LAYERS.length - 1 - i) * 0.12;
  return smoothstep(0.18 + delay, 0.52 + delay, t);
}

function layerError(i, t) {
  const delay = (LAYERS.length - 1 - i) * 0.05;
  return smoothstep(2.56 + delay, 2.68 + delay, t);
}

function overAmount(t) {
  return smoothstep(2.78, 2.93, t);
}

function nodeBase(i, k) {
  const layer = LAYERS[i];
  const n = layer.count;
  const v = n <= 1 ? 0.5 : k / (n - 1);
  return {
    x: layer.x + 7 - (v - 0.5) * 8,
    y: layer.nodeTop + (layer.nodeBottom - layer.nodeTop) * v,
    v
  };
}

// 第四层（i=3）误差经过时矫枉过正：节点被推离原位，像权重重排过头。
function nodePoint(i, k, hold) {
  const b = nodeBase(i, k);
  const over = i === 3 ? overAmount(hold) : 0;
  const dir = hash2(k, 17, 901) > 0.5 ? 1 : -1;
  const dx = over * dir * (4 + hash2(k, 18, 902) * 5.5);
  const dy = over * (hash2(k, 19, 903) - 0.5) * 6;
  return { x: b.x + dx, y: b.y + dy, v: b.v, over };
}

function pathPoints(hold) {
  const list = [];
  for (let i = 0; i < LAYERS.length; i++) {
    const k = Math.min(PATH_INDEX[i], LAYERS[i].count - 1);
    list.push(nodePoint(i, k, hold));
  }
  return list;
}

function pointAlong(points, u) {
  const q = clamp(u, 0, 1);
  let total = 0;
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(len);
    total += len;
  }
  if (total < 0.001) return { x: points[0].x, y: points[0].y, angle: 0 };
  let remain = q * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remain <= lengths[i] || i === lengths.length - 1) {
      const v = lengths[i] > 0.001 ? remain / lengths[i] : 0;
      const x = points[i].x + (points[i + 1].x - points[i].x) * v;
      const y = points[i].y + (points[i + 1].y - points[i].y) * v;
      const angle = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
      return { x, y, angle };
    }
    remain -= lengths[i];
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y, angle: 0 };
}

// ---------- 背景 ----------

function drawBackground(p, t) {
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, 1000, 1000);

  linearWash(
    p,
    0,
    170,
    0,
    850,
    [
      [0, 'rgba(2,4,12,0.72)'],
      [0.2, 'rgba(6,12,32,0.16)'],
      [0.56, 'rgba(12,25,62,0.08)'],
      [0.82, 'rgba(3,7,18,0.12)'],
      [1, 'rgba(2,4,10,0.72)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 大片深蓝数据层，低 alpha 叠出空气深度。
  fillHex(p, C.bgLift, 0.5);
  p.rect(0, 210, 1000, 520);
  fillHex(p, C.navy, 0.1);
  p.rect(0, 300, 1000, 280);
  fillHex(p, C.navyLight, 0.035);
  p.ellipse(742, 404, 760, 460);
  fillHex(p, C.cyan, 0.014);
  p.ellipse(772, 388, 560, 340);
  fillHex(p, C.glassDeep, 0.42);
  p.rect(0, 730, 1000, 270);

  // 很淡的方向网格：只保留横向数据层和少量竖线，不做代码雨。
  p.strokeWeight(0.65);
  for (let y = 236; y <= 748; y += 42) {
    const a = y % 168 === 68 ? 0.045 : 0.022;
    strokeHex(p, C.mist, a);
    p.line(36, y, 986, y);
  }
  for (let x = 436; x <= 986; x += 50) {
    strokeHex(p, C.line, x % 200 === 36 ? 0.035 : 0.02);
    p.line(x, 206, x, 748);
  }

  // 数据空间里的斜向薄面，避免背景变成纯色。
  for (let i = 0; i < 5; i++) {
    const x = 360 + i * 146;
    fillHex(p, C.navyLight, 0.018 + i * 0.004);
    p.beginShape();
    p.vertex(x, 226);
    p.vertex(x + 54, 226);
    p.vertex(x + 18, 706);
    p.vertex(x - 36, 706);
    p.endShape(p.CLOSE);
  }

  // 固定尘埃点。
  for (const d of DUST) {
    const drift = Math.sin(t * 0.22 + d.phase) * 3;
    fillHex(p, d.soft ? C.mist : C.cyanSoft, d.a);
    if (d.r > 1.45) {
      p.rect(d.x + drift, d.y, d.r * 2.4, 0.7);
    } else {
      p.ellipse(d.x + drift, d.y, d.r, d.r);
    }
  }

  // 网络区一点点冷光底，用层叠低 alpha 代替大半径模糊。
  fillHex(p, C.cyan, 0.018);
  p.ellipse(700, 372, 620, 250);
  fillHex(p, C.cyanDeep, 0.012);
  p.ellipse(820, 420, 400, 190);
  fillHex(p, C.amber, 0.008);
  p.ellipse(880, 452, 180, 96);

  // 上下的暗角。
  linearWash(
    p,
    0,
    0,
    0,
    1000,
    [
      [0, 'rgba(0,1,5,0.34)'],
      [0.18, 'rgba(0,1,5,0)'],
      [0.82, 'rgba(0,1,5,0)'],
      [1, 'rgba(0,1,5,0.36)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.pop();
}

// ---------- 特征符号 ----------

function drawFeatureGlyph(p, cx, cy, s, type, alpha, color, simplify = 0) {
  if (alpha <= 0.004) return;
  p.push();
  p.strokeCap(p.ROUND);

  if (simplify > 0.72) {
    // 深层的特征已经缩成几个点。
    p.noStroke();
    for (let i = 0; i < 3; i++) {
      const a = type * 0.8 + i * 2.1;
      const rr = 0.55 + hash2(i, type, 431) * 0.25;
      fillHex(p, color, alpha * (0.5 + hash2(i, type, 432) * 0.35));
      p.ellipse(cx + Math.cos(a) * s * rr, cy + Math.sin(a) * s * rr, 1.15, 1.15);
    }
    p.pop();
    return;
  }

  if (simplify > 0.34) {
    // 中层：只剩一条方向线和一个端点。
    p.noFill();
    strokeHex(p, color, alpha * 0.78);
    p.strokeWeight(0.8);
    const a = type * 0.9 + 0.35;
    p.line(
      cx - Math.cos(a) * s * 0.62,
      cy - Math.sin(a) * s * 0.5,
      cx + Math.cos(a) * s * 0.62,
      cy + Math.sin(a) * s * 0.5
    );
    p.noStroke();
    fillHex(p, C.cyanPale, alpha * 0.72);
    p.ellipse(cx + Math.cos(a) * s * 0.62, cy + Math.sin(a) * s * 0.5, 1.4, 1.4);
    p.pop();
    return;
  }

  const kind = ((type % 7) + 7) % 7;
  if (kind === 0) {
    // 边缘：两段不连续斜线。
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(0.8);
    p.beginShape();
    p.vertex(cx - s * 0.72, cy + s * 0.62);
    p.vertex(cx - s * 0.04, cy - s * 0.16);
    p.vertex(cx + s * 0.72, cy - s * 0.62);
    p.endShape();
    p.strokeWeight(0.65);
    strokeHex(p, color, alpha * 0.62);
    p.beginShape();
    p.vertex(cx - s * 0.72, cy + s * 0.05);
    p.vertex(cx - s * 0.13, cy - s * 0.34);
    p.endShape();
    p.noStroke();
    fillHex(p, C.cyanPale, alpha * 0.8);
    p.ellipse(cx + s * 0.48, cy - s * 0.42, 1.35, 1.35);
  } else if (kind === 1) {
    // 圆弧：采样点折线。
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(0.8);
    p.beginShape();
    for (let i = 0; i <= 11; i++) {
      const a = Math.PI * 1.02 + (i / 11) * Math.PI * 1.02;
      p.vertex(cx + Math.cos(a) * s * 0.76, cy + Math.sin(a) * s * 0.58);
    }
    p.endShape();
    p.noStroke();
    fillHex(p, C.cyanPale, alpha * 0.82);
    p.ellipse(cx - s * 0.76, cy + s * 0.02, 1.4, 1.4);
    p.ellipse(cx + s * 0.7, cy + s * 0.2, 1.1, 1.1);
  } else if (kind === 2) {
    // 方块/角块。
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(0.8);
    p.rect(cx - s * 0.58, cy - s * 0.58, s * 1.06, s * 1.06);
    strokeHex(p, color, alpha * 0.6);
    p.strokeWeight(0.65);
    p.line(cx + s * 0.06, cy - s * 0.58, cx + s * 0.06, cy - s * 0.16);
    p.line(cx + s * 0.06, cy - s * 0.16, cx + s * 0.48, cy - s * 0.16);
    p.noStroke();
    fillHex(p, C.cyanPale, alpha * 0.75);
    p.rect(cx - s * 0.58, cy - s * 0.58, 1.6, 1.6);
  } else if (kind === 3) {
    // 纹理点。
    p.noStroke();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const h = hash2(x, y, 417);
        if (h < 0.22) continue;
        fillHex(p, color, alpha * (0.35 + h * 0.5));
        p.ellipse(
          cx - s * 0.5 + x * s * 0.5,
          cy - s * 0.5 + y * s * 0.5,
          0.8 + h * 1.1,
          0.8 + h * 1.1
        );
      }
    }
  } else if (kind === 4) {
    // 平行条纹。
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(0.72);
    for (let i = 0; i < 3; i++) {
      const yy = cy - s * 0.42 + i * s * 0.42;
      p.line(cx - s * 0.66 + i * s * 0.1, yy, cx + s * 0.58, yy - s * 0.12);
    }
    p.noStroke();
    fillHex(p, C.cyanPale, alpha * 0.62);
    p.ellipse(cx + s * 0.55, cy - s * 0.52, 1.2, 1.2);
  } else if (kind === 5) {
    // L 形接角。
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(0.85);
    p.line(cx - s * 0.56, cy - s * 0.56, cx - s * 0.56, cy + s * 0.55);
    p.line(cx - s * 0.56, cy + s * 0.55, cx + s * 0.6, cy + s * 0.55);
    strokeHex(p, color, alpha * 0.6);
    p.strokeWeight(0.65);
    p.line(cx - s * 0.18, cy - s * 0.14, cx + s * 0.55, cy - s * 0.14);
  } else {
    // 小环 + 中心点。
    p.noFill();
    strokeHex(p, color, alpha);
    p.strokeWeight(0.8);
    p.ellipse(cx, cy, s * 1.18, s * 1.18);
    strokeHex(p, color, alpha * 0.6);
    p.strokeWeight(0.65);
    p.line(cx, cy - s * 0.75, cx, cy - s * 0.52);
    p.line(cx + s * 0.55, cy, cx + s * 0.76, cy);
    p.noStroke();
    fillHex(p, C.cyanPale, alpha * 0.8);
    p.ellipse(cx, cy, 1.6, 1.6);
  }

  p.pop();
}

function drawNodeChip(p, x, y, type, alpha, simplify, error) {
  const chip = 7;
  p.push();
  p.noStroke();
  fillHex(p, error > 0.2 ? C.errorDeep : C.glass, (error > 0.2 ? 0.18 : 0.55) * alpha);
  p.rect(x - chip, y - chip, chip * 2, chip * 2, 1.1);
  p.noFill();
  strokeHex(p, error > 0.2 ? C.error : C.edge, (error > 0.2 ? 0.6 : 0.3) * alpha);
  p.strokeWeight(0.65);
  p.rect(x - chip, y - chip, chip * 2, chip * 2, 1.1);
  strokeHex(p, error > 0.2 ? C.errorHot : C.cyanSoft, 0.22 * alpha);
  p.line(x - chip + 2, y - chip + 2, x - chip + 5, y - chip + 2);
  drawFeatureGlyph(
    p,
    x,
    y,
    4.4,
    type,
    alpha * 0.86,
    error > 0.2 ? C.errorHot : C.cyan,
    simplify
  );
  p.pop();
}

// ---------- 网络 ----------

function drawFogBands(p, hold, presence) {
  for (let i = 0; i < LAYERS.length - 1; i++) {
    const a = Math.min(layerReveal(i, hold), layerReveal(i + 1, hold)) * presence;
    if (a <= 0.003) continue;
    const left = LAYERS[i];
    const right = LAYERS[i + 1];
    const x0 = left.x + 22;
    const x1 = right.x - 15;
    const err = Math.min(layerError(i, hold), layerError(i + 1, hold));

    p.push();
    p.noStroke();
    fillHex(p, err > 0.35 ? C.errorDeep : C.mist, (err > 0.35 ? 0.012 : 0.019) * a);
    p.beginShape();
    p.vertex(x0, left.top + 30);
    p.vertex(x1, right.top + 32);
    p.vertex(x1, right.nodeBottom + 12);
    p.vertex(x0, left.nodeBottom + 16);
    p.endShape(p.CLOSE);
    fillHex(p, C.cyan, (0.012 + hash2(i, 3, 601) * 0.014) * a);
    p.ellipse((x0 + x1) * 0.5, 392 + i * 8, (x1 - x0) * 1.65, 174);
    p.noFill();
    strokeHex(p, err > 0.35 ? C.error : C.mist, (0.055 + err * 0.05) * a);
    p.strokeWeight(0.6);
    p.line(x0, left.top + 34, x1, right.top + 36);
    p.line(x0, left.nodeBottom + 4, x1, right.nodeBottom + 2);
    p.pop();
  }
}

function drawLayerPlanes(p, hold, presence) {
  for (let i = 0; i < LAYERS.length; i++) {
    const layer = LAYERS[i];
    const reveal = layerReveal(i, hold) * presence;
    if (reveal <= 0.003) continue;
    const err = layerError(i, hold);
    const over = i === 3 ? overAmount(hold) : 0;
    const shift = over * Math.sin(hold * 11 + i) * 1.4;
    const x = layer.x + shift;
    const top = layer.top;
    const bottom = layer.bottom;
    const op = reveal;

    p.push();
    p.noStroke();
    fillHex(p, err > 0.25 ? C.errorDeep : C.glass, (err > 0.25 ? 0.09 : 0.28) * op);
    p.beginShape();
    p.vertex(x - 17, top + 8);
    p.vertex(x + 23, top - 1);
    p.vertex(x + 26, bottom - 9);
    p.vertex(x - 11, bottom + 3);
    p.endShape(p.CLOSE);

    // 层内的横向切片。
    p.strokeWeight(0.6);
    for (let k = 0; k < 9; k++) {
      const u = k / 8;
      const yy = top + 10 + (bottom - top - 20) * u;
      strokeHex(
        p,
        err > 0.4 ? C.error : C.cyan,
        (k % 3 === 0 ? 0.08 : 0.033) * op * (1 - u * 0.22)
      );
      p.line(x - 13 + u * 2, yy + 7, x + 24 - u * 2, yy);
    }

    // 两侧的玻璃厚边。
    p.noFill();
    strokeHex(p, err > 0.35 ? C.error : C.edge, (0.32 + err * 0.2) * op);
    p.strokeWeight(1);
    p.beginShape();
    p.vertex(x - 17, top + 8);
    p.vertex(x + 23, top - 1);
    p.vertex(x + 26, bottom - 9);
    p.endShape();
    strokeHex(p, err > 0.35 ? C.errorHot : C.cyanDeep, (0.25 + err * 0.22) * op);
    p.beginShape();
    p.vertex(x - 17, top + 8);
    p.vertex(x - 11, bottom + 3);
    p.endShape();
    strokeHex(p, C.cyanSoft, 0.13 * op);
    p.strokeWeight(0.7);
    p.line(x + 20, top + 2, x + 23, bottom - 10);

    // 误差层上贴一条抖动的红线。
    if (err > 0.1) {
      strokeHex(p, C.error, 0.34 * err * op);
      p.strokeWeight(0.9);
      p.beginShape();
      for (let k = 0; k <= 8; k++) {
        const yy = top + 16 + k * 23;
        const wobble = Math.sin(k * 2.4 + i) * 2.4;
        p.vertex(x - 17 + wobble, yy);
      }
      p.endShape();
    }

    // 层编号是这套数据仪器的刻度，不是产品界面。
    p.noStroke();
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(6.2);
    fillHex(p, err > 0.35 ? C.errorHot : C.cyan, (0.24 + err * 0.24) * op);
    p.text(layer.label, x + 4, 462);
    strokeHex(p, err > 0.35 ? C.error : C.cyanDeep, 0.3 * op);
    p.strokeWeight(0.8);
    p.line(x + 4, 455, x + 4, 459);

    p.pop();
  }
}

function drawConnections(p, hold, presence) {
  p.push();
  p.noFill();
  for (let i = 0; i < LAYERS.length - 1; i++) {
    const reveal = Math.min(layerReveal(i, hold), layerReveal(i + 1, hold)) * presence;
    if (reveal <= 0.004) continue;
    const err = Math.min(layerError(i, hold), layerError(i + 1, hold));
    const fromLayer = LAYERS[i];
    const toLayer = LAYERS[i + 1];
    for (let f = 0; f < fromLayer.count; f++) {
      const a = nodePoint(i, f, hold);
      for (let g = 0; g < toLayer.count; g++) {
        const b = nodePoint(i + 1, g, hold);
        const w = hash2(f + i * 19, g + i * 11, 701);
        const alpha = (0.028 + w * 0.068) * reveal;
        strokeHex(p, err > 0.4 ? C.cyanDeep : C.line, alpha);
        p.strokeWeight(w > 0.88 ? 0.9 : 0.6);
        p.line(a.x, a.y, b.x, b.y);
        if (w > 0.91) {
          strokeHex(p, err > 0.4 ? C.error : C.cyan, alpha * 0.7);
          p.strokeWeight(0.45);
          p.line(a.x + 1, a.y, b.x + 1, b.y);
        }
      }
    }
  }
  p.pop();
}

function drawSignalPath(p, hold, presence) {
  const pts = pathPoints(hold);
  const reveal = Math.min(layerReveal(0, hold), layerReveal(LAYERS.length - 1, hold)) * presence;
  if (reveal <= 0.004) return;

  p.push();
  p.noFill();
  strokeHex(p, C.cyan, 0.035 * reveal);
  p.strokeWeight(3.4);
  p.beginShape();
  for (const n of pts) p.vertex(n.x, n.y);
  p.endShape();
  strokeHex(p, C.cyanSoft, 0.3 * reveal);
  p.strokeWeight(1.15);
  p.beginShape();
  for (const n of pts) p.vertex(n.x, n.y);
  p.endShape();

  const err = smoothstep(2.54, 2.92, hold);
  if (err > 0.01) {
    strokeHex(p, C.error, 0.055 * err);
    p.strokeWeight(4);
    p.beginShape();
    for (let i = pts.length - 1; i >= 0; i--) p.vertex(pts[i].x, pts[i].y);
    p.endShape();
    strokeHex(p, C.errorHot, 0.5 * err);
    p.strokeWeight(1.25);
    p.beginShape();
    for (let i = pts.length - 1; i >= 0; i--) p.vertex(pts[i].x, pts[i].y);
    p.endShape();

    // 反向路径上的箭头，说明误差往输入侧走。
    for (let k = 1; k < pts.length - 1; k += 2) {
      const a = pts[k];
      const b = pts[k - 1];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      drawArrow(p, a.x, a.y, angle, 4.6, C.errorHot, 0.45 * err);
    }
  }
  p.pop();
}

function drawNode(p, i, k, hold, presence) {
  const layer = LAYERS[i];
  const reveal = layerReveal(i, hold) * presence;
  if (reveal <= 0.004) return;
  const err = layerError(i, hold);
  const point = nodePoint(i, k, hold);
  const over = point.over;
  const twinkle = 0.58 + 0.24 * Math.sin(hold * 2.7 + i * 0.9 + k * 1.7);
  const chipX = point.x - 22;
  const type = (k + i * 2) % 7;
  const simplify = i >= 5 ? 0.9 : i >= 3 ? 0.46 : 0.12;

  p.push();
  p.noStroke();
  // 辉光只做低 alpha 叠层。
  fillHex(p, err > 0.2 ? C.error : C.cyan, (0.043 + twinkle * 0.06) * reveal);
  p.ellipse(point.x, point.y, 18 + err * 9, 18 + err * 9);
  if (over > 0.03) {
    fillHex(p, C.error, 0.05 * over * reveal);
    p.ellipse(point.x, point.y, 30, 30);
  }

  // 节点环。
  p.noFill();
  strokeHex(p, err > 0.16 ? C.error : C.cyanDeep, 0.34 * reveal);
  p.strokeWeight(0.65);
  p.ellipse(point.x, point.y, 10.6, 10.6);
  strokeHex(p, err > 0.16 ? C.errorHot : C.cyan, (0.5 + twinkle * 0.32) * reveal);
  p.strokeWeight(err > 0.16 ? 1.25 : 0.95);
  p.ellipse(point.x, point.y, 8, 8);
  p.noStroke();
  fillHex(p, C.glassDeep, 0.94 * reveal);
  p.ellipse(point.x, point.y, 6.2, 6.2);
  fillHex(p, err > 0.16 ? C.errorHot : C.cyanPale, 0.88 * reveal);
  p.ellipse(point.x - 0.25, point.y - 0.25, 2.5, 2.5);
  if (err > 0.45) {
    fillHex(p, C.amberHot, 0.75 * reveal);
    p.ellipse(point.x, point.y, 1.35, 1.35);
  }

  // 节点旁的小特征图。
  drawNodeChip(p, chipX, point.y, type, reveal * 0.9, simplify, err);

  if (over > 0.05) {
    // “重排过头”的残影。
    p.noFill();
    strokeHex(p, C.error, 0.18 * over * reveal);
    p.strokeWeight(0.7);
    p.ellipse(point.x + 6, point.y - 3, 9.5, 9.5);
    strokeHex(p, C.amberHot, 0.17 * over * reveal);
    p.ellipse(point.x - 5, point.y + 3, 8, 8);
    p.noStroke();
    fillHex(p, C.amberHot, 0.36 * over * reveal);
    p.rect(point.x + 8, point.y - 8, 3, 1);
  }

  // 每个节点下沿的一点点分叉刻度。
  strokeHex(p, err > 0.16 ? C.error : C.line, 0.16 * reveal);
  p.strokeWeight(0.55);
  p.line(point.x - 3, point.y + 6, point.x - 5, point.y + 9);
  p.line(point.x + 3, point.y + 6, point.x + 5, point.y + 9);
  p.pop();
}

function drawOvercorrect(p, hold, presence) {
  const over = overAmount(hold);
  if (over <= 0.01) return;
  const layer = LAYERS[3];
  const a = over * presence;
  p.push();
  p.noFill();
  strokeHex(p, C.error, 0.24 * a);
  p.strokeWeight(0.9);
  p.beginShape();
  p.vertex(layer.x - 27, layer.top + 38);
  p.vertex(layer.x + 38, layer.top + 34);
  p.vertex(layer.x + 38, layer.nodeBottom + 13);
  p.vertex(layer.x - 25, layer.nodeBottom + 9);
  p.endShape();
  strokeHex(p, C.amberHot, 0.4 * a);
  p.strokeWeight(1);
  p.beginShape();
  for (let k = 0; k <= 9; k++) {
    const x = layer.x - 24 + k * 7;
    const y = layer.nodeBottom + 15 + Math.sin(k * 2.6 + hold * 4) * 3;
    p.vertex(x, y);
  }
  p.endShape();

  // 两根反向短箭头，表示这一层被推过头。
  for (let k = 0; k < 2; k++) {
    const yy = layer.top + 54 + k * 18;
    strokeHex(p, C.errorHot, 0.36 * a);
    p.strokeWeight(0.8);
    p.line(layer.x + 32, yy, layer.x + 22, yy);
    p.line(layer.x + 27, yy - 4, layer.x + 22, yy);
    p.line(layer.x + 27, yy + 4, layer.x + 22, yy);
  }
  p.pop();
}

function drawErrorPulse(p, hold, presence) {
  const err = smoothstep(2.54, 2.92, hold);
  if (err <= 0.01) return;
  const pts = pathPoints(hold);
  const rev = [...pts].reverse();
  const q = smoothstep(2.62, 2.98, hold);
  const pos = pointAlong(rev, q);
  const a = err * presence;
  const flicker = 0.74 + 0.26 * Math.sin(hold * 19.5);

  p.push();
  p.noStroke();
  fillHex(p, C.error, 0.06 * a);
  p.ellipse(pos.x, pos.y, 34, 34);
  fillHex(p, C.amberHot, 0.76 * a * flicker);
  p.ellipse(pos.x, pos.y, 5.4, 5.4);
  fillHex(p, C.emberCore, 0.92 * a);
  p.ellipse(pos.x, pos.y, 2.2, 2.2);
  for (let i = 1; i <= 3; i++) {
    const trail = pointAlong(rev, q - i * 0.045);
    fillHex(p, i === 1 ? C.errorHot : C.amber, (0.35 - i * 0.07) * a);
    p.ellipse(trail.x, trail.y, 3.2 - i * 0.55, 3.2 - i * 0.55);
  }
  p.pop();
}

// ---------- 输入特征架 ----------

function drawInputRack(p, hold, presence) {
  const reveal = smoothstep(0.46, 0.96, hold) * presence;
  if (reveal <= 0.004) return;
  const err = smoothstep(2.72, 2.96, hold);
  p.push();
  p.noStroke();

  // 仪器框：切角矩形，不用现代卡片。
  fillHex(p, C.glass, 0.56 * reveal);
  p.beginShape();
  p.vertex(INPUT_FRAME.x + 7, INPUT_FRAME.y);
  p.vertex(INPUT_FRAME.x + INPUT_FRAME.w, INPUT_FRAME.y);
  p.vertex(INPUT_FRAME.x + INPUT_FRAME.w, INPUT_FRAME.y + INPUT_FRAME.h - 7);
  p.vertex(INPUT_FRAME.x + INPUT_FRAME.w - 7, INPUT_FRAME.y + INPUT_FRAME.h);
  p.vertex(INPUT_FRAME.x, INPUT_FRAME.y + INPUT_FRAME.h);
  p.vertex(INPUT_FRAME.x, INPUT_FRAME.y + 7);
  p.endShape(p.CLOSE);

  p.noFill();
  strokeHex(p, err > 0.55 ? C.error : C.edge, (0.28 + err * 0.22) * reveal);
  p.strokeWeight(0.9);
  p.beginShape();
  p.vertex(INPUT_FRAME.x + 7, INPUT_FRAME.y);
  p.vertex(INPUT_FRAME.x + INPUT_FRAME.w, INPUT_FRAME.y);
  p.vertex(INPUT_FRAME.x + INPUT_FRAME.w, INPUT_FRAME.y + INPUT_FRAME.h - 7);
  p.vertex(INPUT_FRAME.x + INPUT_FRAME.w - 7, INPUT_FRAME.y + INPUT_FRAME.h);
  p.vertex(INPUT_FRAME.x, INPUT_FRAME.y + INPUT_FRAME.h);
  p.vertex(INPUT_FRAME.x, INPUT_FRAME.y + 7);
  p.endShape(p.CLOSE);
  strokeHex(p, C.cyanSoft, 0.28 * reveal);
  p.strokeWeight(0.7);
  p.line(INPUT_FRAME.x + 7, INPUT_FRAME.y + 7, INPUT_FRAME.x + 45, INPUT_FRAME.y + 7);

  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(6.4);
  fillHex(p, C.cyanSoft, 0.52 * reveal);
  p.text('INPUT', INPUT_FRAME.x + 2, INPUT_FRAME.y - 8);
  fillHex(p, C.mist, 0.28 * reveal);
  p.text('FEATURE TILES', INPUT_FRAME.x + 36, INPUT_FRAME.y - 8);

  for (let i = 0; i < INPUT_TILES.length; i++) {
    const tile = INPUT_TILES[i];
    const appear = smoothstep(0.46 + i * 0.06, 0.86 + i * 0.06, hold) * presence;
    if (appear <= 0.003) continue;
    const cx = tile.x + tile.w / 2;
    const cy = tile.y + tile.h / 2;
    p.noStroke();
    fillHex(p, i === 1 ? C.navyMid : C.glassDeep, 0.82 * reveal * appear);
    p.rect(tile.x, tile.y, tile.w, tile.h, 1.5);
    strokeHex(p, err > 0.55 ? C.error : C.edge, (0.24 + i * 0.03) * reveal * appear);
    p.strokeWeight(0.7);
    p.noFill();
    p.rect(tile.x, tile.y, tile.w, tile.h, 1.5);
    strokeHex(p, err > 0.55 ? C.errorHot : C.cyan, 0.13 * reveal * appear);
    p.line(tile.x + 4, tile.y + 4, tile.x + 14, tile.y + 4);
    drawFeatureGlyph(
      p,
      cx,
      cy,
      14,
      tile.type,
      reveal * appear * 0.9,
      err > 0.55 ? C.errorHot : C.cyan,
      0
    );
    // 右下角小刻度。
    p.noStroke();
    fillHex(p, err > 0.55 ? C.error : C.cyanDeep, 0.44 * reveal * appear);
    p.rect(tile.x + tile.w - 11, tile.y + tile.h - 7, 7, 0.8);
    p.rect(tile.x + tile.w - 7, tile.y + tile.h - 5, 3, 0.8);
  }

  // 特征收集线：先沿左侧落到输入总线，再从标题下方横穿到第一层。
  p.push();
  p.noFill();
  strokeHex(p, C.cyanDeep, 0.3 * reveal);
  p.strokeWeight(0.8);
  p.line(142, 306, 142, 456);

  // 每块特征瓦片用短引线接入收集轨；左列从列间窄槽绕到底部。
  strokeHex(p, C.cyan, 0.16 * reveal);
  p.strokeWeight(0.55);
  for (let i = 0; i < INPUT_TILES.length; i++) {
    const tile = INPUT_TILES[i];
    const cy = tile.y + tile.h / 2;
    if (i === 0 || i === 2) {
      p.line(tile.x + tile.w, cy, 80, cy);
      p.line(80, cy, 80, 399);
    } else {
      p.line(tile.x + tile.w, cy, 142, cy);
    }
  }
  p.line(80, 399, 142, 399);
  p.noStroke();
  fillHex(p, C.cyanSoft, 0.2 * reveal);
  p.ellipse(142, 324, 1.5, 1.5);
  p.ellipse(142, 372, 1.5, 1.5);
  p.ellipse(142, 399, 1.5, 1.5);

  for (let i = 0; i < 6; i++) {
    strokeHex(p, C.cyan, (0.1 + i * 0.025) * reveal);
    p.line(142, 318 + i * 21, 148, 318 + i * 21);
  }
  strokeHex(p, C.cyan, 0.28 * reveal);
  p.strokeWeight(0.9);
  p.line(142, 456, 452, 456);
  for (let x = 158; x < 450; x += 34) {
    strokeHex(p, C.cyanSoft, 0.18 * reveal);
    p.line(x, 452, x, 460);
  }
  strokeHex(p, C.cyanSoft, 0.18 * reveal);
  p.line(142, 306, 136, 306);
  drawArrow(p, 458, 456, 0, 5, C.cyan, 0.5 * reveal);

  // 总线到第一层节点的短接线。
  for (let k = 0; k < LAYERS[0].count; k++) {
    const n = nodePoint(0, k, hold);
    strokeHex(p, C.cyanDeep, (0.1 + hash2(k, 5, 610) * 0.12) * reveal);
    p.strokeWeight(0.65);
    p.line(458, 456, n.x - 4, n.y);
  }

  // 几颗沿输入总线滑向网络的小点。
  p.noStroke();
  for (let i = 0; i < 5; i++) {
    const u = clamp((hold * 0.13 + i * 0.19) % 1, 0, 1);
    fillHex(p, i === 3 ? C.cyanPale : C.cyan, 0.35 * reveal);
    p.ellipse(142 + u * 310, 455.5, 1.5, 1.5);
  }
  p.pop();
  p.pop();
}

// ---------- 输出标签 ----------

function drawSymbol(p, cx, cy, s, kind, color, alpha) {
  p.push();
  p.translate(cx, cy);
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(1.15);
  if (kind === 0) {
    p.ellipse(0, 0, s * 1.38, s * 1.38);
    p.line(-s * 0.85, 0, -s * 1.18, 0);
    p.line(s * 0.85, 0, s * 1.18, 0);
    p.noStroke();
    fillHex(p, color, alpha);
    p.ellipse(0, 0, s * 0.34, s * 0.34);
  } else if (kind === 1) {
    p.triangle(-s * 0.86, s * 0.64, s * 0.86, s * 0.64, 0, -s * 0.78);
    strokeHex(p, C.error, alpha);
    p.strokeWeight(1.5);
    p.line(-s * 0.46, s * 0.3, s * 0.48, -s * 0.34);
  } else {
    p.line(-s * 0.72, -s * 0.72, s * 0.72, s * 0.72);
    p.line(s * 0.72, -s * 0.72, -s * 0.72, s * 0.72);
    p.ellipse(0, 0, s * 0.5, s * 0.5);
  }
  p.pop();
}

function drawOutputBlock(p, hold, presence) {
  const reveal = smoothstep(0.94, 1.42, hold) * presence;
  if (reveal <= 0.004) return;
  const err = smoothstep(2.7, 2.94, hold);
  const flip = smoothstep(2.76, 2.94, hold);
  const faceBack = flip > 0.5;
  const sx = Math.max(0.06, Math.abs(Math.cos(flip * Math.PI)));
  const x = OUT.cx;
  const y = OUT.cy;
  const w = OUT.w;
  const h = OUT.h;
  const last = nodePoint(LAYERS.length - 1, PATH_INDEX[PATH_INDEX.length - 1], hold);

  p.push();
  p.noFill();
  const joinX = x - w / 2 - 13;
  strokeHex(p, err > 0.3 ? C.error : C.cyanDeep, (0.2 + err * 0.32) * reveal);
  p.strokeWeight(0.75);
  p.line(last.x + 5, last.y, joinX, last.y);
  p.line(joinX, last.y, joinX, y);
  p.line(joinX, y, x - w / 2 - 5, y);
  drawArrow(p, x - w / 2 - 1, y, 0, 4.3, err > 0.3 ? C.errorHot : C.cyan, 0.4 * reveal);

  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.BOTTOM);
  p.textSize(6.4);
  fillHex(p, err > 0.3 ? C.errorHot : C.cyan, (0.28 + err * 0.28) * reveal);
  p.text('OUT', x, y - h / 2 - 6);

  // 输出标签的旧答案残影。
  if (err > 0.01) {
    p.push();
    p.translate(x - 13 * err, y + 4 * err);
    drawSymbol(p, 0, 0, 8.5, 0, C.cyan, 0.13 * err * reveal);
    p.pop();
  }

  // 标签本体：一块带切角的小玻璃牌。
  p.push();
  p.translate(x, y);
  fillHex(p, C.glass, 0.9 * reveal);
  p.beginShape();
  p.vertex(-w / 2, -h / 2 + 6);
  p.vertex(-w / 2 + 7, -h / 2);
  p.vertex(w / 2, -h / 2);
  p.vertex(w / 2, h / 2 - 5);
  p.vertex(w / 2 - 5, h / 2);
  p.vertex(-w / 2, h / 2);
  p.endShape(p.CLOSE);
  p.noFill();
  strokeHex(p, err > 0.3 ? C.error : C.edge, (0.66 + err * 0.22) * reveal);
  p.strokeWeight(1.1);
  p.beginShape();
  p.vertex(-w / 2, -h / 2 + 6);
  p.vertex(-w / 2 + 7, -h / 2);
  p.vertex(w / 2, -h / 2);
  p.vertex(w / 2, h / 2 - 5);
  p.vertex(w / 2 - 5, h / 2);
  p.vertex(-w / 2, h / 2);
  p.endShape(p.CLOSE);
  strokeHex(p, err > 0.3 ? C.errorHot : C.cyan, (0.3 + err * 0.3) * reveal);
  p.line(-w / 2 + 9, -h / 2 + 5, w / 2 - 18, -h / 2 + 5);

  p.noStroke();
  fillHex(p, err > 0.3 ? C.error : C.cyanDeep, 0.2 * reveal);
  p.rect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 2);

  p.push();
  p.scale(sx, 1);
  drawSymbol(
    p,
    0,
    -3,
    10.5,
    faceBack ? 1 : 0,
    faceBack ? C.errorHot : C.cyanPale,
    reveal * 0.95
  );
  p.pop();

  // 置信刻度：不变的是自信，不是答案。
  const filled = faceBack ? 4 : 4;
  for (let i = 0; i < 5; i++) {
    p.noStroke();
    fillHex(
      p,
      i < filled ? (err > 0.3 ? C.error : C.cyan) : C.navyLight,
      (i < filled ? 0.65 : 0.3) * reveal
    );
    p.rect(-w / 2 + 10 + i * 8, h / 2 - 10, 5, 2.2, 0.5);
  }
  p.pop();

  // 候选标签：几何符号，不写真实类别名。
  for (let i = 0; i < OUT_ROWS.length; i++) {
    const row = OUT_ROWS[i];
    const selected = faceBack ? i === 0 : i === 1;
    const rowAlpha = reveal * (0.62 + (selected ? 0.25 : 0.08));
    const rowX = x;
    p.push();
    p.translate(rowX, row.cy);
    p.noStroke();
    fillHex(p, selected ? (err > 0.3 ? C.errorDeep : C.navyMid) : C.glassDeep,
      (selected ? 0.36 + err * 0.2 : 0.24) * reveal);
    p.rect(-29, -6.2, 58, 12.4, 1.2);
    p.noFill();
    strokeHex(
      p,
      selected ? (err > 0.3 ? C.error : C.cyan) : C.edge,
      (selected ? 0.62 : 0.18) * reveal
    );
    p.strokeWeight(selected ? 1 : 0.6);
    p.rect(-29, -6.2, 58, 12.4, 1.2);
    p.noFill();
    strokeHex(p, err > 0.3 && selected ? C.errorHot : C.cyanSoft, rowAlpha);
    p.strokeWeight(0.7);
    drawSymbol(p, -18, 0, 3.8, row.sym, selected ? (err > 0.3 ? C.errorHot : C.cyanPale) : C.cyanDeep, rowAlpha);
    const confidence = i === 0 ? 2 + 2 * err : i === 1 ? 4 - 2 * err : 1;
    for (let k = 0; k < 5; k++) {
      p.noStroke();
      fillHex(p, k < confidence ? (err > 0.3 && selected ? C.error : C.cyan) : C.navyLight, 0.35 * reveal);
      p.rect(1 + k * 4.8, -1.2, 3.4, 2.4, 0.4);
    }
    if (selected) {
      p.noStroke();
      fillHex(p, err > 0.3 ? C.errorHot : C.cyanPale, 0.7 * reveal);
      p.rect(-25.5, -2, 1.4, 4);
    }
    p.pop();
  }

  // 输出到损失屏的细连线：从玻璃牌右缘绕开候选标签，再落到屏幕上沿。
  const linkX = x + w / 2 + 4;
  const linkAlpha = (0.12 + err * 0.35) * reveal;
  strokeHex(p, err > 0.3 ? C.error : C.cyanDeep, linkAlpha);
  p.strokeWeight(0.7);
  p.line(x + w / 2, y + 10, linkX, y + 10);
  dashedLine(
    p,
    linkX,
    y + 10,
    linkX,
    LOSS.y - 4,
    linkAlpha,
    err > 0.3 ? C.error : C.cyanDeep,
    0.75
  );
  p.pop();
}

// ---------- 损失曲线 ----------

function lossValue(u) {
  const base = 0.33 + 0.19 * (1 - u) + 0.012 * Math.sin(u * 17 + 1.2);
  const d = Math.abs(u - 0.9);
  const spike = 0.52 * (1 - smoothstep(0, 0.082, d));
  return base + spike;
}

function drawLossPanel(p, hold, presence) {
  const exitFade = 1 - smoothstep(4.12, 4.94, hold);
  const fade = presence * exitFade;
  if (fade <= 0.004) return;
  const err = smoothstep(2.7, 2.95, hold);
  const progress = smoothstep(0.56, 3.0, hold) * 0.9;
  const reveal = smoothstep(0.82, 1.32, hold) * fade;
  if (reveal <= 0.004) return;

  p.push();
  p.noStroke();
  // 仪器屏底板。
  fillHex(p, C.glassDeep, 0.84 * reveal);
  p.beginShape();
  p.vertex(LOSS.x + 10, LOSS.y);
  p.vertex(LOSS.x + LOSS.w, LOSS.y);
  p.vertex(LOSS.x + LOSS.w, LOSS.y + LOSS.h - 10);
  p.vertex(LOSS.x + LOSS.w - 10, LOSS.y + LOSS.h);
  p.vertex(LOSS.x, LOSS.y + LOSS.h);
  p.vertex(LOSS.x, LOSS.y + 10);
  p.endShape(p.CLOSE);
  fillHex(p, C.navy, 0.12 * reveal);
  p.rect(LOSS.x + 4, LOSS.y + 4, LOSS.w - 8, 22);

  p.noFill();
  strokeHex(p, err > 0.3 ? C.error : C.edge, (0.4 + err * 0.3) * reveal);
  p.strokeWeight(1);
  p.beginShape();
  p.vertex(LOSS.x + 10, LOSS.y);
  p.vertex(LOSS.x + LOSS.w, LOSS.y);
  p.vertex(LOSS.x + LOSS.w, LOSS.y + LOSS.h - 10);
  p.vertex(LOSS.x + LOSS.w - 10, LOSS.y + LOSS.h);
  p.vertex(LOSS.x, LOSS.y + LOSS.h);
  p.vertex(LOSS.x, LOSS.y + 10);
  p.endShape();
  strokeHex(p, C.cyanSoft, 0.22 * reveal);
  p.line(LOSS.x + 10, LOSS.y + 8, LOSS.x + 72, LOSS.y + 8);
  strokeHex(p, err > 0.3 ? C.errorHot : C.cyan, 0.3 * reveal);
  p.strokeWeight(0.8);
  p.line(LOSS.x + 14, LOSS.y + 17, LOSS.x + 36, LOSS.y + 17);

  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(7);
  fillHex(p, err > 0.3 ? C.errorHot : C.cyan, (0.46 + err * 0.3) * reveal);
  p.text('LOSS', LOSS.x + 14, LOSS.y + 13);
  fillHex(p, C.mist, 0.28 * reveal);
  p.textSize(5.8);
  p.textAlign(p.RIGHT, p.CENTER);
  p.text('STEP', LOSS.x + LOSS.w - 16, LOSS.y + 13);

  // 坐标纸。
  p.strokeWeight(0.65);
  for (let i = 0; i <= 6; i++) {
    const x = PLOT.x + (i / 6) * PLOT.w;
    strokeHex(p, C.line, i === 0 ? 0.22 : 0.06);
    p.line(x, PLOT.y, x, PLOT.y + PLOT.h);
  }
  for (let i = 0; i <= 4; i++) {
    const y = PLOT.y + (i / 4) * PLOT.h;
    strokeHex(p, C.line, i === 4 ? 0.22 : 0.06);
    p.line(PLOT.x, y, PLOT.x + PLOT.w, y);
  }
  strokeHex(p, C.cyanDeep, 0.3 * reveal);
  p.strokeWeight(0.8);
  p.line(PLOT.x, PLOT.y + PLOT.h, PLOT.x + PLOT.w, PLOT.y + PLOT.h);
  p.line(PLOT.x, PLOT.y + PLOT.h, PLOT.x, PLOT.y);
  for (let i = 0; i <= 6; i++) {
    const x = PLOT.x + (i / 6) * PLOT.w;
    strokeHex(p, C.cyanDeep, 0.25 * reveal);
    p.line(x, PLOT.y + PLOT.h, x, PLOT.y + PLOT.h + 3);
  }
  for (let i = 0; i <= 4; i++) {
    const y = PLOT.y + (i / 4) * PLOT.h;
    strokeHex(p, C.cyanDeep, 0.22 * reveal);
    p.line(PLOT.x - 3, y, PLOT.x, y);
  }

  // 曲线采样。只画到当前步；误差发生时，末端正好冲到尖峰。
  const count = 46;
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const u = (i / count) * progress;
    const x = PLOT.x + 6 + (u / 0.9) * (PLOT.w - 12);
    const y = PLOT.y + PLOT.h - clamp(lossValue(u), 0, 0.95) * PLOT.h * 0.94;
    pts.push({ x, y, u });
  }
  if (pts.length > 1) {
    p.noStroke();
    fillHex(p, err > 0.4 ? C.error : C.cyan, 0.03 * reveal);
    p.beginShape();
    p.vertex(pts[0].x, PLOT.y + PLOT.h);
    for (const q of pts) p.vertex(q.x, q.y);
    p.vertex(pts[pts.length - 1].x, PLOT.y + PLOT.h);
    p.endShape(p.CLOSE);

    p.strokeWeight(3.2);
    for (let i = 0; i < pts.length - 1; i++) {
      const hot = err > 0.2 && pts[i].u > 0.7;
      strokeHex(p, hot ? C.error : C.cyan, (hot ? 0.07 : 0.035) * reveal);
      p.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
    p.strokeWeight(1.25);
    for (let i = 0; i < pts.length - 1; i++) {
      const hot = err > 0.2 && pts[i].u > 0.7;
      strokeHex(p, hot ? C.errorHot : C.cyanSoft, (hot ? 0.85 : 0.7) * reveal);
      p.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }

    const end = pts[pts.length - 1];
    p.noStroke();
    fillHex(p, err > 0.4 ? C.error : C.cyan, 0.11 * reveal);
    p.ellipse(end.x, end.y, err > 0.4 ? 22 : 14, err > 0.4 ? 22 : 14);
    fillHex(p, err > 0.4 ? C.errorHot : C.cyanPale, 0.9 * reveal);
    p.ellipse(end.x, end.y, err > 0.4 ? 4.2 : 3, err > 0.4 ? 4.2 : 3);

    if (err > 0.04) {
      // 尖峰标记：几根短线，而不是一个警告 UI。
      p.strokeWeight(0.8);
      strokeHex(p, C.errorHot, 0.72 * err * reveal);
      for (let i = 0; i < 3; i++) {
        const a = -1.9 + i * 0.9;
        p.line(
          end.x + Math.cos(a) * 9,
          end.y + Math.sin(a) * 9,
          end.x + Math.cos(a) * (14 + err * 4),
          end.y + Math.sin(a) * (14 + err * 4)
        );
      }
      // 末端峰值到横轴的一条细虚线，强调“抬头”。
      p.strokeWeight(0.7);
      for (let yy = end.y + 8; yy < PLOT.y + PLOT.h; yy += 6) {
        strokeHex(p, C.error, 0.18 * err * reveal);
        p.line(end.x, yy, end.x, Math.min(yy + 3, PLOT.y + PLOT.h));
      }
      // 损失屏上的一点反光。
      fillHex(p, C.error, 0.025 * err * reveal);
      p.ellipse(end.x, end.y, 54, 32);
    }
  }

  // 右下角的一枚小刻度，帮画面收边。
  p.noStroke();
  fillHex(p, C.cyanDeep, 0.25 * reveal);
  p.textAlign(p.RIGHT, p.CENTER);
  p.textSize(5.6);
  p.text('N', LOSS.x + LOSS.w - 16, LOSS.y + LOSS.h - 12);
  p.pop();
}

// ---------- 离场 token 序列（简化） ----------

function drawTokenStrip(p, t, presence) {
  const exit = smoothstep(4.12, 5.26, t);
  if (exit <= 0.004) return;
  const y = 423;
  const fade = 1 - smoothstep(5.3, 6, t);
  p.push();
  p.noStroke();
  for (let i = 0; i < LAYERS.length; i++) {
    const reveal = smoothstep(4.12 + i * 0.06, 4.72 + i * 0.06, t);
    if (reveal <= 0.003) continue;
    const x = 472 + i * 66;
    const lift = (1 - reveal) * 18;
    const a = reveal * fade * 0.88;
    p.push();
    p.translate(x, y + lift);
    fillHex(p, C.glass, 0.72 * a);
    p.beginShape();
    p.vertex(-21, -14);
    p.vertex(17, -14);
    p.vertex(22, -9);
    p.vertex(22, 14);
    p.vertex(-21, 14);
    p.endShape(p.CLOSE);
    p.noFill();
    strokeHex(p, C.cyan, 0.38 * a);
    p.strokeWeight(0.8);
    p.beginShape();
    p.vertex(-21, -14);
    p.vertex(17, -14);
    p.vertex(22, -9);
    p.vertex(22, 14);
    p.vertex(-21, 14);
    p.endShape(p.CLOSE);
    p.noStroke();
    fillHex(p, C.cyanSoft, 0.55 * a);
    p.rect(-15, -8, 21, 1.2);
    p.rect(-15, -4, 12, 1);
    fillHex(p, C.cyanDeep, 0.32 * a);
    for (let k = 0; k < 3; k++) p.rect(4, 1 + k * 3.2, 11, 1);
    drawFeatureGlyph(p, -2, 6, 4.2, i, 0.55 * a, C.cyan, i >= 4 ? 0.5 : 0);
    p.pop();
  }
  p.pop();
}

// ---------- 标题与氛围 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 180;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, C.cream, 0.76 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.cyanSoft, 0.2 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1.2, w - 4, 1.2, 1);
  fillHex(p, C.creamDim, 0.18 * alpha);
  p.rect(x - w / 2 + 2, y + h / 2 - 2.5, w - 4, 1);
  p.noFill();
  strokeHex(p, C.cyanDeep, 0.5 * alpha);
  p.strokeWeight(0.9);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

function drawAtmosphere(p, alpha) {
  if (alpha <= 0.001) return;
  p.push();
  p.noStroke();
  // 极淡的蓝色层间反光，不盖标题。
  fillHex(p, C.cyan, 0.012 * alpha);
  p.ellipse(710, 360, 540, 250);
  fillHex(p, C.error, 0.008 * alpha);
  p.ellipse(894, 405, 140, 90);
  p.pop();
}

// ---------- 主角：梯度方块 / 多层权重棱镜 ----------

function drawActorCube(p, rawT, state) {
  const raw = clamp(rawT, 0, 6);
  const hold = Math.min(raw, 3);
  const appear = smoothstep(0, 0.38, hold);
  const exit = smoothstep(4.2, 5.5, raw);
  const error = smoothstep(2.7, 2.92, hold);
  const slices = 1 + Math.floor(clamp((hold - 1.15) / 0.55, 0, 2));
  const roll = Math.sin(hold * TAU + 0.65) * 0.055;
  const bounce = -Math.abs(Math.sin(hold * TAU)) * 1.6;
  const scale = (0.9 + 0.1 * appear) * (1 - 0.18 * exit);
  const flash = smoothstep(2.8, 2.94, hold) * (0.78 + 0.22 * Math.sin(hold * 18.5));

  p.push();
  // 直接吃世界坐标，不在这里减版块偏移。
  p.translate(state.x, ROAD_MID);
  p.scale(scale);
  p.translate(0, bounce);
  p.noStroke();

  // 张量带上的接触影与滚动刻度。
  fillHex(p, C.bgDeep, 0.58 * appear);
  p.ellipse(2, -1, 74, 13);
  fillHex(p, C.cyan, 0.035 * appear);
  p.ellipse(0, -4, 92, 22);
  strokeHex(p, C.cyanDeep, 0.3 * appear);
  p.strokeWeight(0.7);
  p.noFill();
  p.ellipse(0, -1, 29, 7);
  strokeHex(p, C.creamDim, 0.22 * appear);
  p.line(-36, 0, -25, 0);
  p.line(25, 0, 36, 0);

  // 滚动尾迹：几片被压扁的张量片。
  p.noStroke();
  for (let i = 0; i < 3; i++) {
    const tx = -36 - i * 11;
    fillHex(p, i === 0 ? C.cyan : C.mist, (0.11 - i * 0.025) * appear);
    p.beginShape();
    p.vertex(tx - 8, -4 - i * 1.5);
    p.vertex(tx + 8, -6 - i * 1.5);
    p.vertex(tx + 11, 0);
    p.vertex(tx - 7, 0);
    p.endShape(p.CLOSE);
  }

  // 方块本体。轻微起伏，不做大幅翻滚；两拍动作主要靠切片数/层间停顿。
  p.push();
  p.translate(0, -16);
  p.rotate(roll);
  p.translate(0, -2);

  // 落影与内部暖光。
  p.noStroke();
  fillHex(p, C.bgDeep, 0.4 * appear);
  p.rect(-21, -24, 46, 44, 3);
  fillHex(p, C.ember, 0.05 * appear);
  p.rect(-27, -30, 56, 56, 5);
  fillHex(p, C.cyan, 0.03 * appear);
  p.rect(-26, -28, 56, 52, 5);

  // 右侧面。
  fillHex(p, C.cyanDeep, 0.11 * appear);
  p.beginShape();
  p.vertex(16, 13);
  p.vertex(27, 6);
  p.vertex(27, -26);
  p.vertex(16, -19);
  p.endShape(p.CLOSE);
  // 顶面。
  fillHex(p, C.cyanSoft, 0.075 * appear);
  p.beginShape();
  p.vertex(-20, -19);
  p.vertex(16, -19);
  p.vertex(27, -26);
  p.vertex(-9, -27);
  p.endShape(p.CLOSE);

  // 正面：半透明玻璃，内部蓝切片从外面透出来。
  fillHex(p, C.glass, 0.82 * appear);
  p.beginShape();
  p.vertex(-20, 12);
  p.vertex(16, 12);
  p.vertex(16, -19);
  p.vertex(-20, -19);
  p.endShape(p.CLOSE);
  strokeHex(p, C.cyanSoft, 0.31 * appear);
  p.strokeWeight(1.1);
  p.noFill();
  p.beginShape();
  p.vertex(-20, 12);
  p.vertex(16, 12);
  p.vertex(16, -19);
  p.vertex(-20, -19);
  p.endShape(p.CLOSE);

  // 2–3 层内部权重切片。
  for (let s = 0; s < slices; s++) {
    const mis = error * ((s % 2 === 0 ? 1 : -1) * 1.5);
    const x0 = -16 + s * 6 + mis;
    const yTop = -16 - s * 2;
    const yBot = 9 - s * 2.4;
    fillHex(p, s === slices - 1 ? C.cyan : C.cyanDeep, (0.045 + s * 0.012) * appear);
    p.beginShape();
    p.vertex(x0, yBot);
    p.vertex(x0 + 14, yBot - 1);
    p.vertex(x0 + 14, yTop);
    p.vertex(x0, yTop + 1);
    p.endShape(p.CLOSE);
    strokeHex(p, s === slices - 1 ? C.cyanPale : C.cyan, 0.22 * appear);
    p.strokeWeight(0.7);
    p.noFill();
    p.beginShape();
    p.vertex(x0, yBot);
    p.vertex(x0 + 14, yBot - 1);
    p.vertex(x0 + 14, yTop);
    p.vertex(x0, yTop + 1);
    p.endShape();
  }

  // 权重刻度和向后箭头。
  p.noStroke();
  for (let i = 0; i < 7; i++) {
    const hh = 2 + hash2(i, 3, 821) * 4;
    fillHex(p, i === 4 ? C.creamDim : C.cyan, (0.18 + hash2(i, 2, 822) * 0.2) * appear);
    p.rect(-15 + i * 4.4, 7 - hh, 0.8, hh);
  }
  strokeHex(p, C.amber, 0.62 * appear);
  p.strokeWeight(1);
  p.noFill();
  p.beginShape();
  p.vertex(9, -10);
  p.vertex(-1, -10);
  p.vertex(-5, -13);
  p.endShape();
  drawArrow(p, -7, -13, Math.PI, 3.8, C.amberHot, 0.7 * appear);
  strokeHex(p, C.amber, 0.22 * appear);
  p.strokeWeight(0.65);
  p.noFill();
  p.beginShape();
  p.vertex(11, -6);
  p.vertex(1, -6);
  p.endShape();

  // 火种：第 11 版块的同一颗暖赭。
  const cx = -2.5;
  const cy = -0.5;
  fillHex(p, C.bgDeep, 0.95 * appear);
  p.ellipse(cx, cy, 13, 13);
  fillHex(p, C.ember, (0.35 + flash * 0.2) * appear);
  p.ellipse(cx, cy, 10, 10);
  fillHex(p, C.emberHot, 0.94 * appear);
  p.ellipse(cx - 0.4, cy - 0.6, 5.2, 5.8);
  fillHex(p, C.emberCore, 0.96 * appear);
  p.ellipse(cx - 0.8, cy - 1.1, 2, 2.2);
  strokeHex(p, C.emberHot, (0.28 + flash * 0.24) * appear);
  p.strokeWeight(0.7);
  p.noFill();
  p.ellipse(cx, cy, 15 + flash * 7, 15 + flash * 7);
  if (error > 0.05) {
    fillHex(p, C.error, 0.06 * error * appear);
    p.ellipse(cx, cy, 30, 30);
  }

  // 物体边缘的冷光高线。
  p.noStroke();
  fillHex(p, C.cyanPale, 0.32 * appear);
  p.rect(-19, -18.5, 20, 0.8);
  fillHex(p, C.cyan, 0.25 * appear);
  p.rect(-20, 11, 31, 0.7);
  strokeHex(p, C.cyanSoft, 0.3 * appear);
  p.strokeWeight(0.7);
  p.noFill();
  p.beginShape();
  p.vertex(16, 12);
  p.vertex(27, 6);
  p.vertex(27, -26);
  p.endShape();
  p.beginShape();
  p.vertex(-20, -19);
  p.vertex(16, -19);
  p.vertex(27, -26);
  p.endShape();

  // 误差在表面上留下的细裂纹。
  if (error > 0.04) {
    strokeHex(p, C.errorHot, 0.55 * error * appear);
    p.strokeWeight(0.8);
    p.noFill();
    p.beginShape();
    p.vertex(-14, -18);
    p.vertex(-10, -9);
    p.vertex(-13, -2);
    p.vertex(-8, 5);
    p.endShape();
    p.beginShape();
    p.vertex(7, -17);
    p.vertex(10, -11);
    p.vertex(8, -7);
    p.endShape();
    p.noStroke();
    fillHex(p, C.amberHot, 0.65 * error * appear);
    p.rect(-10.5, -9.5, 1.2, 1.2);
  }

  // 定格时套在方块外的一圈断续环，很像测量仪器夹住它。
  if (error > 0.2) {
    p.noFill();
    strokeHex(p, C.amberHot, 0.24 * error * appear);
    p.strokeWeight(0.9);
    for (let i = 0; i < 18; i++) {
      if (i % 3 === 0) continue;
      const a0 = (i / 18) * TAU;
      const a1 = a0 + TAU / 26;
      p.beginShape();
      for (let k = 0; k <= 2; k++) {
        const a = a0 + (a1 - a0) * (k / 2);
        p.vertex(Math.cos(a) * 36, -11 + Math.sin(a) * 12);
      }
      p.endShape();
    }
    p.noStroke();
    fillHex(p, C.error, 0.22 * error * appear);
    p.rect(-4, -52, 8, 1);
  }

  p.pop();

  // 离场：切片从方块壳里展开成薄薄的键值卡。
  if (exit > 0.01) {
    p.push();
    p.noStroke();
    for (let s = 0; s < 3; s++) {
      const spread = exit * (18 + s * 15);
      const a = exit * (1 - exit * 0.25) * 0.32;
      fillHex(p, s === 1 ? C.cyanSoft : C.cyan, a * 0.28);
      p.rect(-12 + s * 3 - spread, -56 + s * 6, 17 + s * 3, 1.4);
      strokeHex(p, C.cyan, a);
      p.strokeWeight(0.7);
      p.noFill();
      p.rect(-18 + s * 4 - spread, -61 + s * 7, 24 + s * 3, 20 + s * 2, 1);
      p.noStroke();
    }
    p.pop();
  }

  p.pop();
}

// ---------- 张量带 ----------

function drawLeftSampleStack(p, t, fade) {
  if (fade <= 0.005) return;
  p.push();
  p.noStroke();
  // 从第 12 版块的样本纸带折成张量层：一条暖纸边压进冷蓝。
  for (let k = 0; k < 5; k++) {
    const y = 447 + k * 8;
    const skew = 10 + k * 5;
    fillHex(p, k < 2 ? C.creamDim : C.mist, (0.1 - k * 0.012) * fade);
    p.beginShape();
    p.vertex(0, y);
    p.vertex(18 + k * 9, y);
    p.vertex(46 + k * 13, y + 7);
    p.vertex(0, y + 7);
    p.endShape(p.CLOSE);
    strokeHex(p, k === 0 ? C.cream : C.cyan, (0.16 - k * 0.02) * fade);
    p.strokeWeight(0.65);
    p.line(24 + skew, y + 1.5, 50 + skew, y + 1.5);
  }
  p.noStroke();
  for (let i = 0; i < 4; i++) {
    fillHex(p, i === 2 ? C.emberHot : C.cream, 0.22 * fade);
    p.ellipse(26 + i * 18, 454 + i * 7, 1.6, 1.6);
  }
  p.pop();
}

function drawExitTokens(p, t, fade) {
  const exit = smoothstep(4.1, 5.28, t);
  if (exit <= 0.005) return;
  p.push();
  p.noStroke();
  // 张量带在最后缩成一段 token 序列。
  fillHex(p, C.bgDeep, 0.7 * exit * fade);
  p.rect(0, 484, 1000, 28);
  for (let i = 0; i < 10; i++) {
    const x = 60 + i * 100;
    const a = exit * fade * (0.2 + hash2(i, 5, 715) * 0.35);
    strokeHex(p, C.cyan, a);
    p.strokeWeight(0.8);
    p.noFill();
    p.rect(x - 26, 489, 52, 18, 1.5);
    p.noStroke();
    fillHex(p, C.cyanSoft, a * 0.8);
    p.rect(x - 18, 494, 22 + (i % 3) * 7, 1.1);
    p.rect(x - 18, 499, 31, 0.9);
    fillHex(p, C.cyanDeep, a * 0.5);
    p.rect(x + 14, 493, 4, 4);
  }
  p.pop();
}

function drawTensorBand(p, t, state) {
  const hold = Math.min(t, 3);
  const exit = smoothstep(4.08, 5.32, t);
  const fade = 1 - smoothstep(5.35, 6, t);
  p.push();
  p.noStroke();

  // 全宽覆盖默认路面带 y=470..530。
  fillHex(p, '#02050d', 1);
  p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  fillHex(p, '#081126', 1);
  p.rect(0, 473, 1000, 54);
  fillHex(p, C.navyMid, 0.46);
  p.rect(0, 478, 1000, 44);

  // 层的上下边缘：不是普通路面，而是被压紧的张量封边。
  fillHex(p, C.bgDeep, 0.96);
  p.rect(0, 469, 1000, 4);
  p.rect(0, 527, 1000, 4);
  fillHex(p, C.cyan, 0.2);
  p.rect(0, 473, 1000, 1);
  fillHex(p, C.edge, 0.5);
  p.rect(0, 525, 1000, 1.2);
  fillHex(p, C.cyanDeep, 0.1);
  p.rect(0, 476, 1000, 1);

  // 并行细线。
  const lanes = [480, 486, 492, 498, 504, 510, 516, 522];
  for (let i = 0; i < lanes.length; i++) {
    const y = lanes[i];
    strokeHex(
      p,
      i === 3 ? C.creamDim : i % 3 === 0 ? C.cyan : C.mist,
      (i === 3 ? 0.17 : i % 3 === 0 ? 0.14 : 0.08) * (1 - exit * 0.4)
    );
    p.strokeWeight(i === 3 ? 0.8 : 0.55);
    p.line(0, y, 1000, y);
  }
  strokeHex(p, C.cyanPale, 0.09);
  p.strokeWeight(0.6);
  p.line(0, 499.5, 1000, 499.5);

  // 张量切片斜纹。
  p.strokeWeight(0.55);
  for (let x = -24; x < 1000; x += 15) {
    strokeHex(p, C.cyan, 0.024);
    p.line(x, 478, x + 15, 524);
  }
  for (let x = -16; x < 1000; x += 50) {
    strokeHex(p, C.creamDim, 0.045);
    p.line(x, 476, x + 9, 526);
  }

  // 压扁的数据片。
  p.noStroke();
  for (const f of FLAKES) {
    const wobble = Math.sin(hold * 1.4 + f.x * 0.021) * 1.2;
    fillHex(p, f.warm && hold > 2.8 ? C.emberHot : C.cyanSoft, f.a * (1 - exit * 0.55));
    p.rect(f.x + wobble, f.y, f.w, f.h, 0.3);
  }

  // 层索引 / 截面刻度。
  for (let i = 0; i < LAYERS.length; i++) {
    const layer = LAYERS[i];
    const x = layer.x + 4;
    strokeHex(p, C.cyan, 0.16);
    p.strokeWeight(0.8);
    p.line(x, 472, x, 526);
    strokeHex(p, C.cyanSoft, 0.34);
    p.line(x - 5, 473, x + 5, 473);
    p.noStroke();
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(5.4);
    fillHex(p, C.cyanSoft, 0.36);
    p.text(layer.label, x, 526);
  }

  // 两端的小标记：左边接样本纸带，右边接 token 序列。
  drawLeftSampleStack(p, t, 1 - exit);

  // 张量带上的弱脉冲点。
  p.noStroke();
  for (let i = 0; i < 22; i++) {
    const speed = 36 + (i % 4) * 12;
    const x = (i * 71 + hold * speed) % 1000;
    const lane = [482, 488, 494, 500, 506, 512, 518][i % 7];
    const a = 0.1 + hash2(i, 4, 718) * 0.25;
    fillHex(p, i % 11 === 0 && hold > 2.85 ? C.emberHot : C.cyan, a * (1 - exit * 0.5));
    p.ellipse(x, lane, 1.5, 1.1);
  }

  // 两头封边的小切口。
  p.noFill();
  strokeHex(p, C.cyan, 0.25);
  p.strokeWeight(0.8);
  p.line(0, 478, 10, 478);
  p.line(0, 522, 12, 522);
  p.line(990, 478, 1000, 478);
  p.line(988, 522, 1000, 522);

  if (exit > 0.002) {
    drawExitTokens(p, t, fade);
  }

  // 6s 边缘变暗，方便进入第 14 版块。
  if (t > 5.35) {
    fillHex(p, C.bgDeep, 0.3 * fade);
    p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  }
  p.pop();
}

// ---------- 场景导出 ----------

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const hold = Math.min(t, 3);
    const presence = 1 - smoothstep(4.06, 5.06, t);
    const exit = smoothstep(4.1, 5.4, t);

    p.push();
    p.noStroke();
    drawBackground(p, t);
    drawFogBands(p, hold, presence);
    drawLayerPlanes(p, hold, presence);
    drawConnections(p, hold, presence);
    drawSignalPath(p, hold, presence);
    for (let i = 0; i < LAYERS.length; i++) {
      for (let k = 0; k < LAYERS[i].count; k++) {
        drawNode(p, i, k, hold, presence);
      }
    }
    drawOvercorrect(p, hold, presence);
    drawErrorPulse(p, hold, presence);
    drawInputRack(p, hold, presence);
    drawOutputBlock(p, hold, presence);
    drawLossPanel(p, hold, presence);

    // 网络层在离场时淡出，另起一排 token 卡接第 14 版块。
    if (exit > 0.002) {
      drawTokenStrip(p, t, presence);
    }

    drawAtmosphere(p, 1 - smoothstep(4.2, 5.2, t));

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
    drawTensorBand(p, t, state);
    p.pop();
  },

  drawActor(p, state) {
    const rawT = clamp(state.localT || 0, 0, 6);
    p.push();
    drawActorCube(p, rawT, state);
    p.pop();
  }
};
