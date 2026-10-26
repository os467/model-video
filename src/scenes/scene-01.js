import { fillHex, strokeHex } from '../kit/palette.js';
import { clamp, hash2, mulberry32, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// TASK10/R1：计数与刻痕。
// 石头按旋转后的真实尖端接触骨面；5 次凿击逐次生成短刻痕。
// 旧组 1/2 低对比预置，当前动作刻完第 3 组，再跨组刻 4/5。
// 刻痕躺平在骨面上：右端深圆、左端收尖，槽心贴 y=612，石身在上方，
// 8.0 时最后一道槽的大部分仍露在石尖左侧。
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

// 标题卡只属于当前版块：镜头会提前看到下一段，不能让下一段标题
// 在上一段就入镜。globalT 缺失时退回 blockIndex。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

const MARKS_BASE_Y = 612;
const NOTCH_PITCH = 12;
// 把整组凿刻工作区从过右的 624–756 拉回到标题右侧 330–463，
// 既保留第 1 版块已验收的构图，又能在 8.0 高光帧看到刻痕。
const WORK_X = -294;

// 燧石局部尖端 (0, 36) 经 scale(1.12) 后的真实长度。
// 接触公式：
//   tipX = x - sin(rot) * TIP_LEN
//   tipY = y + cos(rot) * TIP_LEN
// 反解时 x = tipX + sin(rot) * TIP_LEN，y = tipY - cos(rot) * TIP_LEN。
const TIP_LEN = 36 * 1.12;

// 工作区放在镜头后半段仍能看到的位置：localT 5.2 时镜头中心已到 x≈1087，
// 若沿用 x=86..353 的旧坐标，整组刻痕会在 10.20 验收帧前移出画面。
const GROUPS = [
  { x: 330, count: 1, old: true },
  { x: 358, count: 2, old: true },
  { x: 399, count: 3, old: false },
  { x: 451, count: 2, old: false }
];

// 横向楔形槽：沿水平长 11.6–12.2（1080p 约 22–23px），高 3.7–3.9（约 7px）。
// x 是右端深槽（真实尖端落点），槽体向左收尖；dy 让槽心落在 612±0.5，
// 角度的反向偏移正好被 dy 抵消，整道槽都停在骨面基线上。
// 组内节距 12，组间 28–29；旧组 1/2 静止，第 3 组刻完冷却，4/5 保持新鲜。
const STRIKES = [
  { x: 399, t: 0.78, len: 12.0, height: 5.8, angle: -0.055, dy: 0.35, tap: 1 },
  { x: 411, t: 1.10, len: 12.3, height: 6.0, angle: 0.070, dy: -0.25, tap: 2 },
  { x: 423, t: 1.42, len: 11.8, height: 5.6, angle: -0.030, dy: 0.45, tap: 1 },
  { x: 451, t: 2.54, len: 12.1, height: 5.9, angle: 0.095, dy: -0.35, tap: 2 },
  { x: 463, t: 2.80, len: 11.9, height: 5.8, angle: -0.060, dy: 0.30, tap: 1 }
];

// 旧组：祖先已经刻好的 1、2，静止、低对比、不产生骨屑。
// 右端深槽仍按组内节距 12 排开；长度/角度做手工抖动。
const OLD_NOTCHES = (() => {
  const out = [];
  for (const group of GROUPS) {
    if (!group.old) continue;
    for (let i = 0; i < group.count; i++) {
      const idx = out.length;
      out.push({
        x: group.x + i * NOTCH_PITCH,
        len: 11.5 + hash2(idx, 1, 21) * 0.8,
        height: 5.1 + hash2(idx, 2, 22) * 0.5,
        angle: -0.05 + hash2(idx, 3, 23) * 0.10,
        dy: -0.45 + hash2(idx, 4, 24) * 0.9
      });
    }
  }
  return out;
})();

// 燧石尖端轨迹。前 4 项是下落/对准，之后每次凿击都有：
// 接触 -> 二次下压 -> 抬起 8–12 -> 弧线前移。
// 3.0–4.0 定格；4.2–5.2 抬离画面。
const TIP_KEYS = [
  { t: 0.00, x: 660, y: 498, rot: 0.140 },
  { t: 0.42, x: 678, y: 548, rot: 0.070 },
  { t: 0.58, x: 693, y: 598, rot: 0.020 },
  { t: 0.72, x: 693, y: 601, rot: 0.015 },
  { t: 0.78, x: 693, y: 612, rot: -0.030 },
  { t: 0.88, x: 693, y: 612, rot: -0.030 },
  { t: 0.96, x: 693, y: 606, rot: -0.030 },
  { t: 1.01, x: 695, y: 602, rot: -0.005 },
  { t: 1.06, x: 700, y: 602, rot: 0.030 },
  { t: 1.10, x: 705, y: 612, rot: 0.040 },
  { t: 1.20, x: 705, y: 612, rot: 0.040 },
  { t: 1.26, x: 705, y: 606, rot: 0.040 },
  { t: 1.31, x: 709, y: 602, rot: 0.010 },
  { t: 1.37, x: 713, y: 604, rot: -0.010 },
  { t: 1.42, x: 717, y: 612, rot: -0.020 },
  { t: 1.52, x: 717, y: 612, rot: -0.020 },
  { t: 1.60, x: 717, y: 604, rot: -0.020 },
  { t: 1.80, x: 724, y: 600, rot: 0.020 },
  { t: 2.10, x: 738, y: 601, rot: 0.040 },
  { t: 2.38, x: 745, y: 603, rot: 0.050 },
  { t: 2.50, x: 745, y: 608, rot: 0.050 },
  { t: 2.54, x: 745, y: 612, rot: 0.050 },
  { t: 2.64, x: 745, y: 612, rot: 0.050 },
  { t: 2.70, x: 745, y: 605, rot: 0.050 },
  { t: 2.76, x: 750, y: 601, rot: -0.010 },
  { t: 2.80, x: 757, y: 612, rot: -0.040 },
  { t: 2.94, x: 757, y: 612, rot: -0.040 },
  // 收尾不再钉死 1 秒：沿刻痕做两次很轻的“验刻”，再加速离场。
  { t: 3.12, x: 761, y: 604, rot: -0.020 },
  { t: 3.34, x: 772, y: 610, rot: 0.000 },
  { t: 3.58, x: 790, y: 604, rot: 0.010 },
  { t: 3.82, x: 812, y: 610, rot: 0.020 },
  { t: 4.00, x: 830, y: 606, rot: 0.020, scale: 1.0 },
  { t: 4.20, x: 870, y: 604, rot: 0.020, scale: 0.98 },
  { t: 4.60, x: 960, y: 602, rot: 0.010, scale: 0.84 },
  { t: 5.10, x: 1090, y: 598, rot: 0.020, scale: 0.60 },
  { t: 5.60, x: 1210, y: 606, rot: 0.020, scale: 0.36 },
  { t: 6.00, x: 1294, y: 630, rot: 0.020, scale: 0.12 }
];

// 尖端关键帧整体套用同一工作区偏移，避免逐项漏改。
for (const key of TIP_KEYS) key.x += WORK_X;

// 骨屑：固定 seed、固定重力，只在每次接触/二次下压时从槽口两侧生成。
const CHIPS = (() => {
  const out = [];
  const GRAVITY = 520;
  for (let si = 0; si < STRIKES.length; si++) {
    const s = STRIKES[si];
    const impacts = [
      { t: s.t, n: 2 },
      { t: s.t + 0.08, n: 1 }
    ];
    for (let ii = 0; ii < impacts.length; ii++) {
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < impacts[ii].n; k++) {
          const seed = 900 + si * 37 + ii * 11 + (side > 0 ? 5 : 0) + k;
          out.push({
            t: impacts[ii].t,
            x: s.x + side * (2.4 + hash2(seed, 2, 42) * 3.2),
            y: MARKS_BASE_Y + 1.5,
            vx: side * (24 + hash2(seed, 3, 43) * 34),
            vy: -(55 + hash2(seed, 4, 44) * 80),
            gravity: GRAVITY,
            life: 0.30 + hash2(seed, 5, 45) * 0.24,
            size: 1.0 + hash2(seed, 6, 46) * 1.5,
            tone: hash2(seed, 7, 47)
          });
        }
      }
    }
  }
  return out;
})();

