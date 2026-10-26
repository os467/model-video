import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 11 符号主义与专家系统：1970s 终端/主机房 + 规则树 + 推理回环。
// 静态重点：localT≈1.5（标题、CRT、磁带、规则树、总线）与
// localT≈3.0（IF→THEN→TRUE→答案、WHY?、规则翻面/自指回环、扫描线卡住、约 1s 定格）。
const TAU = Math.PI * 2;
const ROAD_TOP = 470;
const ROAD_BOTTOM = 530;
const ROAD_MID = 500;

const META = {
  id: 11,
  cn: '符号主义与专家系统',
  en: 'Symbolism & Expert Systems',
  era: '1970s',
  group: 'electronic'
};

const C = {
  bg: '#061614',
  bgDeep: '#030d0b',
  bgLow: '#071b16',
  wall: '#0a211b',
  wallDark: '#061612',
  wallLight: '#143c30',
  cabinet: '#0b251e',
  cabinetLight: '#174438',
  cabinetDeep: '#050f0c',
  teal: '#123c32',
  edge: '#23584a',
  mint: '#86e0be',
  phosphor: '#b4ffdf',
  ink: '#d7ffe9',
  cream: '#f0dfb8',
  creamDim: '#cdbb95',
  brassDeep: '#3d2915',
  brassDark: '#6a4824',
  brass: '#b8863c',
  brassLight: '#e3b56f',
  ember: '#c96a2c',
  emberHot: '#f0a052',
  emberCore: '#ffe3aa',
  red: '#c05a46',
  redDim: '#72372b',
  glass: '#03100c',
  tape: '#211b17',
  tapeEdge: '#4a3a2d',
  paperInk: '#2a5b4a'
};

// CRT 外壳 / 屏幕 / 磁带机 / 键盘落点。屏幕底边停在总线上沿之前。
const CRT = { x: 498, y: 282, w: 440, h: 358 };
const SCREEN = { x: 540, y: 306, w: 360, h: 156 };
const TAPE = { x: 734, y: 218, w: 242, h: 84 };
const KEYB = { x: 536, y: 650, w: 372, h: 100 };

// 规则卡与答案框都在屏幕内侧/边缘，不侵入左上标题区。
const CARDS = [
  {
    id: 'if',
    x: 592,
    y: 300,
    w: 84,
    h: 36,
    label: 'IF',
    sub: 'RULE 01',
    start: 0.35,
    seed: 111
  },
  {
    id: 'then',
    x: 672,
    y: 338,
    w: 82,
    h: 32,
    label: 'THEN',
    back: 'FALSE',
    start: 0.55,
    seed: 112
  },
  {
    id: 'true',
    x: 590,
    y: 376,
    w: 78,
    h: 30,
    label: 'TRUE',
    back: 'FALSE',
    start: 0.74,
    seed: 113
  },
  {
    id: 'false',
    x: 698,
    y: 376,
    w: 72,
    h: 30,
    label: 'FALSE',
    start: 0.9,
    seed: 114
  }
];

const ANSWER = { x: 548, y: 412, w: 94, h: 36 };
const WHY = { x: 580, y: 447, w: 66, h: 20 };

const BITS = '01011010010110100101101001011010';

// 固定尘埃 / 屏幕散点 / 总线统计点，全部由固定种子预生成。
const DUST = (() => {
  const rng = mulberry32(0x11a51e);
  const list = [];
  for (let i = 0; i < 110; i++) {
    list.push({
      x: rng() * 1000,
      y: 190 + rng() * 630,
      r: 0.5 + rng() * 1.5,
      a: 0.015 + rng() * 0.04,
      light: rng() > 0.62
    });
  }
  return list;
})();

const SCREEN_DOTS = (() => {
  const rng = mulberry32(0x5c4ee2);
  const list = [];
  for (let i = 0; i < 54; i++) {
    list.push({
      x: SCREEN.x + 8 + rng() * (SCREEN.w - 16),
      y: SCREEN.y + 8 + rng() * (SCREEN.h - 16),
      a: 0.025 + rng() * 0.05
    });
  }
  return list;
})();

