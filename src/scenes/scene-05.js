import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 05 机械计算：深木工作台 + 黄铜计算尺 + 算盘/齿轮 + 剪影手。
// 静态重点：localT≈1.0（标题/滑尺/齿轮）与 localT≈3.0（0 形算盘、竖大拇指、蒸汽）。
const TAU = Math.PI * 2;

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const C = {
  wood: '#2a211a',
  woodDeep: '#1d1611',
  woodLight: '#3c2b1f',
  grainDark: '#120c08',
  grainLight: '#6b4b30',
  brassDeep: '#4e3317',
  brassDark: '#6e4a22',
  brass: '#b8863c',
  brassLight: '#d8a75a',
  cream: '#f0debc',
  creamDim: '#cbb287',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe0a0',
  hand: '#16100b',
  handRim: '#3a2817',
  woodBead: '#4b311c',
  woodBeadDark: '#28190f',
  slot: '#170f09',
  oil: '#0d0805',
  steam: '#d8c7a6'
};

const META = {
  id: 5,
  cn: '机械计算',
  en: 'Mechanical Calculation',
  era: '约 1600 · 算盘与计算尺',
  group: 'mechanical'
};

// 264 条木纹：长而缓的二次曲线，亮/暗混合，全部由固定种子预生成。
const GRAIN = (() => {
  const rng = mulberry32(0x05a17e);
  const list = [];
  for (let i = 0; i < 264; i++) {
    const long = rng() > 0.08;
    const x0 = long ? -40 : 90 + rng() * 520;
    const x1 = long ? 1040 : x0 + 100 + rng() * 300;
    const y0 = 224 + rng() * 548;
    const cx = -220 + rng() * 1440;
    const amp = (rng() - 0.5) * 2 * (3 + rng() * 13);
    const alpha = 0.035 + rng() * 0.075;
    const weight = 0.7 + rng() * 1.1;
    list.push({ x0, x1, y0, cx, amp, alpha, weight, light: rng() > 0.72 });
  }
  return list;
})();

// 工作台上不进入 y=470..530 的宽色斑，drawRoad 补路面带时才好接。
const ZONES = [
  [760, 308, 560, 230, C.woodLight, 0.055],
  [252, 338, 380, 190, C.woodLight, 0.038],
  [322, 694, 640, 210, C.woodLight, 0.045],
  [880, 660, 420, 190, C.woodDeep, 0.05],
  [690, 740, 560, 170, C.woodDeep, 0.04]
];

const KNOTS = [
  [176, 716, 34, 15, 1],
  [742, 560, 26, 12, 2],
  [902, 708, 30, 13, 3],
  [396, 446, 21, 9, 4]
];

const AB = {
  x: 688,
  y: 236,
  w: 280,
  h: 178,
  rods: 6,
  rows: 3,
  beadW: 32,
  beadH: 21
};
AB.rodStart = AB.x + 26;
AB.rodEnd = AB.x + AB.w - 26;
AB.rodStep = (AB.rodEnd - AB.rodStart) / (AB.rods - 1);
AB.ringX = AB.x + AB.w * 0.5;
AB.ringY = AB.y + 88;
AB.ringRX = 96;
AB.ringRY = 64;

const RULE_Y = 606;
const RULE_H = 58;
const SCALE_X0 = 70;
const SCALE_SPAN = 860;

function grainY(g, x) {
  const q = (x - g.cx) / 520;
  return g.y0 + g.amp * (q * q - 0.22);
}

function drawGrain(p) {
  p.noFill();
  p.strokeCap(p.ROUND);
  for (const g of GRAIN) {
    strokeHex(p, g.light ? C.grainLight : C.grainDark, g.light ? g.alpha * 0.55 : g.alpha);
    p.strokeWeight(g.weight);
    p.beginShape();
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const x = g.x0 + (g.x1 - g.x0) * u;
      p.vertex(x, grainY(g, x));
    }
    p.endShape();
  }
}

function drawKnot(p, cx, cy, w, h, seed) {
  p.noFill();
  for (let k = 0; k < 4; k++) {
    strokeHex(p, k % 2 ? C.grainLight : C.grainDark, 0.07 + hash2(seed, k, 3) * 0.045);
    p.strokeWeight(0.9 + k * 0.18);
    p.ellipse(cx, cy, w + k * 9, h + k * 5);
  }
  p.noStroke();
  fillHex(p, C.grainDark, 0.16);
  p.ellipse(cx + 2, cy + 1, w * 0.22, h * 0.3);
}

