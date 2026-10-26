import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 02 数与形 / Number & Form
// 全屏湿润泥板 + 4×4 平方表 + 楔形压印 + 青铜/芦苇尖笔。
// 静态重点：
//   localT≈1.0：标题在场、尖笔压入泥面、表格开始被填。
//   localT≈3.0：4×4 表沿格线裂成 16 块，拼成完整正方形并微微悬起，
//                尖笔停在路的左端；标题已淡出。

const META = {
  id: 2,
  cn: '数与形',
  en: 'Number & Form',
  era: '约前 1800 · 巴比伦',
  group: 'paper'
};

const C = {
  mud: '#c79a63',
  mudLight: '#d9b27c',
  mudPale: '#e7c795',
  mudDark: '#ac7c49',
  mudDeep: '#8a5f36',
  groove: '#5a4327',
  ink: '#33291f',
  inkDeep: '#241c14',
  inkSoft: '#5a4a3a',
  ochre: '#a45f32',
  ochreLight: '#c78648',
  ember: '#e2a35a',
  emberHot: '#f6d391',
  bronze: '#9c6b33',
  bronzeLight: '#cf9c58',
  bronzeDark: '#6c4722',
  paper: '#e8dcc0'
};

const TABLE = {
  x0: 460,
  x1: 910,
  y0: 270,
  y1: 610,
  cols: 4,
  rows: 4,
  cellW: 112.5,
  cellH: 85
};

const ROAD_Y = 630;
const LOCAL_X_PER_SECOND = 1000 / 6;
// 笔先飞到第一格，表格随每次压印填；最后一格约 2.22s 完成。
const FILL_START = 0.58;
const FILL_STEP = 0.105;

// ---------------------------------------------------------------- 小工具

function mix(a, b, k) {
  return a + (b - a) * k;
}

function q10(t) {
  return Math.floor(clamp(t, 0, 6) * 10 + 1e-9) / 10;
}

// 标题卡只属于当前版块：镜头会提前看到下一段，不能让下一段标题
// 在上一段的第 2 小节就入镜。globalT 缺失时退回 blockIndex。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

// 标题区保持安静：越靠近标题卡，背景噪点越淡。
function titleCalm(x, y) {
  const dx = (x - 300) / 250;
  const dy = (y - 362) / 140;
  const d = Math.sqrt(dx * dx + dy * dy);
  return 0.22 + 0.78 * smoothstep(0.8, 1.55, d);
}

function inRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// ---------------------------------------------------------------- 泥面底

function drawMudBase(p) {
  p.noStroke();
  fillHex(p, C.mud, 1);
  p.rect(-2, -2, 1004, 1004);

  // 低频湿泥斑（亮/暗各一层，不逐像素）
  for (let i = 0; i < 14; i++) {
    const x = -60 + hash2(i, 1, 101) * 1120;
    const y = -40 + hash2(i, 2, 101) * 1080;
    const w = 150 + hash2(i, 3, 101) * 280;
    const h = 110 + hash2(i, 4, 101) * 220;
    const a = (0.035 + hash2(i, 5, 101) * 0.045) * titleCalm(x, y);
    fillHex(p, i % 3 === 0 ? C.mudDark : C.mudLight, a);
    p.ellipse(x, y, w, h);
  }

  for (let i = 0; i < 34; i++) {
    const x = hash2(i, 6, 102) * 1000;
    const y = hash2(i, 7, 102) * 1000;
    const r = 22 + hash2(i, 8, 102) * 80;
    const a = (0.018 + hash2(i, 9, 102) * 0.03) * titleCalm(x, y);
    fillHex(p, i % 2 ? C.mudDark : C.mudPale, a);
    p.ellipse(x, y, r * (0.7 + hash2(i, 10, 102) * 0.7), r);
  }
}

// 泥板工匠的极淡辅助方格，不抢表格
function drawGuideGrid(p) {
  p.push();
  p.strokeWeight(0.8);

  for (let i = 0; i <= 10; i++) {
    const x = i * 100;
    for (let k = 0; k < 5; k++) {
      if (hash2(i, k, 141) < 0.18) continue;
      strokeHex(p, C.ink, 0.016);
      p.line(x, k * 200, x, k * 200 + 200);
    }
  }

  for (let j = 0; j <= 10; j++) {
    const y = j * 100;
    for (let k = 0; k < 5; k++) {
      if (hash2(j, k, 142) < 0.22) continue;
      strokeHex(p, C.ink, 0.016);
      p.line(k * 200, y, k * 200 + 200, y);
    }
  }

  // 表格外侧两道很淡的工匠辅助线
  strokeHex(p, C.groove, 0.055);
  p.strokeWeight(0.9);
  p.line(TABLE.x0 - 16, TABLE.y0 - 16, TABLE.x1 + 16, TABLE.y0 - 16);
  p.line(TABLE.x0 - 16, TABLE.y1 + 16, TABLE.x1 + 16, TABLE.y1 + 16);
  p.pop();
}

function drawSmears(p) {
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  for (let i = 0; i < 5; i++) {
    const x = 80 + hash2(i, 21, 111) * 840;
    const y = 120 + hash2(i, 22, 111) * 760;
    const w = 220 + hash2(i, 23, 111) * 320;
    const h = 120 + hash2(i, 24, 111) * 180;
    const start = hash2(i, 25, 111) * Math.PI * 2;
    const sweep = 0.7 + hash2(i, 26, 111) * 1.4;
    const a = (0.028 + hash2(i, 27, 111) * 0.025) * titleCalm(x, y);
    strokeHex(p, i % 2 ? C.mudLight : C.mudDark, a);
    p.strokeWeight(12 + hash2(i, 28, 111) * 18);
    p.arc(x, y, w, h, start, start + sweep);
  }
  p.pop();
}

function drawSand(p) {
  p.noStroke();
  for (let i = 0; i < 340; i++) {
    const x = hash2(i, 31, 121) * 1000;
    const y = hash2(i, 32, 121) * 1000;
    const s = 0.7 + hash2(i, 33, 121) * 2.1;
    const a = (0.08 + hash2(i, 34, 121) * 0.22) * titleCalm(x, y);
    fillHex(p, i % 4 === 0 ? C.mudPale : i % 4 === 1 ? C.mudDark : C.mudDeep, a);
    if (i % 7 === 0) p.ellipse(x, y, s * 2.2, s * 0.8);
    else p.ellipse(x, y, s, s);
  }
}