const SCATTER = (() => {
  const rng = mulberry32(0x5ca77e);
  const list = [];
  for (let i = 0; i < 88; i++) {
    list.push({
      x: rng() * 1000,
      y: ROAD_TOP + 6 + rng() * (ROAD_BOTTOM - ROAD_TOP - 12),
      r: 0.8 + rng() * 2.2,
      a: 0.2 + rng() * 0.55,
      warm: rng() > 0.78,
      seed: i
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

function screenWash(p, alpha) {
  const ctx = p.drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
  ctx.clip();
  const grad = ctx.createRadialGradient(
    SCREEN.x + SCREEN.w * 0.42,
    SCREEN.y + SCREEN.h * 0.46,
    8,
    SCREEN.x + SCREEN.w * 0.46,
    SCREEN.y + SCREEN.h * 0.48,
    SCREEN.w * 0.72
  );
  grad.addColorStop(0, `rgba(58, 214, 158, ${0.115 * alpha})`);
  grad.addColorStop(0.52, `rgba(22, 116, 86, ${0.05 * alpha})`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
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

function screw(p, x, y, r = 2.6) {
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.9);
  p.ellipse(x + 0.7, y + 0.8, r * 2.1, r * 2.1);
  fillHex(p, C.brassDark, 0.75);
  p.ellipse(x, y, r * 2, r * 2);
  fillHex(p, C.brassLight, 0.35);
  p.ellipse(x - 0.8, y - 0.8, r * 0.9, r * 0.7);
  strokeHex(p, C.brassDeep, 0.8);
  p.strokeWeight(0.7);
  p.line(x - r * 0.55, y, x + r * 0.55, y);
}

// ---------- 房间 ----------

function drawRoom(p) {
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
      [0, 'rgba(2,8,7,0.58)'],
      [0.24, 'rgba(3,17,14,0.1)'],
      [0.62, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,4,3,0.66)']
    ],
    0,
    0,
    1000,
    1000
  );

  // 墙面竖向拼板 + 淡的水平接缝，不要做成现代机房网格。
  p.strokeWeight(1);
  for (let x = 36; x < 1000; x += 124) {
    strokeHex(p, C.wallLight, 0.055);
    p.line(x, 196, x, 760);
    strokeHex(p, C.bgDeep, 0.2);
    p.line(x + 3, 196, x + 3, 760);
  }
  strokeHex(p, C.wallLight, 0.06);
  p.line(0, 254, 1000, 254);
  strokeHex(p, C.bgDeep, 0.2);
  p.line(0, 257, 1000, 257);
  strokeHex(p, C.wallLight, 0.045);
  p.line(0, 620, 1000, 620);

  // 上方通风格栅，位置在标题区之上。
  for (let i = 0; i < 7; i++) {
    const y = 225 + i * 5;
    strokeHex(p, i % 2 ? C.wallLight : C.bgDeep, 0.15);
    p.strokeWeight(i % 2 ? 1.8 : 1);
    p.line(168, y, 426, y);
  }
  strokeHex(p, C.wallLight, 0.12);
  p.strokeWeight(1);
  p.noFill();
  p.rect(164, 221, 266, 39, 3);

  // 尘埃。不是代码雨，只是老机房空气里的亮点。
  p.noStroke();
  for (const d of DUST) {
    fillHex(p, d.light ? C.mint : C.creamDim, d.a);
    p.ellipse(d.x, d.y, d.r, d.r);
  }

  // 屏幕向左侧反射的一点绿光。
  p.noStroke();
  fillHex(p, C.mint, 0.017);
  p.ellipse(700, 392, 470, 270);
  fillHex(p, C.ember, 0.008);
  p.ellipse(650, 360, 200, 120);

  // 地面设备底部的暗影。
  fillHex(p, C.bgDeep, 0.45);
  p.rect(0, 760, 1000, 240);
  strokeHex(p, C.wallLight, 0.04);
  p.strokeWeight(1);
  for (let x = 40; x < 1000; x += 58) p.line(x, 764, x + 24, 764);
}

function drawHostRack(p, x, y, w, h, seed, t) {
  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.55);
  p.rect(x + 5, y + 7, w, h, 3);

  fillHex(p, C.cabinetDeep, 1);
  p.rect(x, y, w, h, 3);
  fillHex(p, C.cabinet, 0.98);
  p.rect(x + 4, y + 4, w - 8, h - 8, 2);
  strokeHex(p, C.edge, 0.32);
  p.strokeWeight(1.2);
  p.noFill();
  p.rect(x + 4, y + 4, w - 8, h - 8, 2);
  strokeHex(p, C.mint, 0.08);
  p.strokeWeight(0.8);
  p.line(x + 7, y + 6, x + w - 8, y + 6);

  // 侧轨和分层
  fillHex(p, C.cabinetDeep, 0.62);
  p.rect(x + 8, y + 12, 6, h - 24);
  p.rect(x + w - 14, y + 12, 6, h - 24);

  const rows = Math.max(1, Math.floor((h - 20) / 76));
  const gap = 6;
  const rowH = (h - 20 - gap * (rows - 1)) / rows;
  const step = Math.floor(t * 10);

  for (let row = 0; row < rows; row++) {
    const py = y + 12 + row * (rowH + gap);
    fillHex(p, C.cabinetLight, 0.28);
    p.rect(x + 17, py, w - 34, rowH, 1.5);
    fillHex(p, C.bgDeep, 0.4);
    p.rect(x + 19, py + 3, w - 38, rowH - 6, 1);

    // 通风格栅
    for (let k = 0; k < 4; k++) {
      const yy = py + 7 + k * ((rowH - 16) / 4);
      strokeHex(p, C.wallLight, 0.18);
      p.strokeWeight(0.8);
      p.line(x + 22, yy, x + w - 22, yy);
    }

    // 磁带/插线单元的黑窗
    fillHex(p, C.cabinetDeep, 0.88);
    p.rect(x + 24, py + 5, 22, rowH - 10, 1);
    strokeHex(p, C.brassDark, 0.35);
    p.strokeWeight(0.8);
    p.noFill();
    p.rect(x + 24, py + 5, 22, rowH - 10, 1);

    // 10Hz 状态灯：每一小步换一组，不靠随机。
    for (let k = 0; k < 7; k++) {
      const on = hash2(row * 13 + k, step, seed) > 0.48;
      const ex = x + w - 27 - (k % 2) * 7;
      const ey = py + 9 + Math.floor(k / 2) * 8;
      if (on) {
        const warm = (row + k) % 7 === 0;
        fillHex(p, warm ? C.emberHot : C.mint, 0.5 + hash2(row, k, seed) * 0.38);
        p.ellipse(ex, ey, 2.8, 2.8);
        fillHex(p, warm ? C.ember : C.mint, 0.09);
        p.ellipse(ex, ey, 7, 7);
      } else {
        fillHex(p, C.cabinetDeep, 0.9);
        p.ellipse(ex, ey, 2.2, 2.2);
      }
    }
  }

  // 底部小轮
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.98);
  p.rect(x + 9, y + h, 18, 5, 2);
  p.rect(x + w - 27, y + h, 18, 5, 2);
  p.pop();
}

function drawCableRun(p, x0, y0, x1, y1, sag, color, alpha, weight) {
  p.push();
  p.noFill();
  strokeHex(p, color, alpha);
  p.strokeWeight(weight);
  const cx = (x0 + x1) * 0.5;
  const cy = Math.max(y0, y1) + sag;
  p.beginShape();
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const v = 1 - u;
    const x = v * v * x0 + 2 * v * u * cx + u * u * x1;
    const y = v * v * y0 + 2 * v * u * cy + u * u * y1;
    p.vertex(x, y);
  }
  p.endShape();
  p.pop();
}

function drawRoomEquipment(p, t) {
  drawHostRack(p, 18, 214, 114, 346, 1101, t);
  drawHostRack(p, 466, 266, 48, 206, 1102, t);
  drawHostRack(p, 950, 318, 48, 300, 1103, t);

  // 顶部线槽
  p.push();
  p.noFill();
  strokeHex(p, C.wallLight, 0.22);
  p.strokeWeight(3);
  p.line(8, 243, 728, 243);
  strokeHex(p, C.bgDeep, 0.5);
  p.strokeWeight(1.2);
  p.line(8, 247, 728, 247);
  for (let x = 38; x < 728; x += 92) {
    strokeHex(p, C.wallLight, 0.18);
    p.strokeWeight(1);
    p.line(x, 239, x, 249);
  }
  p.pop();

  // 几束从左侧主机架垂到地板的线缆。全部走标题区下沿以下，别搅乱留白。
  drawCableRun(p, 126, 432, 312, 608, 38, C.cabinetDeep, 0.65, 8);
  drawCableRun(p, 130, 440, 296, 604, 32, C.teal, 0.34, 3);
  drawCableRun(p, 118, 458, 506, 628, 34, C.cabinetDeep, 0.55, 6);
  drawCableRun(p, 122, 466, 482, 616, 28, C.wallLight, 0.22, 1.8);
  drawCableRun(p, 476, 282, 566, 248, -12, C.cabinetDeep, 0.52, 5);
  drawCableRun(p, 930, 266, 986, 380, 24, C.cabinetDeep, 0.5, 5);

  // 一条竖直管，把标题区与终端区分开。
  p.noStroke();
  fillHex(p, C.cabinetDeep, 0.72);
  p.rect(483, 250, 9, 225);
  fillHex(p, C.wallLight, 0.14);
  p.rect(484, 250, 2, 225);
  for (const y of [272, 338, 404, 462]) {
    fillHex(p, C.brassDark, 0.45);
    p.rect(480, y, 15, 4, 1);
  }
}

// ---------- 磁带机 ----------

function drawReel(p, cx, cy, r, angle, alpha) {
  p.push();
  p.translate(cx, cy);
  p.noStroke();

  fillHex(p, C.bgDeep, 0.5 * alpha);
  p.ellipse(3, 4, r * 2.2, r * 2.2);

  fillHex(p, C.cabinetDeep, 0.95 * alpha);
  p.ellipse(0, 0, r * 2.14, r * 2.14);
  fillHex(p, C.tape, alpha);
  p.ellipse(0, 0, r * 1.92, r * 1.92);
  fillHex(p, C.tapeEdge, 0.42 * alpha);
  p.ellipse(0, 0, r * 1.7, r * 1.7);

  // 盘片窗口和旋转的三根加强筋。
  fillHex(p, C.cabinetDeep, 0.86 * alpha);
  p.ellipse(0, 0, r * 1.22, r * 1.22);
  p.rotate(angle);
  for (let i = 0; i < 3; i++) {
    p.push();
    p.rotate((i * TAU) / 3);
    fillHex(p, C.creamDim, 0.3 * alpha);
    p.beginShape();
    p.vertex(-r * 0.17, -r * 0.2);
    p.vertex(r * 0.17, -r * 0.2);
    p.vertex(r * 0.09, -r * 0.76);
    p.vertex(-r * 0.09, -r * 0.76);
    p.endShape(p.CLOSE);
    strokeHex(p, C.tapeEdge, 0.55 * alpha);
    p.strokeWeight(1);
    p.line(0, -r * 0.26, 0, -r * 0.7);
    p.pop();
  }

  p.rotate(-angle);
  p.noFill();
  strokeHex(p, C.brassLight, 0.34 * alpha);
  p.strokeWeight(1);
  p.ellipse(0, 0, r * 2, r * 2);
  strokeHex(p, C.mint, 0.2 * alpha);
  p.ellipse(0, 0, r * 1.84, r * 1.84);

  p.noStroke();
  fillHex(p, C.brassDark, 0.96 * alpha);
  p.ellipse(0, 0, r * 0.38, r * 0.38);
  fillHex(p, C.brassLight, 0.72 * alpha);
  p.ellipse(-r * 0.04, -r * 0.05, r * 0.2, r * 0.2);
  fillHex(p, C.cabinetDeep, 0.8 * alpha);
  p.ellipse(0, 0, r * 0.12, r * 0.12);

  // 转动标记，让 10Hz 的转动看得出来。
  fillHex(p, C.cream, 0.42 * alpha);
  p.ellipse(Math.cos(angle) * r * 0.82, Math.sin(angle) * r * 0.82, 2.4, 2.4);

  p.pop();
}

function drawTapeDeck(p, hold) {
  const x = TAPE.x;
  const y = TAPE.y;

  p.push();
  p.noStroke();
  fillHex(p, C.bgDeep, 0.55);
  p.rect(x + 7, y + 8, TAPE.w, TAPE.h, 4);

  fillHex(p, C.cabinetDeep, 0.98);
  p.rect(x, y, TAPE.w, TAPE.h, 4);
  fillHex(p, C.cabinet, 0.94);
  p.rect(x + 4, y + 4, TAPE.w - 8, TAPE.h - 8, 3);
  strokeHex(p, C.edge, 0.42);
  p.strokeWeight(1.2);
  p.noFill();
  p.rect(x + 4, y + 4, TAPE.w - 8, TAPE.h - 8, 3);

  // 玻璃窗
  fillHex(p, C.glass, 0.78);
  p.rect(x + 18, y + 12, 167, 60, 3);
  strokeHex(p, C.wallLight, 0.35);
  p.strokeWeight(1);
  p.rect(x + 18, y + 12, 167, 60, 3);

  // 磁带路径
  const lx = x + 48;
  const rx = x + 138;
  const ly = y + 43;
  const ry = y + 41;
  p.noFill();
  strokeHex(p, C.tapeEdge, 0.72);
  p.strokeWeight(3.2);
  p.beginShape();
  p.vertex(lx, ly + 26);
  p.vertex(lx, y + 63);
  p.vertex(rx, y + 63);
  p.vertex(rx, ry + 23);
  p.endShape();
  strokeHex(p, C.creamDim, 0.18);
  p.strokeWeight(0.8);
  p.line(lx, ly + 26, lx, y + 63);
  p.line(rx, ry + 23, rx, y + 63);

  // 磁头/压带轮
  fillHex(p, C.cabinetDeep, 0.96);
  p.rect(x + 80, y + 59, 30, 12, 1.5);
  fillHex(p, C.brassDark, 0.85);
  p.rect(x + 83, y + 62, 24, 3, 1);
  fillHex(p, C.creamDim, 0.6);
  p.ellipse(x + 97, y + 66, 4, 4);
  fillHex(p, C.brassDeep, 0.9);
  p.ellipse(x + 104, y + 66, 2.4, 2.4);

  const spin = Math.floor(hold * 10) / 10;
  drawReel(p, lx, ly, 26, spin * 1.05 + 0.4, 1);
  drawReel(p, rx, ry, 22, -spin * 1.3 + 0.2, 1);

  // 右侧计数器/指示灯窗
  fillHex(p, C.bgDeep, 0.78);
  p.rect(x + 194, y + 18, 38, 21, 2);
  strokeHex(p, C.brassDark, 0.54);
  p.strokeWeight(1);
  p.rect(x + 194, y + 18, 38, 21, 2);
  for (let i = 0; i < 4; i++) {
    fillHex(p, i % 2 ? C.creamDim : C.mint, 0.36);
    p.rect(x + 199 + i * 8, y + 23, 4, 11, 1);
  }
  fillHex(p, C.emberHot, 0.72);
  p.ellipse(x + 245, y + 67, 3.2, 3.2);
  fillHex(p, C.ember, 0.08);
  p.ellipse(x + 245, y + 67, 12, 12);

  // 通风孔、把手、螺钉
  for (let i = 0; i < 8; i++) {
    fillHex(p, C.cabinetDeep, 0.8);
    p.rect(x + 203, y + 42 + i * 3.2, 27, 1.2);
  }
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(x + 18, y + TAPE.h - 13, 54, 4, 2);
  for (const [sx, sy] of [
    [x + 10, y + 10],
    [x + TAPE.w - 10, y + 10],
    [x + 10, y + TAPE.h - 10],
    [x + TAPE.w - 10, y + TAPE.h - 10]
  ]) {
    screw(p, sx, sy, 2);
  }

  p.pop();
}

// ---------- CRT 终端 ----------

function drawTerminalShell(p, t) {
  const { x, y, w, h } = CRT;
  p.push();
  p.noStroke();

  // 落影 + 外壳
  fillHex(p, C.bgDeep, 0.68);
  p.rect(x + 9, y + 12, w, h, 12);
  fillHex(p, C.cabinetDeep, 1);
  p.rect(x, y, w, h, 12);
  fillHex(p, C.cabinet, 0.98);
  p.rect(x + 6, y + 6, w - 12, h - 12, 9);
  fillHex(p, C.wallLight, 0.08);
  p.rect(x + 10, y + 8, w - 20, 8, 4);

  // 侧边倒角 + 暖铜饰条
  fillHex(p, C.cabinetLight, 0.24);
  p.rect(x + 12, y + 24, 5, h - 60);
  fillHex(p, C.cabinetDeep, 0.48);
  p.rect(x + w - 17, y + 24, 5, h - 60);
  strokeHex(p, C.brassDark, 0.42);
  p.strokeWeight(1.2);
  p.line(x + 26, y + 18, x + 188, y + 18);
  p.line(x + w - 210, y + 18, x + w - 28, y + 18);

  // 屏幕凹槽
  fillHex(p, C.cabinetDeep, 0.95);
  p.rect(532, 298, 372, 172, 7);
  fillHex(p, C.bgDeep, 0.98);
  p.rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 5);
  strokeHex(p, C.edge, 0.4);
  p.strokeWeight(1.2);
  p.rect(532, 298, 372, 172, 7);

  // CRT 屏幕底光。用低 alpha 层叠模拟余辉，不用大半径 blur。
  fillHex(p, C.glass, 1);
  p.rect(SCREEN.x + 2, SCREEN.y + 2, SCREEN.w - 4, SCREEN.h - 4, 4);
  screenWash(p, 1);
  fillHex(p, C.mint, 0.02);
  p.rect(SCREEN.x + 8, SCREEN.y + 8, SCREEN.w - 16, SCREEN.h - 16, 3);

  // 屏幕角的扫描余辉和玻璃反光
  p.noFill();
  strokeHex(p, C.mint, 0.18);
  p.strokeWeight(1);
  p.line(SCREEN.x + 10, SCREEN.y + 10, SCREEN.x + 28, SCREEN.y + 10);
  p.line(SCREEN.x + 10, SCREEN.y + 10, SCREEN.x + 10, SCREEN.y + 26);
  p.line(SCREEN.x + SCREEN.w - 10, SCREEN.y + SCREEN.h - 10, SCREEN.x + SCREEN.w - 30, SCREEN.y + SCREEN.h - 10);
  p.line(SCREEN.x + SCREEN.w - 10, SCREEN.y + SCREEN.h - 10, SCREEN.x + SCREEN.w - 10, SCREEN.y + SCREEN.h - 28);
  p.noStroke();
  fillHex(p, C.cream, 0.018);
  p.beginShape();
  p.vertex(SCREEN.x + 32, SCREEN.y);
  p.vertex(SCREEN.x + 118, SCREEN.y);
  p.vertex(SCREEN.x + 46, SCREEN.y + SCREEN.h);
  p.vertex(SCREEN.x + 4, SCREEN.y + SCREEN.h);
  p.endShape(p.CLOSE);

  // 顶部铭牌、通风口、四角螺钉
  fillHex(p, C.cabinetDeep, 0.9);
  p.rect(x + 276, y + 20, 138, 8, 2);
  fillHex(p, C.brassDark, 0.58);
  p.rect(x + 281, y + 22, 74, 1.2);
  for (let i = 0; i < 9; i++) {
    fillHex(p, C.cabinetDeep, 0.72);
    p.rect(x + 28 + i * 8, y + h - 23, 4, 1.5);
  }
  for (const [sx, sy] of [
    [x + 14, y + 14],
    [x + w - 14, y + 14],
    [x + 14, y + h - 14],
    [x + w - 14, y + h - 14]
  ]) {
    screw(p, sx, sy, 2.4);
  }

  // 顶部右侧的电源灯（磁带机下面仍能读到一点）
  fillHex(p, C.emberHot, 0.75);
  p.ellipse(x + w - 34, y + 15, 3.3, 3.3);
  fillHex(p, C.ember, 0.08);
  p.ellipse(x + w - 34, y + 15, 13, 13);

  p.pop();
}

