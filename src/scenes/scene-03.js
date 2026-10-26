import { fillHex, strokeHex } from '../kit/palette.js';
import { hash2, mulberry32, smoothstep, clamp } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 03 几何与证明 · 羊皮纸 / 尺规构造 / 青铜圆规。
// 静态关键帧：localT=1.0（标题 + 圆规进场），localT=3.0（小方块卡圆边、圆规停住）。
// 所有纸纹、裂纹、螺旋都由固定种子/角度公式生成，同 t 重渲一致。

const META = {
  id: 3,
  cn: '几何与证明',
  en: 'Geometry & Proof',
  era: '约前 300 · 古希腊',
  group: 'paper'
};

const C = {
  paper: '#e8dcc0',
  paperLight: '#f2e8d2',
  paperShade: '#d6c5a0',
  paperDark: '#c2ad84',
  fiberDark: '#8d7654',
  ink: '#33291f',
  graphite: '#443d32',
  graphiteSoft: '#6a6153',
  cold: '#5d7180',
  rust: '#a45f32',
  brassDark: '#5c3a1c',
  brass: '#b8863c',
  brassLight: '#d8a75a',
  brassHi: '#edc87e',
  ember: '#d98a3e',
  emberHot: '#f6c878'
};

const CX = 700;
const CY = 402;
const R = 174;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// 证明链：沿圆外侧左下 -> 右下 -> 右上，最后一个节点未完成。
const CHAIN_DEGS = [112, 80, 50, 20, -10];
const CHAIN_R = 195;
const CHAIN_NODE_R = [5.0, 4.6, 5.4, 4.8, 6.3];

// 卡在圆边的小方块。圆心 (700,402)、半径 174 时，120° 处约 (613,552.7)。

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

// ---------------------------------------------------------------- 纸面

function drawPaper(p) {
  p.push();
  p.noStroke();
  fillHex(p, C.paper, 1);
  p.rect(-2, -2, 1004, 1004);

  // 低频斑驳：大而软的椭圆，避免高频噪点。
  for (let i = 0; i < 64; i++) {
    const x = hash2(i, 11, 31) * 1000;
    const y = hash2(i, 12, 31) * 1000;
    const rx = 50 + hash2(i, 13, 31) * 150;
    const ry = 30 + hash2(i, 14, 31) * 120;
    const light = hash2(i, 15, 31) > 0.52;
    fillHex(
      p,
      light ? C.paperLight : C.paperShade,
      0.022 + hash2(i, 16, 31) * 0.04
    );
    p.ellipse(x, y, rx * 2, ry * 2);
  }

  // 水平方向的纸浆雾。
  for (let i = 0; i < 18; i++) {
    const x = hash2(i, 21, 31) * 900 - 60;
    const y = hash2(i, 22, 31) * 1000;
    const w = 120 + hash2(i, 23, 31) * 520;
    fillHex(
      p,
      i % 2 ? C.paperShade : C.paperLight,
      0.016 + hash2(i, 24, 31) * 0.024
    );
    p.rect(x, y, w, 1 + hash2(i, 25, 31) * 2);
  }

  // 380 根短纤维，一半褐、一半亮，低对比。
  for (let i = 0; i < 380; i++) {
    const x = hash2(i, 1, 77) * 1000;
    const y = hash2(i, 2, 77) * 1000;
    const len = 8 + hash2(i, 3, 77) * 22;
    const a = -0.28 + (hash2(i, 4, 77) - 0.5) * 0.9;
    const dark = i % 2 === 0;
    const alpha = dark
      ? 0.05 + hash2(i, 5, 77) * 0.07
      : 0.1 + hash2(i, 5, 77) * 0.12;
    const mx =
      x + Math.cos(a) * len * 0.5 + (hash2(i, 7, 77) - 0.5) * 1.4;
    const my =
      y + Math.sin(a) * len * 0.5 + (hash2(i, 8, 77) - 0.5) * 1.4;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    strokeHex(p, dark ? C.fiberDark : C.paperLight, alpha);
    p.strokeWeight(0.55 + hash2(i, 6, 77) * 0.5);
    p.line(x, y, mx, my);
    p.line(mx, my, x2, y2);
  }

  // 细沙颗粒。
  p.noStroke();
  for (let i = 0; i < 240; i++) {
    const x = hash2(i, 41, 91) * 1000;
    const y = hash2(i, 42, 91) * 1000;
    fillHex(p, i % 3 ? C.paperDark : C.ink, 0.03 + hash2(i, 43, 91) * 0.05);
    p.ellipse(
      x,
      y,
      0.8 + hash2(i, 44, 91) * 1.8,
      0.7 + hash2(i, 44, 91) * 1.4
    );
  }
  for (let i = 0; i < 90; i++) {
    const x = hash2(i, 51, 91) * 1000;
    const y = hash2(i, 52, 91) * 1000;
    fillHex(p, C.paperLight, 0.06 + hash2(i, 53, 91) * 0.08);
    p.ellipse(x, y, 0.7 + hash2(i, 54, 91) * 1.3, 0.6 + hash2(i, 54, 91));
  }
  p.pop();
}

