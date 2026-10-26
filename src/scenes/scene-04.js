import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 第 4 版块：羊皮纸、铁胆墨步骤与 split-nib 芦苇笔。
// 本版块是静态优先：重点保证 localT≈1.0（左侧纸带被逐笔写出）和
// localT≈3.0（纸螺旋已展开、“算法”印落下、笔尖停在收笔点）。
const META = {
  id: 4,
  cn: '算法一词的诞生',
  en: 'The Word Algorithm',
  era: '约 800 · 花拉子米',
  group: 'paper'
};

const C = {
  paper: '#e7d9b8',
  paperLight: '#f1e6cb',
  paperPale: '#f8efdc',
  paperShade: '#d8c39a',
  paperDark: '#c7ad7c',
  ink: '#2a2118',
  inkDeep: '#1d1710',
  inkWarm: '#4c3827',
  gold: '#b0853f',
  goldLight: '#d3ae68',
  seal: '#963a2a',
  sealDark: '#6f2418',
  graphite: '#6f6558',
  reed: '#a77645',
  reedLight: '#d0a36c',
  reedDark: '#5f412a',
  ember: '#e8993e',
  emberHot: '#ffe1a3'
};

// 铁胆墨五阶：焦 / 浓 / 重 / 淡 / 清。
const INK = {
  burnt: 0.9,
  dense: 0.8,
  heavy: 0.6,
  pale: 0.35,
  clear: 0.15
};

const ROAD_TOP = 470;
const ROAD_BOTTOM = 530;
const SEAL = { x: 894, y: 674, size: 70 };
const STAMP = { x: 936, y: 716 };
const PEN_LENGTH = 214;

const STEPS = [
  {
    digit: 1,
    x: 646,
    baseY: 503,
    markY: 497,
    revealA: 1.42,
    revealB: 1.72,
    seed: 401
  },
  {
    digit: 2,
    x: 646,
    baseY: 578,
    markY: 572,
    revealA: 1.76,
    revealB: 2.06,
    seed: 402
  },
  {
    digit: 3,
    x: 646,
    baseY: 653,
    markY: 647,
    revealA: 2.1,
    revealB: 2.4,
    seed: 403
  }
];

// 笔尖的局部绝对坐标：从版块接缝左侧连续进入，先写左侧纸带，
// 再写右侧 1/2/3，沿回环收笔，最后落到“算法”印上。
const PEN_X_KEYS = [
  [0.0, -20],
  [0.35, 70],
  [0.6, 150],
  [0.9, 270],
  [1.15, 390],
  [1.26, 468],
  [1.45, 646],
  [1.8, 646],
  [2.15, 646],
  [2.26, 776],
  [2.4, 898],
  [2.55, 850],
  [2.64, 779],
  [2.9, STAMP.x],
  [3.0, STAMP.x]
];

const PEN_Y_KEYS = [
  [0.0, 612],
  [0.35, 642],
  [0.6, 648],
  [0.9, 648],
  [1.15, 648],
  [1.26, 648],
  [1.45, 503],
  [1.8, 578],
  [2.15, 653],
  [2.26, 647],
  [2.4, 576],
  [2.55, 482],
  [2.64, 493],
  [2.9, STAMP.y],
  [3.0, STAMP.y]
];

const PEN_ANGLE_KEYS = [
  [0.0, 0.42],
  [0.4, 0.25],
  [0.9, 0.08],
  [1.15, 0.12],
  [1.4, 0.35],
  [1.7, 0.5],
  [2.0, 0.5],
  [2.2, 0.38],
  [2.4, 0.1],
  [2.6, -0.02],
  [2.75, 0.08],
  [2.95, 0.18],
  [3.0, 0.18],
  [4.0, 0.18],
  [4.5, 0.35],
  [5.0, 0.5],
  [6.0, 0.6]
];

// 收笔后向右滑到版块接缝：笔尖最终停在下一版算珠的坐标 (1000,602)，
// 让第 4 版的火种直接交接给第 5 版的算珠。
const PEN_EXIT_X_KEYS = [
  [4.0, STAMP.x],
  [4.25, 960],
  [4.6, 990],
  [5.0, 1010],
  [5.6, 1005],
  [6.0, 1000]
];

const PEN_EXIT_Y_KEYS = [
  [4.0, STAMP.y],
  [4.25, 690],
  [4.6, 650],
  [5.0, 620],
  [5.6, 605],
  [6.0, 602]
];

function buildCubic(segments, steps = 12) {
  const points = [];
  for (let s = 0; s < segments.length; s++) {
    const [a, b, c, d] = segments[s];
    const first = s === 0 ? 0 : 1;
    for (let i = first; i <= steps; i++) {
      const u = i / steps;
      const v = 1 - u;
      const x =
        v * v * v * a[0] +
        3 * v * v * u * b[0] +
        3 * v * u * u * c[0] +
        u * u * u * d[0];
      const y =
        v * v * v * a[1] +
        3 * v * v * u * b[1] +
        3 * v * u * u * c[1] +
        u * u * u * d[1];
      points.push([x, y]);
    }
  }
  return points;
}

function makeSpiral(cx, cy, r0, r1, turns, squash, samples = 120) {
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const q = i / samples;
    const a = q * Math.PI * 2 * turns;
    const r = r0 + (r1 - r0) * q;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
  }
  return points;
}

function resamplePolyline(points, step = 4.2) {
  if (points.length < 2) return points;
  const out = [points[0].slice()];
  let remainder = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let at = step - remainder;
    while (at <= len) {
      const u = at / len;
      out.push([a[0] + dx * u, a[1] + dy * u]);
      at += step;
    }
    remainder = len - (at - step);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(tail[0] - last[0], tail[1] - last[1]) > step * 0.35) {
    out.push(last.slice());
  }
  return out;
}

