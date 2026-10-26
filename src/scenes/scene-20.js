import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 20 未来：尚未命名的东西：暖白留白场 + 一条几乎看不见的来路 + 未收拢的微光。
// 静态重点：localT≈1.5（标题/软边深色衬底、留白、来路、暖光灯显影）
// 与 localT≈3.0（20 个余烬从远到近点亮、光弧向左回望、未命名形状显影、约 1s 定格）。
// 第 20 版块是最后一段：镜头会越过本段 1000 宽，所以场和路向右补到 x≈1800；
// 左侧仍从 x=0 开始，把 19→20 转场留给锁定的第 19 版块。
const TAU = Math.PI * 2;
const ROAD_Y = 500;
const LOOK_AHEAD = 220;
const FIELD_RIGHT = 1800;

const META = {
  id: 20,
  cn: '未来：尚未命名的东西',
  en: 'The Unnamed Future',
  era: '2026+',
  group: 'data'
};

const C = {
  bg: '#f4f0e6',
  bgLight: '#fbf8ef',
  cream: '#fff7e4',
  warmGlow: '#fffaf0',
  edgeCool: '#7e929b',
  edgeWarm: '#9a8468',
  grainWarm: '#a99376',
  grainCool: '#8b9a9c',
  line: '#b39a7a',
  lineDeep: '#9b7c58',
  inkWash: '#0d1526',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa',
  emberDeep: '#8f4a1f',
  cyanArc: '#6f9ba4',
  cyanSoft: '#a8c8cd',
  violetGray: '#8e8da0',
  brassMuted: '#ac8c5e'
};

// 固定种子预生成微尘 / 纸纤维，同 t 重渲一致。
const DUST = (() => {
  const rng = mulberry32(0x20d057);
  const list = [];
  for (let i = 0; i < 112; i++) {
    list.push({
      x: 6 + rng() * 1770,
      y: 214 + rng() * 574,
      r: 0.6 + rng() * 1.5,
      a: 0.014 + rng() * 0.038,
      warm: rng() > 0.62,
      phase: rng() * TAU,
      sway: 0.6 + rng() * 2.2
    });
  }
  return list;
})();

const FIBERS = (() => {
  const rng = mulberry32(0x20f1be);
  const list = [];
  for (let i = 0; i < 16; i++) {
    const x = 18 + rng() * 1720;
    const y = 236 + rng() * 528;
    const len = 30 + rng() * 150;
    list.push({
      x,
      y,
      x2: x + len,
      y2: y + (rng() - 0.5) * 1.8,
      a: 0.012 + rng() * 0.024,
      warm: rng() > 0.5
    });
  }
  return list;
})();

const EMBERS = (() => {
  const rng = mulberry32(0x20e3be);
  const list = [];
  for (let i = 0; i < 20; i++) {
    list.push({
      u: (i + 0.5) / 20 + (rng() - 0.5) * 0.008,
      dy: (rng() - 0.5) * 2.4,
      g: 0.55 + rng() * 0.9
    });
  }
  return list;
})();

// 未命名形状：四段开口弧，故意不闭合、不同心。
const SHAPE_ARCS = [
  {
    dx: 2,
    dy: 0,
    rx: 96,
    ry: 68,
    rot: -0.26,
    a0: -2.7,
    span: 4.5,
    color: C.cyanArc,
    alpha: 0.3,
    weight: 1.25,
    phase: 0.3
  },
  {
    dx: 8,
    dy: 3,
    rx: 68,
    ry: 47,
    rot: 0.58,
    a0: 1.12,
    span: 4.1,
    color: C.brassMuted,
    alpha: 0.24,
    weight: 1.0,
    phase: 1.7
  },
  {
    dx: -7,
    dy: 1,
    rx: 45,
    ry: 31,
    rot: 1.86,
    a0: -0.62,
    span: 3.7,
    color: C.violetGray,
    alpha: 0.22,
    weight: 0.9,
    phase: 3.1
  },
  {
    dx: 3,
    dy: -3,
    rx: 112,
    ry: 82,
    rot: 0.12,
    a0: 3.42,
    span: 2.05,
    color: C.cyanSoft,
    alpha: 0.16,
    weight: 0.8,
    phase: 4.4
  }
];