function drawGuideGrid(p, t) {
  const a = 0.034 * smoothstep(0.15, 0.95, t);
  if (a <= 0.001) return;
  p.push();
  p.noFill();
  p.strokeWeight(0.7);
  for (let x = 0; x <= 1000; x += 62.5) {
    const major = Math.abs(x % 250) < 0.01;
    strokeHex(p, C.graphite, a * (major ? 1.35 : 0.9));
    p.line(x, 0, x, 1000);
  }
  for (let y = 0; y <= 1000; y += 62.5) {
    const major = Math.abs(y % 250) < 0.01;
    strokeHex(p, C.graphite, a * (major ? 1.35 : 0.9));
    p.line(0, y, 1000, y);
  }
  p.pop();
}

function drawCracks(p) {
  const rng = mulberry32(3303);
  const starts = [
    { x: 30, y: 118, a: 0.62, n: 7 },
    { x: 952, y: 244, a: 2.72, n: 6 },
    { x: 116, y: 904, a: -0.72, n: 6 }
  ];
  p.push();
  p.noFill();
  for (const s of starts) {
    const pts = [{ x: s.x, y: s.y }];
    let x = s.x;
    let y = s.y;
    let a = s.a;
    for (let k = 0; k < s.n; k++) {
      a += (rng() - 0.5) * 0.5;
      x += Math.cos(a) * (12 + rng() * 22);
      y += Math.sin(a) * (12 + rng() * 22);
      pts.push({ x, y });
    }
    // 裂口亮边 + 暗芯，做出很浅的厚度。
    strokeHex(p, C.paperLight, 0.1);
    p.strokeWeight(0.8);
    p.beginShape();
    for (const pt of pts) p.vertex(pt.x + 1.2, pt.y + 1.0);
    p.endShape();
    strokeHex(p, '#7a6448', 0.12);
    p.strokeWeight(0.9);
    p.beginShape();
    for (const pt of pts) p.vertex(pt.x, pt.y);
    p.endShape();
  }
  p.pop();
}

function drawEdgeWear(p) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createRadialGradient(500, 500, 330, 500, 500, 720);
  grad.addColorStop(0, 'rgba(92,72,46,0)');
  grad.addColorStop(0.74, 'rgba(92,72,46,0.028)');
  grad.addColorStop(1, 'rgba(92,72,46,0.11)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();

  // 边缘磨损：贴边的小块掉色/压痕。
  p.push();
  p.noStroke();
  for (let i = 0; i < 30; i++) {
    const side = i % 4;
    const u = hash2(i, 61, 17);
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = u * 1000;
      y = hash2(i, 62, 17) * 10;
    } else if (side === 1) {
      x = 990 + hash2(i, 62, 17) * 10;
      y = u * 1000;
    } else if (side === 2) {
      x = u * 1000;
      y = 990 + hash2(i, 62, 17) * 10;
    } else {
      x = hash2(i, 62, 17) * 10;
      y = u * 1000;
    }
    fillHex(
      p,
      i % 3 ? C.paperDark : C.paperLight,
      0.04 + hash2(i, 63, 17) * 0.07
    );
    p.ellipse(x, y, 4 + hash2(i, 64, 17) * 14, 2 + hash2(i, 65, 17) * 6);
  }
  p.pop();
}

// ---------------------------------------------------------------- 构造图

function drawArc(p, cx, cy, r, a0, a1, color, alpha, weight) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.arc(cx, cy, r * 2, r * 2, a0, a1, p.OPEN);
  p.pop();
}