function drawPits(p) {
  let drawn = 0;
  for (let i = 0; i < 22 && drawn < 14; i++) {
    const x = 30 + hash2(i, 41, 131) * 940;
    const y = 40 + hash2(i, 42, 131) * 920;
    if (inRect(x, y, 130, 260, 470, 450)) continue;
    if (inRect(x, y, 490, 300, 910, 640)) continue;
    const w = 7 + hash2(i, 43, 131) * 20;
    const h = w * (0.45 + hash2(i, 44, 131) * 0.35);
    const a = (0.07 + hash2(i, 45, 131) * 0.07) * titleCalm(x, y);
    p.noStroke();
    fillHex(p, C.mudDark, a);
    p.ellipse(x, y, w, h);
    fillHex(p, C.mudPale, a * 1.2);
    p.ellipse(x + 0.6, y + h * 0.22, w * 0.72, h * 0.42);
    drawn++;
  }
}

// ---------------------------------------------------------------- 裂纹

function makeCrackPoints(seed, x, y, angle, steps, stepMin, stepMax, turn) {
  const rng = mulberry32(seed);
  const pts = [[x, y]];
  let px = x;
  let py = y;
  let a = angle;
  for (let i = 0; i < steps; i++) {
    a += (rng() - 0.5) * turn;
    const len = stepMin + rng() * (stepMax - stepMin);
    px += Math.cos(a) * len;
    py += Math.sin(a) * len;
    pts.push([px, py]);
  }
  return pts;
}

function drawCrackPaths(p, pts, lightColor, lightA, darkColor, darkA, lightW, darkW) {
  p.noFill();
  if (lightA > 0.002) {
    strokeHex(p, lightColor, lightA);
    p.strokeWeight(lightW);
    p.beginShape();
    for (const [x, y] of pts) p.vertex(x, y);
    p.endShape();
  }
  if (darkA > 0.002) {
    strokeHex(p, darkColor, darkA);
    p.strokeWeight(darkW);
    p.beginShape();
    for (const [x, y] of pts) p.vertex(x, y);
    p.endShape();
  }
}

const EDGE_CRACKS = [
  { seed: 9001, x: 8, y: 180, a: 0.25, n: 5, turn: 0.55 },
  { seed: 9002, x: 4, y: 640, a: -0.1, n: 6, turn: 0.5 },
  { seed: 9003, x: 22, y: 880, a: -0.55, n: 5, turn: 0.6 },
  { seed: 9004, x: 992, y: 140, a: 2.9, n: 5, turn: 0.55 },
  { seed: 9005, x: 996, y: 520, a: 2.6, n: 6, turn: 0.5 },
  { seed: 9006, x: 978, y: 860, a: 3.5, n: 5, turn: 0.6 },
  { seed: 9007, x: 180, y: 6, a: 1.3, n: 5, turn: 0.55 },
  { seed: 9008, x: 720, y: 4, a: 1.7, n: 5, turn: 0.55 },
  { seed: 9009, x: 320, y: 996, a: -1.4, n: 5, turn: 0.55 },
  { seed: 9010, x: 860, y: 992, a: -1.9, n: 5, turn: 0.55 }
];

function drawEdgeCracks(p) {
  p.push();
  p.strokeCap(p.ROUND);
  for (const spec of EDGE_CRACKS) {
    const pts = makeCrackPoints(spec.seed, spec.x, spec.y, spec.a, spec.n, 12, 28, spec.turn);
    drawCrackPaths(p, pts, C.mudPale, 0.10, C.groove, 0.20, 1.8, 0.9);
  }
  p.pop();
}

// 第 3 小节：泥板变干，右侧边缘裂开，裂缝里透出下一版块的浅色纸面
const DRY_CRACKS = [
  { seed: 9201, x: 996, y: 210, a: 2.9, n: 6 },
  { seed: 9202, x: 998, y: 390, a: 3.1, n: 7 },
  { seed: 9203, x: 994, y: 560, a: 2.7, n: 5 },
  { seed: 9204, x: 992, y: 740, a: 3.4, n: 6 },
  { seed: 9205, x: 940, y: 998, a: -1.7, n: 5 }
];

function drawDryMud(p, t) {
  const dry = smoothstep(4.0, 5.5, t);
  if (dry <= 0.001) return;

  p.push();
  p.noStroke();
  for (let i = 0; i < 5; i++) {
    const x = 912 + hash2(i, 61, 161) * 80;
    const y = 170 + hash2(i, 62, 161) * 700;
    fillHex(p, C.paper, 0.035 * dry);
    p.ellipse(x, y, 90 + hash2(i, 63, 161) * 120, 60 + hash2(i, 64, 161) * 100);
  }

  p.strokeCap(p.ROUND);
  for (const spec of DRY_CRACKS) {
    const pts = makeCrackPoints(spec.seed, spec.x, spec.y, spec.a, spec.n, 10, 22, 0.6);
    drawCrackPaths(
      p,
      pts,
      C.paper,
      0.30 * dry,
      C.groove,
      0.34 * dry,
      2.0,
      0.9
    );
  }
  p.pop();
}

// ---------------------------------------------------------------- 横向基线凹槽

function drawBaseline(p) {
  p.noStroke();
  fillHex(p, C.mudPale, 0.05);
  p.rect(-2, 612, 1004, 34);
  fillHex(p, C.mudDark, 0.09);
  p.rect(-2, 625, 1004, 10);

  strokeHex(p, C.groove, 0.24);
  p.strokeWeight(2.4);
  p.line(-2, 630.5, 1002, 630.5);
  strokeHex(p, C.mudPale, 0.30);
  p.strokeWeight(1.1);
  p.line(-2, 634.5, 1002, 634.5);

  p.noStroke();
  for (let i = 0; i < 34; i++) {
    const x = hash2(i, 51, 151) * 1000;
    const y = 626 + hash2(i, 52, 151) * 12;
    fillHex(p, i % 3 ? C.mudDeep : C.mudPale, 0.10 + hash2(i, 53, 151) * 0.12);
    p.ellipse(x, y, 1 + hash2(i, 54, 151) * 2.2, 0.8 + hash2(i, 54, 151) * 1.2);
  }
}