const DIGIT_STROKES = {
  1: [
    {
      points: buildCubic([[[0, -64], [1, -44], [2, -22], [2, -4]]], 13),
      width: 6.8,
      from: 0,
      to: 0.56,
      dry: 0.65
    },
    {
      points: buildCubic([[[-21, -39], [-14, -51], [-2, -64], [1, -62]]], 10),
      width: 3.6,
      from: 0.56,
      to: 0.8,
      dry: 0.35
    },
    {
      points: buildCubic([[[-15, -3], [-4, -2.5], [10, -2], [21, -2]]], 8),
      width: 4.2,
      from: 0.8,
      to: 1,
      dry: 0.3
    }
  ],
  2: [
    {
      points: buildCubic(
        [
          [[-20, -49], [-18, -68], [2, -73], [16, -59]],
          [[16, -59], [17, -45], [5, -28], [-15, -5]]
        ],
        13
      ),
      width: 6.2,
      from: 0,
      to: 0.8,
      dry: 0.55
    },
    {
      points: buildCubic([[[-23, -2], [-10, -3], [10, -2], [22, -2]]], 9),
      width: 4.2,
      from: 0.8,
      to: 1,
      dry: 0.3
    }
  ],
  3: [
    {
      points: buildCubic(
        [
          [[-18, -47], [-15, -68], [7, -73], [16, -59]],
          [[16, -59], [19, -49], [10, -39], [3, -35]],
          [[3, -35], [13, -30], [19, -21], [16, -12]],
          [[16, -12], [12, 1], [-8, 4], [-19, -7]]
        ],
        12
      ),
      width: 6.3,
      from: 0,
      to: 1,
      dry: 0.6
    }
  ]
};

for (const strokes of Object.values(DIGIT_STROKES)) {
  for (const stroke of strokes) {
    stroke.points = resamplePolyline(stroke.points, 4.2);
  }
}

STEPS[0].markPoints = resamplePolyline(
  buildCubic([[[706, 497], [728, 494], [752, 499], [770, 497]]], 12)
);
STEPS[1].markPoints = resamplePolyline(
  buildCubic([[[706, 572], [728, 569], [752, 574], [770, 572]]], 12)
);
STEPS[2].markPoints = resamplePolyline(
  buildCubic([[[706, 647], [728, 644], [752, 649], [770, 647]]], 12)
);

const LOOP_POINTS = resamplePolyline(
  buildCubic(
    [
      [[776, 647], [850, 659], [898, 624], [898, 576]],
      [[898, 576], [900, 528], [884, 494], [850, 482]],
      [[850, 482], [824, 473], [798, 480], [779, 493]]
    ],
    16
  ),
  4.2
);

const CREASE_SPIRAL = makeSpiral(816, 552, 24, 198, 2.35, 0.64, 220);
const ROLL_SPIRAL = makeSpiral(816, 552, 18, 178, 1.85, 0.63, 220);
const CURL_SPIRAL = makeSpiral(980, 748, 2.5, 16, 2.4, 0.55, 46);

function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smoothstep(t0, t1, t);
    }
  }
  return keys[keys.length - 1][1];
}

function slicePath(points, fraction) {
  const f = clamp(fraction, 0, 1);
  if (f >= 0.999) return points;
  if (f <= 0 || points.length < 2) return [];
  const pos = f * (points.length - 1);
  const last = Math.floor(pos);
  const rest = pos - last;
  const out = points.slice(0, last + 1);
  if (last < points.length - 1) {
    const a = points[last];
    const b = points[last + 1];
    out.push([a[0] + (b[0] - a[0]) * rest, a[1] + (b[1] - a[1]) * rest]);
  }
  return out.length >= 2 ? out : [];
}

function makeRibbon(points, width, seed) {
  const n = points.length;
  const left = new Array(n);
  const right = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    let len = Math.hypot(dx, dy);
    if (len < 1e-5) {
      dx = 1;
      dy = 0;
      len = 1;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const q = i / (n - 1);
    // 起笔短、行笔稳、收笔渐渐提起来；轻微噪声只做边缘毛涩。
    const pressure =
      smoothstep(0, 0.13, q) *
      (1 - 0.68 * smoothstep(0.7, 1, q)) *
      (0.86 + 0.14 * hash2(seed, i, 17));
    const wl = Math.max(0.16, width * pressure * (0.92 + 0.14 * hash2(seed, i, 23)));
    const wr = Math.max(0.16, width * pressure * (0.92 + 0.14 * hash2(seed, i, 29)));
    left[i] = [points[i][0] + nx * wl * 0.5, points[i][1] + ny * wl * 0.5];
    right[i] = [points[i][0] - nx * wr * 0.5, points[i][1] - ny * wr * 0.5];
  }
  return { left, right };
}

function paintRibbon(p, ribbon, color, alpha, ox = 0, oy = 0) {
  if (alpha <= 0.001) return;
  p.noStroke();
  fillHex(p, color, alpha);
  p.beginShape();
  for (let i = 0; i < ribbon.left.length; i++) {
    p.vertex(ribbon.left[i][0] + ox, ribbon.left[i][1] + oy);
  }
  for (let i = ribbon.right.length - 1; i >= 0; i--) {
    p.vertex(ribbon.right[i][0] + ox, ribbon.right[i][1] + oy);
  }
  p.endShape(p.CLOSE);
}