function drawDashedArc(p, cx, cy, r, deg0, deg1, alpha, dash) {
  if (alpha <= 0.002) return;
  const ctx = p.drawingContext;
  const a0 = (deg0 * Math.PI) / 180;
  const a1 = (deg1 * Math.PI) / 180;
  ctx.save();
  ctx.setLineDash(dash);
  drawArc(p, cx, cy, r, a0, a1, C.cold, alpha, 0.95);
  ctx.restore();
}

function drawTriangleLines(p, pts, alpha, weight) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, C.graphite, alpha);
  p.strokeWeight(weight);
  p.line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
  p.line(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  p.line(pts[2].x, pts[2].y, pts[0].x, pts[0].y);
  p.pop();
}

function drawDot(p, x, y, r, color, alpha) {
  p.push();
  p.noStroke();
  fillHex(p, color, alpha);
  p.ellipse(x, y, r * 2, r * 2);
  p.pop();
}

function drawProofChain(p, prog) {
  if (prog <= 0.002) return;
  const pts = CHAIN_DEGS.map((deg) => polar(CX, CY, CHAIN_R, deg));
  p.push();

  for (let i = 0; i < pts.length - 1; i++) {
    const seg = smoothstep(i * 0.13, i * 0.13 + 0.22, prog);
    const alpha = (i === pts.length - 2 ? 0.2 : 0.32) * seg;
    if (alpha <= 0.002) continue;
    strokeHex(p, C.graphite, alpha);
    p.strokeWeight(0.9);
    p.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }

  for (let i = 0; i < pts.length; i++) {
    const np = smoothstep(i * 0.13, i * 0.13 + 0.3, prog);
    if (np <= 0.002) continue;
    const pt = pts[i];
    const rr = CHAIN_NODE_R[i];
    if (i < pts.length - 1) {
      // 点亮的小墨点：暖赭微光 + 墨芯 + 一点纸色高光。
      p.noStroke();
      fillHex(p, C.rust, 0.055 * np);
      p.ellipse(pt.x, pt.y, (rr + 9) * 2, (rr + 9) * 2);
      fillHex(p, C.ink, 0.82 * np);
      p.ellipse(pt.x, pt.y, rr * 2, rr * 2);
      fillHex(p, C.paperLight, 0.55 * np);
      p.ellipse(
        pt.x - rr * 0.32,
        pt.y - rr * 0.32,
        rr * 0.55,
        rr * 0.55
      );
    } else {
      // 最后一个节点：虚线空心环，表示证明尚未闭合。
      const ctx = p.drawingContext;
      ctx.save();
      ctx.setLineDash([2.2, 3.0]);
      p.push();
      p.noFill();
      strokeHex(p, C.rust, 0.5 * np);
      p.strokeWeight(1.1);
      p.arc(pt.x, pt.y, rr * 2, rr * 2, 0, TAU, p.OPEN);
      p.pop();
      ctx.restore();
      p.noStroke();
      fillHex(p, C.rust, 0.28 * np);
      p.ellipse(pt.x, pt.y, 2.4, 2.4);
    }
  }
  p.pop();
}