// ---------------------------------------------------------------- 路上的楔形压印

function pressPulse(t) {
  const phase = ((t % 0.5) + 0.5) % 0.5;
  if (phase < 0.16) return 1 - phase / 0.16;
  return 0;
}

function freezeAmount(t) {
  return smoothstep(2.88, 2.98, t) * (1 - smoothstep(3.86, 3.98, t));
}

function tapPulse(t) {
  const a = Math.max(0, 1 - Math.abs(t - 3.2) / 0.1);
  const b = Math.max(0, 1 - Math.abs(t - 3.5) / 0.1);
  return Math.max(a, b);
}

// 三角楔口 + 短尾 + 翻泥亮边
function drawPressMark(p, x, y, s, angle, alpha, lipAlpha) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.noStroke();

  if (lipAlpha > 0.002) {
    fillHex(p, C.mudPale, lipAlpha);
    p.beginShape();
    p.vertex(-s * 0.62 + 0.8, -s * 0.42 + 0.8);
    p.vertex(-s * 0.62 + 0.8, s * 0.42 + 0.8);
    p.vertex(s * 0.52 + 0.8, 0.8);
    p.endShape(p.CLOSE);
    p.rect(s * 0.2, -s * 0.15 + 0.8, s * 0.7, s * 0.3);
  }

  fillHex(p, C.ink, alpha);
  p.beginShape();
  p.vertex(-s * 0.6, -s * 0.4);
  p.vertex(-s * 0.6, s * 0.4);
  p.vertex(s * 0.5, 0);
  p.endShape(p.CLOSE);
  p.rect(s * 0.2, -s * 0.13, s * 0.7, s * 0.26);

  fillHex(p, C.inkDeep, alpha * 0.5);
  p.beginShape();
  p.vertex(-s * 0.18, -s * 0.16);
  p.vertex(-s * 0.18, s * 0.16);
  p.vertex(s * 0.3, 0);
  p.endShape(p.CLOSE);

  p.pop();
}

function drawPressCluster(p, cx, cy, seed, alpha) {
  const n = 2 + (hash2(seed, 1, 411) > 0.55 ? 1 : 0);
  for (let j = 0; j < n; j++) {
    const x = cx + (j - (n - 1) / 2) * 8.5 + (hash2(seed, j, 412) - 0.5) * 1.8;
    const y = cy + (hash2(seed, j, 413) - 0.5) * 2.4;
    const s = 8 + hash2(seed, j, 414) * 3.2;
    const a = (hash2(seed, j, 415) - 0.5) * 0.22;

    p.noStroke();
    fillHex(p, C.mudPale, 0.10 * alpha);
    p.ellipse(x, y + 1.6, s * 1.5, s * 0.62);
    fillHex(p, C.mudDark, 0.05 * alpha);
    p.ellipse(x - 0.5, y + 0.5, s * 1.35, s * 0.5);

    drawPressMark(p, x, y, s, a, 0.82 * alpha, 0.26 * alpha);

    for (let k = 0; k < 3; k++) {
      const px = x + (hash2(seed, j * 7 + k, 416) - 0.5) * s * 2.2;
      const py = y + (hash2(seed, j * 7 + k, 417) - 0.5) * s * 1.1 - 1;
      fillHex(p, k % 2 ? C.mudPale : C.mudDeep, (0.16 + hash2(seed, j, 418) * 0.16) * alpha);
      p.ellipse(px, py, 1 + hash2(seed, j * 7 + k, 419) * 2.2, 0.8 + hash2(seed, j * 7 + k, 419) * 1.4);
    }
  }
}

function drawRoadMarks(p, t) {
  // 已经压完的组，固定留在路面
  for (let k = 1; k <= 5; k++) {
    const pt = k * 0.5;
    if (t >= pt + 0.08) {
      drawPressCluster(p, pt * LOCAL_X_PER_SECOND, ROAD_Y, 500 + k, 0.9);
    }
  }

  // 正在压下的一笔：只在压印开始的第一帧出现，随后转成固定刻痕
  if (t < 2.62) {
    const beat = Math.floor(t * 2 + 1e-6);
    const pressStart = beat * 0.5;
    const pulse = pressPulse(t);
    if (t >= pressStart && t < pressStart + 0.08 && pulse > 0.2) {
      drawPressCluster(
        p,
        t * LOCAL_X_PER_SECOND,
        ROAD_Y,
        700 + beat,
        0.55 + 0.35 * pulse
      );
    }
  }
}

// ---------------------------------------------------------------- 楔形数字

// 竖楔（个位）：短尾在上，楔口向下压在泥里
function nailGlyph(p, x, baseY, s, color, alpha, ox, oy) {
  p.noStroke();
  fillHex(p, color, alpha);
  p.rect(x - s * 0.16 + ox, baseY - s * 1.42 + oy, s * 0.32, s * 0.52);
  p.beginShape();
  p.vertex(x - s * 0.52 + ox, baseY - s * 0.94 + oy);
  p.vertex(x + s * 0.52 + ox, baseY - s * 0.94 + oy);
  p.vertex(x + ox, baseY + oy);
  p.endShape(p.CLOSE);
}

// 角楔（十位）：横压的三角楔口 + 短尾，转一点角度
function cornerGlyph(p, x, y, s, color, alpha, ox, oy) {
  p.push();
  p.translate(x + ox, y + oy);
  p.rotate(-0.38);
  p.noStroke();
  fillHex(p, color, alpha);
  p.beginShape();
  p.vertex(-s * 0.55, -s * 0.48);
  p.vertex(-s * 0.55, s * 0.48);
  p.vertex(s * 0.32, 0);
  p.endShape(p.CLOSE);
  p.rect(s * 0.05, -s * 0.14, s * 0.5, s * 0.28);
  p.pop();
}

function digitMetrics(d, u) {
  const tens = Math.floor(d / 10);
  const units = d % 10;
  const unitGlyphW = u * 0.99;
  const unitPitch = u * 1.12;
  const tensGlyphW = u * 1.05;
  const tensPitch = u * 1.16;
  const unitW = units > 0 ? (units - 1) * unitPitch + unitGlyphW : 0;
  const tensW = tens > 0 ? (tens - 1) * tensPitch + tensGlyphW : 0;
  return {
    tens,
    units,
    unitW,
    tensW,
    unitGlyphW,
    unitPitch,
    tensGlyphW,
    tensPitch,
    w: Math.max(unitW, tensW)
  };
}