const SHAPE_GLINTS = (() => {
  const rng = mulberry32(0x20a11e);
  const list = [];
  for (let i = 0; i < 14; i++) {
    list.push({
      a: rng() * TAU,
      rx: 30 + rng() * 100,
      ry: 22 + rng() * 64,
      size: 0.8 + rng() * 2.1,
      warm: rng() > 0.46,
      phase: rng() * TAU,
      delay: rng() * 0.55
    });
  }
  return list;
})();

// 主角外围的三道细光弧；回望时向左展开。
const ACTOR_ARCS = [
  {
    rx: 22,
    ry: 15,
    rot: -0.42,
    a0: -2.5,
    span: 4.2,
    color: C.emberHot,
    alpha: 0.55,
    weight: 0.9,
    grow: 0.55,
    shift: 7,
    phase: 0.2
  },
  {
    rx: 29,
    ry: 19,
    rot: 0.68,
    a0: 0.55,
    span: 3.8,
    color: C.cyanArc,
    alpha: 0.46,
    weight: 0.8,
    grow: 0.8,
    shift: 11,
    phase: 1.9
  },
  {
    rx: 37,
    ry: 23,
    rot: -0.15,
    a0: 2.1,
    span: 3.5,
    color: C.ember,
    alpha: 0.33,
    weight: 0.85,
    grow: 1.0,
    shift: 15,
    phase: 3.4
  }
];

function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