function paintDryBrush(p, points, width, seed, strength) {
  if (strength <= 0.01 || width < 2.4 || points.length < 6) return;
  const n = points.length;
  const streaks = width > 5 ? 3 : 2;
  p.noFill();
  p.strokeCap(p.ROUND);
  for (let k = 0; k < streaks; k++) {
    const q0 = 0.34 + k * 0.14;
    const q1 = Math.min(0.94, 0.68 + k * 0.11 + hash2(seed, k, 31) * 0.08);
    const start = Math.floor(q0 * (n - 1));
    const end = Math.min(n - 1, Math.floor(q1 * (n - 1)));
    if (end - start < 3) continue;
    p.strokeWeight(0.45 + hash2(seed, k, 32) * 0.42);
    strokeHex(
      p,
      k === 1 ? C.paperPale : C.paperLight,
      strength * (0.1 + hash2(seed, k, 33) * 0.09)
    );
    p.beginShape();
    for (let i = start; i <= end; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(n - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (hash2(seed, i, k + 41) - 0.5) * width * 0.62;
      p.vertex(points[i][0] - (dy / len) * off, points[i][1] + (dx / len) * off);
    }
    p.endShape();
  }
}

function drawInkStroke(p, points, options) {
  if (!points || points.length < 2) return;
  const {
    width,
    color = C.ink,
    alpha = INK.dense,
    seed = 1,
    dry = 0
  } = options;
  p.push();
  const halo = makeRibbon(points, width * 1.55, seed + 97);
  const damp = makeRibbon(points, width * 1.18, seed + 53);
  const core = makeRibbon(points, width, seed);
  paintRibbon(p, halo, C.inkWarm, Math.min(0.075, alpha * 0.085), -0.8, 0.7);
  paintRibbon(p, damp, color, Math.min(0.055, alpha * 0.06), 0.7, -0.45);
  paintRibbon(p, core, color, alpha);
  if (width > 4.8) {
    paintRibbon(p, makeRibbon(points, width * 0.34, seed + 71), C.inkDeep, alpha * 0.13, 0, -0.2);
  }
  paintDryBrush(p, points, width, seed + 19, dry);
  p.pop();
}

function drawArrowHead(p, tipX, tipY, angle, size, seed, alpha = INK.dense) {
  const back = angle + Math.PI;
  for (let k = 0; k < 2; k++) {
    const spread = (k === 0 ? -1 : 1) * 0.52;
    const bx = tipX + Math.cos(back + spread) * size;
    const by = tipY + Math.sin(back + spread) * size;
    const mx = tipX + Math.cos(back + spread * 0.35) * size * 0.56;
    const my = tipY + Math.sin(back + spread * 0.35) * size * 0.56;
    const points = buildCubic(
      [[[bx, by], [mx, my], [tipX + Math.cos(back + spread * 0.1) * 1.4, tipY + Math.sin(back + spread * 0.1) * 1.4], [tipX, tipY]]],
      8
    );
    drawInkStroke(p, points, {
      width: 2.6,
      alpha,
      seed: seed + k * 7,
      dry: 0.08
    });
  }
}

function drawLinearWash(p, x0, y0, x1, y1, stops, x, y, w, h) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const stop of stops) grad.addColorStop(stop[0], stop[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawPaper(p, bandOnly = false) {
  p.noStroke();
  fillHex(p, C.paper, 1);
  p.rect(-360, -80, 1720, 1160);

  // 低频斑驳：只铺几层很淡的横向旧纸色，不做逐像素噪声。
  for (let i = 0; i < 42; i++) {
    const x = -260 + hash2(i, 21) * 1520;
    const y = 185 + hash2(i, 22) * 630;
    const w = 70 + hash2(i, 23) * 330;
    const h = 14 + hash2(i, 24) * 92;
    const color = i % 4 === 0 ? C.paperLight : i % 3 === 0 ? C.paperDark : C.paperShade;
    const alpha = 0.018 + hash2(i, 25) * 0.032;
    fillHex(p, color, alpha);
    p.ellipse(x, y, w, h);
  }

  // 764 根纸纤维：一半褐色、一半亮色，α 都压在低区。
  // drawRoad 只补路面带时可跳过离带很远的纤维，视觉上仍连续。
  p.push();
  p.strokeCap(p.ROUND);
  for (let i = 0; i < 764; i++) {
    const x = -260 + hash2(i, 51) * 1520;
    const y = 170 + hash2(i, 52) * 660;
    if (bandOnly && (y < ROAD_TOP - 22 || y > ROAD_BOTTOM + 22)) continue;
    const long = i % 9 === 0;
    const len = long ? 28 + hash2(i, 53) * 48 : 4 + hash2(i, 53) * 23;
    const tilt = (hash2(i, 54) - 0.5) * 0.2 + (i % 7 === 0 ? 0.045 : 0);
    if (i % 2 === 0) {
      strokeHex(p, C.paperDark, 0.05 + hash2(i, 55) * 0.075);
      p.strokeWeight(0.55 + hash2(i, 56) * 0.6);
    } else {
      strokeHex(p, C.paperLight, 0.12 + hash2(i, 55) * 0.14);
      p.strokeWeight(0.55 + hash2(i, 56) * 0.55);
    }
    p.line(x, y, x + Math.cos(tilt) * len, y + Math.sin(tilt) * len);
    if (i % 17 === 0) {
      strokeHex(p, C.paperLight, 0.08 + hash2(i, 57) * 0.07);
      p.strokeWeight(0.5);
      p.line(x + 1.2, y + 1.1, x + Math.cos(tilt) * len * 0.86, y + 1.1 + Math.sin(tilt) * len * 0.86);
    }
  }
  p.pop();

  // 少量旧斑、飞点。
  p.noStroke();
  for (let i = 0; i < 58; i++) {
    const x = -180 + hash2(i, 71) * 1360;
    const y = 200 + hash2(i, 72) * 600;
    const titleBump = x > 120 && x < 500 && y > 250 && y < 465 ? 0.3 : 1;
    fillHex(
      p,
      i % 6 === 0 ? C.gold : C.inkWarm,
      (0.02 + hash2(i, 73) * 0.045) * titleBump
    );
    p.ellipse(x, y, 1 + hash2(i, 74) * 5.5, 0.8 + hash2(i, 74) * 2.6);
  }

  // 四边很淡的卷边阴影；直接改渐变时严格 save/restore。
  drawLinearWash(
    p,
    -280,
    0,
    -40,
    0,
    [
      [0, 'rgba(77,54,30,0.11)'],
      [1, 'rgba(77,54,30,0)']
    ],
    -320,
    -80,
    310,
    1160
  );
  drawLinearWash(
    p,
    930,
    0,
    1040,
    0,
    [
      [0, 'rgba(62,43,23,0.005)'],
      [1, 'rgba(62,43,23,0.14)']
    ],
    930,
    -80,
    140,
    1160
  );
  drawLinearWash(
    p,
    0,
    188,
    0,
    252,
    [
      [0, 'rgba(80,58,33,0.085)'],
      [1, 'rgba(80,58,33,0)']
    ],
    -360,
    175,
    1720,
    96
  );
  drawLinearWash(
    p,
    0,
    738,
    0,
    815,
    [
      [0, 'rgba(80,58,33,0)'],
      [1, 'rgba(80,58,33,0.11)']
    ],
    -360,
    738,
    1720,
    100
  );
}

function drawGuideRules(p) {
  const rules = [
    { y: 507, a: 0.045, segs: [[-240, 256], [304, 594], [630, 842], [910, 1210]] },
    { y: 582, a: 0.04, segs: [[-220, 286], [332, 612], [668, 858], [936, 1240]] },
    { y: 657, a: 0.045, segs: [[-260, 210], [246, 590], [692, 845], [884, 1220]] },
    { y: 731, a: 0.038, segs: [[-200, 278], [324, 610], [706, 854], [902, 1260]] }
  ];
  p.push();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    strokeHex(p, C.inkWarm, r.a);
    p.strokeWeight(i === 0 ? 0.95 : 0.8);
    for (let s = 0; s < r.segs.length; s++) {
      const [x0, x1] = r.segs[s];
      const y = r.y + (hash2(i, s, 31) - 0.5) * 1.4;
      p.line(x0, y, x1, y + (hash2(i, s, 32) - 0.5) * 0.8);
    }
  }
  p.pop();
}

function drawSquare(p, cx, cy, r, rotation) {
  p.beginShape();
  for (let i = 0; i < 4; i++) {
    const a = rotation + (i / 4) * Math.PI * 2;
    p.vertex(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  p.endShape(p.CLOSE);
}

function drawOrnaments(p) {
  p.push();
  p.noFill();
  strokeHex(p, C.gold, 0.34);
  p.strokeWeight(0.9);
  drawSquare(p, 938, 334, 37, Math.PI / 4);
  drawSquare(p, 938, 334, 37, 0);
  p.noStroke();
  fillHex(p, C.gold, 0.055);
  drawSquare(p, 938, 334, 36, Math.PI / 4);
  drawSquare(p, 938, 334, 36, 0);
  p.noFill();
  strokeHex(p, C.inkWarm, 0.25);
  p.strokeWeight(0.8);
  p.ellipse(938, 334, 34, 34);
  p.noStroke();
  fillHex(p, C.gold, 0.3);
  p.ellipse(938, 334, 3.6, 3.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    fillHex(p, C.gold, 0.26);
    p.ellipse(938 + Math.cos(a) * 44, 334 + Math.sin(a) * 44, 2.1, 2.1);
  }

  // 左下角的小型交织几何，和右上八芒星呼应。
  p.noFill();
  strokeHex(p, C.gold, 0.27);
  p.strokeWeight(0.9);
  p.ellipse(101, 694, 36, 36);
  p.ellipse(121, 694, 36, 36);
  strokeHex(p, C.inkWarm, 0.2);
  p.strokeWeight(0.7);
  drawSquare(p, 111, 694, 26, Math.PI / 4);
  drawSquare(p, 111, 694, 26, 0);
  p.noStroke();
  fillHex(p, C.gold, 0.22);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    p.ellipse(111 + Math.cos(a) * 34, 694 + Math.sin(a) * 34, 2.4, 2.4);
  }
  p.pop();
}

function drawPaperSpiral(p, t) {
  const roll = smoothstep(2.38, 2.54, t) * (1 - smoothstep(2.7, 2.86, t));

  p.push();
  p.noFill();
  if (roll > 0.002) {
    // 中段短暂卷起的纸螺旋：宽纸带 + 暗缝，靠叠层而非 blur。
    strokeHex(p, C.inkWarm, 0.045 * roll);
    p.strokeWeight(38);
    p.beginShape();
    for (const pt of ROLL_SPIRAL) p.vertex(pt[0] + 3, pt[1] + 5);
    p.endShape();
    strokeHex(p, C.paperShade, 0.19 * roll);
    p.strokeWeight(20);
    p.beginShape();
    for (const pt of ROLL_SPIRAL) p.vertex(pt[0], pt[1]);
    p.endShape();
    strokeHex(p, C.paperLight, 0.2 * roll);
    p.strokeWeight(7);
    p.beginShape();
    for (const pt of ROLL_SPIRAL) p.vertex(pt[0] - 4, pt[1] - 2);
    p.endShape();
    strokeHex(p, C.inkWarm, 0.08 * roll);
    p.strokeWeight(1.1);
    p.beginShape();
    for (const pt of ROLL_SPIRAL) p.vertex(pt[0], pt[1]);
    p.endShape();
  }

  // 展开后留下的浅浅同心纸卷印，静态帧里仍能读到“它刚刚卷过”；
  // 进场时不能提前露出卷痕，所以随卷纸动作一起浮现。
  const crease = smoothstep(2.28, 2.56, t);
  strokeHex(p, C.inkWarm, 0.043 * crease);
  p.strokeWeight(1.25);
  p.beginShape();
  for (const pt of CREASE_SPIRAL) p.vertex(pt[0], pt[1] + 1.2);
  p.endShape();
  strokeHex(p, C.paperPale, 0.16 * crease);
  p.strokeWeight(0.9);
  p.beginShape();
  for (const pt of CREASE_SPIRAL) p.vertex(pt[0] - 0.6, pt[1] - 0.8);
  p.endShape();
  p.pop();
}

function drawInkwell(p, t) {
  const x = 468;
  const y = 650;
  p.push();
  p.noStroke();
  fillHex(p, C.inkWarm, 0.11);
  p.ellipse(x - 4, y + 37, 76, 15);

  fillHex(p, C.reedDark, 0.97);
  p.beginShape();
  p.vertex(x - 27, y);
  p.vertex(x - 24, y + 24);
  p.vertex(x - 14, y + 32);
  p.vertex(x + 18, y + 32);
  p.vertex(x + 26, y + 24);
  p.vertex(x + 28, y);
  p.endShape(p.CLOSE);
  p.ellipse(x, y, 55, 17);
  p.ellipse(x, y + 31, 43, 11);

  fillHex(p, C.gold, 0.2);
  p.ellipse(x, y, 52, 14);
  fillHex(p, C.inkDeep, 0.97);
  p.ellipse(x, y, 43, 10);
  fillHex(p, C.goldLight, 0.24);
  p.ellipse(x - 11, y - 1.3, 11, 2.4);

  strokeHex(p, C.gold, 0.48);
  p.strokeWeight(1.15);
  p.noFill();
  p.arc(x, y, 54, 16, 0.08, Math.PI - 0.08);
  strokeHex(p, C.inkWarm, 0.25);
  p.strokeWeight(0.8);
  p.line(x - 24, y + 8, x - 21, y + 24);

  const dip = smoothstep(1.12, 1.3, t) * (1 - smoothstep(1.45, 1.65, t));
  if (dip > 0.002) {
    p.noFill();
    strokeHex(p, C.goldLight, 0.42 * dip);
    p.strokeWeight(0.9);
    const spread = 9 * (1 - dip) + 5;
    p.ellipse(x, y - 0.8, 22 + spread, 6 + spread * 0.22);
    p.ellipse(x, y - 0.8, 34 + spread * 1.4, 8 + spread * 0.3);
    p.noStroke();
    fillHex(p, C.ink, 0.55 * dip);
    p.ellipse(x + 14, y + 3, 2.2, 1.4);
    p.ellipse(x - 17, y + 1, 1.6, 1.2);
  }

  // 纸上的墨滴和极小反光，让墨井不是孤立的图标。
  p.noStroke();
  fillHex(p, C.inkWarm, 0.14);
  p.ellipse(x + 39, y + 22, 8, 3.2);
  fillHex(p, C.goldLight, 0.3);
  p.ellipse(x + 37, y + 21, 2.4, 1.1);
  p.pop();
}

// 汉字数字：用同一套衬线字，加一点铁胆墨的洇边；比阿拉伯数字更贴这一版。
const HAN_GLYPHS = ['一', '二', '三'];

function drawHanGlyph(p, digit, q) {
  const a = smoothstep(0, 0.55, q);
  if (a <= 0.002) return;
  const glyph = HAN_GLYPHS[digit - 1];
  p.push();
  p.translate(0, -36);
  p.rotate(-0.012 + digit * 0.006);
  p.noStroke();
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(52);
  fillHex(p, C.inkWarm, 0.12 * a);
  p.text(glyph, 0.8, 0.6);
  fillHex(p, C.ink, INK.burnt * a);
  p.text(glyph, 0, 0);
  p.pop();
}

function drawStepDigit(p, step, q) {
  if (q <= 0.001) return;
  if (step.digit >= 1 && step.digit <= 3) {
    p.push();
    p.translate(step.x, step.baseY);
    drawHanGlyph(p, step.digit, q);
    p.pop();
    return;
  }
  const strokes = DIGIT_STROKES[step.digit];
  p.push();
  p.translate(step.x, step.baseY);
  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    const local = clamp((q - stroke.from) / (stroke.to - stroke.from), 0, 1);
    if (local <= 0.001) continue;
    const points = slicePath(stroke.points, local);
    drawInkStroke(p, points, {
      width: stroke.width,
      color: C.ink,
      alpha: INK.burnt,
      seed: step.seed * 37 + i * 13,
      dry: stroke.dry
    });
  }
  p.pop();
}

function drawStepMark(p, step, q) {
  const f = clamp((q - 0.52) / 0.48, 0, 1);
  if (f <= 0.001) return;
  const points = slicePath(step.markPoints, f);
  drawInkStroke(p, points, {
    width: 2.55,
    color: C.ink,
    alpha: INK.dense,
    seed: step.seed * 11 + 5,
    dry: 0.36
  });
  if (f > 0.94) {
    p.push();
    p.noStroke();
    fillHex(p, C.ink, 0.42);
    p.ellipse(770, step.markY, 2.1, 1.6);
    p.pop();
  }
}

function drawLoopKnot(p, t) {
  const appear = smoothstep(2.5, 2.7, t);
  if (appear <= 0.001) return;
  p.push();
  p.noFill();
  strokeHex(p, C.ink, 0.48 * appear);
  p.strokeWeight(1.45);
  p.beginShape();
  for (let i = 0; i <= 40; i++) {
    const a = i * 0.36;
    const r = 1.2 + i * 0.32;
    p.vertex(791 + Math.cos(a) * r, 651 + Math.sin(a) * r * 0.6);
  }
  p.endShape();
  p.noStroke();
  fillHex(p, C.ink, 0.6 * appear);
  p.ellipse(791, 651, 3.4, 2.6);
  fillHex(p, C.ink, 0.25 * appear);
  p.ellipse(806, 660, 1.6, 1.2);
  p.ellipse(783, 664, 1.2, 1.0);
  p.pop();
}

function drawStepColumn(p, t) {
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const q = smoothstep(step.revealA, step.revealB, t);
    drawStepDigit(p, step, q);
    drawStepMark(p, step, q);
  }

  const qLoop = smoothstep(2.26, 2.64, t);
  if (qLoop > 0.001) {
    const points = slicePath(LOOP_POINTS, qLoop);
    drawInkStroke(p, points, {
      width: 3.0,
      color: C.ink,
      alpha: INK.dense,
      seed: 911,
      dry: 0.25
    });
    if (qLoop > 0.86) {
      const last = LOOP_POINTS[LOOP_POINTS.length - 1];
      const prev = LOOP_POINTS[LOOP_POINTS.length - 2];
      const arrowAngle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      drawArrowHead(p, last[0], last[1] + 1, arrowAngle, 12, 912, INK.dense);
    }
    if (qLoop > 0.94) {
      p.push();
      p.noStroke();
      fillHex(p, C.ink, 0.34);
      p.ellipse(777, 647, 3.4, 2.2);
      p.pop();
    }
  }
  drawLoopKnot(p, t);
}