function digitHeight(d, u) {
  return Math.floor(d / 10) > 0 ? u * 2.7 : u * 1.35;
}

function drawDigit(p, d, x, bottomY, u, color, alpha, lipAlpha) {
  const m = digitMetrics(d, u);
  const unitsY = bottomY;
  const tensY = bottomY - u * 2.15;
  const unitsX = x + (m.w - m.unitW) / 2;
  const tensX = x + (m.w - m.tensW) / 2;
  const lo = Math.min(0.6, u * 0.14);

  if (lipAlpha > 0.002) {
    for (let i = 0; i < m.units; i++) {
      nailGlyph(
        p,
        unitsX + i * m.unitPitch + m.unitGlyphW / 2,
        unitsY,
        u * 0.95,
        C.mudPale,
        lipAlpha,
        lo,
        lo
      );
    }
    for (let i = 0; i < m.tens; i++) {
      cornerGlyph(
        p,
        tensX + i * m.tensPitch + m.tensGlyphW / 2,
        tensY,
        u,
        C.mudPale,
        lipAlpha,
        lo,
        lo
      );
    }
  }

  for (let i = 0; i < m.units; i++) {
    nailGlyph(
      p,
      unitsX + i * m.unitPitch + m.unitGlyphW / 2,
      unitsY,
      u * 0.95,
      color,
      alpha,
      0,
      0
    );
  }
  for (let i = 0; i < m.tens; i++) {
    cornerGlyph(
      p,
      tensX + i * m.tensPitch + m.tensGlyphW / 2,
      tensY,
      u,
      color,
      alpha,
      0,
      0
    );
  }
}

// 巴比伦式六十进制小数字组：高位在左、低位在右，共用同一条底线
function drawCuneiform(p, n, cx, cy, u, color, alpha, lipAlpha, align) {
  if (alpha <= 0.002) return;
  const digits = n >= 60 ? [Math.floor(n / 60), n % 60] : [n];
  const inter = u * 1.4;
  let totalW = inter * (digits.length - 1);
  let totalH = 0;
  const widths = [];
  for (const d of digits) {
    const w = digitMetrics(d, u).w;
    widths.push(w);
    totalW += w;
    totalH = Math.max(totalH, digitHeight(d, u));
  }
  const bottomY = cy + totalH / 2;
  let x = align === 'left' ? cx : cx - totalW / 2;
  for (let i = 0; i < digits.length; i++) {
    drawDigit(p, digits[i], x, bottomY, u, color, alpha, lipAlpha);
    x += widths[i] + inter;
  }
}

// ---------------------------------------------------------------- 4×4 表

function cellFillTime(idx) {
  return FILL_START + (idx + 0.5) * FILL_STEP;
}

function cellFilled(idx, t) {
  return t + 1e-9 >= cellFillTime(idx);
}

function cellCenter(idx) {
  const row = Math.floor(idx / TABLE.cols);
  const col = idx % TABLE.cols;
  return {
    x: TABLE.x0 + (col + 0.5) * TABLE.cellW,
    y: TABLE.y0 + (row + 0.5) * TABLE.cellH
  };
}

function activeCellIndex(t) {
  let active = 0;
  for (let i = 0; i < TABLE.cols * TABLE.rows; i++) {
    if (cellFilled(i, t)) active = i;
  }
  return active;
}

function tableState(t) {
  // 2.62 裂开 → 2.76 完全散开 → 2.98 重新拼好 → 3.86 后落回
  const out = smoothstep(2.62, 2.76, t) * (1 - smoothstep(2.84, 2.98, t));
  const joined = smoothstep(2.84, 2.98, t);
  const settle = smoothstep(3.86, 4.12, t);
  const hold = joined * (1 - settle);
  const emphasis = smoothstep(2.92, 3.0, t) * (1 - smoothstep(3.86, 4.06, t));
  return {
    out,
    hold,
    settle,
    gap: out * 8 + hold * 5.0,
    lift: out * 12 + hold * 10,
    emphasis,
    spin: out,
    residualSpin: hold * 0.018,
    tileVis: clamp(out + hold, 0, 1)
  };
}

function tileInfo(row, col, ts) {
  const idx = row * 4 + col;
  const baseCx = TABLE.x0 + (col + 0.5) * TABLE.cellW;
  const baseCy = TABLE.y0 + (row + 0.5) * TABLE.cellH;
  const dx = baseCx - (TABLE.x0 + TABLE.x1) / 2;
  const dy = baseCy - (TABLE.y0 + TABLE.y1) / 2;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const spread = ts.gap * (0.22 + 0.18 * hash2(idx, 71, 181));
  const ox = (dx / len) * spread;
  const oy = (dy / len) * spread;
  const angle =
    (hash2(idx, 72, 182) - 0.5) *
    2 *
    (ts.spin * 0.09 * (0.6 + 0.8 * hash2(idx, 73, 183)) + ts.residualSpin);
  return {
    idx,
    baseCx,
    baseCy,
    ox,
    oy,
    angle,
    cx: baseCx + ox,
    cy: baseCy + oy - ts.lift * 0.5,
    w: TABLE.cellW - ts.gap,
    h: TABLE.cellH - ts.gap
  };
}

function drawTableBed(p, ts) {
  const bx = TABLE.x0 - 12;
  const by = TABLE.y0 - 12;
  const bw = TABLE.x1 - TABLE.x0 + 24;
  const bh = TABLE.y1 - TABLE.y0 + 24;

  p.noStroke();
  fillHex(p, C.mud, 0.96);
  p.rect(bx, by, bw, bh);
  fillHex(p, C.mudPale, 0.045);
  p.rect(bx, by, bw, bh);

  for (let i = 0; i < 34; i++) {
    const gx = bx + hash2(i, 601, 191) * bw;
    const gy = by + hash2(i, 602, 191) * bh;
    fillHex(p, i % 3 ? C.mudDark : C.mudPale, 0.04 + hash2(i, 603, 191) * 0.05);
    p.ellipse(gx, gy, 1 + hash2(i, 604, 191) * 2.4, 0.7 + hash2(i, 604, 191) * 1.4);
  }

  p.noFill();
  strokeHex(p, C.groove, 0.12);
  p.strokeWeight(1.2);
  p.rect(bx + 1.5, by + 1.5, bw - 3, bh - 3, 2);
  strokeHex(p, C.mudPale, 0.12);
  p.strokeWeight(0.8);
  p.line(bx + 2, by + bh - 2, bx + bw - 2, by + bh - 2);

  if (ts.lift > 0.4) {
    const k = clamp(ts.lift / 9, 0, 1);
    p.noStroke();
    fillHex(p, C.mudDeep, 0.05 * k);
    p.rect(bx + 6, by + 6, bw - 12, bh - 12);
    fillHex(p, C.mudDeep, 0.05 * k);
    p.rect(bx + 6, by + 6, bw - 12, 16);
    fillHex(p, C.mudPale, 0.04 * k);
    p.rect(bx + 8, by + bh - 12, bw - 16, 5);
  }
}