// 四条骨面裂纹，固定 seed，模块加载时生成一次。
const CRACKS = (() => {
  const rng = mulberry32(5903);
  const starts = [
    { x: 60, y: 160, a: 0.5, n: 5 },
    { x: 940, y: 210, a: 2.6, n: 5 },
    { x: 120, y: 800, a: 4.2, n: 4 },
    { x: 860, y: 760, a: 3.4, n: 4 }
  ];
  const out = [];
  for (const s of starts) {
    let x = s.x;
    let y = s.y;
    let a = s.a;
    const pts = [{ x, y }];
    for (let k = 0; k < s.n; k++) {
      a += (rng() - 0.5) * 0.5;
      x += Math.cos(a) * (14 + rng() * 18);
      y += Math.sin(a) * (14 + rng() * 18);
      pts.push({ x, y });
    }
    out.push(pts);
  }
  return out;
})();

// 标题区保持安静：越靠近标题卡，背景颗粒越淡。
function titleCalm(x, y) {
  const dx = Math.max(0, Math.abs(x - 300) - 135);
  const dy = Math.max(0, Math.abs(y - 362) - 90);
  return 0.28 + 0.72 * smoothstep(0, 120, Math.max(dx, dy));
}

function drawBoneBackground(p) {
  p.noStroke();
  fillHex(p, C.bone, 1);
  p.rect(-400, 0, 1800, 1000);

  // 骨面颗粒：短横纹 + 小孔；标题区降对比。
  for (let i = 0; i < 360; i++) {
    const x = -120 + hash2(i, 1) * 1240;
    const y = 190 + hash2(i, 2) * 620;
    const calm = titleCalm(x, y);
    if (i % 4 === 0) {
      fillHex(p, C.boneShade, (0.06 + hash2(i, 3) * 0.08) * calm);
      p.ellipse(x, y, 2 + hash2(i, 4) * 5, 1 + hash2(i, 4) * 4);
    } else {
      fillHex(p, i % 3 ? C.boneShade : C.ink, (0.035 + hash2(i, 3) * 0.07) * calm);
      p.ellipse(x, y, 6 + hash2(i, 4) * 24, 0.8 + hash2(i, 4) * 1.6);
    }
  }

  // 骨面裂纹
  p.noFill();
  strokeHex(p, C.ink, 0.18);
  p.strokeWeight(1.2);
  for (const pts of CRACKS) {
    p.beginShape();
    for (const pt of pts) p.vertex(pt.x, pt.y);
    p.endShape();
  }
}