function drawOilAndChips(p) {
  const stains = [
    [452, 724, 1.0, 5],
    [218, 574, 0.78, 8],
    [766, 704, 0.92, 2],
    [918, 562, 0.7, 11],
    [596, 760, 0.62, 14]
  ];
  for (const [x, y, scale, seed] of stains) {
    p.noStroke();
    for (let k = 0; k < 5; k++) {
      const ox = (hash2(seed, k, 21) - 0.5) * 54 * scale;
      const oy = (hash2(seed, k, 22) - 0.5) * 22 * scale;
      fillHex(p, C.oil, 0.045 + hash2(seed, k, 23) * 0.055);
      p.ellipse(x + ox, y + oy, (36 + hash2(seed, k, 24) * 58) * scale,
        (10 + hash2(seed, k, 25) * 20) * scale);
    }
    // 油膜的一点反光
    fillHex(p, C.brassLight, 0.022);
    p.ellipse(x - 8 * scale, y - 4 * scale, 44 * scale, 8 * scale);
  }

  // 金属屑：短亮线 + 小点
  p.strokeCap(p.ROUND);
  for (let i = 0; i < 30; i++) {
    const x = 60 + hash2(i, 31) * 860;
    const y = 538 + hash2(i, 32) * 222;
    const a = -0.7 + hash2(i, 33) * 1.4;
    const len = 2.5 + hash2(i, 34) * 6;
    strokeHex(p, i % 3 === 0 ? C.creamDim : C.brassLight, 0.22 + hash2(i, 35) * 0.3);
    p.strokeWeight(0.8);
    p.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
  }
  p.noStroke();
  for (let i = 0; i < 28; i++) {
    const x = 40 + hash2(i, 41) * 920;
    const y = 534 + hash2(i, 42) * 236;
    fillHex(p, i % 2 ? C.brass : C.grainLight, 0.18 + hash2(i, 43) * 0.3);
    p.ellipse(x, y, 1 + hash2(i, 44) * 2.2, 1 + hash2(i, 44) * 1.5);
  }
}

function drawWorkbench(p) {
  p.noStroke();
  fillHex(p, C.wood, 1);
  p.rect(0, 0, 1000, 1000);

  // 大块暖/暗色斑，先铺底再压木纹
  for (const [x, y, w, h, color, alpha] of ZONES) {
    fillHex(p, color, alpha);
    p.ellipse(x, y, w, h);
  }

  // 工作台前侧的暖反光，铜色但不抢尺面
  fillHex(p, C.brassDark, 0.055);
  p.rect(0, 566, 1000, 110);
  fillHex(p, C.brassLight, 0.025);
  p.rect(0, 596, 1000, 34);

  drawGrain(p);
  for (const [x, y, w, h, seed] of KNOTS) drawKnot(p, x, y, w, h, seed);

  // 两条长板缝，让台面有厚度
  p.strokeWeight(1.4);
  strokeHex(p, C.woodDeep, 0.42);
  p.line(0, 548, 1000, 548);
  p.line(0, 742, 1000, 742);
  p.strokeWeight(1);
  strokeHex(p, C.grainLight, 0.09);
  p.line(0, 549.5, 1000, 549.5);
  p.line(0, 743.5, 1000, 743.5);

  // 台面上的两颗固定螺栓
  drawBenchBolt(p, 58, 446);
  drawBenchBolt(p, 942, 446);

  drawOilAndChips(p);
}

function drawBenchBolt(p, x, y) {
  p.noStroke();
  fillHex(p, C.slot, 0.88);
  p.ellipse(x, y, 13, 13);
  fillHex(p, C.brassDark, 0.85);
  p.ellipse(x, y - 1, 10, 9);
  p.noFill();
  strokeHex(p, C.brassLight, 0.45);
  p.strokeWeight(1);
  p.arc(x, y - 1, 9, 8, Math.PI * 1.05, Math.PI * 1.62);
  strokeHex(p, C.slot, 0.8);
  p.strokeWeight(1.2);
  p.line(x - 3, y - 1, x + 3, y - 1);
}