// 镜头中心在第 20 版块局部坐标里的 x；与 main/camera 的
// protagonistWorldX(t) + LOOK_AHEAD 对齐，但只读不改。
function cameraLocalX(t) {
  return LOOK_AHEAD + (clamp(t, 0, 6) / 6) * 1000;
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

// 渐变矩形要盖住整个渐变圆，避免裁出硬边。
function radialWash(p, cx, cy, r0, r1, stops, x, y, w, h) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function trailY(u) {
  return ROAD_Y + Math.sin(u * 5.1 + 0.8) * 0.55;
}

// 只用采样点折线画开口弧，避开 p5 2.x 对 bezier 闭合形状的空内部点问题。
function drawOpenArc(
  p,
  cx,
  cy,
  rx,
  ry,
  rot,
  a0,
  sweep,
  color,
  alpha,
  weight,
  segments = 32,
  wobble = 0
) {
  if (alpha <= 0.002 || sweep <= 0.002) return;
  p.push();
  p.noFill();
  p.strokeCap(p.ROUND);
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  p.beginShape();
  const n = Math.max(2, Math.ceil(segments));
  for (let i = 0; i <= n; i++) {
    const a = a0 + sweep * (i / n);
    const rr = 1 + wobble * Math.sin(a * 3.1 + 1.7);
    const px = Math.cos(a) * rx * rr;
    const py = Math.sin(a) * ry * rr;
    p.vertex(
      cx + px * Math.cos(rot) - py * Math.sin(rot),
      cy + px * Math.sin(rot) + py * Math.cos(rot)
    );
  }
  p.endShape();
  p.pop();
}

// 进场微光：留白场从一团暖白微光里显影；只铺在场景底材上，标题/主角在其后绘制。
function drawEntryBloom(p, cx, t, y0, y1) {
  const bloom = 1 - smoothstep(0, 1.1, t);
  if (bloom <= 0.002) return;
  radialWash(
    p,
    cx,
    478,
    24,
    540,
    [
      [0, `rgba(255,251,240,${0.5 * bloom})`],
      [0.55, `rgba(253,248,236,${0.2 * bloom})`],
      [1, 'rgba(253,248,236,0)']
    ],
    0,
    y0,
    FIELD_RIGHT,
    y1 - y0
  );
}

// 场的中段渐变。draw 与 drawRoad 都调用同一套，保证路带不出现色差。
function paintFieldMid(p, cx, t, y0, y1) {
  radialWash(
    p,
    cx,
    468,
    60,
    620,
    [
      [0, 'rgba(255,250,238,0.26)'],
      [0.52, 'rgba(253,248,236,0.1)'],
      [1, 'rgba(252,247,235,0)']
    ],
    0,
    y0,
    FIELD_RIGHT,
    y1 - y0
  );
  radialWash(
    p,
    cx,
    500,
    220,
    640,
    [
      [0, 'rgba(126,140,146,0)'],
      [0.58, 'rgba(126,140,146,0.008)'],
      [0.84, 'rgba(132,144,148,0.05)'],
      [1, 'rgba(120,132,138,0.14)']
    ],
    0,
    y0,
    FIELD_RIGHT,
    y1 - y0
  );
  drawEntryBloom(p, cx, t, y0, y1);
}

// 19→20：第 20 版块只在接缝左侧补一层暖白羽化，
// 让第 19 版的城市线稿像被光吃掉一样散进留白；不改第 19 版文件。
function drawLeftDissolve(p, t, y0, y1, withMotes) {
  const ctx = p.drawingContext;
  ctx.save();
  const g = ctx.createLinearGradient(-340, 0, 0, 0);
  g.addColorStop(0, 'rgba(244,240,230,0)');
  g.addColorStop(0.55, 'rgba(244,240,230,0.55)');
  g.addColorStop(1, 'rgba(244,240,230,1)');
  ctx.fillStyle = g;
  ctx.fillRect(-340, y0, 340, y1 - y0);
  ctx.restore();

  if (!withMotes) return;
  const fade = 1 - smoothstep(0.5, 1.8, t);
  if (fade <= 0.003) return;
  p.push();
  p.noStroke();
  for (let i = 0; i < 14; i++) {
    const x = -330 + hash2(i, 801) * 310;
    const y = 250 + hash2(i, 802) * 460;
    const a = (0.12 + 0.2 * hash2(i, 803)) * fade;
    fillHex(p, i % 3 === 0 ? C.emberHot : C.ember, a);
    p.ellipse(x, y, 1.4 + hash2(i, 804) * 2.6, 1.2 + hash2(i, 805) * 1.6);
  }
  p.pop();
}

function drawField(p, t) {
  const cx = cameraLocalX(t);
  p.push();
  p.noStroke();
  fillHex(p, C.bg, 1);
  p.rect(0, 0, FIELD_RIGHT, 1000);

  paintFieldMid(p, cx, t, 0, 1000);

  // 上冷下暖的极淡边缘灰。
  linearWash(
    p,
    0,
    190,
    0,
    350,
    [
      [0, 'rgba(108,126,134,0.11)'],
      [0.5, 'rgba(120,136,142,0.04)'],
      [1, 'rgba(126,140,146,0)']
    ],
    0,
    185,
    FIELD_RIGHT,
    170
  );
  linearWash(
    p,
    0,
    640,
    0,
    800,
    [
      [0, 'rgba(146,128,105,0)'],
      [0.5, 'rgba(148,130,106,0.04)'],
      [1, 'rgba(142,122,98,0.13)']
    ],
    0,
    640,
    FIELD_RIGHT,
    170
  );

  // 纸纤维与微尘：低速呼吸，不铺满、不形成网格。
  p.push();
  p.strokeCap(p.ROUND);
  for (const f of FIBERS) {
    strokeHex(p, f.warm ? C.grainWarm : C.grainCool, f.a);
    p.strokeWeight(0.7);
    p.line(f.x, f.y, f.x2, f.y2);
  }
  p.pop();
  p.noStroke();

  for (const d of DUST) {
    const sway = Math.sin(t * 0.24 + d.phase) * d.sway;
    const breathe = 0.72 + 0.28 * Math.sin(t * 0.8 + d.phase);
    fillHex(p, d.warm ? C.grainWarm : C.grainCool, d.a * breathe);
    p.ellipse(d.x + sway, d.y, d.r, d.r);
  }
  p.pop();
}

// 火种的外圈：把原来飘到右侧的“未命名”弧光收回来，
// 以智能体为圆心重新排成一组不同心的开口环。越看越像同一个东西。
function drawCorona(p, t, reveal, later, look) {
  if (reveal <= 0.003) return;
  const grow = 0.5 + 0.5 * smoothstep(1.0, 4.7, t);
  const breath = 0.5 + 0.5 * Math.sin(t * 0.7 + 1.2);

  p.push();
  p.translate(-4 * look, 0);
  p.noStroke();

  // 统一的外层暖光，先把各个开口环托在一起。
  radialWash(
    p,
    0,
    0,
    24,
    166,
    [
      [0, `rgba(255,250,238,${0.08 * reveal * later})`],
      [0.52, `rgba(253,248,236,${0.035 * reveal * later})`],
      [1, 'rgba(253,248,236,0)']
    ],
    -180,
    -180,
    360,
    360
  );

  for (let i = 0; i < SHAPE_ARCS.length; i++) {
    const a = SHAPE_ARCS[i];
    const sway = Math.sin(t * 0.3 + a.phase) * 1.2;
    const arcAlpha = a.alpha * reveal * later * (0.95 + 0.3 * breath) * 1.3;
    const rx = a.rx * (0.85 + 0.35 * grow) + sway;
    const ry = a.ry * (0.85 + 0.35 * grow);
    const rot = a.rot + Math.sin(t * 0.22 + a.phase) * 0.02 + t * 0.012 * (i % 2 ? 1 : -1);
    drawOpenArc(
      p,
      a.dx,
      a.dy,
      rx,
      ry,
      rot,
      a.a0,
      a.span * grow,
      a.color,
      arcAlpha,
      a.weight * 1.15,
      44,
      0.03
    );
    drawOpenArc(
      p,
      a.dx,
      a.dy,
      rx + 2.5,
      ry + 2.5,
      rot,
      a.a0,
      a.span * grow,
      a.color,
      arcAlpha * 0.24,
      a.weight + 1.8,
      44,
      0.03
    );
  }
  p.noStroke();

  for (const g of SHAPE_GLINTS) {
    const ga = smoothstep(0.8 + g.delay * 0.9, 1.6 + g.delay * 0.9, t);
    if (ga <= 0.003) continue;
    const ang = g.a + t * 0.03;
    const gx = Math.cos(ang) * g.rx * (0.9 + 0.2 * grow);
    const gy = Math.sin(ang) * g.ry * 0.72 * (0.9 + 0.2 * grow);
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.9 + g.phase);
    const a = (0.1 + 0.2 * pulse) * reveal * later * ga;
    const size = g.size * 1.35;
    fillHex(p, g.warm ? C.emberHot : C.cyanSoft, a);
    p.ellipse(gx, gy, size, size);
    if (g.size > 1.4) {
      fillHex(p, g.warm ? C.cream : C.bgLight, a * 0.3);
      p.ellipse(gx, gy, size * 4, size * 4);
    }
  }

  // 圆心一点没有指向性的暖白微光，和火种芯分开。
  fillHex(p, C.cream, 0.06 * reveal * later * (0.7 + 0.3 * breath));
  p.ellipse(10, -10, 12, 12);
  p.pop();
}