function drawSpiral(p, t) {
  const env =
    smoothstep(2.05, 2.3, t) * (1 - smoothstep(2.56, 2.78, t));
  if (env <= 0.002) return;
  const cx = 612;
  const cy = 566;
  const spin = (t - 2.05) * 10;
  const collapse = 1 - 0.35 * smoothstep(2.56, 2.78, t);
  p.push();
  p.noFill();
  for (let k = 0; k < 3; k++) {
    strokeHex(p, C.graphite, (0.22 + k * 0.02) * env);
    p.strokeWeight(1.0 + k * 0.1);
    p.beginShape();
    for (let q = 0; q <= 64; q++) {
      const u = q / 64;
      const ang = u * TAU * 3.4 + k * 2.1 + spin;
      const rr =
        (2.5 + u * 21 + k * 0.7 + Math.sin(u * 11 + k * 1.7) * 1.2) *
        collapse;
      p.vertex(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    p.endShape();
  }
  p.pop();
}

function drawConstruction(p, t) {
  // 2D 假透视：把构造面纵向压到 0.86，并垫一层偏移阴影，
  // 不切 WEBGL，保留现有 2D 管线。
  p.push();
  p.translate(0, 500);
  p.scale(1, 0.86);
  p.translate(0, -500);
  p.noStroke();
  fillHex(p, C.ink, 0.045);
  p.ellipse(CX + 16, CY + 24, R * 2.15, R * 1.8);

  const appear = smoothstep(0.0, 0.5, t);
  // 圆规走到圆边（≈2.5s）前后才把主线画完，20.0s 高光时正好闭圆。
  const circleP = smoothstep(0.9, 3.0, t);
  const triP = smoothstep(1.7, 2.9, t);
  const parP = smoothstep(2.2, 3.2, t);
  const auxP = smoothstep(2.1, 3.1, t);
  const dashP = smoothstep(2.4, 3.4, t);
  const chainP = smoothstep(2.7, 3.6, t);

  const tri = [
    polar(CX, CY, R, -90),
    polar(CX, CY, R, 30),
    polar(CX, CY, R, 150)
  ];

  // 大圆：极淡的完整底稿 + 顺时针长出的主线。
  drawArc(
    p,
    CX,
    CY,
    R,
    0,
    TAU,
    C.graphiteSoft,
    0.13 * appear * (1 - 0.35 * circleP),
    0.9
  );
  if (circleP > 0.002) {
    drawArc(
      p,
      CX,
      CY,
      R,
      -HALF_PI,
      -HALF_PI + TAU * circleP,
      C.graphite,
      0.82,
      2.5
    );
  }

  // 内接三角形：淡淡底稿，再压深。
  drawTriangleLines(p, tri, 0.09 * appear, 1.0);
  drawTriangleLines(p, tri, 0.8 * triP, 2.4);

  // 两条平行弦。
  if (parP > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.graphite, 0.1 * appear);
    p.strokeWeight(0.9);
    p.line(505, 316, 880, 316);
    p.line(505, 348, 880, 348);
    strokeHex(p, C.graphite, 0.58 * parP);
    p.strokeWeight(1.6);
    p.line(505, 316, 880, 316);
    p.line(505, 348, 880, 348);
    strokeHex(p, C.graphite, 0.34 * parP);
    p.strokeWeight(0.9);
    for (const yy of [316, 348]) {
      p.line(515, yy - 4, 515, yy + 4);
      p.line(870, yy - 4, 870, yy + 4);
    }
    p.pop();
  }

  // 圆心、半径辅助线与交点。
  if (auxP > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.graphite, 0.25 * auxP);
    p.strokeWeight(0.8);
    for (const v of tri) p.line(CX, CY, v.x, v.y);
    strokeHex(p, C.graphite, 0.34 * auxP);
    p.strokeWeight(0.9);
    p.line(CX - 9, CY, CX + 9, CY);
    p.line(CX, CY - 9, CX, CY + 9);
    p.pop();
    drawDot(p, CX, CY, 2.0, C.ink, 0.5 * auxP);
  }

  if (auxP > 0.002) {
    for (const v of tri) {
      drawDot(p, v.x, v.y, 2.2, C.ink, 0.5 * auxP);
    }
    for (const yy of [316, 348]) {
      const dy = yy - CY;
      const half = Math.sqrt(Math.max(0, R * R - dy * dy));
      drawDot(p, CX - half, yy, 1.6, C.graphite, 0.42 * auxP);
      drawDot(p, CX + half, yy, 1.6, C.graphite, 0.42 * auxP);
    }
  }

  // 3–4 段虚线构造弧：冷灰蓝只出现在这里。
  if (dashP > 0.002) {
    drawDashedArc(p, CX, CY, R + 8, 20, 62, 0.3 * dashP, [3, 5]);
    drawDashedArc(p, CX, CY, R - 14, 145, 188, 0.34 * dashP, [2.5, 4.5]);
    drawDashedArc(p, CX, CY, 66, -55, 12, 0.28 * dashP, [2, 4]);
    drawDashedArc(p, CX, CY, 118, -62, -34, 0.36 * dashP, [3, 5]);
  }

  drawProofChain(p, chainP);
  drawSpiral(p, t);
  p.pop();
}