function drawScreenBackdrop(p, hold) {
  p.push();
  p.noStroke();

  // 稀疏像素点，像老化荧光屏上的余辉。
  for (const d of SCREEN_DOTS) {
    fillHex(p, C.mint, d.a);
    p.rect(d.x, d.y, 1.2, 1.2);
  }

  // 右侧数据列：只出现 0/1 和短栏，不写长句。
  const step = Math.floor(hold * 10);
  p.textFont('monospace');
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(7);
  for (let row = 0; row < 9; row++) {
    const y = SCREEN.y + 18 + row * 12;
    const bit = BITS[(row * 3 + step) % BITS.length];
    fillHex(p, row === 2 || row === 6 ? C.creamDim : C.mint, 0.18 + hash2(row, step, 31) * 0.2);
    p.text(bit, SCREEN.x + 314, y);
    fillHex(p, C.mint, 0.07);
    p.rect(SCREEN.x + 324, y - 1, 6 + Math.floor(hash2(row, step, 32) * 12), 1.2);
  }
  fillHex(p, C.brassDark, 0.3);
  p.rect(SCREEN.x + 312, SCREEN.y + 12, 20, 1);

  // 左下角极淡的规则编号，压在卡片下。
  p.textSize(7);
  p.textAlign(p.LEFT, p.TOP);
  fillHex(p, C.mint, 0.28);
  p.text('RULE 01', SCREEN.x + 12, SCREEN.y + 12);

  // 静态细扫描线。亮线在 drawScreenAfterglow 里单独画。
  p.strokeWeight(1);
  for (let y = SCREEN.y + 3; y < SCREEN.y + SCREEN.h - 2; y += 3.2) {
    strokeHex(p, C.phosphor, 0.024);
    p.line(SCREEN.x + 2, y, SCREEN.x + SCREEN.w - 2, y);
  }
  strokeHex(p, C.mint, 0.08);
  p.strokeWeight(1);
  p.line(SCREEN.x + 10, SCREEN.y + SCREEN.h - 9, SCREEN.x + 116, SCREEN.y + SCREEN.h - 9);
  p.line(SCREEN.x + 10, SCREEN.y + SCREEN.h - 6, SCREEN.x + 74, SCREEN.y + SCREEN.h - 6);

  p.pop();
}

