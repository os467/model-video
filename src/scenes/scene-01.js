import { fillHex, strokeHex } from '../kit/palette.js';
import { hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// TASK5：全屏骨片 + 尖燧石凿刻 + 1/2/3 递增刻痕组。
// 不再有拖拽尾巴；每一凿只留下一道倾斜深痕。
const C = {
  bone: '#e3d2b0',
  boneLight: '#f6eedc',
  boneShade: '#cbb58c',
  boneDark: '#a98e68',
  ink: '#33291f',
  inkSoft: '#5a4a3a',
  rust: '#a45f32',
  rustLight: '#c78648',
  flint: '#6f6a5e',
  flintLight: '#aaa396',
  flintDark: '#47433b'
};

const META = {
  id: 1,
  cn: '计数与刻痕',
  en: 'Counting & Notches',
  era: '约前 20000 · 旧石器',
  group: 'paper'
};

// 1、2、3 三组；左侧起始 x，组内间距 13
const GROUPS = [
  { x: 58, count: 1 },
  { x: 124, count: 2 },
  { x: 198, count: 3 }
];
const GROUP_SPACING = 13;
const MARKS_BASE_Y = 612;

function drawBoneBackground(p) {
  p.noStroke();
  fillHex(p, C.bone, 1);
  p.rect(-400, 0, 1800, 1000);

  // 骨面颗粒：短横纹 + 小孔
  for (let i = 0; i < 360; i++) {
    const x = -120 + hash2(i, 1) * 1240;
    const y = 190 + hash2(i, 2) * 620;
    if (i % 4 === 0) {
      fillHex(p, C.boneShade, 0.06 + hash2(i, 3) * 0.08);
      p.ellipse(x, y, 2 + hash2(i, 4) * 5, 1 + hash2(i, 4) * 4);
    } else {
      fillHex(p, i % 3 ? C.boneShade : C.ink, 0.035 + hash2(i, 3) * 0.07);
      p.ellipse(x, y, 6 + hash2(i, 4) * 24, 0.8 + hash2(i, 4) * 1.6);
    }
  }

  // 骨面裂纹
  const rng = mulberry32(5903);
  const starts = [
    { x: 60, y: 160, a: 0.5, n: 5 },
    { x: 940, y: 210, a: 2.6, n: 5 },
    { x: 120, y: 800, a: 4.2, n: 4 },
    { x: 860, y: 760, a: 3.4, n: 4 }
  ];
  for (const s of starts) {
    let x = s.x;
    let y = s.y;
    let a = s.a;
    p.noFill();
    strokeHex(p, C.ink, 0.2);
    p.strokeWeight(1.2);
    p.beginShape();
    p.vertex(x, y);
    for (let k = 0; k < s.n; k++) {
      a += (rng() - 0.5) * 0.5;
      x += Math.cos(a) * (14 + rng() * 18);
      y += Math.sin(a) * (14 + rng() * 18);
      p.vertex(x, y);
    }
    p.endShape();
  }
}

function drawGridHorizontal(p) {
  for (const y of [550, 610, 670, 730]) {
    strokeHex(p, C.ink, 0.03);
    p.strokeWeight(1);
    p.line(0, y, 1000, y);
  }
}

function markCenters() {
  const out = [];
  for (const group of GROUPS) {
    for (let i = 0; i < group.count; i++) {
      out.push(group.x + i * GROUP_SPACING);
    }
  }
  return out;
}

function drawGridVertical(p) {
  // 竖向刻度网格：靠近刻痕的地方直接断开，像被凿断
  const centers = markCenters();
  p.strokeWeight(1);
  for (let x = 20; x <= 980; x += 25) {
    const cut = centers.some((cx) => Math.abs(cx - x) < 16);
    strokeHex(p, C.ink, x % 100 === 0 ? 0.1 : 0.06);
    if (cut) {
      p.line(x, 520, x, 528);
      p.line(x, 624, x, 770);
    } else {
      p.line(x, 520, x, 770);
    }
  }
}

function drawChiselMark(p, x, baseY, angle, len, idx) {
  p.push();
  p.translate(x, baseY);
  p.rotate(angle);

  // 刻痕内光：赭色从切口里透出来
  strokeHex(p, C.rust, 0.05);
  p.strokeWeight(10);
  p.line(0, 4, 0, -len - 4);

  // 深痕的暗侧影
  strokeHex(p, C.ink, 0.13);
  p.strokeWeight(9);
  p.line(4, 3, 4, -len - 2);

  // 上宽下窄的深楔形刻痕
  p.noStroke();
  fillHex(p, C.ink, 0.84);
  p.beginShape();
  p.vertex(-4.6, 2);
  p.vertex(4.6, 2);
  p.vertex(2.6, -len * 0.55);
  p.vertex(1.2, -len);
  p.vertex(-1.2, -len);
  p.vertex(-2.6, -len * 0.55);
  p.endShape(p.CLOSE);

  // 毛糙的边缘
  p.strokeCap(p.ROUND);
  strokeHex(p, C.inkSoft, 0.5);
  p.strokeWeight(1.2);
  p.line(-3.4, 0, -2.1, -len);
  p.line(3.6, 0, 2.2, -len);

  // 被凿翻起来的骨刃口
  strokeHex(p, C.boneLight, 0.45);
  p.strokeWeight(1.2);
  p.line(-3.9, 2, -2.8, -len + 2);

  // 赭色细芯
  strokeHex(p, C.rust, 0.55);
  p.strokeWeight(1.4);
  p.line(1, -3, 1, -len + 3);

  // 骨屑/毛边
  p.noStroke();
  for (let k = 0; k < 4; k++) {
    const px = (hash2(idx, k, 14) - 0.5) * 11;
    const py = -hash2(idx, k, 13) * len;
    fillHex(p, k % 2 ? C.boneLight : C.ink, 0.35 + hash2(idx, k, 15) * 0.3);
    p.ellipse(px, py, 1.2 + hash2(idx, k, 16) * 2, 1 + hash2(idx, k, 16) * 1.6);
  }
  fillHex(p, C.boneLight, 0.55);
  p.ellipse(-2.4, -len + 1, 2.4, 1.4);
  fillHex(p, C.ink, 0.4);
  p.ellipse(3.2, 3, 1.8, 1.2);

  p.pop();
}

function drawGroups(p) {
  let idx = 0;
  for (const group of GROUPS) {
    for (let i = 0; i < group.count; i++) {
      const x = group.x + i * GROUP_SPACING;
      const angle = -0.16 + hash2(idx, 21) * 0.32;
      const len = 58 + hash2(idx, 22) * 16;
      drawChiselMark(p, x, MARKS_BASE_Y, angle, len, idx);
      idx++;
    }
  }
}

function drawJumpDust(p, stoneX) {
  // 只留跳起时扬起的几粒骨屑，不做拖拽线
  p.noStroke();
  for (let i = 0; i < 7; i++) {
    const u = hash2(i, 31);
    const x = 232 + u * 42;
    const y = 584 + hash2(i, 32) * 16;
    fillHex(p, i % 2 ? C.rustLight : C.boneShade, 0.18 + hash2(i, 33) * 0.2);
    p.ellipse(x, y, 1.2 + hash2(i, 34) * 2, 1.2 + hash2(i, 34) * 2);
  }
}

function drawFlint(p, t, x) {
  const wobble = Math.sin(t * 2.4);
  const lift = 28 + Math.abs(wobble) * 3;

  // 影子留在骨面上
  p.noStroke();
  fillHex(p, C.ink, 0.16);
  p.ellipse(x - 6, 614, 100, 12);

  drawJumpDust(p, x);

  p.push();
  p.translate(x, 582 - lift);
  p.rotate(0.08 + 0.03 * wobble);
  p.scale(1.12);

  // 燧石本体：一个带明显下尖的石片
  fillHex(p, C.flint, 1);
  strokeHex(p, C.ink, 0.9);
  p.strokeWeight(2.4);
  p.beginShape();
  const pts = [
    [-34, -8],
    [-28, -34],
    [-4, -50],
    [20, -44],
    [36, -24],
    [30, 2],
    [12, 10],
    [0, 36],
    [-16, 10]
  ];
  for (const [px, py] of pts) p.vertex(px, py);
  p.endShape(p.CLOSE);

  // 受光面
  p.noStroke();
  fillHex(p, C.flintLight, 0.45);
  p.beginShape();
  p.vertex(-28, -12);
  p.vertex(-22, -32);
  p.vertex(-2, -44);
  p.vertex(6, -36);
  p.vertex(-4, -18);
  p.vertex(-18, -4);
  p.endShape(p.CLOSE);

  // 右侧暗面，给燧石体积
  fillHex(p, C.flintDark, 0.35);
  p.beginShape();
  p.vertex(10, 8);
  p.vertex(30, 0);
  p.vertex(34, -22);
  p.vertex(20, -38);
  p.vertex(12, -16);
  p.endShape(p.CLOSE);

  // 石纹
  strokeHex(p, C.ink, 0.4);
  p.strokeWeight(1.2);
  p.line(-20, -36, -8, -18);
  p.line(18, -36, 8, -12);
  p.line(-26, -16, -14, -10);

  // 下尖的刃口与火星
  strokeHex(p, C.boneLight, 0.8);
  p.strokeWeight(1.8);
  p.line(-4, 32, 4, 34);
  fillHex(p, C.rust, 0.2);
  p.noStroke();
  p.ellipse(0, 36, 18, 18);
  fillHex(p, C.rustLight, 0.9);
  p.ellipse(0, 36, 3, 3);

  p.pop();
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = Math.max(0, Math.min(6, state.localT || 0));
    drawBoneBackground(p);
    drawGridHorizontal(p);
    drawGroups(p);
    drawGridVertical(p);
    drawTitleCard(p, {
      ...META,
      number: META.id,
      x: 300,
      y: 362,
      alpha: 1 - smoothstep(2.2, 2.8, t)
    });
  },

  drawRoad(p) {
    // 盖掉默认路面，让整屏保持骨片；补回被盖住的一小段网格
    p.noStroke();
    fillHex(p, C.bone, 1);
    p.rect(0, 470, 1000, 60);
    for (let i = 0; i < 26; i++) {
      const x = hash2(i, 41) * 1000;
      const y = 474 + hash2(i, 42) * 52;
      fillHex(p, i % 3 ? C.boneShade : C.ink, 0.04 + hash2(i, 43) * 0.06);
      p.ellipse(x, y, 6 + hash2(i, 44) * 20, 1 + hash2(i, 44) * 1.5);
    }
    p.strokeWeight(1);
    for (let x = 20; x <= 980; x += 25) {
      strokeHex(p, C.ink, x % 100 === 0 ? 0.06 : 0.035);
      p.line(x, 520, x, 530);
    }
  },

  drawActor(p, state) {
    drawFlint(p, state.t, state.x);
  }
};