// 横线只保留两条极淡骨纹，并在工作区断开，不再形成页面网格。
function drawBoneStriations(p) {
  const ys = [540, 700];
  for (let s = 0; s < 2; s++) {
    const baseY = ys[s];
    strokeHex(p, C.ink, s === 0 ? 0.022 : 0.018);
    p.strokeWeight(1.1);
    p.noFill();
    for (let seg = 0; seg < 2; seg++) {
      const x0 = seg === 0 ? -400 : 518;
      const x1 = seg === 0 ? 284 : 1400;
      p.beginShape();
      for (let x = x0; x <= x1; x += 40) {
        p.vertex(x, baseY + Math.sin(x * 0.006 + s * 1.7) * 2.2);
      }
      p.endShape();
    }
  }
}

// 竖向页面网格改成不规则短斜骨纤维。
function drawBoneFibers(p) {
  p.strokeWeight(1);
  for (let i = 0; i < 24; i++) {
    const x = -120 + hash2(i, 5, 71) * 1240;
    const y = 300 + hash2(i, 6, 72) * 500;
    if (x > 281 && x < 521 && y > 545 && y < 685) continue;
    if (x > 140 && x < 465 && y > 255 && y < 465) continue;
    const len = 8 + hash2(i, 7, 73) * 14;
    const a = -1.1 + hash2(i, 8, 74) * 2.2;
    strokeHex(p, i % 4 === 0 ? C.ink : C.boneShade, 0.018 + hash2(i, 9, 75) * 0.017);
    p.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
  }
}