// 圆规进场时留下的两段“第一弧”，中心在铜尺上，纯构造痕迹。
function drawTrialArcs(p, t) {
  const arcs = [
    { cx: 152, cy: 620, r: 64, start: 0.5, end: 1.15 },
    { cx: 300, cy: 620, r: 78, start: 1.25, end: 1.95 }
  ];
  p.push();
  for (const arc of arcs) {
    const pr = smoothstep(arc.start, arc.end, t);
    if (pr <= 0.002) continue;
    const a0 = (200 * Math.PI) / 180;
    const a1 = a0 + ((140 * Math.PI) / 180) * pr;
    p.noFill();
    strokeHex(p, C.graphite, 0.3);
    p.strokeWeight(1.2);
    p.arc(arc.cx, arc.cy, arc.r * 2, arc.r * 2, a0, a1, p.OPEN);
    p.noStroke();
    fillHex(p, C.ink, 0.35);
    p.ellipse(arc.cx, arc.cy, 3.2, 3.2);
  }
  p.pop();
}

// ---------------------------------------------------------------- 铜尺

function drawRuler(p) {
  p.push();
  p.noStroke();

  // 尺下阴影，让铜尺成为路面的硬边。
  fillHex(p, '#4a3a24', 0.12);
  p.rect(0, 638, 1000, 5);

  // 黄铜：底色 + 暗边 + 1px 高光偏移。
  fillHex(p, C.brass, 1);
  p.rect(0, 622, 1000, 16);
  fillHex(p, C.brassLight, 0.4);
  p.rect(0, 623, 1000, 5);
  fillHex(p, C.brassDark, 0.28);
  p.rect(0, 634, 1000, 2.5);
  fillHex(p, C.brassDark, 0.95);
  p.rect(0, 637, 1000, 1.2);

  // 氧化斑与拉丝。
  for (let i = 0; i < 16; i++) {
    const x = hash2(i, 71, 53) * 1000;
    const y = 624 + hash2(i, 72, 53) * 11;
    const w = 18 + hash2(i, 73, 53) * 70;
    fillHex(
      p,
      i % 2 ? C.brassDark : C.brassHi,
      0.055 + hash2(i, 74, 53) * 0.05
    );
    p.rect(x, y, w, 0.8);
  }

  // 1px 高光偏移 + 上沿暗线。
  strokeHex(p, C.brassHi, 0.85);
  p.strokeWeight(1);
  p.line(0, 623.5, 1000, 623.5);
  strokeHex(p, C.brassDark, 0.65);
  p.strokeWeight(1);
  p.line(0, 622, 1000, 622);

  // 刻度。
  p.strokeWeight(0.8);
  for (let x = 10; x <= 990; x += 20) {
    const major = x % 100 === 0;
    strokeHex(p, C.brassDark, major ? 0.68 : 0.4);
    p.line(x, 623, x, 623 + (major ? 7 : 4));
    if (major) {
      p.line(x, 632, x, 636);
    }
  }
  p.pop();
}

// ---------------------------------------------------------------- 青铜圆规

function drawLeg(p, H, F, bend, fixed) {
  const dx = F.x - H.x;
  const dy = F.y - H.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const kx = H.x + ux * len * 0.58 + nx * bend;
  const ky = H.y + uy * len * 0.58 + ny * bend;

  p.push();
  fillHex(p, '#96652f', 1);
  strokeHex(p, C.brassDark, 0.9);
  p.strokeWeight(1.2);
  p.beginShape();
  p.vertex(H.x + nx * 6, H.y + ny * 6);
  p.vertex(kx + nx * 4, ky + ny * 4);
  p.vertex(F.x + nx * 1.2, F.y + ny * 1.2);
  p.vertex(F.x - nx * 1.2, F.y - ny * 1.2);
  p.vertex(kx - nx * 4, ky - ny * 4);
  p.vertex(H.x - nx * 6, H.y - ny * 6);
  p.endShape(p.CLOSE);

  // 受光边 / 暗边。
  p.noFill();
  strokeHex(p, C.brassHi, 0.62);
  p.strokeWeight(1.1);
  p.line(H.x + nx * 3, H.y + ny * 3, kx + nx * 2, ky + ny * 2);
  p.line(kx + nx * 2, ky + ny * 2, F.x + nx * 0.5, F.y + ny * 0.5);
  strokeHex(p, C.brassDark, 0.45);
  p.strokeWeight(1.0);
  p.line(H.x - nx * 3, H.y - ny * 3, kx - nx * 2, ky - ny * 2);
  p.line(kx - nx * 2, ky - ny * 2, F.x - nx * 0.5, F.y - ny * 0.5);

  // 中部束环。
  const cx1 = H.x + ux * len * 0.24;
  const cy1 = H.y + uy * len * 0.24;
  strokeHex(p, C.brassLight, 0.55);
  p.strokeWeight(1.6);
  p.line(cx1 + nx * 4, cy1 + ny * 4, cx1 - nx * 4, cy1 - ny * 4);

  if (fixed) {
    // 定脚钢针。
    strokeHex(p, '#6f6a5e', 0.9);
    p.strokeWeight(1.3);
    p.line(F.x, F.y, F.x + ux * 7, F.y + uy * 7);
    p.noStroke();
    fillHex(p, C.ink, 0.7);
    p.ellipse(F.x + ux * 7, F.y + uy * 7, 1.6, 1.6);
  } else {
    // 画笔脚：石墨芯。
    strokeHex(p, C.ink, 0.9);
    p.strokeWeight(2.0);
    p.line(F.x, F.y, F.x + ux * 4, F.y + uy * 4);
    p.noStroke();
    fillHex(p, C.graphiteSoft, 0.8);
    p.ellipse(F.x + ux * 4, F.y + uy * 4, 2.4, 2.4);
  }
  p.pop();
}