function drawScreenAfterglow(p, t, hold, whyGlow) {
  p.push();
  p.noStroke();

  const lock = smoothstep(2.56, 2.82, hold);
  const freeY = SCREEN.y + 10 + ((hold * 76 + 41) % (SCREEN.h - 18));
  const stuckY = SCREEN.y + 72;
  const scanY = freeY + (stuckY - freeY) * lock;

  // 扫描带拖尾
  fillHex(p, C.phosphor, 0.045 + lock * 0.05);
  p.rect(SCREEN.x + 2, scanY - 5, SCREEN.w - 4, 2);
  fillHex(p, C.mint, 0.09 + lock * 0.15);
  p.rect(SCREEN.x + 2, scanY, SCREEN.w - 4, 1.2);
  fillHex(p, C.cream, 0.055 + lock * 0.1);
  p.rect(SCREEN.x + 2, scanY + 2, SCREEN.w - 4, 0.8);

  if (lock > 0.02) {
    // 卡住后的双线余辉与局部断点。
    fillHex(p, C.phosphor, 0.12 * lock);
    p.rect(SCREEN.x + 2, stuckY - 2, SCREEN.w - 4, 0.8);
    fillHex(p, C.mint, 0.08 * lock);
    p.rect(SCREEN.x + 2, stuckY + 3, SCREEN.w - 4, 0.8);
    for (let i = 0; i < 5; i++) {
      const x = SCREEN.x + 28 + hash2(i, 11, 73) * (SCREEN.w - 70);
      fillHex(p, i % 2 ? C.cream : C.phosphor, 0.18 * lock);
      p.rect(x, stuckY + (i % 3) * 4 - 2, 5 + hash2(i, 12, 73) * 22, 1);
    }
  }

  // 字符块光标：随 10Hz 时钟闪，卡屏时仍然呼吸。
  const on = Math.floor(t * 10) % 6 < 4;
  const cx = SCREEN.x + SCREEN.w - 54;
  const cy = SCREEN.y + SCREEN.h - 22;
  if (on) {
    fillHex(p, C.phosphor, 0.75);
    p.rect(cx, cy, 7, 10);
    fillHex(p, C.cream, 0.25);
    p.rect(cx + 1.2, cy + 1, 4.2, 1.2);
  } else {
    fillHex(p, C.mint, 0.22);
    p.rect(cx, cy, 7, 10);
  }

  // WHY? 出现时的局部绿色荧光
  if (whyGlow > 0.002) {
    fillHex(p, C.mint, 0.05 * whyGlow);
    p.ellipse(SCREEN.x + 178, SCREEN.y + 135, 160, 48);
    fillHex(p, C.cream, 0.025 * whyGlow);
    p.ellipse(SCREEN.x + 178, SCREEN.y + 135, 92, 24);
  }

  // 屏幕边缘的暗角，不做大范围模糊。
  p.noFill();
  strokeHex(p, C.bgDeep, 0.54);
  p.strokeWeight(10);
  p.rect(SCREEN.x + 5, SCREEN.y + 5, SCREEN.w - 10, SCREEN.h - 10, 4);
  strokeHex(p, C.mint, 0.06);
  p.strokeWeight(1);
  p.rect(SCREEN.x + 8, SCREEN.y + 8, SCREEN.w - 16, SCREEN.h - 16, 3);

  p.pop();
}

function drawTerminalBase(p, hold) {
  p.push();
  p.noStroke();
  // 总线以下还能看到的控制台下半身。
  fillHex(p, C.cabinetDeep, 0.98);
  p.rect(516, 524, 404, 118, 6);
  fillHex(p, C.cabinet, 0.9);
  p.rect(522, 532, 392, 94, 4);
  strokeHex(p, C.edge, 0.32);
  p.strokeWeight(1);
  p.noFill();
  p.rect(522, 532, 392, 94, 4);

  for (let i = 0; i < 13; i++) {
    fillHex(p, C.cabinetDeep, 0.65);
    p.rect(548 + i * 26, 548, 18, 2);
    p.rect(548 + i * 26, 554, 18, 1.4);
  }

  // 旋钮与拨杆
  for (let i = 0; i < 3; i++) {
    const x = 676 + i * 56;
    const y = 590;
    fillHex(p, C.bgDeep, 0.6);
    p.ellipse(x + 2, y + 3, 25, 25);
    fillHex(p, C.cabinetLight, 0.8);
    p.ellipse(x, y, 23, 23);
    strokeHex(p, C.brassDark, 0.55);
    p.strokeWeight(1);
    p.ellipse(x, y, 17, 17);
    const a = -0.9 + i * 0.7 + Math.sin(hold * 0.3 + i) * 0.08;
    strokeHex(p, C.creamDim, 0.6);
    p.strokeWeight(1.2);
    p.line(x, y, x + Math.cos(a) * 8, y + Math.sin(a) * 8);
  }
  for (let i = 0; i < 5; i++) {
    const x = 550 + i * 20;
    fillHex(p, C.brassDark, 0.55);
    p.rect(x - 3, 578, 6, 12, 1);
    fillHex(p, i === 3 ? C.emberHot : C.cabinetDeep, 0.8);
    p.ellipse(x, 576, 2.4, 2.4);
  }
  for (const [sx, sy] of [
    [530, 540],
    [904, 540],
    [530, 616],
    [904, 616]
  ]) {
    screw(p, sx, sy, 2.2);
  }
  p.pop();
}

function drawKeyboard(p, hold) {
  p.push();
  p.noStroke();

  // 键盘底座：老式终端的一整块斜面托盘。
  fillHex(p, C.bgDeep, 0.48);
  p.rect(KEYB.x + 8, KEYB.y + 9, KEYB.w, KEYB.h + 8, 7);
  fillHex(p, C.cabinetDeep, 1);
  p.beginShape();
  p.vertex(KEYB.x + 38, KEYB.y);
  p.vertex(KEYB.x + KEYB.w - 32, KEYB.y);
  p.vertex(KEYB.x + KEYB.w, KEYB.y + KEYB.h);
  p.vertex(KEYB.x, KEYB.y + KEYB.h);
  p.endShape(p.CLOSE);
  fillHex(p, C.cabinet, 0.94);
  p.beginShape();
  p.vertex(KEYB.x + 43, KEYB.y + 4);
  p.vertex(KEYB.x + KEYB.w - 37, KEYB.y + 4);
  p.vertex(KEYB.x + KEYB.w - 5, KEYB.y + KEYB.h - 6);
  p.vertex(KEYB.x + 6, KEYB.y + KEYB.h - 6);
  p.endShape(p.CLOSE);
  strokeHex(p, C.edge, 0.34);
  p.strokeWeight(1.2);
  p.noFill();
  p.beginShape();
  p.vertex(KEYB.x + 38, KEYB.y);
  p.vertex(KEYB.x + KEYB.w - 32, KEYB.y);
  p.vertex(KEYB.x + KEYB.w, KEYB.y + KEYB.h);
  p.vertex(KEYB.x, KEYB.y + KEYB.h);
  p.endShape(p.CLOSE);

  // 四排键。轻微透视：越往下越宽。
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  for (let row = 0; row < 4; row++) {
    const y = KEYB.y + 18 + row * 17;
    const inset = 50 - row * 7;
    const x0 = KEYB.x + inset;
    const x1 = KEYB.x + KEYB.w - inset;
    const count = 12;
    const gap = 4;
    const kw = (x1 - x0 - gap * (count - 1)) / count;
    for (let k = 0; k < count; k++) {
      const kx = x0 + k * (kw + gap);
      const lit = hash2(k, row, 117) > 0.78;
      fillHex(p, lit ? C.teal : C.cabinetDeep, lit ? 0.82 : 0.92);
      p.rect(kx, y, kw, 11, 1.3);
      fillHex(p, C.wallLight, lit ? 0.14 : 0.08);
      p.rect(kx + 1, y + 1, kw - 2, 1.2, 1);
      fillHex(p, C.bgDeep, 0.38);
      p.rect(kx + 1, y + 9, kw - 2, 1.2, 1);
      if (lit) {
        fillHex(p, C.emberHot, 0.55);
        p.ellipse(kx + kw - 4, y + 3.2, 1.4, 1.4);
      }
    }
  }
  const sy = KEYB.y + 18 + 4 * 17 + 2;
  fillHex(p, C.cabinetDeep, 0.96);
  p.rect(KEYB.x + 76, sy, KEYB.w - 152, 10, 2);
  fillHex(p, C.wallLight, 0.08);
  p.rect(KEYB.x + 79, sy + 1.5, KEYB.w - 158, 1);
  // 键盘前沿的指示灯
  fillHex(p, C.mint, 0.5);
  p.ellipse(KEYB.x + KEYB.w - 34, sy + 4, 2.2, 2.2);
  fillHex(p, C.emberHot, 0.6);
  p.ellipse(KEYB.x + KEYB.w - 25, sy + 4, 2.2, 2.2);

  // 键盘底部与主机的几根连线。
  p.noFill();
  strokeHex(p, C.wallLight, 0.18);
  p.strokeWeight(1.2);
  p.line(KEYB.x + 12, KEYB.y + KEYB.h - 4, KEYB.x - 28, KEYB.y + KEYB.h + 28);
  p.line(KEYB.x + KEYB.w - 12, KEYB.y + KEYB.h - 4, KEYB.x + KEYB.w + 22, KEYB.y + KEYB.h + 22);
  strokeHex(p, C.mint, 0.06);
  p.strokeWeight(0.8);
  p.line(KEYB.x + 18, KEYB.y + KEYB.h - 4, KEYB.x - 20, KEYB.y + KEYB.h + 24);
  p.pop();
}

// ---------- 规则树 ----------