// 工作区先垫一层弱化骨色补丁，确保任何背景线不会穿过槽口。
function drawWorkPatch(p) {
  p.noStroke();
  fillHex(p, C.bone, 0.18);
  p.rect(284, 536, 230, 156, 24);
  fillHex(p, C.bone, 0.22);
  p.rect(296, 548, 206, 132, 18);
  fillHex(p, C.bone, 0.26);
  p.rect(308, 560, 182, 108, 12);
  fillHex(p, C.bone, 0.30);
  p.rect(320, 572, 158, 84, 8);
  fillHex(p, C.boneLight, 0.05);
  p.rect(332, 582, 134, 64, 6);
}

// 短横向/斜向楔形槽：右端深圆（石尖落点）、左端收尖。
// 暗芯 + 下唇亮边 + 上唇暗边；旧槽低对比，新槽下唇亮、槽底带暖色反光。
function drawNotch(p, deepX, y, angle, len, height, strength, heat) {
  if (len < 0.6 || height < 0.4 || strength <= 0.01) return;
  const half = len * 0.5;
  const hh = height * 0.5;
  const bowlR = Math.min(hh * 1.1, len * 0.30);
  const bowlC = half - bowlR;
  const tailX = -half;
  const span = bowlC - tailX;
  const coreA = (0.72 + 0.14 * heat) * strength;

  p.push();
  p.translate(deepX - Math.cos(angle) * half, y);
  p.rotate(angle);

  // 槽体暗芯：右端半圆深勺，向左收成细尖。
  p.noStroke();
  fillHex(p, C.ink, coreA);
  p.beginShape();
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI * 0.5 + (Math.PI * i) / steps;
    p.vertex(bowlC + Math.cos(a) * bowlR, Math.sin(a) * hh * 0.96);
  }
  p.vertex(bowlC - span * 0.42, hh * 0.72);
  p.vertex(bowlC - span * 0.78, hh * 0.34);
  p.vertex(tailX, 0.16);
  p.vertex(tailX + 0.35, -0.12);
  p.vertex(bowlC - span * 0.74, -hh * 0.30);
  p.vertex(bowlC - span * 0.36, -hh * 0.68);
  p.endShape(p.CLOSE);

  // 深勺内芯：右端读成“被凿进去的圆坑”，不是平涂条。
  p.noStroke();
  fillHex(p, C.ink, 0.32 * strength + 0.18 * heat);
  p.ellipse(bowlC - 0.15, 0.15, bowlR * 1.8, hh * 1.35);
  fillHex(p, C.rust, 0.18 * strength + 0.16 * heat);
  p.ellipse(bowlC + 0.1, hh * 0.45, bowlR * 1.1, hh * 0.55);
  // 槽底暖色反光，只在新槽出现。
  fillHex(p, C.rust, 0.05 + 0.12 * heat);
  p.ellipse(bowlC + 0.15, hh * 0.28, 1.5, 0.7);

  // 上唇暗边：沿槽口上缘，压住骨面高光。
  strokeHex(p, C.ink, 0.16 + 0.20 * heat);
  p.strokeWeight(1.05);
  p.noFill();
  p.beginShape();
  p.vertex(tailX + 0.5, -0.15);
  p.vertex(bowlC - span * 0.74, -hh * 0.36);
  p.vertex(bowlC - span * 0.34, -hh * 0.74);
  p.vertex(bowlC, -hh * 0.98);
  p.endShape();

  // 下唇亮边：贴着下缘，越靠深勺越亮；不画顶盖、不做白帽。
  strokeHex(p, C.boneLight, 0.10 + 0.55 * heat);
  p.strokeWeight(1.15);
  p.beginShape();
  p.vertex(tailX + 0.55, 0.38);
  p.vertex(bowlC - span * 0.72, hh * 0.46);
  p.vertex(bowlC - span * 0.38, hh * 0.82);
  p.vertex(bowlC + 0.15, hh * 1.01);
  p.endShape();

  // 被挤起的下唇骨色小鼓包，帮助读成“槽在骨面里”。
  p.noStroke();
  fillHex(p, C.boneLight, 0.08 + 0.16 * heat);
  p.ellipse(bowlC - span * 0.30, hh + 0.85, len * 0.34, 0.9);

  // 新槽口 1–2 粒细骨屑/亮口，旧槽不画。
  if (heat > 0.45) {
    fillHex(p, C.boneLight, 0.30 * heat);
    p.ellipse(tailX + span * 0.52, hh * 0.55 + 0.55, 1.0, 0.7);
    fillHex(p, C.rustLight, 0.22 * heat);
    p.ellipse(bowlC - span * 0.16, hh + 0.45, 0.9, 0.6);
  }
  p.pop();
}