// 左侧纸带：把“算法”拆成 起 → 分 → 环 三个动作，笔从左缘连续写过去。
const LEFT_NODES = [
  { x: 150, y: 640, label: '起', t0: 0.52 },
  { x: 270, y: 640, label: '分', t0: 0.82 },
  { x: 390, y: 640, label: '环', t0: 1.12 }
];

function drawLeftNode(p, index, a) {
  if (a <= 0.002) return;
  p.push();
  p.translate(LEFT_NODES[index].x, LEFT_NODES[index].y);
  p.scale(0.9 + 0.35 * a);
  p.noFill();
  strokeHex(p, C.ink, 0.62 * a);
  p.strokeWeight(1.5);

  if (index === 0) {
    p.ellipse(0, 0, 13, 13);
    p.noStroke();
    fillHex(p, C.ink, 0.76 * a);
    p.ellipse(0, 0, 4.2, 4.2);
    strokeHex(p, C.inkWarm, 0.4 * a);
    p.strokeWeight(1.1);
    p.line(-7, -12, -7, -18);
    p.line(0, -13, 0, -21);
    p.line(7, -12, 7, -18);
  } else if (index === 1) {
    p.beginShape();
    p.vertex(0, -7);
    p.vertex(7, 0);
    p.vertex(0, 7);
    p.vertex(-7, 0);
    p.endShape(p.CLOSE);
    p.line(-7, 0, -18, -8);
    p.line(7, 0, 18, -8);
    p.noStroke();
    fillHex(p, C.ink, 0.55 * a);
    p.ellipse(-18, -8, 2.4, 2.4);
    p.ellipse(18, -8, 2.4, 2.4);
  } else {
    p.arc(0, 0, 17, 17, -0.4, Math.PI * 1.55, p.OPEN);
    p.push();
    p.translate(-4, -7);
    p.rotate(-2.5);
    p.noStroke();
    fillHex(p, C.ink, 0.62 * a);
    p.triangle(0, 0, -5, -2.4, -5, 2.4);
    p.pop();
    strokeHex(p, C.seal, 0.58 * a);
    p.strokeWeight(1.4);
    p.line(10, -2, 13, 2);
    p.line(13, 2, 18, -5);
  }
  p.pop();
}