function rulePose(card, hold, exit) {
  const drop = smoothstep(card.start, card.start + 0.45, hold);
  const drift = hash2(card.seed, 21) - 0.5;
  const lift = exit * (22 + hash2(card.seed, 22) * 34);
  return {
    x: card.x + drift * 34 * exit + exit * 28,
    y: card.y - (1 - drop) * 62 + lift,
    w: card.w,
    h: card.h,
    alpha: drop,
    spin: (1 - drop) * (drift > 0 ? 0.18 : -0.18) + drift * 0.06,
    drop
  };
}

function drawArrowHead(p, x, y, angle, size, color, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.noStroke();
  fillHex(p, color, alpha);
  p.triangle(0, 0, -size, -size * 0.52, -size, size * 0.52);
  p.pop();
}

function drawRuleLink(p, points, alpha, color = C.mint) {
  if (alpha <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, C.bgDeep, 0.55 * alpha);
  p.strokeWeight(3.4);
  p.beginShape();
  for (const [x, y] of points) p.vertex(x + 1.2, y + 1.5);
  p.endShape();
  strokeHex(p, color, 0.36 * alpha);
  p.strokeWeight(1.5);
  p.beginShape();
  for (const [x, y] of points) p.vertex(x, y);
  p.endShape();
  strokeHex(p, C.cream, 0.13 * alpha);
  p.strokeWeight(0.8);
  p.beginShape();
  for (const [x, y] of points) p.vertex(x - 0.5, y - 0.5);
  p.endShape();
  p.pop();
}

function dashedLine(p, x0, y0, x1, y1, alpha, color = C.cream) {
  if (alpha <= 0.002) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const dash = 4.5;
  const gap = 4;
  p.push();
  strokeHex(p, color, alpha);
  p.strokeWeight(1.1);
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    p.line(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
  }
  p.pop();
}

function drawRuleCard(p, card, pose, alpha, lit, flip) {
  if (alpha <= 0.002) return;
  const w = card.w;
  const h = card.h;
  const x = pose.x;
  const y = pose.y;
  const showBack = flip > 0.5;
  const sx = Math.max(0.035, Math.abs(Math.cos(flip * Math.PI)));
  const flash = Math.sin(flip * Math.PI);
  const label = showBack && card.back ? card.back : card.label;
  const border = showBack ? C.ember : C.brassLight;
  const face = showBack ? '#1c1711' : '#0b211c';

  p.push();
  p.translate(x, y);
  p.rotate(pose.spin);
  p.scale(sx, 1);

  p.noStroke();
  // 卡片透出的荧光与落影，层叠低 alpha，不用模糊。
  fillHex(p, lit ? C.ember : C.brassDark, (lit ? 0.055 : 0.035) * alpha);
  p.rect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 3);
  fillHex(p, C.bgDeep, 0.45 * alpha);
  p.rect(-w / 2 + 3, -h / 2 + 4, w, h, 3);

  fillHex(p, C.brassDeep, 0.95 * alpha);
  p.rect(-w / 2, -h / 2, w, h, 2.5);
  fillHex(p, face, 0.97 * alpha);
  p.rect(-w / 2 + 2.3, -h / 2 + 2.3, w - 4.6, h - 4.6, 1.6);

  p.noFill();
  strokeHex(p, border, (0.62 + flash * 0.25) * alpha);
  p.strokeWeight(1.25);
  p.rect(-w / 2, -h / 2, w, h, 2.5);
  strokeHex(p, showBack ? C.red : C.brass, 0.28 * alpha);
  p.strokeWeight(0.8);
  p.rect(-w / 2 + 2.2, -h / 2 + 2.2, w - 4.4, h - 4.4, 1.4);

  // 内部扫描纹
  strokeHex(p, C.phosphor, 0.045 * alpha);
  p.strokeWeight(0.7);
  p.line(-w / 2 + 7, -h / 2 + 7, w / 2 - 7, -h / 2 + 7);
  p.line(-w / 2 + 7, h / 2 - 7, w / 2 - 7, h / 2 - 7);

  // 四角铆钉
  p.noStroke();
  for (const [rx, ry] of [
    [-w / 2 + 5.5, -h / 2 + 5.5],
    [w / 2 - 5.5, -h / 2 + 5.5],
    [-w / 2 + 5.5, h / 2 - 5.5],
    [w / 2 - 5.5, h / 2 - 5.5]
  ]) {
    fillHex(p, C.brassDark, 0.95 * alpha);
    p.ellipse(rx, ry, 4.2, 4.2);
    fillHex(p, C.creamDim, 0.52 * alpha);
    p.ellipse(rx - 0.7, ry - 0.8, 1.4, 1.2);
  }

  // 节点灯
  const lamp = showBack ? C.red : lit ? C.mint : C.brassDark;
  fillHex(p, lamp, (lit || showBack ? 0.9 : 0.36) * alpha);
  p.ellipse(w / 2 - 8, -h / 2 + 8, 3.2, 3.2);
  if (lit || showBack) {
    fillHex(p, lamp, 0.1 * alpha);
    p.ellipse(w / 2 - 8, -h / 2 + 8, 10, 10);
  }

  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  if (card.sub && !showBack) {
    p.textSize(6.2);
    fillHex(p, C.creamDim, 0.56 * alpha);
    p.text(card.sub, 0, -h / 2 + 8);
    p.textSize(11.5);
    fillHex(p, lit ? C.ink : C.phosphor, 0.9 * alpha);
    p.text(label, 0, 2.5);
  } else {
    p.textSize(label.length > 4 ? 9.2 : 11.5);
    fillHex(p, showBack ? C.cream : lit ? C.ink : C.phosphor, 0.92 * alpha);
    p.text(label, 0, 0.5);
  }
  p.textStyle(p.NORMAL);
  p.pop();
}

function drawAnswerBox(p, alpha, glow) {
  if (alpha <= 0.002) return;
  const { x, y, w, h } = ANSWER;
  p.push();
  p.translate(x, y);
  p.noStroke();
  fillHex(p, C.brassDeep, 0.8 * alpha);
  p.rect(-w / 2, -h / 2, w, h, 2);
  fillHex(p, '#0a1e18', 0.96 * alpha);
  p.rect(-w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5, 1.5);
  fillHex(p, C.mint, (0.035 + glow * 0.05) * alpha);
  p.rect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 3);
  p.noFill();
  strokeHex(p, C.brassLight, 0.78 * alpha);
  p.strokeWeight(1.4);
  p.rect(-w / 2, -h / 2, w, h, 2);
  strokeHex(p, C.mint, (0.28 + glow * 0.42) * alpha);
  p.strokeWeight(0.9);
  p.rect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 1);
  p.noStroke();
  fillHex(p, C.emberHot, 0.78 * alpha);
  p.ellipse(w / 2 - 9, -h / 2 + 9, 3, 3);
  fillHex(p, C.ember, 0.08 * alpha);
  p.ellipse(w / 2 - 9, -h / 2 + 9, 10, 10);
  p.textFont('monospace');
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(13);
  fillHex(p, C.ink, 0.94 * alpha);
  p.text('TRUE', 0, 0.5);
  p.textStyle(p.NORMAL);
  p.pop();
}

function drawWhy(p, alpha, echo) {
  if (alpha <= 0.002) return;
  const { x, y, w, h } = WHY;
  p.push();
  p.translate(x, y);
  p.noStroke();

  // 余辉的几层错位字，低 alpha，不糊成一团。
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(15);
  fillHex(p, C.mint, 0.07 * alpha);
  p.text('WHY?', -5, -4);
  fillHex(p, C.cream, 0.055 * alpha);
  p.text('WHY?', 6, 5);

  fillHex(p, C.cream, 0.1 * alpha);
  p.rect(-w / 2 - 4, -h / 2 - 3, w + 8, h + 6, 2);
  fillHex(p, '#101c16', 0.88 * alpha);
  p.rect(-w / 2, -h / 2, w, h, 1.5);
  p.noFill();
  strokeHex(p, C.cream, 0.65 * alpha);
  p.strokeWeight(1.2);
  p.rect(-w / 2, -h / 2, w, h, 1.5);
  strokeHex(p, C.mint, 0.25 * alpha);
  p.strokeWeight(0.8);
  p.rect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 1);

  p.noStroke();
  fillHex(p, C.phosphor, 0.95 * alpha);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text('WHY?', 0, 0.5);
  p.textStyle(p.NORMAL);

  // 小引线连回答案框。
  if (echo > 0.002) {
    strokeHex(p, C.cream, 0.2 * alpha * echo);
    p.strokeWeight(0.8);
    p.line(-w / 2 - 1, -h / 2 + 4, -w / 2 - 14, -h / 2 - 2);
  }
  p.pop();
}