function drawChips(p, t) {
  p.noStroke();
  for (let i = 0; i < CHIPS.length; i++) {
    const c = CHIPS[i];
    const age = t - c.t;
    if (age < 0 || age >= c.life) continue;
    const k = age / c.life;
    const x = c.x + c.vx * age;
    let y = c.y + c.vy * age + 0.5 * c.gravity * age * age;
    if (y > c.y + 2.5) y = c.y + 2.5;
    const fade = (1 - k) * (1 - k);
    const color = c.tone < 0.55 ? C.boneLight : c.tone < 0.8 ? C.boneShade : C.rustLight;
    fillHex(p, color, 0.25 + 0.55 * fade);
    const size = c.size * (1 - 0.35 * k);
    p.ellipse(x, y, size, size * 0.8);
  }
}

function strikeHeat(index, t) {
  // 第 3 组（前三次凿击）在 7.4 仍清晰，到 8.0 冷却成旧组对比；
  // 第 4/5 道保持新鲜，10.2 前才开始冷却。
  if (index < 3) {
    return 0.18 + 0.82 * (1 - smoothstep(2.15, 3.0, t));
  }
  return 0.22 + 0.78 * (1 - smoothstep(4.0, 5.0, t));
}

function drawGroups(p, t) {
  // 旧组 1、2：一直存在，低对比，无骨屑。
  for (let i = 0; i < OLD_NOTCHES.length; i++) {
    const n = OLD_NOTCHES[i];
    drawNotch(
      p, n.x, MARKS_BASE_Y + n.dy, n.angle, n.len, n.height, 0.55, 0
    );
  }

  // 新刻：q 由凿击时间驱动，q=0 时完全不画；只从右端生长，槽尾向左拖出。
  for (let i = 0; i < STRIKES.length; i++) {
    const s = STRIKES[i];
    const q = smoothstep(s.t, s.t + 0.10, t);
    if (q <= 0.001) continue;
    const q2 = smoothstep(s.t + 0.08, s.t + 0.16, t);
    const len = s.len * (0.30 + 0.70 * q) * (1 + 0.02 * q2);
    const height = s.height * (0.62 + 0.38 * q) * (1 + 0.05 * q2);
    const heat = strikeHeat(i, t);
    const strength = 0.5 + 0.5 * heat;
    drawNotch(
      p, s.x, MARKS_BASE_Y + s.dy, s.angle, len, height, strength, heat
    );
  }

  drawChips(p, t);
}

function pulse(t, start, rise, fall) {
  return (
    smoothstep(start, start + rise, t) *
    (1 - smoothstep(start + rise + 0.012, start + rise + fall, t))
  );
}