function drawBenchShade(p) {
  // 只在画面上下压一点暗角，左右留给全片镜头暗角，避免版块缝出现竖条。
  const ctx = p.drawingContext;
  const grad = ctx.createLinearGradient(0, 150, 0, 850);
  grad.addColorStop(0, 'rgba(10,6,4,0.32)');
  grad.addColorStop(0.16, 'rgba(10,6,4,0)');
  grad.addColorStop(0.8, 'rgba(10,6,4,0)');
  grad.addColorStop(1, 'rgba(8,5,3,0.36)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
}

// ---------- 齿轮 ----------

function gearRingPath(p, r, teeth) {
  const step = TAU / teeth;
  const ri = r * 0.77;
  p.beginShape();
  for (let j = 0; j < teeth; j++) {
    const a = j * step;
    p.vertex(Math.cos(a - step * 0.3) * ri, Math.sin(a - step * 0.3) * ri);
    p.vertex(Math.cos(a - step * 0.17) * r, Math.sin(a - step * 0.17) * r);
    p.vertex(Math.cos(a + step * 0.17) * r, Math.sin(a + step * 0.17) * r);
    p.vertex(Math.cos(a + step * 0.3) * ri, Math.sin(a + step * 0.3) * ri);
  }
  p.endShape(p.CLOSE);
}

function drawGear(p, cx, cy, r, teeth, angle, alpha) {
  p.push();
  p.translate(cx, cy);
  p.rotate(angle);

  p.noStroke();
  // 落影
  fillHex(p, '#0b0705', 0.32 * alpha);
  p.ellipse(5, 6, r * 2.12, r * 2.12);

  // 底色 + 径向暗边 + 亮面
  fillHex(p, '#1a110a', 0.85 * alpha);
  gearRingPath(p, r + 2.2, teeth);
  fillHex(p, C.brassDark, alpha);
  gearRingPath(p, r, teeth);
  fillHex(p, C.brass, 0.96 * alpha);
  p.ellipse(-1, -1, r * 1.48, r * 1.48);
  fillHex(p, C.brassLight, 0.16 * alpha);
  p.ellipse(-r * 0.12, -r * 0.12, r * 1.05, r * 1.05);

  // 轮辐
  strokeHex(p, C.brassDark, 0.62 * alpha);
  p.strokeWeight(Math.max(1.1, r * 0.075));
  for (let k = 0; k < 5; k++) {
    const a = k * (TAU / 5) + 0.2;
    p.line(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3,
      Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
  }

  // 轴心
  p.noStroke();
  fillHex(p, C.brassDark, alpha);
  p.ellipse(0, 0, r * 0.44, r * 0.44);
  fillHex(p, C.slot, 0.95 * alpha);
  p.ellipse(0, 0, r * 0.26, r * 0.26);
  fillHex(p, C.brassLight, 0.55 * alpha);
  p.ellipse(-r * 0.03, -r * 0.04, r * 0.1, r * 0.1);

  // 1px 高光偏移
  p.noFill();
  strokeHex(p, C.brassLight, 0.55 * alpha);
  p.strokeWeight(1.2);
  p.arc(0, 0, r * 1.38, r * 1.38, Math.PI * 1.03, Math.PI * 1.55);
  strokeHex(p, C.brassDeep, 0.6 * alpha);
  p.strokeWeight(1.1);
  p.arc(0, 0, r * 1.42, r * 1.42, Math.PI * 0.04, Math.PI * 0.58);

  p.pop();
}

function drawGearTrain(p, t) {
  // 高光定格时齿轮停 1 秒；4s 后从冻结位置继续。
  const gearT = t < 3 ? t : t < 4 ? 3 : t - 1;
  drawGear(p, 930, 418, 38, 12, 1.3 - 0.22 * gearT, 0.9);
  drawGear(p, 500, 280, 30, 12, 0.602 - 0.36 * gearT, 0.94);
  drawGear(p, 548, 348, 60, 18, 0.5 + 0.18 * gearT, 0.96);
}

function drawGearSteam(p, t) {
  const hold = Math.min(t, 3);
  const fade = 1 - smoothstep(4.0, 4.9, t);
  const puffs = [
    [505, 246, 0],
    [538, 230, 1],
    [574, 240, 2],
    [613, 227, 3],
    [665, 232, 4],
    [902, 384, 5]
  ];
  p.noStroke();
  for (const [x, y, i] of puffs) {
    const birth = 2.5 + hash2(i, 61) * 0.34;
    const age = hold - birth;
    if (age <= 0) continue;
    const u = clamp(age / 0.92, 0, 1);
    const lift = u * (26 + hash2(i, 62) * 18);
    const px = x + Math.sin(u * 2.3 + i) * 7;
    const py = y - lift;
    const rad = 9 + u * 17;
    fillHex(p, C.steam, (0.1 * (1 - u * 0.55)) * fade);
    p.ellipse(px, py, rad * 2.3, rad * 1.45);
    fillHex(p, C.creamDim, (0.04 * (1 - u)) * fade);
    p.ellipse(px - rad * 0.35, py - 2, rad * 1.1, rad * 0.7);
  }
  // 很淡的油雾
  fillHex(p, C.creamDim, 0.025 * fade);
  p.ellipse(600, 300, 250, 34);
}

// ---------- 算盘 ----------

function rodX(i) {
  return AB.rodStart + i * AB.rodStep;
}

function beadRingTarget(i) {
  const theta = -Math.PI / 2 + i * (TAU / AB.rods / AB.rows);
  const x = AB.ringX + Math.cos(theta) * AB.ringRX;
  const y = AB.ringY + Math.sin(theta) * AB.ringRY;
  const rot = Math.atan2(AB.ringRY * Math.cos(theta), -AB.ringRX * Math.sin(theta));
  return { x, y, rot, theta };
}

function drawAbacusBead(p, x, y, rot, form) {
  p.push();
  p.translate(x, y);
  p.rotate(rot);

  p.noStroke();
  fillHex(p, C.slot, 0.95);
  p.ellipse(0, 0, AB.beadW + 3, AB.beadH + 3);
  fillHex(p, C.woodBead, 1);
  p.ellipse(0, 0, AB.beadW, AB.beadH);
  fillHex(p, C.woodBeadDark, 0.55);
  p.ellipse(0, AB.beadH * 0.18, AB.beadW * 0.82, AB.beadH * 0.52);

  // 黄铜包边
  p.noFill();
  strokeHex(p, C.brassDark, 0.9);
  p.strokeWeight(1.1);
  p.ellipse(0, 0, AB.beadW - 1, AB.beadH - 1);
  strokeHex(p, C.brassLight, 0.5);
  p.strokeWeight(1);
  p.arc(0, 0, AB.beadW - 4, AB.beadH - 4, Math.PI * 1.04, Math.PI * 1.7);

  // 珠孔 + 一点火光
  p.noStroke();
  fillHex(p, C.slot, 1);
  p.ellipse(0, 0, AB.beadW * 0.19, AB.beadH * 0.43);
  p.noFill();
  strokeHex(p, C.brassLight, 0.34);
  p.strokeWeight(0.8);
  p.ellipse(0, 0, AB.beadW * 0.19, AB.beadH * 0.43);

  // 1px 高光
  p.noStroke();
  fillHex(p, C.cream, 0.18 * form);
  p.ellipse(-AB.beadW * 0.18, -AB.beadH * 0.26, AB.beadW * 0.28, AB.beadH * 0.2);
  p.pop();
}

function drawAbacusFrame(p) {
  p.noStroke();
  // 外框落影
  fillHex(p, '#0a0604', 0.42);
  p.rect(AB.x + 5, AB.y + 6, AB.w, AB.h, 6);

  // 木框
  fillHex(p, '#3d2a18', 1);
  p.rect(AB.x, AB.y, AB.w, AB.h, 5);
  fillHex(p, '#4d3520', 0.9);
  p.rect(AB.x + 4, AB.y + 4, AB.w - 8, 12, 2);
  p.rect(AB.x + 4, AB.y + AB.h - 16, AB.w - 8, 12, 2);

  // 内侧暗板压住背景齿轮
  fillHex(p, '#120d09', 0.62);
  p.rect(AB.x + 13, AB.y + 15, AB.w - 26, AB.h - 30, 3);

  // 黄铜嵌条
  fillHex(p, C.brassDark, 0.9);
  p.rect(AB.x + 7, AB.y + 15, AB.w - 14, 2);
  p.rect(AB.x + 7, AB.y + AB.h - 17, AB.w - 14, 2);
  p.noFill();
  strokeHex(p, C.brassDark, 0.8);
  p.strokeWeight(1.4);
  p.rect(AB.x, AB.y, AB.w, AB.h, 5);
  strokeHex(p, C.brassLight, 0.34);
  p.strokeWeight(1);
  p.line(AB.x + 8, AB.y + 2, AB.x + AB.w - 8, AB.y + 2);

  // 六根黄铜杆
  for (let i = 0; i < AB.rods; i++) {
    const x = rodX(i);
    strokeHex(p, C.slot, 0.9);
    p.strokeWeight(3);
    p.line(x, AB.y + 17, x, AB.y + AB.h - 17);
    strokeHex(p, C.brassDark, 1);
    p.strokeWeight(1.6);
    p.line(x, AB.y + 17, x, AB.y + AB.h - 17);
    strokeHex(p, C.brassLight, 0.55);
    p.strokeWeight(0.8);
    p.line(x - 0.8, AB.y + 18, x - 0.8, AB.y + AB.h - 18);
  }

  // 四角铜片 + 螺钉
  const corners = [
    [AB.x + 9, AB.y + 9],
    [AB.x + AB.w - 9, AB.y + 9],
    [AB.x + 9, AB.y + AB.h - 9],
    [AB.x + AB.w - 9, AB.y + AB.h - 9]
  ];
  for (const [x, y] of corners) {
    p.noStroke();
    fillHex(p, C.brassDark, 0.9);
    p.rect(x - 5, y - 4, 10, 8, 2);
    fillHex(p, C.brassLight, 0.45);
    p.ellipse(x - 1.5, y - 1.5, 3, 2.4);
    fillHex(p, C.slot, 0.7);
    p.rect(x - 2.5, y - 0.5, 5, 1, 0.5);
  }
}

function drawAbacus(p, t) {
  drawAbacusFrame(p);

  // 变形进度：0 = 在杆上，1 = 排成 0
  const formAll = smoothstep(2.3, 2.72, Math.min(t, 3));
  if (formAll > 0.01) {
    // 0 的孔与淡描边
    p.noStroke();
    fillHex(p, '#0b0805', 0.14 * formAll);
    p.ellipse(AB.ringX, AB.ringY, AB.ringRX * 1.25, AB.ringRY * 1.25);
    p.noFill();
    strokeHex(p, C.cream, 0.08 * formAll);
    p.strokeWeight(1.2);
    p.ellipse(AB.ringX, AB.ringY, AB.ringRX * 2, AB.ringRY * 2);
  }

  let idx = 0;
  for (let r = 0; r < AB.rods; r++) {
    for (let row = 0; row < AB.rows; row++) {
      const restX = rodX(r);
      const restY = AB.y + 34 + row * 44;
      const target = beadRingTarget(idx);
      const delay = hash2(idx, 71) * 0.09;
      const u = smoothstep(2.3 + delay, 2.66 + delay, Math.min(t, 3));
      const lift = Math.sin(u * Math.PI) * (12 + hash2(idx, 72) * 18);
      const side = (hash2(idx, 73) - 0.5) * 18;
      const x = restX + (target.x - restX) * u + side * Math.sin(u * Math.PI);
      const y = restY + (target.y - restY) * u - lift;
      const rot = target.rot * u;
      drawAbacusBead(p, x, y, rot, 0.8 + 0.2 * u);
      idx++;
    }
  }
}

// ---------- 计算尺 / 游标 ----------

function scaleX(v) {
  return SCALE_X0 + SCALE_SPAN * Math.log10(v);
}

function drawLogScale(p) {
  p.push();
  p.textFont('serif');
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(10);

  for (let n = 1; n <= 10; n++) {
    const x = scaleX(n);
    strokeHex(p, C.cream, 0.72);
    p.strokeWeight(n === 1 || n === 10 ? 1.6 : 1.3);
    p.line(x, 622, x, 641);
    p.noStroke();
    fillHex(p, C.brassDeep, 0.5);
    p.text(String(n), x + 0.7, 647.3);
    fillHex(p, C.cream, 0.66);
    p.text(String(n), x, 646.5);

    if (n < 10) {
      const steps = n < 2 ? 10 : n < 4 ? 10 : n < 7 ? 5 : 2;
      for (let k = 1; k < steps; k++) {
        const v = n + k / steps;
        const xx = scaleX(v);
        strokeHex(p, C.cream, 0.34);
        p.strokeWeight(0.8);
        p.line(xx, 622, xx, 622 + (k % 2 === 0 ? 10 : 6));
      }
    }
  }

  // 上排浅刻的第二条对数尺
  for (let n = 1; n <= 10; n++) {
    const x = scaleX(n);
    strokeHex(p, C.creamDim, 0.24);
    p.strokeWeight(0.9);
    p.line(x, 611, x, 621);
    if (n < 10) {
      const xx = scaleX(n + 0.5);
      p.line(xx, 611, xx, 616);
    }
  }
  p.pop();
}

function drawCursor(p, x) {
  p.push();
  p.noStroke();
  // 阴影
  fillHex(p, '#0a0604', 0.4);
  p.rect(x - 8 + 4, 596 + 4, 22, 76, 3);

  // 黄铜框
  fillHex(p, C.brassDark, 0.98);
  p.rect(x - 12, 592, 24, 82, 3);
  fillHex(p, C.brass, 0.98);
  p.rect(x - 9, 595, 18, 76, 2);
  fillHex(p, C.brassLight, 0.7);
  p.rect(x - 9, 595, 2.2, 76, 1);
  fillHex(p, C.brassDeep, 0.65);
  p.rect(x + 5, 595, 4, 76, 1);

  // 顶部指针
  fillHex(p, C.cream, 0.9);
  p.triangle(x, 585, x - 7, 594, x + 7, 594);

  // 读数细线
  strokeHex(p, C.cream, 0.86);
  p.strokeWeight(1.4);
  p.line(x, 590, x, 677);
  strokeHex(p, C.brassDeep, 0.45);
  p.strokeWeight(0.8);
  p.line(x + 2, 593, x + 2, 674);

  // 两颗小螺钉
  for (const y of [603, 663]) {
    p.noStroke();
    fillHex(p, C.brassDeep, 1);
    p.ellipse(x, y, 5, 5);
    fillHex(p, C.brassLight, 0.7);
    p.ellipse(x - 1, y - 1, 2, 2);
    strokeHex(p, C.slot, 0.7);
    p.strokeWeight(0.8);
    p.line(x - 1.5, y, x + 1.5, y);
  }
  p.pop();
}

function drawCursorHistory(p, t) {
  const everPushed = smoothstep(2.56, 2.7, Math.min(t, 3));
  if (everPushed < 0.01) return;

  // 游标被推过头的残影（固定在尺面上，不跟着主角走）
  const gx = 566;
  p.push();
  p.noFill();
  strokeHex(p, C.cream, 0.1 * everPushed);
  p.strokeWeight(1.6);
  p.line(gx, 594, gx, 674);
  p.line(gx + 8, 594, gx + 8, 674);
  p.noStroke();
  fillHex(p, C.cream, 0.09 * everPushed);
  p.triangle(gx + 4, 587, gx - 2, 594, gx + 10, 594);

  // 刮擦痕
  strokeHex(p, C.brassLight, 0.17 * everPushed);
  p.strokeWeight(1);
  p.line(536, 626, 552, 625.5);
  p.line(540, 632, 556, 631);
  p.line(534, 644, 550, 643.5);
  p.line(544, 650, 558, 649.5);
  strokeHex(p, C.cream, 0.1 * everPushed);
  p.line(538, 638, 560, 637.5);

  // 回弹的细小铜屑
  p.noStroke();
  for (let i = 0; i < 4; i++) {
    fillHex(p, C.brassLight, 0.2 * everPushed);
    p.ellipse(559 + hash2(i, 81) * 14, 621 + hash2(i, 82) * 26, 1.4, 1);
  }
  p.pop();
}

function drawSlideRule(p, t) {
  const overrun = cursorOverrun(t);
  const actorX = actorLocalX(t);
  // 游标停在珠子右侧：珠缘压住游标左框，读数细线仍露出来。
  const cursorX = actorX + 34 + 36 * overrun;

  p.noStroke();
  // 尺身下的阴影
  fillHex(p, '#0a0604', 0.34);
  p.rect(0, 660, 1000, 22);
  fillHex(p, '#0a0604', 0.16);
  p.rect(0, 680, 1000, 12);

  // 定尺（三层黄铜：暗边、铜面、1px 高光）
  fillHex(p, C.brassDeep, 1);
  p.rect(0, RULE_Y, 1000, RULE_H);
  fillHex(p, C.brass, 1);
  p.rect(0, RULE_Y + 5, 1000, RULE_H - 10);
  fillHex(p, C.brassDark, 0.55);
  p.rect(0, RULE_Y + 46, 1000, 7);
  fillHex(p, C.brassLight, 0.55);
  p.rect(0, RULE_Y + 5, 1000, 1.6);

  // 滑尺凹槽
  fillHex(p, C.brassDark, 0.66);
  p.rect(26, 621, 948, 26, 1);
  fillHex(p, C.brass, 0.72);
  p.rect(29, 623, 942, 21, 1);
  fillHex(p, C.brassDeep, 0.42);
  p.rect(29, 643, 942, 1.4);

  // 铜面旧痕
  for (let i = 0; i < 42; i++) {
    const x = hash2(i, 91) * 1000;
    const y = RULE_Y + 8 + hash2(i, 92) * 42;
    fillHex(p, i % 4 ? C.brassDark : C.creamDim, 0.03 + hash2(i, 93) * 0.06);
    p.rect(x, y, 3 + hash2(i, 94) * 16, 0.8 + hash2(i, 94) * 1.2);
  }

  drawLogScale(p);

  // 两端的端板与螺钉
  p.noStroke();
  fillHex(p, C.brassDeep, 1);
  p.rect(0, RULE_Y - 3, 26, RULE_H + 6);
  p.rect(974, RULE_Y - 3, 26, RULE_H + 6);
  fillHex(p, C.brassDark, 0.95);
  p.rect(3, RULE_Y, 20, RULE_H);
  p.rect(977, RULE_Y, 20, RULE_H);
  for (const x of [13, 987]) {
    fillHex(p, C.brassLight, 0.35);
    p.ellipse(x - 1, 625, 6, 6);
    fillHex(p, C.slot, 0.8);
    p.ellipse(x, 627, 3, 3);
  }

  // 尺面被推过的痕迹 + 游标
  drawCursorHistory(p, t);
  drawCursor(p, cursorX);

  // 游标与珠子接触点旁边的小铜屑
  if (t > 2.7) {
    p.noStroke();
    fillHex(p, C.brassLight, 0.24);
    p.ellipse(cursorX - 18, 610, 2, 1.2);
    p.ellipse(cursorX - 15, 616, 1.4, 1);
  }
}

// ---------- 手 ----------

function handPose(t) {
  const hold = Math.min(t, 3);
  // 手在第 2 小节才进入，别让标题帧就顶着一只大手。
  const presence = smoothstep(1.65, 2.0, hold);
  const push1 = smoothstep(2.06, 2.17, hold) * (1 - smoothstep(2.28, 2.44, hold));
  const push2 = smoothstep(2.56, 2.67, hold) * (1 - smoothstep(2.84, 2.97, hold));
  const push = push2;
  const thumb = smoothstep(2.8, 2.98, hold);
  const actorX = actorLocalX(hold);
  const restX = Math.max(actorX + 110, 530);
  const pushX = Math.max(actorX + 40, 480);
  const handX = restX + (pushX - restX) * push;
  const palmY = 350 + push * 38 - (1 - presence) * 170 - smoothstep(4.15, 4.85, t) * 280;
  return { presence, push, thumb, handX, palmY, push1, push2 };
}

function drawHandShapes(p, pose, includeFinger, color, grow, ox, oy) {
  const x = pose.handX + ox;
  const y = pose.palmY + oy;
  p.strokeCap(p.ROUND);
  p.stroke(color);

  // 前臂从画面上方伸入
  p.strokeWeight(92 + grow);
  p.line(x + 52, 96, x + 30, y - 30);

  // 拇指：竖起或收拢
  const thx = x - 68 - 24 * pose.thumb;
  const thy = y + 34 - 139 * pose.thumb;
  p.strokeWeight(40 + grow);
  p.line(x - 38, y + 8, thx, thy);

  // 食指：推游标时向下伸出
  if (includeFinger) {
    const tipY = y + 34 + 176 * pose.push;
    p.strokeWeight(33 + grow);
    p.line(x - 6, y + 12, x - 12, tipY);
  }

  // 手掌
  p.noStroke();
  fillHex(p, color, 1);
  p.ellipse(x, y, 150 + grow, 140 + grow);

  // 握拳的四个指节
  for (let k = 0; k < 4; k++) {
    const kx = x - 57 + k * 28;
    const ky = y + 47 + (k === 0 ? -6 : k === 3 ? 4 : 0);
    p.ellipse(kx, ky, 42 + grow, 40 + grow);
  }
}

function drawHand(p, t, includeFinger) {
  const pose = handPose(t);
  if (pose.presence < 0.015) return;
  p.push();
  // 暖棕色轮廓偏移，再用深色剪影盖住左上，形成 1px 暖边
  drawHandShapes(p, pose, includeFinger, C.handRim, 7, 3, 5);
  drawHandShapes(p, pose, includeFinger, C.hand, 0, 0, 0);
  p.pop();
}

// 食指单独补画：drawRoad 盖掉默认路带后，只恢复跨带的那根指头。
function drawIndexFingerShapes(p, pose, color, grow, ox, oy) {
  const x = pose.handX + ox;
  const y = pose.palmY + oy;
  p.strokeCap(p.ROUND);
  p.stroke(color);
  p.strokeWeight(33 + grow);
  p.line(x - 6, y + 12, x - 12, y + 34 + 176 * pose.push);
}

// ---------- 主角：算盘珠 ----------

function drawActorBead(p, worldX, rollX, t) {
  const hold = Math.min(t, 3);
  p.push();
  p.translate(worldX, 602);

  // 尺面上的暖光与影子
  p.noStroke();
  fillHex(p, C.ember, 0.055);
  p.ellipse(0, 4, 108, 54);
  fillHex(p, '#0a0604', 0.34);
  p.ellipse(0, 20, 82, 17);

  // 接触刻度：珠子正压在刻度上
  strokeHex(p, C.cream, 0.75);
  p.strokeWeight(1.4);
  p.line(-13, 28, 13, 28);
  strokeHex(p, C.brassDeep, 0.6);
  p.strokeWeight(1);
  p.line(-9, 31, 9, 31);

  // 带齿的深木外圈
  p.push();
  p.rotate(rollX / 26 + 0.15);
  p.noStroke();
  fillHex(p, C.slot, 0.95);
  gearRingPath(p, 33, 12);
  fillHex(p, C.woodBead, 1);
  gearRingPath(p, 31, 12);
  fillHex(p, C.woodBeadDark, 0.6);
  p.ellipse(0, 0, 53, 53);

  // 黄铜内盘
  fillHex(p, C.brassDark, 1);
  p.ellipse(0, 0, 48, 48);
  fillHex(p, C.brass, 1);
  p.ellipse(-1, -1, 42, 42);
  fillHex(p, C.brassLight, 0.22);
  p.ellipse(-6, -7, 27, 27);
  p.noFill();
  strokeHex(p, C.brassLight, 0.55);
  p.strokeWeight(1.2);
  p.arc(0, 0, 40, 40, Math.PI * 1.03, Math.PI * 1.62);
  strokeHex(p, C.brassDeep, 0.62);
  p.strokeWeight(1.1);
  p.arc(0, 0, 44, 44, Math.PI * 0.06, Math.PI * 0.55);

  // 内圈火种（延续第 4 版块）
  p.noStroke();
  fillHex(p, C.slot, 1);
  p.ellipse(0, 0, 20, 20);
  fillHex(p, C.ember, 0.7);
  p.ellipse(0, 0, 16, 16);
  fillHex(p, C.emberHot, 1);
  p.ellipse(-1, -1, 9, 9);
  fillHex(p, C.emberCore, 1);
  p.ellipse(-1.5, -1.5, 3.4, 3.4);
  p.noFill();
  strokeHex(p, C.emberHot, 0.28);
  p.strokeWeight(1);
  p.ellipse(0, 0, 22, 22);

  // 齿尖高光
  p.noStroke();
  for (let i = 0; i < 12; i++) {
    const a = i * (TAU / 12) + 0.12;
    fillHex(p, C.brassLight, 0.32);
    p.ellipse(Math.cos(a) * 27, Math.sin(a) * 27, 2.6, 1.4);
  }
  p.pop();

  // 咔哒火花：珠子右侧顶着游标
  const click = Math.max(
    smoothstep(2.45, 2.55, hold) * (1 - smoothstep(2.62, 2.76, hold)),
    smoothstep(2.84, 2.92, hold)
  );
  if (click > 0.02) {
    p.noStroke();
    for (let i = 0; i < 3; i++) {
      const a = -0.5 + i * 0.45;
      strokeHex(p, i === 1 ? C.cream : C.brassLight, 0.5 * click);
      p.strokeWeight(1.1);
      p.line(24, 6, 24 + Math.cos(a) * (6 + i * 2), 6 + Math.sin(a) * (6 + i * 2));
    }
    p.noStroke();
    fillHex(p, C.cream, 0.55 * click);
    p.ellipse(23, 4, 2.2, 2.2);
  }

  // 珠子冒出的一小股蒸汽，停在路带上沿以下
  const steamFade = 1 - smoothstep(4.0, 4.8, t);
  p.noStroke();
  for (let i = 0; i < 4; i++) {
    const birth = 2.72 + i * 0.05;
    const age = hold - birth;
    if (age <= 0) continue;
    const u = clamp(age / 0.46, 0, 1);
    const sx = 1 + (hash2(i, 111) - 0.5) * 18 + u * 9;
    const sy = -37 - u * 22;
    fillHex(p, C.steam, 0.135 * (1 - u * 0.6) * steamFade);
    p.ellipse(sx, sy, 16 + u * 16, 9 + u * 8);
  }

  p.pop();
}

// ---------- 公共姿态 ----------

function actorLocalX(t) {
  return clamp(t, 0, 6) * (1000 / 6);
}

function cursorOverrun(t) {
  const hold = Math.min(t, 3);
  const push1 = smoothstep(2.06, 2.17, hold) * (1 - smoothstep(2.28, 2.44, hold));
  const push2 = smoothstep(2.56, 2.67, hold) * (1 - smoothstep(2.84, 2.97, hold));
  return Math.min(1, push1 * 0.55 + push2);
}

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 180;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, '#f3e3bc', 0.68 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.noFill();
  strokeHex(p, C.brassLight, 0.42 * alpha);
  p.strokeWeight(1);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

// 补默认路面带（y=470..530）时用的短木纹，全部压在带内。
const BAND_GRAIN = (() => {
  const rng = mulberry32(0xba51d);
  const list = [];
  for (let i = 0; i < 34; i++) {
    const y0 = 473 + rng() * 52;
    const x0 = -30 + rng() * 160;
    const x1 = 840 + rng() * 190;
    const amp = (rng() - 0.5) * 2 * (1 + rng() * 4);
    const alpha = 0.035 + rng() * 0.06;
    const weight = 0.6 + rng() * 0.8;
    list.push({ y0, x0, x1, amp, alpha, weight, light: rng() > 0.74 });
  }
  return list;
})();

function drawRoadBandGrain(p) {
  p.noFill();
  p.strokeCap(p.ROUND);
  for (const g of BAND_GRAIN) {
    strokeHex(p, g.light ? C.grainLight : C.grainDark, g.light ? g.alpha * 0.55 : g.alpha);
    p.strokeWeight(g.weight);
    p.beginShape();
    for (let k = 0; k <= 5; k++) {
      const u = k / 5;
      const x = g.x0 + (g.x1 - g.x0) * u;
      const y = g.y0 + g.amp * Math.sin(u * Math.PI);
      p.vertex(x, y);
    }
    p.endShape();
  }
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    p.push();
    p.noStroke();

    drawWorkbench(p);
    drawGearTrain(p, t);
    drawGearSteam(p, t);
    drawAbacus(p, t);
    drawSlideRule(p, t);

    // 手在 draw 里画；推游标的食指若跨过默认路带，交给 drawRoad 再补一次。
    const pose = handPose(t);
    drawHand(p, t, pose.push <= 0.02);

    drawBenchShade(p);

    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (showTitle) {
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

    // 整条默认路面带用同一块木台面补回
    fillHex(p, C.wood, 1);
    p.rect(0, 470, 1000, 60);
    fillHex(p, C.woodLight, 0.04);
    p.rect(0, 470, 1000, 24);
    fillHex(p, C.woodDeep, 0.055);
    p.rect(0, 508, 1000, 22);

    drawRoadBandGrain(p);

    // 食指只在推游标时跨过这条带；这里只补画指头，避免手体重叠标题卡。
    const pose = handPose(t);
    if (pose.push > 0.02 && pose.presence > 0.015) {
      p.push();
      drawIndexFingerShapes(p, pose, C.handRim, 7, 3, 5);
      drawIndexFingerShapes(p, pose, C.hand, 0, 0, 0);
      p.pop();
    }

    p.pop();
  },

  drawActor(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const localX = state.x - (state.blockIndex - 1) * 1000;
    p.push();
    drawActorBead(p, state.x, localX, t);
    p.pop();
  }
};