function drawLeftScroll(p, t) {
  // 上一版块的石墨线在接缝处淡出，让笔从同一条纸面进入。
  const carry = 1 - smoothstep(0.5, 1.4, t);
  if (carry > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.graphite, 0.16 * carry);
    p.strokeWeight(1.1);
    p.arc(8, 606, 158, 158, -1.2, 0.35, p.OPEN);
    p.line(0, 552, 84, 552);
    strokeHex(p, C.graphite, 0.09 * carry);
    p.strokeWeight(0.8);
    p.line(0, 560, 52, 560);
    p.pop();
  }

  const band = smoothstep(0.12, 0.5, t);
  if (band > 0.002) {
    p.push();
    p.noStroke();
    fillHex(p, C.paperLight, 0.32 * band);
    p.beginShape();
    p.vertex(62, 612);
    p.vertex(95, 606);
    p.vertex(130, 610);
    p.vertex(170, 603);
    p.vertex(215, 608);
    p.vertex(260, 602);
    p.vertex(310, 607);
    p.vertex(355, 601);
    p.vertex(400, 606);
    p.vertex(432, 602);
    p.vertex(447, 612);
    p.vertex(439, 682);
    p.vertex(400, 687);
    p.vertex(350, 681);
    p.vertex(300, 687);
    p.vertex(250, 682);
    p.vertex(200, 688);
    p.vertex(150, 683);
    p.vertex(100, 688);
    p.vertex(64, 684);
    p.endShape(p.CLOSE);

    strokeHex(p, C.paperPale, 0.3 * band);
    p.strokeWeight(1.1);
    p.line(95, 607, 430, 603);
    strokeHex(p, C.paperDark, 0.3 * band);
    p.strokeWeight(1.3);
    p.line(66, 685, 438, 683);
    strokeHex(p, C.paperDark, 0.14 * band);
    p.strokeWeight(3.2);
    p.line(70, 690, 434, 688);

    p.strokeCap(p.ROUND);
    for (let i = 0; i < 20; i++) {
      const x = 70 + hash2(i, 201) * 350;
      const y = 610 + hash2(i, 202) * 68;
      strokeHex(p, C.paperShade, 0.1 * band);
      p.strokeWeight(0.7);
      p.line(x, y, x + 2 + hash2(i, 203) * 5, y + (hash2(i, 204) - 0.5) * 2);
    }
    p.pop();
  }

  const link = smoothstep(0.4, 1.3, t);
  if (link > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.ink, 0.45 * link);
    p.strokeWeight(1.25);
    p.beginShape();
    for (let i = 0; i <= 48; i++) {
      const q = i / 48;
      p.vertex(118 + q * 300, 640 + Math.sin(q * Math.PI * 3.2) * 0.8);
    }
    p.endShape();
    if (link > 0.5) {
      drawArrowHead(p, 213, 640, 0, 5, 211, 0.42 * link);
      drawArrowHead(p, 333, 640, 0, 5, 212, 0.42 * link);
    }
    p.pop();
  }

  for (let i = 0; i < LEFT_NODES.length; i++) {
    const node = LEFT_NODES[i];
    const a = smoothstep(node.t0, node.t0 + 0.24, t);
    drawLeftNode(p, i, a);
    if (a > 0.002) {
      p.push();
      p.noStroke();
      fillHex(p, C.inkWarm, 0.5 * a);
      p.textFont('serif');
      p.textSize(11);
      p.textAlign(p.CENTER, p.TOP);
      p.text(node.label, node.x, node.y + 22);
      p.pop();
    }
  }

  const notes = smoothstep(0.35, 0.9, t);
  if (notes > 0.002) {
    p.push();
    for (let i = 0; i < 5; i++) {
      const x = 112 + i * 16;
      strokeHex(p, C.graphite, 0.24 * notes);
      p.strokeWeight(0.9);
      p.line(x, 614 + (i % 2) * 2, x + 1.5, 626 + (i % 2) * 2);
    }
    p.noStroke();
    fillHex(p, C.seal, 0.4 * notes);
    p.rect(424, 664, 12, 12, 1);
    p.noFill();
    strokeHex(p, C.sealDark, 0.34 * notes);
    p.strokeWeight(0.8);
    p.rect(427, 667, 6, 6, 1);
    p.pop();
  }
}