function strikePress(t) {
  let press = 0;
  for (let i = 0; i < STRIKES.length; i++) {
    const s = STRIKES[i];
    // 第一次接触
    press = Math.max(press, pulse(t, s.t, 0.028, 0.062));
    // 二次凿击，峰值比第一次更高
    press = Math.max(press, pulse(t, s.t + 0.08, 0.024, 0.056) * (1.02 + 0.09 * s.tap));
  }
  // 3.0–4.0 定格，石尖仍压在最后槽口。
  if (t >= 2.94 && t <= 3.95) {
    press = Math.max(press, 0.82);
  } else if (t > 3.95 && t < 4.15) {
    press = Math.max(press, 0.82 * (1 - smoothstep(3.95, 4.15, t)));
  }
  return clamp(press, 0, 1.3);
}

function tipKeyAt(t) {
  let a = TIP_KEYS[0];
  if (t <= a.t) {
    return { x: a.x, y: a.y, rot: a.rot, scale: a.scale ?? 1 };
  }
  for (let i = 1; i < TIP_KEYS.length; i++) {
    const b = TIP_KEYS[i];
    if (t <= b.t) {
      const k = smoothstep(a.t, b.t, t);
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        rot: a.rot + (b.rot - a.rot) * k,
        scale: (a.scale ?? 1) + ((b.scale ?? 1) - (a.scale ?? 1)) * k
      };
    }
    a = b;
  }
  return { x: a.x, y: a.y, rot: a.rot, scale: a.scale ?? 1 };
}

function flintPose(t) {
  const key = tipKeyAt(t);
  const press = strikePress(t);
  // 屏幕 y 向下，下压就是让尖端 y 略大于骨面基线。
  const pressDepth = press > 0 ? 0.8 + 3.2 * press : 0;
  const tipXDesired = key.x;
  const tipYDesired = key.y + pressDepth;
  const scale = key.scale ?? 1;
  const tipLen = TIP_LEN * scale;

  const rot = key.rot;
  const x = tipXDesired + Math.sin(rot) * tipLen;
  const y = tipYDesired - Math.cos(rot) * tipLen;

  // 用最终变换反解真实尖端，影子/接触判断都跟它走。
  const tipX = x - Math.sin(rot) * tipLen;
  const tipY = y + Math.cos(rot) * tipLen;
  const lift = Math.max(0, MARKS_BASE_Y - tipY);

  let strikeIndex = -1;
  for (let i = 0; i < STRIKES.length; i++) {
    if (t >= STRIKES[i].t) strikeIndex = i;
  }
  const chipAge = strikeIndex >= 0
    ? clamp((t - STRIKES[strikeIndex].t) / 0.62, 0, 1)
    : 1;

  return {
    x,
    y,
    rot,
    press,
    tipX,
    tipY,
    lift,
    scale,
    contact: lift < 0.4 || (press > 0.025 && lift < 1.0),
    strikeIndex,
    chipAge
  };
}