function drawGhostRules(p, hold, alpha) {
  if (alpha <= 0.002) return;
  p.push();
  p.noStroke();
  for (let i = 0; i < 16; i++) {
    const w = 34 + hash2(i, 51) * 70;
    const h = 14 + hash2(i, 52) * 19;
    const x = SCREEN.x + 14 + hash2(i, 53) * (SCREEN.w - 28 - w);
    const y = SCREEN.y + 18 + hash2(i, 54) * (SCREEN.h - 34);
    const a = (0.03 + hash2(i, 55) * 0.055) * alpha;
    p.push();
    p.translate(x + w / 2, y + h / 2);
    p.rotate((hash2(i, 56) - 0.5) * 0.22);
    fillHex(p, i % 4 === 0 ? C.ember : C.brassDark, a);
    p.rect(-w / 2, -h / 2, w, h, 1.5);
    p.noFill();
    strokeHex(p, i % 3 === 0 ? C.cream : C.mint, a * 1.5);
    p.strokeWeight(0.7);
    p.rect(-w / 2, -h / 2, w, h, 1.5);
    p.noStroke();
    fillHex(p, C.mint, a * 1.3);
    p.rect(-w / 2 + 4, -h / 2 + 4, w * 0.32, 1.1);
    p.pop();
  }
  p.pop();
}

function drawRuleTree(p, t, hold, exit) {
  const poses = CARDS.map((card) => rulePose(card, hold, exit));
  const fade = 1 - smoothstep(4.0, 4.9, t);
  const ghostAlpha = smoothstep(2.8, 3.0, hold) * (1 - smoothstep(4.0, 4.55, t));
  const reverse = smoothstep(2.7, 2.98, hold);
  const loop = smoothstep(2.82, 2.98, hold);
  const whyIn = smoothstep(2.66, 2.84, hold);
  const answerIn = smoothstep(2.32, 2.54, hold);
  const flipTrue = smoothstep(2.78, 2.92, hold);
  const flipThen = smoothstep(2.86, 2.98, hold);
  const litIf = smoothstep(0.9, 1.25, hold);
  const litThen = smoothstep(2.1, 2.35, hold);
  const litTrue = smoothstep(2.45, 2.65, hold) * (1 - smoothstep(2.8, 3.0, hold) * 0.55);
  const litFalse = smoothstep(2.82, 2.98, hold);

  drawGhostRules(p, hold, ghostAlpha);

  // 线路连接：从 IF 分到 THEN，再分到 TRUE/FALSE，最后落到答案。
  const ifP = poses[0];
  const thenP = poses[1];
  const trueP = poses[2];
  const falseP = poses[3];
  const linkA = Math.min(ifP.alpha, thenP.alpha) * (1 - smoothstep(4.0, 4.4, t));
  drawRuleLink(
    p,
    [
      [ifP.x + 10, ifP.y + ifP.h / 2],
      [ifP.x + 10, ifP.y + ifP.h / 2 + 7],
      [thenP.x - thenP.w / 2 - 9, thenP.y - 4],
      [thenP.x - thenP.w / 2, thenP.y - 4]
    ],
    linkA,
    C.mint
  );
  drawArrowHead(p, thenP.x - thenP.w / 2 + 1, thenP.y - 4, 0, 5.2, C.cream, 0.65 * linkA);

  const linkB = Math.min(thenP.alpha, trueP.alpha) * (1 - smoothstep(4.0, 4.4, t));
  drawRuleLink(
    p,
    [
      [thenP.x - 18, thenP.y + thenP.h / 2],
      [trueP.x + 18, trueP.y - trueP.h / 2]
    ],
    linkB,
    C.mint
  );
  drawArrowHead(
    p,
    trueP.x + 18,
    trueP.y - trueP.h / 2 + 1,
    Math.PI / 2,
    5.4,
    C.mint,
    0.66 * linkB
  );

  const linkC = Math.min(thenP.alpha, falseP.alpha) * (1 - smoothstep(4.0, 4.4, t));
  drawRuleLink(
    p,
    [
      [thenP.x + 22, thenP.y + thenP.h / 2],
      [falseP.x, falseP.y - falseP.h / 2]
    ],
    linkC,
    C.brass
  );
  drawArrowHead(
    p,
    falseP.x,
    falseP.y - falseP.h / 2 + 1,
    Math.PI / 2,
    5.2,
    C.brassLight,
    0.55 * linkC
  );

  const answerAlpha = answerIn * (1 - smoothstep(4.0, 4.65, t));
  drawRuleLink(
    p,
    [
      [trueP.x - 8, trueP.y + trueP.h / 2],
      [trueP.x - 26, answerIn > 0.02 ? ANSWER.y - ANSWER.h / 2 - 2 : trueP.y + trueP.h / 2 + 20]
    ],
    Math.min(trueP.alpha, answerIn) * 0.8 * (1 - smoothstep(4.0, 4.4, t)),
    C.creamDim
  );
  drawArrowHead(
    p,
    trueP.x - 26,
    ANSWER.y - ANSWER.h / 2 - 1,
    Math.PI / 2,
    4.6,
    C.creamDim,
    0.55 * answerAlpha
  );

  // 反向推理链：一条从答案往回走的虚线。
  if (reverse > 0.002) {
    const ra = 0.44 * reverse * (1 - smoothstep(4.0, 4.45, t));
    dashedLine(p, ANSWER.x + 30, ANSWER.y - ANSWER.h / 2, trueP.x - 6, trueP.y + trueP.h / 2, ra, C.cream);
    dashedLine(p, trueP.x + 4, trueP.y - trueP.h / 2, thenP.x - 18, thenP.y + thenP.h / 2, ra, C.cream);
    dashedLine(p, thenP.x + 4, thenP.y - thenP.h / 2, ifP.x + 8, ifP.y + ifP.h / 2, ra, C.emberHot);
    drawArrowHead(p, ifP.x + 8, ifP.y + ifP.h / 2 + 4, -Math.PI / 2, 5.2, C.emberHot, ra * 1.2);

    // 从答案绕到屏幕右侧，再回到 IF：把“为什么”反问整棵规则树读出来。
    const ret = 0.26 * reverse * (1 - smoothstep(4.0, 4.45, t));
    const retX = 764;
    const retY = ANSWER.y - 4;
    dashedLine(p, ANSWER.x + ANSWER.w / 2 - 4, retY, retX, retY, ret, C.creamDim);
    dashedLine(p, retX, retY, retX, ifP.y + ifP.h / 2, ret, C.creamDim);
    dashedLine(p, retX, ifP.y + ifP.h / 2, ifP.x + ifP.w / 2 + 8, ifP.y + ifP.h / 2, ret, C.emberHot);
    drawArrowHead(
      p,
      ifP.x + ifP.w / 2 + 8,
      ifP.y + ifP.h / 2,
      Math.PI,
      5,
      C.emberHot,
      ret * 1.3
    );

    // 往回的边用小圆点标出来，别再加箭头雨。
    p.noStroke();
    for (let i = 0; i < 3; i++) {
      fillHex(p, i === 1 ? C.emberHot : C.cream, 0.16 * ra);
      p.ellipse(ANSWER.x + 38 + i * 8, ANSWER.y - 5, 1.6, 1.6);
    }
  }

  // 卡片本体：TRUE 卡会翻面成 FALSE。
  for (let i = 0; i < CARDS.length; i++) {
    const card = CARDS[i];
    const pose = poses[i];
    const flip =
      card.id === 'true' ? flipTrue : card.id === 'then' ? flipThen : 0;
    const lit =
      card.id === 'if'
        ? litIf
        : card.id === 'then'
          ? litThen
          : card.id === 'true'
            ? litTrue
            : litFalse;
    drawRuleCard(p, card, pose, pose.alpha * fade, lit, flip);
  }

  // 答案框：比规则卡晚出现，给“自信的结论”。
  const answerDrop = (1 - answerIn) * 18;
  p.push();
  p.translate(0, answerDrop);
  drawAnswerBox(p, answerAlpha, smoothstep(2.55, 2.9, hold) * (1 - smoothstep(4.0, 4.5, t)));
  p.pop();

  // FALSE 卡的自指回环。用采样点折线代替 bezierVertex：
  // p5 2.x 对只有 bezier 段的开口 endShape 也会读空内部点。
  if (loop > 0.002) {
    const a = loop * (1 - smoothstep(4.0, 4.45, t));
    const loopPts = [
      [31, 2], [45, -2], [53, -12], [54, -24], [47, -33],
      [35, -36], [23, -34], [14, -27], [13, -18], [20, -13], [27, -15]
    ];
    p.push();
    p.noFill();
    strokeHex(p, C.bgDeep, 0.6 * a);
    p.strokeWeight(3.8);
    p.beginShape();
    for (const [dx, dy] of loopPts) p.vertex(falseP.x + dx, falseP.y + dy);
    p.endShape();
    strokeHex(p, C.red, 0.58 * a);
    p.strokeWeight(1.3);
    p.beginShape();
    for (const [dx, dy] of loopPts) p.vertex(falseP.x + dx, falseP.y + dy);
    p.endShape();
    drawArrowHead(p, falseP.x + 17, falseP.y - 17, 1.1, 5.4, C.cream, 0.55 * a);
    p.pop();
  }

  // WHY? 从答案旁边浮出，随后停住。
  if (whyIn > 0.002) {
    const whyFade = 1 - smoothstep(4.0, 4.7, t);
    drawWhy(
      p,
      whyIn * whyFade,
      smoothstep(2.82, 3.0, hold) * (1 - smoothstep(4.0, 4.5, t))
    );
    // 主角与 WHY? 之间的一小段虚线，表示它停在这里。
    const linkY = WHY.y - 1;
    dashedLine(p, 535, linkY, WHY.x - WHY.w / 2 - 4, linkY, 0.22 * whyIn * whyFade, C.creamDim);
  }

  // 离场：卡片往总线方向散成小点，屏幕只留 WHY? 的余辉。
  if (exit > 0.002) {
    p.push();
    p.noStroke();
    for (let i = 0; i < CARDS.length * 7; i++) {
      const ci = i % CARDS.length;
      const pose = poses[ci];
      const q = hash2(i, 61);
      const px = pose.x + (q - 0.5) * 92 * exit + 22 * exit;
      const py = pose.y + 44 * exit + hash2(i, 62) * 52 * exit;
      fillHex(p, i % 5 === 0 ? C.emberHot : C.mint, (0.12 + hash2(i, 63) * 0.22) * exit * (1 - smoothstep(4.9, 5.5, t)));
      p.ellipse(px, py, 1.1 + q * 1.7, 1.1 + q * 1.7);
    }
    p.pop();
  }

  // 定格后余留在屏幕边缘的 WHY? 残影。
  const after = smoothstep(4.65, 5.35, t);
  if (after > 0.002) {
    p.push();
    p.textFont('monospace');
    p.textAlign(p.RIGHT, p.BOTTOM);
    p.textStyle(p.BOLD);
    p.textSize(9);
    fillHex(p, C.creamDim, 0.13 * after);
    p.text('WHY?', SCREEN.x + SCREEN.w - 18, SCREEN.y + SCREEN.h - 16);
    p.textStyle(p.NORMAL);
    p.pop();
  }
}