function drawAlgorithmSeal(p, t) {
  const reveal = smoothstep(2.84, 2.98, t);
  if (reveal <= 0.002) return;
  const s = 0.86 + 0.14 * reveal;
  const h = SEAL.size * 0.5;
  p.push();
  p.translate(SEAL.x, SEAL.y);
  p.rotate(-0.045);
  p.scale(s);

  p.noStroke();
  fillHex(p, C.seal, 0.06 * reveal);
  p.ellipse(0, 0, SEAL.size * 1.3, SEAL.size * 1.18);
  fillHex(p, C.seal, 0.9 * reveal);
  p.rect(-h, -h, SEAL.size, SEAL.size, 2);

  p.noFill();
  strokeHex(p, C.sealDark, 0.9 * reveal);
  p.strokeWeight(2.4);
  p.rect(-h, -h, SEAL.size, SEAL.size, 2);
  strokeHex(p, C.paperPale, 0.28 * reveal);
  p.strokeWeight(1);
  p.rect(-h + 4.5, -h + 4.5, SEAL.size - 9, SEAL.size - 9, 1);

  p.noStroke();
  fillHex(p, C.paperPale, 0.94 * reveal);
  p.textFont('serif');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(24);
  p.text('算', 0, -13);
  p.text('法', 0, 13);

  // 干笔飞白：几道印色细线压过印面。
  strokeHex(p, C.sealDark, 0.4 * reveal);
  p.strokeWeight(1.1);
  p.line(-h + 9, -h + 13, -h + 20, -h + 13);
  p.line(h - 20, h - 15, h - 9, h - 16);
  p.line(-h + 8, h - 22, -h + 15, h - 22);
  p.pop();
}