function drawFlint(p, pose) {
  // 影子跟真实尖端走；接触时收紧，抬起时变大变淡。
  const lift = pose.lift;
  const shadowW = Math.min(38, 9.5 + lift * 0.9);
  const shadowH = Math.min(5.5, 2.6 + lift * 0.045);
  const shadowA = clamp(0.10 + 0.17 * pose.press - lift * 0.001, 0.022, 0.30);
  // 石尖升得很高/退出画面时，影子跟着消失，避免骨面留下孤立暗斑。
  const shadowFade = 1 - smoothstep(60, 150, lift);
  p.noStroke();
  if (shadowFade > 0.01) {
    fillHex(p, C.ink, shadowA * shadowFade);
    p.ellipse(pose.tipX + 2.5, MARKS_BASE_Y + 3.0, shadowW, shadowH);
  }
  // 接触点：槽口暗芯 + 被压亮的下唇，不盖住整道槽。
  if (pose.press > 0.02) {
    fillHex(p, C.ink, 0.13 * pose.press);
    p.ellipse(pose.tipX - 0.6, MARKS_BASE_Y + 0.4, 5.0, 1.6);
    fillHex(p, C.boneLight, 0.20 * pose.press);
    p.ellipse(pose.tipX - 2.0, MARKS_BASE_Y + 2.0, 5.0, 1.2);
  }

  p.push();
  p.translate(pose.x, pose.y);
  p.rotate(pose.rot);
  p.scale(1.12 * pose.scale);

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

  // 下尖的刃口与接触火星
  strokeHex(p, C.boneLight, 0.8);
  p.strokeWeight(1.8);
  p.line(-4, 32, 4, 34);
  p.noStroke();
  fillHex(p, C.rust, 0.08 + 0.10 * pose.press);
  p.ellipse(0, 36, 11 - 2.5 * pose.press, 11 - 2.5 * pose.press);
  fillHex(p, C.rustLight, 0.55 + 0.35 * pose.press);
  p.ellipse(0, 36, 2.4, 2.4);
  if (pose.press > 0.75) {
    fillHex(p, C.boneLight, 0.5);
    p.ellipse(0, 36, 1.6, 1.6);
  }

  p.pop();

  // 退出时石身缩小，但火种不能跟着消失：留一颗独立的暖色核心，
  // 让第 2 版块的笔尖从同一个位置接上。
  const emberK = clamp(1 - pose.scale, 0, 1);
  if (emberK > 0.05) {
    p.noStroke();
    fillHex(p, C.rust, 0.10 + 0.18 * emberK);
    p.ellipse(pose.tipX, pose.tipY, 18 + 18 * emberK, 14 + 12 * emberK);
    fillHex(p, C.rustLight, 0.72 + 0.24 * emberK);
    p.ellipse(pose.tipX, pose.tipY, 3.4 + 2.2 * emberK, 3.4 + 2.2 * emberK);
  }
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = clamp(state.localT || 0, 0, 6);
    drawBoneBackground(p);
    drawBoneStriations(p);
    drawBoneFibers(p);
    drawWorkPatch(p);
    drawGroups(p, t);

    const showTitle =
      state.blockIndex === currentBlockAt(state.globalT, state.blockIndex);
    const titleAlpha = showTitle ? 1 - smoothstep(2.2, 2.8, t) : 0;
    if (titleAlpha > 0.002) {
      drawTitleCard(p, {
        ...META,
        number: META.id,
        x: 300,
        y: 362,
        alpha: titleAlpha
      });
    }
  },

  drawRoad(p) {
    // 盖掉默认路面，让整屏保持骨片；补回骨屑颗粒和短斜纤维。
    p.push();
    p.noStroke();
    fillHex(p, C.bone, 1);
    p.rect(0, 470, 1000, 60);
    for (let i = 0; i < 30; i++) {
      const x = hash2(i, 51) * 1000;
      const y = 474 + hash2(i, 52) * 52;
      fillHex(p, i % 3 ? C.boneShade : C.ink, 0.04 + hash2(i, 53) * 0.06);
      p.ellipse(x, y, 6 + hash2(i, 54) * 20, 1 + hash2(i, 54) * 1.5);
    }
    p.strokeWeight(1);
    for (let i = 0; i < 10; i++) {
      const x = hash2(i, 55, 61) * 1000;
      const y = 476 + hash2(i, 56, 62) * 48;
      const len = 8 + hash2(i, 57, 63) * 12;
      const a = -1.1 + hash2(i, 58, 64) * 2.2;
      strokeHex(p, C.boneShade, 0.02 + hash2(i, 59, 65) * 0.02);
      p.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    p.pop();
  },

  drawActor(p, state) {
    // 第 1 版块 origin=0；仍按统一公式把场景局部坐标放回世界坐标。
    const t = clamp(state.localT || 0, 0, 6);
    const blockOrigin = (state.blockIndex - 1) * 1000;
    const pose = flintPose(t);
    p.push();
    p.translate(blockOrigin, 0);
    drawFlint(p, pose);
    p.pop();
  }
};