// ---------- 总线 / 路 ----------

function drawBusPulses(p, t, fade) {
  if (fade <= 0.01) return;
  const step = Math.floor(t * 10);
  p.push();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(7);
  for (let i = 0; i < 14; i++) {
    const lane = i % 3;
    const speed = 17 + lane * 5;
    const x = (i * 83 + step * speed + hash2(i, lane, 71) * 60) % 1000;
    const y = [483, 495, 505, 517][i % 4];
    const bit = BITS[(i * 3 + step) % BITS.length];
    fillHex(p, i % 4 === 0 ? C.emberHot : C.mint, (0.25 + hash2(i, lane, 72) * 0.32) * fade);
    p.text(bit, x, y);
    fillHex(p, i % 4 === 0 ? C.ember : C.mint, 0.05 * fade);
    p.ellipse(x, y, 16, 6);
  }
  p.pop();
}

function drawBus(p, t) {
  const exit = smoothstep(4.05, 5.45, t);
  const normal = 1 - exit;
  p.push();
  p.noStroke();

  // 完全覆盖默认路面带，边缘是深色母线与铜色卡扣。
  fillHex(p, '#091d18', 1);
  p.rect(0, ROAD_TOP, 1000, ROAD_BOTTOM - ROAD_TOP);
  fillHex(p, '#0d2a23', 0.94);
  p.rect(0, ROAD_TOP + 3, 1000, ROAD_BOTTOM - ROAD_TOP - 6);
  fillHex(p, C.bgDeep, 0.78);
  p.rect(0, ROAD_TOP, 1000, 4);
  p.rect(0, ROAD_BOTTOM - 4, 1000, 4);
  fillHex(p, C.mint, 0.1 * normal);
  p.rect(0, ROAD_TOP + 4, 1000, 1);
  fillHex(p, C.brassDark, 0.55 * normal);
  p.rect(0, ROAD_BOTTOM - 6, 1000, 1.2);

  // 并行细线。它们就是“路”的触面。
  const lanes = [479, 487, 495, 503, 511, 519];
  for (let i = 0; i < lanes.length; i++) {
    const y = lanes[i];
    strokeHex(p, i % 3 === 0 ? C.brass : C.mint, (i % 3 === 0 ? 0.18 : 0.11) * normal);
    p.strokeWeight(i === 2 || i === 3 ? 1 : 0.7);
    p.line(0, y, 1000, y);
  }
  strokeHex(p, C.cream, 0.08 * normal);
  p.strokeWeight(0.6);
  p.line(0, 499.5, 1000, 499.5);

  // 左侧从第 10 版块的线束收成扁平排线。
  const loom = 0.55 + hash2(Math.floor(t * 10), 3) * 0.18;
  p.push();
  p.noFill();
  for (let i = 0; i < 7; i++) {
    const y0 = 447 + i * 16;
    const y1 = ROAD_MID - 19 + (i % 4) * 11;
    strokeHex(p, i === 3 ? C.brass : C.cabinet, 0.32 * normal * loom);
    p.strokeWeight(i === 3 ? 2.2 : 1.2);
    p.beginShape();
    p.vertex(-18, y0 - 18);
    p.vertex(20, y0 - 8);
    p.vertex(74, ROAD_MID);
    p.vertex(96, y1 + 3);
    p.endShape();
  }
  p.pop();

  // 微型焊点与拧紧的卡扣
  p.noStroke();
  for (let i = 0; i < 16; i++) {
    const x = 24 + i * 62;
    fillHex(p, C.brassDark, 0.36 * normal);
    p.rect(x, 473, 5, 1.2);
    fillHex(p, C.mint, 0.13 * normal);
    p.rect(x + 1, 525, 3, 1);
  }

  // 节点灯：慢速呼吸；和主角接触的节点由 drawActor 补。
  const step = Math.floor(t * 10);
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 118;
    const lit = hash2(i, step, 73) > 0.6;
    fillHex(p, C.bgDeep, 0.86 * normal);
    p.ellipse(x, ROAD_MID, 7, 7);
    fillHex(p, lit ? C.mint : C.brassDark, (lit ? 0.52 : 0.34) * normal);
    p.ellipse(x, ROAD_MID, 3.8, 3.8);
    if (lit) {
      fillHex(p, C.mint, 0.06 * normal);
      p.ellipse(x, ROAD_MID, 18, 8);
    }
  }

  drawBusPulses(p, t, normal);

  // 总线即将变成统计坐标纸 / 散点。
  if (exit > 0.002) {
    fillHex(p, '#071b16', 0.76 * exit);
    p.rect(0, ROAD_TOP + 1, 1000, ROAD_BOTTOM - ROAD_TOP - 2);

    // 坐标格
    p.strokeWeight(0.7);
    for (let x = 0; x <= 1000; x += 20) {
      strokeHex(p, C.mint, (x % 100 === 0 ? 0.16 : 0.055) * exit);
      p.line(x, ROAD_TOP + 3, x, ROAD_BOTTOM - 3);
    }
    for (let y = ROAD_TOP + 9; y < ROAD_BOTTOM; y += 9) {
      strokeHex(p, C.mint, (y === ROAD_MID ? 0.19 : 0.05) * exit);
      p.line(0, y, 1000, y);
    }
    strokeHex(p, C.cream, 0.18 * exit);
    p.strokeWeight(0.9);
    p.line(0, ROAD_MID, 1000, ROAD_MID);
    for (let x = 0; x <= 1000; x += 100) {
      strokeHex(p, C.creamDim, 0.16 * exit);
      p.line(x, ROAD_MID - 3, x, ROAD_MID + 3);
    }

    // 统计散点
    p.noStroke();
    for (const s of SCATTER) {
      fillHex(p, s.warm ? C.emberHot : C.mint, s.a * exit);
      p.ellipse(s.x, s.y, s.r, s.r);
      if (s.warm) {
        fillHex(p, C.ember, 0.06 * exit);
        p.ellipse(s.x, s.y, s.r * 5, s.r * 5);
      }
    }
    // 右侧进入下一版块的统计基线段
    for (let i = 0; i < 4; i++) {
      const y = ROAD_TOP + 12 + i * 12;
      strokeHex(p, C.mint, 0.1 * exit);
      p.strokeWeight(0.8);
      p.line(850, y, 1000, y);
    }
  }

  p.pop();
}

// ---------- 主角：规则标签 ----------