function grooveLine(p, x1, y1, x2, y2, a) {
  if (a <= 0.005) return;
  strokeHex(p, C.groove, 0.52 * a);
  p.strokeWeight(2.2);
  p.line(x1, y1, x2, y2);
  strokeHex(p, C.mudPale, 0.34 * a);
  p.strokeWeight(1.0);
  p.line(x1 + 1.2, y1 + 1.2, x2 + 1.2, y2 + 1.2);
}

function drawContinuousGrid(p, a) {
  if (a <= 0.005) return;
  const x0 = TABLE.x0;
  const x1 = TABLE.x1;
  const y0 = TABLE.y0;
  const y1 = TABLE.y1;

  for (let c = 1; c < TABLE.cols; c++) {
    grooveLine(p, x0 + c * TABLE.cellW, y0, x0 + c * TABLE.cellW, y1, a);
  }
  for (let r = 1; r < TABLE.rows; r++) {
    grooveLine(p, x0, y0 + r * TABLE.cellH, x1, y0 + r * TABLE.cellH, a);
  }

  // 内边界（格线）与外框（压出的双线）
  grooveLine(p, x0, y0, x1, y0, a);
  grooveLine(p, x0, y1, x1, y1, a);
  grooveLine(p, x0, y0, x0, y1, a);
  grooveLine(p, x1, y0, x1, y1, a);
  grooveLine(p, x0 - 6, y0 - 6, x1 + 6, y0 - 6, a);
  grooveLine(p, x0 - 6, y1 + 6, x1 + 6, y1 + 6, a);
  grooveLine(p, x0 - 6, y0 - 6, x0 - 6, y1 + 6, a);
  grooveLine(p, x1 + 6, y0 - 6, x1 + 6, y1 + 6, a);
}

function drawCrackFlash(p, t) {
  const a = smoothstep(2.56, 2.62, t) * (1 - smoothstep(2.7, 2.8, t));
  if (a <= 0.01) return;
  p.push();
  p.strokeWeight(3.0);
  strokeHex(p, C.ink, 0.35 * a);
  for (let c = 1; c < TABLE.cols; c++) {
    const x = TABLE.x0 + c * TABLE.cellW;
    p.line(x, TABLE.y0, x, TABLE.y1);
  }
  for (let r = 1; r < TABLE.rows; r++) {
    const y = TABLE.y0 + r * TABLE.cellH;
    p.line(TABLE.x0, y, TABLE.x1, y);
  }
  strokeHex(p, C.mudPale, 0.28 * a);
  p.strokeWeight(1.0);
  for (let c = 1; c < TABLE.cols; c++) {
    const x = TABLE.x0 + c * TABLE.cellW + 1.2;
    p.line(x, TABLE.y0 + 1.2, x, TABLE.y1 + 1.2);
  }
  for (let r = 1; r < TABLE.rows; r++) {
    const y = TABLE.y0 + r * TABLE.cellH + 1.2;
    p.line(TABLE.x0 + 1.2, y, TABLE.x1 + 1.2, y);
  }
  p.pop();
}

function drawTileShadow(p, info, ts) {
  const k = clamp(ts.lift / 10, 0, 1);
  const sx = info.baseCx + info.ox + 3 + ts.lift * 0.22;
  const sy = info.baseCy + info.oy + 4 + ts.lift * 0.26;
  p.push();
  p.translate(sx, sy);
  p.rotate(info.angle);
  p.noStroke();
  fillHex(p, C.ink, 0.07 + 0.03 * k);
  p.rect(-info.w / 2, -info.h / 2, info.w, info.h, 2);
  p.pop();
}

function drawTileFace(p, info, vis) {
  p.push();
  p.translate(info.cx, info.cy);
  p.rotate(info.angle);
  p.noStroke();
  fillHex(p, C.mud, vis);
  p.rect(-info.w / 2, -info.h / 2, info.w, info.h);
  fillHex(p, C.mudLight, 0.1 * vis);
  p.rect(-info.w / 2, -info.h / 2, info.w, info.h);

  // 浮起泥片的亮边在上左、暗边在下右
  strokeHex(p, C.mudPale, 0.5 * vis);
  p.strokeWeight(1.1);
  p.line(-info.w / 2, info.h / 2 - 1.2, -info.w / 2, -info.h / 2 + 0.5);
  p.line(-info.w / 2 + 0.5, -info.h / 2, info.w / 2 - 1.2, -info.h / 2);
  strokeHex(p, C.groove, 0.5 * vis);
  p.strokeWeight(1.5);
  p.line(-info.w / 2, info.h / 2, info.w / 2, info.h / 2);
  p.line(info.w / 2, -info.h / 2, info.w / 2, info.h / 2);
  p.noFill();
  strokeHex(p, C.groove, 0.3 * vis);
  p.strokeWeight(0.8);
  p.rect(-info.w / 2, -info.h / 2, info.w, info.h);
  p.pop();
}