// 标题卡背后的软边深墨/深蓝灰晕染，盖住 x≈80–520 / y≈250–440。
// 压成椭圆，避免深色晕到画面顶边；渐变外圈透明，不是硬边 UI 卡片。
function drawTitleStain(p, alpha) {
  if (alpha <= 0.002) return;
  const ctx = p.drawingContext;
  ctx.save();
  ctx.translate(298, 347);
  ctx.scale(1.2, 0.55);
  const grad = ctx.createRadialGradient(0, 0, 18, 0, 0, 210);
  grad.addColorStop(0, `rgba(10,17,31,${0.9 * alpha})`);
  grad.addColorStop(0.45, `rgba(12,20,36,${0.87 * alpha})`);
  grad.addColorStop(0.7, `rgba(17,27,45,${0.65 * alpha})`);
  grad.addColorStop(0.88, `rgba(22,34,52,${0.28 * alpha})`);
  grad.addColorStop(1, 'rgba(24,36,54,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-230, -230, 460, 460);
  ctx.restore();
}

// data 组的年代小字是深色 soft，深色衬底上不可读；只在这一行后面垫一圈软光。
function drawEraGlow(p, alpha) {
  if (alpha <= 0.002) return;
  const ctx = p.drawingContext;
  ctx.save();
  ctx.translate(300, 402);
  ctx.scale(1, 0.22);
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 74);
  grad.addColorStop(0, `rgba(250,244,229,${0.9 * alpha})`);
  grad.addColorStop(0.6, `rgba(248,241,224,${0.72 * alpha})`);
  grad.addColorStop(1, 'rgba(248,241,224,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-74, -74, 148, 148);
  ctx.restore();
}

// ---------- 来路 / 20 个余烬 ----------

function drawTrailRoad(p, t) {
  const cx = cameraLocalX(t);
  p.push();
  p.noStroke();

  // 暖白覆盖默认路带 y≈470–530，并向右补到镜头会看到的范围。
  fillHex(p, C.bg, 1);
  p.rect(0, 462, FIELD_RIGHT, 76);
  paintFieldMid(p, cx, t, 462, 538);

  const start = cx - 505;
  const end = cx + 2;
  const span = end - start;
  const reveal = smoothstep(0.08, 1.05, t);
  const lineFade = 1 - 0.72 * smoothstep(4.2, 5.7, t);

  if (reveal > 0.002 && lineFade > 0.002) {
    p.noFill();
    p.strokeCap(p.ROUND);

    // 一层几乎看不见的暖灰光晕。
    strokeHex(p, C.line, 0.05 * reveal * lineFade);
    p.strokeWeight(5.5);
    p.beginShape();
    const n = Math.max(2, Math.ceil(56 * reveal));
    for (let k = 0; k <= n; k++) {
      const u = reveal * (k / n);
      p.vertex(start + span * u, trailY(u));
    }
    p.endShape();

    // 主线：远端极淡、近端略亮；每小段单独 alpha，避免整条线一样实。
    const segs = Math.max(2, Math.ceil(64 * reveal));
    for (let k = 0; k < segs; k++) {
      const u0 = reveal * (k / segs);
      const u1 = reveal * ((k + 1) / segs);
      const fadeU = smoothstep(0.05, 0.72, (u0 + u1) * 0.5);
      strokeHex(p, C.line, (0.08 + 0.24 * fadeU) * lineFade);
      p.strokeWeight(1.0);
      p.line(start + span * u0, trailY(u0), start + span * u1, trailY(u1));
    }

    // 线的上沿一点暖白高光。
    strokeHex(p, C.cream, 0.16 * reveal * lineFade);
    p.strokeWeight(0.55);
    p.beginShape();
    const n2 = Math.max(2, Math.ceil(44 * reveal));
    for (let k = 0; k <= n2; k++) {
      const u = reveal * (k / n2);
      p.vertex(start + span * u, trailY(u) - 0.55);
    }
    p.endShape();
    p.noStroke();
  }

  // 20 个刻度 / 余烬：第 1 小节很淡，第 2 小节从远到近依次点亮。
  const markFade = 1 - 0.82 * smoothstep(4.2, 5.65, t);
  const flickLock = 1 - smoothstep(2.88, 3.0, t);
  for (let i = 0; i < EMBERS.length; i++) {
    const e = EMBERS[i];
    const u = e.u;
    const reached = smoothstep(u - 0.02, u + 0.03, reveal);
    if (reached <= 0.002) continue;
    const x = start + span * u;
    const y = trailY(u) + e.dy;

    const markA = (0.1 + 0.16 * hash2(i, 4, 20)) * reached * markFade;
    fillHex(p, C.lineDeep, markA);
    p.rect(x - 1.15, y - 0.4, 2.3, 0.8);

    const litAt = 1.95 + i * 0.047;
    const lit = smoothstep(litAt, litAt + 0.14, t) * reached;
    const dimStart = 4.22 + (19 - i) * 0.055;
    const dim = 1 - smoothstep(dimStart, dimStart + 0.34, t);
    const flick = 1 + 0.09 * Math.sin(t * 7 + i * 1.7) * flickLock;
    const emberA = lit * dim * flick;
    if (emberA <= 0.004) continue;

    fillHex(p, C.ember, (0.05 + 0.04 * e.g) * emberA);
    p.ellipse(x, y, 9 + 5 * e.g, 9 + 5 * e.g);
    fillHex(p, C.ember, 0.55 * emberA);
    p.ellipse(x, y, 2.4 + e.g * 0.8, 2.4 + e.g * 0.8);
    fillHex(p, C.emberHot, 0.75 * emberA);
    p.ellipse(x - 0.1, y - 0.1, 1.6, 1.6);
    fillHex(p, C.emberCore, 0.8 * emberA);
    p.ellipse(x - 0.22, y - 0.26, 0.9, 0.9);
  }

  // 快速回放的扫光：从最远一枚掠到主角脚下，在定格前熄掉。
  const pulseA = smoothstep(1.95, 2.1, t) * (1 - smoothstep(2.86, 2.98, t));
  if (pulseA > 0.003) {
    const pu = smoothstep(1.95, 2.9, t);
    const px = start + span * pu;
    const py = trailY(pu) - 1.2;
    fillHex(p, C.emberHot, 0.18 * pulseA);
    p.ellipse(px, py, 14, 7);
    fillHex(p, C.emberCore, 0.8 * pulseA);
    p.ellipse(px, py, 2.1, 2.1);
    for (let k = 1; k <= 3; k++) {
      fillHex(p, C.ember, 0.16 * pulseA * (1 - k * 0.22));
      p.ellipse(px - k * 4.2, py + 0.2, 1.5, 1.2);
    }
  }

  // 场景和路都画完后，再压一层全高羽化，盖住第 19 版留下的深色路带。
  drawLeftDissolve(p, t, 0, 1000, true);

  p.pop();
}

// ---------- 主角：暖光灯 / 余烬 ----------

function drawEmberActor(p, state) {
  const t = clamp(state.localT || 0, 0, 6);
  const poseT = Math.min(t, 3);
  const appear = smoothstep(0.02, 0.85, t);
  if (appear <= 0.002) return;

  const look = smoothstep(1.95, 2.9, poseT);
  const quiverEnv = smoothstep(2.7, 2.8, t) * (1 - smoothstep(2.9, 2.97, t));
  const quiver = Math.sin(t * 55) * quiverEnv * 1.3;
  // 不再在 3–4s 把呼吸冻住：持续轻微上浮/横移，让镜头一直有跟随理由。
  const bob = Math.sin(t * 1.7) * 1.1;
  const breath = 0.5 + 0.5 * Math.sin(t * Math.PI + 0.6);
  const driftX = Math.sin(t * 0.55 + 0.2) * 6 + Math.sin(t * 1.35) * 2.2;
  const driftY = Math.sin(t * 1.1 + 1.4) * 2.2;
  const later = 1 - 0.06 * smoothstep(4.4, 5.8, t);
  const baseX = Number.isFinite(state.x) ? state.x : 19000;
  const ax = baseX + LOOK_AHEAD + quiver + driftX - 10 * look;
  const ay = 466 - bob - driftY;

  p.push();
  p.translate(ax, ay);
  p.noStroke();

  // 暖光晕：径向渐变，边缘透明，不做大半径 blur。
  radialWash(
    p,
    0,
    0,
    6,
    120,
    [
      [0, `rgba(217,122,53,${0.09 * appear * later})`],
      [0.5, `rgba(201,106,44,${0.045 * appear * later})`],
      [1, 'rgba(201,106,44,0)']
    ],
    -126,
    -126,
    252,
    252
  );
  radialWash(
    p,
    0,
    -1,
    2,
    46,
    [
      [0, `rgba(255,227,170,${(0.2 + 0.05 * breath) * appear * later})`],
      [0.55, `rgba(240,160,82,${0.08 * appear * later})`],
      [1, 'rgba(240,160,82,0)']
    ],
    -50,
    -50,
    100,
    100
  );

  // 细线在脚下的一点暖反光，不接触地面。
  const groundY = ROAD_Y - ay;
  fillHex(p, C.ember, 0.1 * appear * later);
  p.ellipse(0, groundY, 34 + 3 * breath, 4.2);
  fillHex(p, C.emberCore, 0.18 * appear * later);
  p.ellipse(0, groundY, 11, 1.4);

  // 2–3 道极细光弧：回望时向左展开。
  for (let i = 0; i < ACTOR_ARCS.length; i++) {
    const a = ACTOR_ARCS[i];
    const rx =
      a.rx + a.grow * look * 15 + Math.sin(t * 0.8 + a.phase) * 0.5 * (1 - look);
    const ry = a.ry + a.grow * look * 5;
    const rot =
      a.rot +
      look * (0.1 - i * 0.14) +
      quiverEnv * Math.sin(t * 55 + i) * 0.03;
    const ccx = -a.shift * look + Math.sin(t * 0.6 + a.phase) * 0.5 * (1 - look);
    const alpha = a.alpha * appear * later * (0.85 + 0.15 * breath);
    const sweep = a.span * (0.96 + 0.04 * look);
    drawOpenArc(
      p,
      ccx,
      0,
      rx,
      ry,
      rot,
      a.a0,
      sweep,
      a.color,
      alpha,
      a.weight,
      30,
      0.02
    );
    drawOpenArc(
      p,
      ccx,
      0,
      rx + 2.5,
      ry + 2.5,
      rot,
      a.a0,
      sweep,
      a.color,
      alpha * 0.22,
      a.weight + 1.6,
      30,
      0.02
    );
  }
  p.noStroke();

  // 外圈大弧：随标题淡出而展开，始终围着火种，不再飘到右侧。
  drawCorona(p, t, smoothstep(1.0, 2.8, t), later, look);

  // 中心同一颗暖赭火种 + 极小的火苗；没有机械外壳。
  fillHex(p, C.emberDeep, 0.2 * appear * later);
  p.ellipse(0, 0, 12.5, 14.5);
  fillHex(p, C.ember, 0.88 * appear * later);
  p.ellipse(0, 0, 9.4, 11);
  fillHex(p, C.emberHot, 0.95 * appear * later);
  p.ellipse(-0.55, -0.7, 6.4, 7.6);
  fillHex(p, C.emberCore, 0.98 * appear * later);
  p.ellipse(-1.0, -1.2, 3.4, 4.2);
  fillHex(p, '#fff8e2', 0.9 * appear * later);
  p.ellipse(-1.25, -1.5, 1.5, 1.9);

  fillHex(p, C.ember, 0.25 * appear * later);
  p.ellipse(-0.4, -7.2, 4.4, 9.5);
  fillHex(p, C.emberHot, 0.3 * appear * later);
  p.ellipse(-0.8, -8.8, 2.6, 7);
  fillHex(p, C.emberCore, 0.24 * appear * later);
  p.ellipse(-1.0, -10.2, 1.3, 4);

  p.pop();
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();
    drawField(p, t);

    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (showTitle && titleAlpha > 0.002) {
      drawTitleStain(p, titleAlpha);
      drawEraGlow(p, titleAlpha);
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
    drawTrailRoad(p, t);
    p.pop();
  },

  drawActor(p, state) {
    p.push();
    drawEmberActor(p, state);
    p.pop();
  }
};