function drawHinge(p, hx, hy) {
  p.push();

  // 顶部提钮。
  strokeHex(p, C.brassDark, 0.9);
  p.strokeWeight(3.2);
  p.line(hx, hy - 11, hx, hy - 21);
  p.noStroke();
  fillHex(p, C.brass, 1);
  p.ellipse(hx, hy - 24, 8, 8);
  strokeHex(p, C.brassDark, 0.8);
  p.strokeWeight(1);
  p.ellipse(hx, hy - 24, 8, 8);

  // 铰链铜盘。
  p.noStroke();
  fillHex(p, C.brassDark, 1);
  p.ellipse(hx, hy, 30, 30);
  fillHex(p, C.brass, 1);
  p.ellipse(hx, hy, 26, 26);
  fillHex(p, C.brassLight, 0.45);
  p.ellipse(hx - 1.5, hy - 2, 20, 20);
  fillHex(p, C.brass, 1);
  p.ellipse(hx, hy, 15, 15);
  p.noFill();
  strokeHex(p, C.brassDark, 0.7);
  p.strokeWeight(1);
  p.ellipse(hx, hy, 18, 18);

  // 同一颗暖赭火种留在铰链里。
  p.noStroke();
  fillHex(p, C.ember, 0.1);
  p.ellipse(hx, hy - 1, 26, 30);
  fillHex(p, C.ember, 0.22);
  p.ellipse(hx, hy - 1, 14, 16);
  fillHex(p, C.ember, 1);
  p.ellipse(hx, hy, 7, 7);
  fillHex(p, C.emberHot, 1);
  p.ellipse(hx - 1, hy - 1, 4.5, 4.5);
  fillHex(p, '#fff0c8', 0.9);
  p.ellipse(hx - 1.5, hy - 1.6, 2, 2);
  p.pop();
}