function drawCellContent(p, idx, row, col, t, ts) {
  const filled = cellFilled(idx, t);
  const flash = filled ? clamp(1 - (t - cellFillTime(idx)) / 0.18, 0, 1) : 0;
  const n = row * 4 + col + 1;

  if (!filled) {
    p.noStroke();
    fillHex(p, C.groove, 0.045);
    p.ellipse(1, 7, 30, 14);
    fillHex(p, C.mudPale, 0.06);
    p.ellipse(1, 8.6, 26, 8);
    return;
  }

  if (flash > 0.01) {
    p.noFill();
    strokeHex(p, C.ochre, 0.13 * flash);
    p.strokeWeight(1.2);
    p.ellipse(0, 6, 42, 26);
    p.noStroke();
    fillHex(p, C.ochre, 0.05 * flash);
    p.ellipse(0, 6, 38, 22);
  }

  const numAlpha = 0.84 - 0.3 * ts.emphasis;
  const smallAlpha = 0.38 - 0.16 * ts.emphasis;

  // 左上角小序号；主平方数放大到约 30–40px 高，填满更大的格。
  drawCuneiform(p, n, -45, -29, 3.4, C.inkSoft, smallAlpha, smallAlpha * 0.35, 'left');
  drawCuneiform(p, n * n, 0, 10, 7.4, C.ink, numAlpha, numAlpha * 0.22, 'center');
}

// 左下的“边 30 / 对角线”参考图形：只画自创的方形、对角线和楔形数字，
// 让第 1 小节左侧不再空，也不复制任何文物照片。
function drawLeftExample(p, t) {
  const a = smoothstep(0.2, 0.85, t) * (1 - smoothstep(4.2, 5.2, t));
  if (a <= 0.002) return;
  p.push();
  p.translate(64, 540);
  p.noFill();
  strokeHex(p, C.groove, 0.34 * a);
  p.strokeWeight(1.7);
  p.rect(0, 0, 80, 80);
  p.line(0, 80, 80, 0);
  p.line(0, 0, 80, 80);
  p.noStroke();
  drawCuneiform(p, 30, 40, 74, 3.0, C.inkSoft, 0.55 * a, 0.16 * a, 'center');
  drawCuneiform(p, 42, 46, 94, 2.8, C.ochre, 0.5 * a, 0.12 * a, 'center');
  p.pop();
}

function drawImpact(p, t) {
  const a = smoothstep(2.42, 2.48, t) * (1 - smoothstep(2.68, 2.78, t));
  if (a <= 0.01) return;

  const cx = TABLE.x0 + 3.5 * TABLE.cellW;
  const cy = TABLE.y0 + 3.5 * TABLE.cellH;
  p.push();
  p.translate(cx, cy);

  p.noFill();
  strokeHex(p, C.groove, 0.4 * a);
  p.strokeWeight(1.6);
  p.ellipse(0, 0, 44, 36);
  strokeHex(p, C.mudPale, 0.35 * a);
  p.strokeWeight(1.0);
  p.ellipse(0.8, 0.8, 46, 38);

  strokeHex(p, C.inkDeep, 0.45 * a);
  p.strokeWeight(1.2);
  for (let k = 0; k < 7; k++) {
    const ang = -2.6 + k * 0.75 + hash2(k, 701, 201) * 0.2;
    let r = 9;
    p.beginShape();
    p.vertex(Math.cos(ang) * r, Math.sin(ang) * r);
    for (let s = 1; s <= 3; s++) {
      r += 5 + hash2(k, s, 702) * 4;
      const jitter = (hash2(k, s, 703) - 0.5) * 0.5;
      p.vertex(Math.cos(ang + jitter) * r, Math.sin(ang + jitter) * r);
    }
    p.endShape();
  }

  p.noStroke();
  for (let k = 0; k < 6; k++) {
    const ang = hash2(k, 704, 201) * Math.PI * 2;
    const r = 20 + hash2(k, 705, 201) * 12;
    fillHex(p, k % 2 ? C.mudPale : C.mudDeep, 0.3 * a);
    p.ellipse(Math.cos(ang) * r, Math.sin(ang) * r, 1.5 + hash2(k, 706, 201) * 2.4, 1.2);
  }
  p.pop();
}

function drawSquareEmphasis(p, ts) {
  const a = ts.emphasis;
  if (a <= 0.005) return;
  const up = ts.lift * 0.5;
  const x0 = TABLE.x0 - 6;
  const x1 = TABLE.x1 + 6;
  const y0 = TABLE.y0 - 6 - up;
  const y1 = TABLE.y1 + 6 - up;

  p.push();
  p.noFill();
  // 浮起正方形的亮边与暗边
  strokeHex(p, C.mudPale, 0.5 * a);
  p.strokeWeight(2.0);
  p.rect(x0 - 0.8, y0 - 0.8, x1 - x0 + 1.6, y1 - y0 + 1.6);
  strokeHex(p, C.groove, 0.45 * a);
  p.strokeWeight(1.8);
  p.rect(x0 + 0.6, y0 + 0.6, x1 - x0 - 1.2, y1 - y0 - 1.2);

  // 四角短刻线：把“完整的正方形”点出来
  strokeHex(p, C.ochre, 0.5 * a);
  p.strokeWeight(1.6);
  const tick = 8;
  p.line(x0, y0, x0 - tick, y0);
  p.line(x0, y0, x0, y0 - tick);
  p.line(x1, y0, x1 + tick, y0);
  p.line(x1, y0, x1, y0 - tick);
  p.line(x0, y1, x0 - tick, y1);
  p.line(x0, y1, x0, y1 + tick);
  p.line(x1, y1, x1 + tick, y1);
  p.line(x1, y1, x1, y1 + tick);
  p.pop();
}

function drawSettleDust(p, t, ts) {
  // 16 块落回时扬起的一层细泥粉；拼合定格阶段保持干净
  const a = smoothstep(3.84, 3.94, t) * (1 - smoothstep(4.06, 4.34, t));
  if (a <= 0.01) return;
  const up = ts.lift * 0.5;
  p.noStroke();
  for (let i = 0; i < 10; i++) {
    const edge = i % 4;
    let x;
    let y;
    if (edge === 0) {
      x = TABLE.x0 + hash2(i, 301, 211) * (TABLE.x1 - TABLE.x0);
      y = TABLE.y1 + 4 + hash2(i, 302, 211) * 8;
    } else if (edge === 1) {
      x = TABLE.x1 + 4 + hash2(i, 301, 211) * 8;
      y = TABLE.y0 + hash2(i, 302, 211) * (TABLE.y1 - TABLE.y0);
    } else if (edge === 2) {
      x = TABLE.x0 + hash2(i, 301, 211) * (TABLE.x1 - TABLE.x0);
      y = TABLE.y0 - 4 - hash2(i, 302, 211) * 8;
    } else {
      x = TABLE.x0 - 4 - hash2(i, 301, 211) * 8;
      y = TABLE.y0 + hash2(i, 302, 211) * (TABLE.y1 - TABLE.y0);
    }
    fillHex(p, i % 2 ? C.mudPale : C.mudDeep, (0.12 + hash2(i, 303, 211) * 0.14) * a);
    p.ellipse(x, y - up, 1 + hash2(i, 304, 211) * 2.2, 1);
  }
}