function drawCornerCurl(p, t) {
  const ex = smoothstep(4.0, 5.6, t);
  p.push();
  p.translate(996, 794);
  p.scale(1 + ex * 0.7);
  p.translate(-996, -794);

  p.noStroke();
  fillHex(p, C.inkWarm, 0.1 + ex * 0.04);
  p.beginShape();
  p.vertex(925, 800);
  p.vertex(1002, 800);
  p.vertex(1002, 688);
  p.vertex(980, 698);
  p.vertex(958, 724);
  p.vertex(946, 756);
  p.vertex(939, 788);
  p.endShape(p.CLOSE);

  fillHex(p, C.paperDark, 0.82);
  p.beginShape();
  p.vertex(1000, 800);
  p.vertex(1000, 690);
  p.vertex(982, 700);
  p.vertex(964, 724);
  p.vertex(954, 752);
  p.vertex(950, 779);
  p.vertex(952, 800);
  p.endShape(p.CLOSE);

  fillHex(p, C.paperLight, 0.66);
  p.beginShape();
  p.vertex(994, 800);
  p.vertex(994, 699);
  p.vertex(982, 707);
  p.vertex(972, 726);
  p.vertex(966, 748);
  p.vertex(964, 774);
  p.vertex(966, 800);
  p.endShape(p.CLOSE);

  p.noFill();
  strokeHex(p, C.paperPale, 0.42);
  p.strokeWeight(1.2);
  p.beginShape();
  p.vertex(995, 798);
  p.vertex(993, 701);
  p.vertex(981, 709);
  p.vertex(971, 727);
  p.vertex(965, 748);
  p.vertex(963, 775);
  p.endShape();

  strokeHex(p, C.inkWarm, 0.34);
  p.strokeWeight(1.0);
  p.beginShape();
  for (const pt of CURL_SPIRAL) p.vertex(pt[0], pt[1]);
  p.endShape();
  strokeHex(p, C.gold, 0.23);
  p.strokeWeight(0.7);
  p.beginShape();
  for (const pt of CURL_SPIRAL) p.vertex(pt[0] + 1.4, pt[1] + 1.1);
  p.endShape();
  p.pop();
}

function drawArtwork(p, t, bandOnly = false) {
  drawPaper(p, bandOnly);
  drawGuideRules(p);
  drawOrnaments(p);
  drawPaperSpiral(p, t);
  drawLeftScroll(p, t);
  drawInkwell(p, t);
  drawStepColumn(p, t);
  drawAlgorithmSeal(p, t);
  drawCornerCurl(p, t);
}

function drawStampImpact(p, tap) {
  if (tap <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, C.ink, 0.18 * tap);
  p.strokeWeight(1.0);
  p.ellipse(STAMP.x, STAMP.y + 1, 17, 8);
  strokeHex(p, C.gold, 0.22 * tap);
  p.strokeWeight(0.8);
  p.ellipse(STAMP.x, STAMP.y + 1, 27, 12);
  p.noStroke();
  fillHex(p, C.ink, 0.48 * tap);
  p.ellipse(STAMP.x - 3, STAMP.y + 4, 8, 3.4);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.48;
    const r = 10 + hash2(i, 4, 61) * 12;
    fillHex(p, i % 2 ? C.gold : C.ember, 0.45 * tap);
    p.ellipse(
      STAMP.x + Math.cos(a) * r,
      STAMP.y + Math.sin(a) * r * 0.55,
      1.3 + hash2(i, 5, 61) * 1.7,
      1.1 + hash2(i, 6, 61) * 1.4
    );
  }
  p.pop();
}