function drawCompass(p, localT, x) {
  const t = clamp(localT, 0, 6);
  const poseT = Math.min(t, 3.0);
  const walk = 1 - smoothstep(1.4, 2.55, poseT);
  const exit = smoothstep(4.05, 5.2, t);
  const phase = poseT * Math.PI * 2 * 1.28;

  const hx = x + 5;
  const hy = 510 + Math.sin(phase) * 1.4 * walk;

  let fixedAngle = 1.84 + Math.sin(phase + Math.PI) * 0.03 * walk;
  let movingAngle = 1.1 + Math.sin(phase + 0.4) * 0.09 * walk;

  // 定脚—旋臂—换点—再画：2.55s 后画脚抬向圆边的小方块。
  const swing = smoothstep(2.55, 2.98, poseT);
  movingAngle = movingAngle * (1 - swing) + 0.361 * swing;
  if (poseT >= 2.86 && poseT <= 3.0) {
    movingAngle += 0.018 * Math.sin((poseT - 2.86) * 70);
  }

  // 离场：两腿合拢，沿铜尺滑出。
  fixedAngle = fixedAngle * (1 - exit) + 1.74 * exit;
  movingAngle = movingAngle * (1 - exit) + 1.4 * exit;

  const len = 116;
  const H = { x: hx, y: hy };
  const footF = {
    x: hx + Math.cos(fixedAngle) * len,
    y: hy + Math.sin(fixedAngle) * len
  };
  const footM = {
    x: hx + Math.cos(movingAngle) * len,
    y: hy + Math.sin(movingAngle) * len
  };

  // 换点时抬脚：脚离开纸面 10–14，再落回；让“换点”读成动作。
  const lift =
    12 * smoothstep(1.62, 1.8, poseT) * (1 - smoothstep(1.98, 2.14, poseT)) +
    9 * smoothstep(2.06, 2.22, poseT) * (1 - smoothstep(2.38, 2.56, poseT));
  footM.y -= lift;

  // 接触阴影。
  p.push();
  p.noStroke();
  fillHex(p, C.ink, 0.13);
  p.ellipse(footF.x - 4, 626, 34, 7);
  if (footM.y > 600) {
    p.ellipse(footM.x - 2, 626, 28, 6);
  }
  fillHex(p, C.ink, 0.05);
  p.ellipse(hx - 4, 620, 82, 7);
  p.pop();

  drawLeg(p, H, footF, 2.0, true);
  drawLeg(p, H, footM, -2.5, false);

  // 笔尖落点：脚放下时在纸面留一个很小的石墨接触点。
  if (t < 3.0 && lift < 0.6) {
    p.push();
    p.noStroke();
    fillHex(p, C.ink, 0.34);
    p.ellipse(footM.x, footM.y + 1.2, 3.2, 2.2);
    p.pop();
  }

  // 闭圆时的一下轻敲：两圈很淡的石墨涟漪。
  const tapRing = smoothstep(2.86, 2.96, t) * (1 - smoothstep(3.0, 3.35, t));
  if (tapRing > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.graphite, 0.22 * tapRing);
    p.strokeWeight(0.9);
    p.arc(footM.x, footM.y, 26, 19, -0.25, Math.PI * 1.22, p.OPEN);
    strokeHex(p, C.graphite, 0.13 * tapRing);
    p.strokeWeight(0.8);
    p.arc(footM.x, footM.y, 40, 29, -0.2, Math.PI * 1.28, p.OPEN);
    p.pop();
  }

  drawHinge(p, hx, hy);
}

// ---------------------------------------------------------------- 标题

// 标题卡只属于当前版块，避免镜头提前看到下一段时把下一段标题带进来。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

function drawTitle(p, t) {
  const alpha = 1 - smoothstep(2.2, 2.8, t);
  if (alpha <= 0.002) return;

  // 年代小字后面垫一条很淡的浅纸色窄带，文字位置/字号不动。
  p.push();
  p.noStroke();
  fillHex(p, C.paperLight, 0.55 * alpha);
  p.rect(232, 394, 136, 16, 3);
  fillHex(p, C.rust, 0.05 * alpha);
  p.rect(232, 409, 136, 1);
  p.pop();

  drawTitleCard(p, {
    ...META,
    number: META.id,
    x: 300,
    y: 362,
    alpha
  });
}

// ---------------------------------------------------------------- 场景导出

function drawScene(p, t, blockIndex, globalT) {
  drawPaper(p);
  drawGuideGrid(p, t);
  drawCracks(p);
  drawEdgeWear(p);
  drawTrialArcs(p, t);
  drawConstruction(p, t);
  if (blockIndex === currentBlockAt(globalT, blockIndex)) drawTitle(p, t);
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    drawScene(p, t, state.blockIndex, state.globalT);
  },

  drawRoad(p, state) {
    const t = clamp(state.localT || 0, 0, 6);

    // 全屏纸面场景：默认路带不能只补一条硬边，否则纸面低频暗斑会在
    // 补丁边缘切出一条亮带。这里把整块场景按同一套纸纹重绘一遍，
    // 再画铜尺；默认路带自然被完全盖住。
    drawScene(p, t, state.blockIndex, state.globalT);
    drawRuler(p);
  },

  drawActor(p, state) {
    // drawActor 直接吃世界坐标，主调度没有 translate 到版块起点；
    // 不能把 state.x 再减版块偏移，否则主角会被画到镜头外。
    // 构造面压扁成纵深，圆规是立在纸前的实体工具，不再跟着压扁。
    drawCompass(p, state.localT, state.x);
  }
};