function drawTable(p, t) {
  const ts = tableState(t);
  drawTableBed(p, ts);
  drawContinuousGrid(p, 1 - clamp(ts.tileVis, 0, 1));
  drawCrackFlash(p, t);

  if (ts.lift > 0.15) {
    for (let r = 0; r < TABLE.rows; r++) {
      for (let c = 0; c < TABLE.cols; c++) {
        drawTileShadow(p, tileInfo(r, c, ts), ts);
      }
    }
  }

  for (let r = 0; r < TABLE.rows; r++) {
    for (let c = 0; c < TABLE.cols; c++) {
      const idx = r * 4 + c;
      const info = tileInfo(r, c, ts);
      if (ts.tileVis > 0.01) drawTileFace(p, info, ts.tileVis);
      p.push();
      p.translate(info.cx, info.cy);
      p.rotate(info.angle);
      drawCellContent(p, idx, r, c, t, ts);
      p.pop();
    }
  }

  drawImpact(p, t);
  drawSquareEmphasis(p, ts);
  drawSettleDust(p, t, ts);
}

// ---------------------------------------------------------------- 尖笔（主角）

function drawStylus(p, x, t, spawn = 1, baseY = ROAD_Y) {
  const freeze = freezeAmount(t);
  const press = pressPulse(t) * (1 - freeze);
  const tap = tapPulse(t) * freeze;
  const tipLift = 3 - 5.5 * press + 8 * freeze - 6.5 * tap;
  const tipY = baseY - tipLift;
  const angle = 0.13 + 0.015 * press + 0.03 * freeze;

  // 接触面的影子；随笔落在表格单元上，而不是永远在路面。
  p.noStroke();
  fillHex(p, C.ink, 0.1 + 0.06 * press + 0.02 * freeze);
  p.ellipse(x + 7, baseY + 3, 42 - 6 * press + 8 * freeze, 8 + 2 * freeze);
  fillHex(p, C.ink, 0.04 + 0.03 * press);
  p.ellipse(x + 15, baseY + 6, 36, 3.5);

  // 压下时泥面向外微鼓
  if (press > 0.1) {
    fillHex(p, C.mudPale, 0.14 * press);
    p.ellipse(x, baseY + 1.5, 22, 6);
    fillHex(p, C.mudDark, 0.09 * press);
    p.ellipse(x, baseY + 2, 15, 3.6);
  }

  // 火种的暖光
  fillHex(p, C.ochre, 0.11 + 0.05 * press);
  p.ellipse(x, tipY, 27, 27);
  fillHex(p, C.ochreLight, 0.23 + 0.08 * press);
  p.ellipse(x, tipY, 14, 14);

  p.push();
  p.translate(x, tipY);
  p.rotate(angle);
  // 从第 1 版块石头的火种位置长出：入场 0.28s 内由 0.18 放大到 1。
  p.scale(spawn);

  // 深色轮廓
  p.noStroke();
  fillHex(p, C.bronzeDark, 1);
  p.beginShape();
  p.vertex(0, 0);
  p.vertex(-5.4, -14);
  p.vertex(-4.6, -46);
  p.vertex(-3.8, -80);
  p.vertex(-3.0, -90);
  p.vertex(3.6, -90);
  p.vertex(4.4, -54);
  p.vertex(5.6, -16);
  p.endShape(p.CLOSE);

  // 受光面
  fillHex(p, C.bronze, 1);
  p.beginShape();
  p.vertex(0, -0.5);
  p.vertex(-4.8, -14);
  p.vertex(-4.1, -48);
  p.vertex(-3.3, -82);
  p.vertex(-1.4, -89);
  p.vertex(-0.3, -48);
  p.vertex(-0.6, -16);
  p.endShape(p.CLOSE);

  // 右侧暗面
  fillHex(p, C.bronzeDark, 0.85);
  p.beginShape();
  p.vertex(0.3, -1);
  p.vertex(5.0, -16);
  p.vertex(3.9, -52);
  p.vertex(3.3, -86);
  p.vertex(1.6, -89);
  p.vertex(0.8, -50);
  p.vertex(0.2, -18);
  p.endShape(p.CLOSE);

  p.noFill();
  strokeHex(p, C.bronzeLight, 0.75);
  p.strokeWeight(1.2);
  p.line(-4.1, -18, -3.1, -80);

  strokeHex(p, C.inkDeep, 0.65);
  p.strokeWeight(1.3);
  p.line(0, 0, -5.4, -14);
  p.line(0, 0, 5.6, -16);

  // 苇杆缠带
  strokeHex(p, C.bronzeDark, 0.7);
  p.strokeWeight(1.4);
  p.line(-4.3, -34, 3.9, -35);
  p.line(-3.8, -58, 3.6, -59);
  strokeHex(p, C.bronzeLight, 0.4);
  p.strokeWeight(0.8);
  p.line(-4.3, -30.8, 3.9, -31.8);
  p.line(-3.8, -54.8, 3.6, -55.8);

  // 顶端封口
  p.noStroke();
  fillHex(p, C.bronzeDark, 1);
  p.ellipse(0.2, -89, 7, 3.4);
  fillHex(p, C.bronzeLight, 0.8);
  p.ellipse(-1, -90, 3, 1.6);

  // 楔形尖的受光刃口
  fillHex(p, C.bronzeLight, 0.9);
  p.beginShape();
  p.vertex(-0.4, -0.5);
  p.vertex(-4.2, -12);
  p.vertex(-1.6, -13);
  p.vertex(0.4, -2);
  p.endShape(p.CLOSE);

  p.pop();

  // 尖端火种
  p.noStroke();
  fillHex(p, C.ember, 0.9);
  p.ellipse(x, tipY - 1, 4.6, 4.6);
  fillHex(p, C.emberHot, 0.95);
  p.ellipse(x - 0.5, tipY - 1.5, 2.1, 2.1);

  drawTipDust(p, x, tipY, t, press, freeze);
}