function drawActorToken(p, rawT, state) {
  const qt = Math.floor(clamp(rawT, 0, 6) * 10) / 10;
  const hold = Math.min(qt, 3);
  const exit = smoothstep(4.0, 5.35, rawT);
  const appear = smoothstep(0, 0.45, rawT);
  const flipToBack = smoothstep(2.8, 2.94, hold);
  const flipBack = smoothstep(4.0, 4.48, rawT);
  const flip = flipToBack * (1 - flipBack);
  const faceBack = flip > 0.5;
  const sx = Math.max(0.035, Math.abs(Math.cos(flip * Math.PI)));
  const loop = smoothstep(2.78, 3.0, hold) * (1 - smoothstep(4.0, 4.55, rawT));
  const appearScale = 0.82 + 0.18 * appear;
  const exitScale = 1 - 0.9 * smoothstep(4.18, 5.35, rawT);

  // 主角画在 state.x 的世界坐标上；不在这里减版块偏移后当世界 x。
  p.push();
  p.translate(state.x, ROAD_MID);
  p.scale(appearScale * exitScale);

  p.noStroke();
  // 总线节点：卡片下沿的接触点。
  fillHex(p, C.mint, 0.07 * appear);
  p.ellipse(0, 0, 64, 18);
  strokeHex(p, C.cream, 0.45 * appear);
  p.strokeWeight(1);
  p.noFill();
  p.ellipse(0, 0, 23, 8);
  p.noStroke();
  fillHex(p, C.cream, 0.9 * appear);
  p.ellipse(0, 0, 5, 3);
  fillHex(p, C.emberHot, 0.7 * appear);
  p.ellipse(0, 0, 2.2, 1.5);

  // 推理回环：在总线上绕出一小圈，主角停在 WHY? 旁边。
  if (loop > 0.002) {
    p.push();
    p.noFill();
    strokeHex(p, C.bgDeep, 0.5 * loop);
    p.strokeWeight(4);
    p.ellipse(15, -1, 154, 26);
    strokeHex(p, C.creamDim, 0.34 * loop);
    p.strokeWeight(1);
    p.ellipse(15, -1, 154, 26);
    strokeHex(p, C.emberHot, 0.45 * loop);
    p.strokeWeight(1);
    p.line(-64, -3, -77, -7);
    p.line(-64, 1, -77, 5);
    p.line(91, -3, 104, -7);
    p.line(91, 1, 104, 5);
    p.pop();
  }

  // 卡片在总线上的投影
  p.noStroke();
  fillHex(p, C.bgDeep, 0.36 * appear);
  p.ellipse(4, -24, 70, 13);
  fillHex(p, C.ember, 0.04 * appear);
  p.ellipse(0, -40, 94, 70);

  // 来回滑动的一点残影：不是第二主角，只是翻面/回退留下的边。
  if (loop > 0.002) {
    p.push();
    p.translate(-15 - 18 * loop, -41);
    p.noFill();
    strokeHex(p, C.cream, 0.1 * loop);
    p.strokeWeight(1);
    p.rect(-27, -20, 54, 40, 3);
    p.translate(30 + 22 * loop, -3);
    strokeHex(p, C.brassLight, 0.08 * loop);
    p.rect(-25, -18, 50, 36, 3);
    p.pop();
  }

  // 卡片本体：黄铜边、荧光 IF/FALSE、四角铆钉、中心火种。
  p.push();
  p.translate(0, -42);
  p.rotate(-0.018 + Math.sin(hold * 7.5) * 0.012);
  p.scale(sx, 1);

  const tw = 64;
  const th = 46;
  const border = faceBack ? C.ember : C.brassLight;

  // 光晕与边缘
  p.noStroke();
  fillHex(p, C.ember, 0.045 * appear);
  p.rect(-tw / 2 - 7, -th / 2 - 7, tw + 14, th + 14, 5);
  fillHex(p, C.bgDeep, 0.4 * appear);
  p.rect(-tw / 2 + 3, -th / 2 + 5, tw, th, 4);
  fillHex(p, C.brassDeep, 0.98 * appear);
  p.rect(-tw / 2, -th / 2, tw, th, 3.5);
  fillHex(p, faceBack ? '#1d1711' : '#0b211b', 0.98 * appear);
  p.rect(-tw / 2 + 2.6, -th / 2 + 2.6, tw - 5.2, th - 5.2, 2.4);

  p.noFill();
  strokeHex(p, border, 0.78 * appear);
  p.strokeWeight(1.4);
  p.rect(-tw / 2, -th / 2, tw, th, 3.5);
  strokeHex(p, faceBack ? C.redDim : C.brass, 0.36 * appear);
  p.strokeWeight(0.8);
  p.rect(-tw / 2 + 3.2, -th / 2 + 3.2, tw - 6.4, th - 6.4, 1.8);

  // 四角小铆钉（由第 10 版块的铜坠收成）
  p.noStroke();
  for (const [rx, ry] of [
    [-tw / 2 + 6, -th / 2 + 6],
    [tw / 2 - 6, -th / 2 + 6],
    [-tw / 2 + 6, th / 2 - 6],
    [tw / 2 - 6, th / 2 - 6]
  ]) {
    fillHex(p, C.brassDark, 0.96 * appear);
    p.ellipse(rx, ry, 4.6, 4.6);
    fillHex(p, C.creamDim, 0.58 * appear);
    p.ellipse(rx - 0.8, ry - 0.8, 1.5, 1.3);
  }

  // 中心火种：与第 10 版块同一颗暖赭。
  fillHex(p, C.bgDeep, 0.95 * appear);
  p.ellipse(0, -7, 16, 16);
  fillHex(p, C.ember, 0.28 * appear);
  p.ellipse(0, -7, 12, 12);
  fillHex(p, C.emberHot, 0.95 * appear);
  p.ellipse(-0.5, -7.5, 6.5, 7.2);
  fillHex(p, C.emberCore, 0.96 * appear);
  p.ellipse(-1.2, -8.3, 2.5, 2.8);
  p.noFill();
  strokeHex(p, C.emberHot, 0.3 * appear);
  p.strokeWeight(0.8);
  p.ellipse(0, -7, 18, 18);

  // 短标记
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(12);
  fillHex(p, faceBack ? C.cream : C.ink, 0.92 * appear);
  p.text(faceBack ? 'FALSE' : 'IF', 0, -17);
  p.textStyle(p.NORMAL);

  // 火种闪过的一瞬
  if (hold > 2.92) {
    fillHex(p, C.emberCore, 0.07 * appear);
    p.ellipse(0, -7, 27, 27);
  }
  p.pop();

  // 从卡片下沿连到总线节点的短脚。
  p.strokeCap(p.ROUND);
  strokeHex(p, C.brassDark, 0.8 * appear);
  p.strokeWeight(2);
  p.line(0, -19, 0, -2);
  strokeHex(p, C.creamDim, 0.35 * appear);
  p.strokeWeight(0.8);
  p.line(-2, -18, -2, -4);
  p.strokeCap(p.ROUND);

  // 离场：缩成一颗小火种。
  if (exit > 0.4) {
    const dot = smoothstep(4.5, 5.35, rawT);
    p.noStroke();
    fillHex(p, C.emberCore, 0.8 * dot);
    p.ellipse(0, -40, 5 - dot * 2.2, 5 - dot * 2.2);
    fillHex(p, C.ember, 0.12 * dot);
    p.ellipse(0, -40, 30, 30);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + Math.floor(rawT * 10) * 0.07;
      fillHex(p, i % 2 ? C.mint : C.emberHot, 0.22 * dot);
      p.ellipse(Math.cos(a) * (20 + i * 8), -40 + Math.sin(a) * (12 + i * 4), 1.6, 1.6);
    }
  }

  p.pop();
}

// ---------- 标题 ----------

function drawEraBand(p, alpha) {
  if (alpha <= 0.002) return;
  const x = 300;
  const y = 402;
  const w = 180;
  const h = 18;
  p.push();
  p.noStroke();
  fillHex(p, '#f3e3bc', 0.7 * alpha);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  fillHex(p, C.mint, 0.12 * alpha);
  p.rect(x - w / 2 + 2, y - h / 2 + 1, w - 4, 1.2, 1);
  p.noFill();
  strokeHex(p, C.brassLight, 0.4 * alpha);
  p.strokeWeight(0.9);
  p.rect(x - w / 2, y - h / 2, w, h, 2);
  p.pop();
}

function drawAtmosphere(p) {
  // 上下暗角 + CRT 溢出的绿色环境光，全部是低 alpha 叠层。
  linearWash(
    p,
    0,
    170,
    0,
    780,
    [
      [0, 'rgba(1,7,6,0.32)'],
      [0.22, 'rgba(1,7,6,0)'],
      [0.76, 'rgba(1,7,6,0)'],
      [1, 'rgba(0,3,2,0.36)']
    ],
    0,
    0,
    1000,
    1000
  );
  p.noStroke();
  fillHex(p, C.mint, 0.012);
  p.ellipse(780, 360, 520, 380);
  fillHex(p, C.ember, 0.008);
  p.ellipse(620, 500, 380, 70);
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    const hold = Math.min(t, 3);
    const exit = smoothstep(4.0, 5.45, t);

    p.push();
    p.noStroke();
    drawRoom(p);
    drawRoomEquipment(p, hold);
    drawTerminalShell(p, hold);
    drawTapeDeck(p, hold);
    drawTerminalBase(p, hold);
    drawScreenBackdrop(p, hold);
    drawRuleTree(p, t, hold, exit);
    drawKeyboard(p, hold);
    drawScreenAfterglow(
      p,
      t,
      hold,
      smoothstep(2.66, 2.95, hold) * (1 - smoothstep(4.0, 4.6, t))
    );
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
    // 主调度给原始 localT；总线脉冲要在钩子内自行压到 10Hz。
    const t = Math.floor(clamp(state.localT || 0, 0, 6) * 10) / 10;
    p.push();
    drawBus(p, t);
    p.pop();
  },

  drawActor(p, state) {
    const rawT = clamp(state.localT || 0, 0, 6);
    p.push();
    drawActorToken(p, rawT, state);
    p.pop();
  }
};