function drawReedPen(p, nibX, nibY, angle) {
  p.push();
  p.translate(nibX, nibY);
  p.rotate(angle);

  // 纸上的投影：比笔杆略宽一点、只留很淡的一层。
  p.push();
  p.translate(9, 7);
  p.rotate(-0.015);
  p.noStroke();
  fillHex(p, C.inkWarm, 0.065);
  p.beginShape();
  p.vertex(-2.2, 0);
  p.vertex(-6.5, -24);
  p.vertex(-9.4, -82);
  p.vertex(-8.4, -164);
  p.vertex(-11.4, -PEN_LENGTH + 2);
  p.vertex(9.5, -PEN_LENGTH + 6);
  p.vertex(8.7, -164);
  p.vertex(9.4, -82);
  p.vertex(6.2, -24);
  p.vertex(2.2, 0);
  p.endShape(p.CLOSE);
  p.pop();

  // 笔杆：芦苇的暖赭色，上端斜切。
  p.noStroke();
  fillHex(p, C.reed, 1);
  p.beginShape();
  p.vertex(-1.7, 0);
  p.vertex(-4.3, -9);
  p.vertex(-6.5, -30);
  p.vertex(-8.1, -72);
  p.vertex(-8.3, -120);
  p.vertex(-7.1, -162);
  p.vertex(-10.4, -PEN_LENGTH + 2);
  p.vertex(8.5, -PEN_LENGTH + 6);
  p.vertex(7.7, -164);
  p.vertex(8.4, -120);
  p.vertex(7.9, -76);
  p.vertex(6.1, -30);
  p.vertex(3.5, -9);
  p.vertex(1.7, 0);
  p.vertex(0, -5);
  p.endShape(p.CLOSE);

  // 两半笔尖的受光/背光面，中央留出一条真正的 slit。
  fillHex(p, C.reedLight, 0.42);
  p.beginShape();
  p.vertex(-4.4, -10);
  p.vertex(-7.2, -40);
  p.vertex(-8.2, -101);
  p.vertex(-7.2, -158);
  p.vertex(0.4, -157);
  p.vertex(0.1, -92);
  p.vertex(0.1, -10);
  p.endShape(p.CLOSE);
  fillHex(p, C.reedDark, 0.28);
  p.beginShape();
  p.vertex(3.7, -9);
  p.vertex(6.5, -39);
  p.vertex(7.9, -99);
  p.vertex(7.4, -160);
  p.vertex(1.0, -159);
  p.vertex(0.3, -98);
  p.vertex(0.3, -10);
  p.endShape(p.CLOSE);

  // 刻开的裂口、竹节和笔杆纤维。
  strokeHex(p, C.inkDeep, 0.78);
  p.strokeWeight(1.35);
  p.line(0, -2.5, 0, -27);
  strokeHex(p, C.inkWarm, 0.26);
  p.strokeWeight(0.75);
  p.line(0.8, -29, 0.5, -44);
  p.line(-4.4, -51, -3.3, -145);
  p.line(3.8, -56, 3.1, -149);
  strokeHex(p, C.paperPale, 0.28);
  p.strokeWeight(0.65);
  p.line(-2.4, -34, -1.7, -118);

  strokeHex(p, C.inkWarm, 0.22);
  p.strokeWeight(0.8);
  p.line(-7, -171, 7.6, -168);
  p.line(-6.6, -96, 6.9, -94);

  // 斜切的上端：暗口 + 一圈较亮的边。
  p.noStroke();
  fillHex(p, C.inkWarm, 0.7);
  p.ellipse(0, -PEN_LENGTH + 4, 17, 4.2);
  fillHex(p, C.reedLight, 0.34);
  p.ellipse(-2, -PEN_LENGTH + 3.2, 10, 2.1);

  // split nib 的两片尖，保持深浅略不同。
  fillHex(p, C.reedLight, 0.55);
  p.beginShape();
  p.vertex(-1.3, -2);
  p.vertex(-4.1, -9);
  p.vertex(-5.4, -22);
  p.vertex(-0.7, -23);
  p.vertex(0, -8);
  p.endShape(p.CLOSE);
  fillHex(p, C.reedDark, 0.3);
  p.beginShape();
  p.vertex(1.3, -2);
  p.vertex(3.8, -9);
  p.vertex(5.0, -22);
  p.vertex(0.7, -23);
  p.vertex(0, -8);
  p.endShape(p.CLOSE);

  // 暖赭火种：与第 3 版块圆规铰链里的那一颗保持同一色温。
  p.noStroke();
  fillHex(p, C.ember, 0.085);
  p.ellipse(0, -1.2, 34, 34);
  fillHex(p, C.ember, 0.2);
  p.ellipse(0, -1.2, 18, 18);
  fillHex(p, C.ember, 0.92);
  p.ellipse(0, -1.5, 6.2, 7.6);
  fillHex(p, C.emberHot, 0.98);
  p.ellipse(-0.5, -2.2, 2.6, 3.3);
  fillHex(p, C.paperPale, 0.8);
  p.ellipse(-0.8, -3.0, 1.1, 1.5);

  // 笔尖上沾着的一小点墨湿光。
  strokeHex(p, C.ink, 0.36);
  p.strokeWeight(0.8);
  p.line(0, -8, 0, -16);

  p.pop();
}

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

function penPose(state) {
  const rawT = clamp(state.localT || 0, 0, 6);
  // drawActor 收到原始 localT，动作在这里自行压到 10Hz。
  const t = Math.floor(rawT * 10) / 10;

  let nibX;
  let nibY;
  let angle;
  if (t < 2.95) {
    // 局部绝对坐标：从接缝左侧进入，连续写完整张纸。
    nibX = track(t, PEN_X_KEYS);
    nibY = track(t, PEN_Y_KEYS);
    angle = track(t, PEN_ANGLE_KEYS);
  } else if (t <= 4.0) {
    // 高光定格：笔尖钉在收笔点上，纸和墨都不再动。
    nibX = STAMP.x;
    nibY = STAMP.y;
    angle = 0.18;
  } else {
    nibX = track(t, PEN_EXIT_X_KEYS);
    nibY = track(t, PEN_EXIT_Y_KEYS);
    angle = track(t, PEN_ANGLE_KEYS);
  }
  return { t, nibX, nibY, angle };
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    drawArtwork(p, t);

    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (titleAlpha > 0.002) {
      // 年代小字背后的窄标签带；文字位置、字号完全交给 title card。
      p.push();
      p.noStroke();
      fillHex(p, C.paperPale, 0.5 * titleAlpha);
      p.rect(226, 393, 148, 18, 2);
      strokeHex(p, C.gold, 0.3 * titleAlpha);
      p.strokeWeight(0.8);
      p.noFill();
      p.rect(226, 393, 148, 18, 2);
      p.pop();
    }

    if (showTitle) {
      drawTitleCard(p, {
        ...META,
        number: 4,
        x: 300,
        y: 362,
        alpha: titleAlpha
      });
    }
  },

  drawRoad(p, state) {
    // 主调度给的是原始 localT；路面带里的步骤/墨线也要按 10Hz 重画。
    const t = Math.floor(clamp(state.localT || 0, 0, 6) * 10) / 10;
    const ctx = p.drawingContext;
    p.push();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
    ctx.clip();
    // 全屏纸面 + 压在这条带上的墨迹必须使用同一条绘制路径，
    // 否则默认路面会像横带一样从纸里透出来。
    drawArtwork(p, t, true);
    ctx.restore();
    p.pop();
  },

  drawActor(p, state) {
    const pose = penPose(state);
    const blockOrigin = ((state.blockIndex || 1) - 1) * 1000;
    p.push();
    p.translate(blockOrigin, 0);
    // 落笔那一瞬的轻响画在纸面坐标里，不能跟着笔的旋转走。
    const tap =
      smoothstep(2.94, 3.0, pose.t) *
      (1 - smoothstep(4.0, 4.35, pose.t));
    drawStampImpact(p, tap);
    drawReedPen(p, pose.nibX, pose.nibY, pose.angle);
    p.pop();
  }
};