function drawTipDust(p, x, tipY, t, press, freeze) {
  p.noStroke();

  if (press > 0.02) {
    const beat = Math.floor(t * 2 + 1e-6);
    for (let k = 0; k < 4; k++) {
      const u = hash2(beat, k, 221);
      const v = hash2(beat, k, 222);
      const px = x + (u - 0.5) * 22;
      const py = tipY + 2 + v * 7;
      fillHex(p, k % 2 ? C.mudPale : C.mudDeep, (0.12 + 0.16 * (1 - press)) * press);
      p.ellipse(px, py, 1.2 + v * 2, 1 + v * 1.4);
    }
  }

  // 定格时敲两下：泥粉从笔尖落下
  if (freeze > 0.01) {
    const taps = [3.2, 3.5];
    for (let ti = 0; ti < taps.length; ti++) {
      const age = (t - taps[ti]) / 0.55;
      if (age < 0 || age > 1) continue;
      for (let k = 0; k < 7; k++) {
        const u = hash2(ti, k, 231);
        const v = hash2(ti, k, 232);
        const px = x + (u - 0.5) * 30 - age * 7;
        const py = 632 - 10 - v * 16 + 52 * age * age;
        const a = 0.3 * (1 - age) * freeze;
        fillHex(p, k % 3 ? C.mudPale : C.mudDeep, a);
        p.ellipse(px, py, 1 + v * 2.2, 0.8 + v * 1.6);
      }
    }
  }
}

// ---------------------------------------------------------------- 场景接口

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);

    drawMudBase(p);
    drawGuideGrid(p);
    drawSmears(p);
    drawSand(p);
    drawPits(p);
    drawEdgeCracks(p);
    drawDryMud(p, t);
    drawLeftExample(p, t);
    drawBaseline(p);
    drawTable(p, t);

    // 标题卡只属于当前版块；年代小字后面垫一条深泥色窄带，
    // 让 paper 组偏浅的 era 色在湿泥底上也能读。
    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (titleAlpha > 0.002) {
      p.noStroke();
      fillHex(p, C.groove, 0.58 * titleAlpha);
      p.rect(204, 394, 192, 17, 8);
      fillHex(p, C.mudDeep, 0.22 * titleAlpha);
      p.rect(214, 396, 172, 13, 6);
      strokeHex(p, C.mudPale, 0.24 * titleAlpha);
      p.strokeWeight(0.8);
      p.line(222, 393, 378, 393);
      p.line(222, 411, 378, 411);
    }

    if (showTitle) {
      drawTitleCard(p, {
        ...META,
        number: META.id,
        x: 300,
        y: 362,
        alpha: titleAlpha
      });
    }
  },

  drawRoad(p, state) {
    // 主调度只量化 draw；这里收到原始 localT，自己量化到 10Hz，
    // 保证补画表格时与 draw 的状态一致。
    const t = q10(state.localT || 0);

    // p5 的 push/pop 同时保存 ctx 与画笔状态；裸 ctx 操作用 save/restore
    // 包住，退出时两套状态才能同步。
    p.push();
    const ctx = p.drawingContext;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1, 466, 1002, 68);
    ctx.clip();

    // 默认路面横带（约 y=470–530）盖住了泥面与表格第 3 行。
    // 在裁剪区内按 draw() 的同一顺序重绘材质层，接缝处逐像素一致。
    drawMudBase(p);
    drawGuideGrid(p);
    drawSmears(p);
    drawSand(p);
    drawPits(p);
    drawEdgeCracks(p);
    drawDryMud(p, t);
    drawTable(p, t);

    ctx.restore();
    p.pop();
  },

  drawActor(p, state) {
    // drawActor 直接吃世界坐标；笔尖从边界火种飞到第一格，
    // 之后每格随笔的压印时间切换，笔与表格内容真正同因果。
    const t = q10(state.localT || 0);
    const blockOrigin = ((state.blockIndex || 1) - 1) * 1000;
    const first = cellCenter(0);
    const cell = cellCenter(activeCellIndex(t));
    const fly = smoothstep(0.06, 0.58, t);
    const spawn = 0.18 + 0.82 * smoothstep(0, 0.28, t);

    let x = state.x;
    let baseY = ROAD_Y;
    if (t < 0.58) {
      x = state.x + (blockOrigin + first.x - state.x) * fly;
      baseY = ROAD_Y + (first.y + 16 - ROAD_Y) * fly;
    } else {
      const cellX = blockOrigin + cell.x;
      const cellY = cell.y + 16;
      // 填完 16 格后笔不再停在最后一格：抬到桌面中心，
      // 看 4×4 表裂开/拼合，随后沿桌沿滑到接缝交出火种。
      const centerX = blockOrigin + 685;
      const centerY = 435 + 5 * smoothstep(3.86, 4.12, t);
      const toCenter = smoothstep(2.26, 2.82, t);
      const toExit = smoothstep(4.12, 6.0, t);
      const arc = Math.sin(Math.PI * clamp((t - 2.26) / 0.56, 0, 1)) * 18;
      const drift =
        smoothstep(2.82, 3.0, t) * (1 - smoothstep(3.86, 4.08, t));

      x = mix(cellX, centerX, toCenter);
      baseY = mix(cellY, centerY, toCenter) - arc;
      x += Math.sin((t - 2.82) * 1.7) * 6 * drift;
      baseY += Math.sin((t - 2.82) * 2.2) * 2 * drift;
      x = mix(x, blockOrigin + 1000, toExit);
      baseY = mix(baseY, 610, toExit);
    }

    // 离场时留一条很淡的暖色划痕，解释笔为什么向右滑。
    if (t > 4.05) {
      const fade = smoothstep(4.05, 4.45, t) * (1 - smoothstep(5.9, 6.0, t));
      const x0 = blockOrigin + TABLE.x1;
      const w = Math.max(0, x - x0);
      p.push();
      p.noStroke();
      fillHex(p, C.ember, 0.09 * fade);
      p.rect(x0, 618, w, 2.2, 1);
      fillHex(p, C.emberHot, 0.13 * fade);
      p.rect(x0, 621, w * 0.92, 0.8, 1);
      p.pop();
    }

    drawStylus(p, x, t, spawn, baseY);
  }
};
