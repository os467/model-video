import { ROAD_Y } from '../beat/timeline.js';
import { fillHex, strokeHex } from '../kit/palette.js';
import { hash2, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';
import { puppetPose } from '../rig/puppet.js';

const C = {
  bg: '#050813',
  skyTop: '#030611',
  skyLow: '#07192b',
  cyan: '#63dfff',
  cyanSoft: '#2f8fa8',
  violet: '#8a7dff',
  white: '#eef8ff',
  ink: '#cfe8f5',
  dark: '#0a0f1a',
  strip: '#bfe8f7'
};

const META = {
  id: 19,
  cn: '智能体进入真实世界',
  en: 'Agents Enter the Real World',
  era: '2026',
  group: 'data'
};

function bezierPoint(p0, p1, p2, p3, u) {
  const v = 1 - u;
  return (
    v * v * v * p0 +
    3 * v * v * u * p1 +
    3 * v * u * u * p2 +
    u * u * u * p3
  );
}

function drawSky(p) {
  p.noStroke();
  for (let i = 0; i < 12; i++) {
    const y = 180 + i * 28;
    fillHex(p, i < 5 ? C.skyTop : C.skyLow, 0.5 + i * 0.03);
    p.rect(0, y, 1000, 30);
  }

  // 远处一枚全息环
  p.noFill();
  strokeHex(p, C.cyan, 0.13);
  p.strokeWeight(2);
  p.ellipse(820, 246, 104, 104);
  strokeHex(p, C.violet, 0.1);
  p.ellipse(820, 246, 78, 102);

  // 星点
  p.noStroke();
  for (let i = 0; i < 34; i++) {
    const x = 500 + hash2(i, 3) * 500;
    const y = 190 + hash2(i, 4) * 230;
    fillHex(p, i % 4 === 0 ? C.violet : C.cyan, 0.12 + hash2(i, 5) * 0.3);
    p.ellipse(x, y, 1 + hash2(i, 6) * 2, 1 + hash2(i, 6) * 2);
  }
}

function drawCity(p, t) {
  const buildings = [
    [510, 44, 190, 0.4],
    [568, 52, 290, 0.48],
    [634, 40, 150, 0.32],
    [688, 58, 330, 0.5],
    [760, 46, 230, 0.38],
    [820, 54, 300, 0.46],
    [888, 42, 180, 0.34],
    [944, 48, 260, 0.42]
  ];

  for (let b = 0; b < buildings.length; b++) {
    const [x, w, h, a] = buildings[b];
    const top = 500 - h;
    fillHex(p, b % 2 ? '#091728' : '#0a1422', 0.75);
    p.rect(x, top, w, h);
    strokeHex(p, b % 2 ? C.cyan : C.violet, a);
    p.strokeWeight(1.4);
    p.noFill();
    p.rect(x, top, w, h);

    // 天线
    if (b % 3 === 0) {
      p.line(x + w / 2, top, x + w / 2, top - 26);
      p.line(x + w / 2 - 6, top - 16, x + w / 2 + 6, top - 16);
    }

    // 窗格光点
    p.noStroke();
    for (let wy = top + 14; wy < 486; wy += 16) {
      for (let wx = x + 7; wx < x + w - 5; wx += 11) {
        const lit = hash2(wx, wy, b + 7) > 0.58;
        if (!lit) continue;
        fillHex(p, b % 2 ? C.cyan : C.violet, 0.18 + hash2(wx, wy, b + 9) * 0.35);
        p.rect(wx, wy, 2.5, 2.5);
      }
    }
  }

  // 城市地平线的几道微光
  strokeHex(p, C.cyan, 0.16);
  p.strokeWeight(1);
  p.line(500, 500, 1000, 500);
  for (let i = 0; i < 9; i++) {
    const x = 520 + hash2(i, 31) * 470;
    const h = 16 + hash2(i, 32) * 40;
    strokeHex(p, i % 2 ? C.cyan : C.violet, 0.13 + hash2(i, 33) * 0.18);
    p.line(x, 500, x, 500 - h);
  }
}

function drawStreams(p, t) {
  const streams = [
    [470, 352, 520, 250, 620, 250, 690, 300],
    [470, 398, 570, 330, 720, 280, 850, 320],
    [470, 438, 610, 430, 810, 340, 930, 392]
  ];

  for (let s = 0; s < streams.length; s++) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = streams[s];
    strokeHex(p, s % 2 ? C.violet : C.cyan, 0.24);
    p.strokeWeight(1.3);
    p.noFill();
    p.bezier(x0, y0, x1, y1, x2, y2, x3, y3);

    for (let k = 0; k < 6; k++) {
      const u = (t * 0.16 + k / 6 + s * 0.13) % 1;
      const x = bezierPoint(x0, x1, x2, x3, u);
      const y = bezierPoint(y0, y1, y2, y3, u);
      fillHex(p, s % 2 ? C.violet : C.cyan, 0.35);
      p.ellipse(x, y, 2 + hash2(k, s, 5) * 2, 2 + hash2(k, s, 5) * 2);
    }
  }
}

function drawProjectionCone(p, t) {
  p.noStroke();
  fillHex(p, C.cyan, 0.028);
  p.beginShape();
  p.vertex(500, 500);
  p.vertex(500, 200);
  p.vertex(900, 200);
  p.endShape(p.CLOSE);

  for (let y = 220; y < 500; y += 12) {
    const k = (500 - y) / 300;
    const xRight = 500 + k * 400;
    strokeHex(p, C.cyan, 0.035 + k * 0.025);
    p.strokeWeight(1);
    p.line(500, y, xRight, y);
  }

  strokeHex(p, C.cyan, 0.22);
  p.strokeWeight(1.2);
  p.line(500, 500, 500, 200);
  p.line(500, 500, 900, 200);
}

function drawScreenFrame(p, t, titleAlpha) {
  // 显示器外框
  strokeHex(p, C.cyan, 0.42);
  p.strokeWeight(2);
  p.line(60, 230, 500, 230);
  p.line(60, 230, 60, 500);
  p.line(500, 230, 500, 500);
  p.line(60, 500, 240, 500);
  p.line(360, 500, 500, 500);

  fillHex(p, '#06101a', 0.86);
  p.rect(72, 242, 416, 246);

  // 屏幕里的网格与代码行
  strokeHex(p, C.cyan, 0.1);
  p.strokeWeight(1);
  for (let x = 72; x <= 488; x += 26) p.line(x, 242, x, 488);
  for (let y = 242; y <= 488; y += 26) p.line(72, y, 488, y);

  for (let i = 0; i < 18; i++) {
    const y = 246 + i * 12;
    const x = 88 + hash2(i, 61) * 40;
    const len = 24 + hash2(i, 62) * 90;
    strokeHex(p, i % 3 === 0 ? C.violet : C.cyan, 0.16 + hash2(i, 63) * 0.2);
    p.strokeWeight(1.6);
    p.line(x, y, x + len, y);
  }

  // 右侧数据读数
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(9);
  for (let i = 0; i < 8; i++) {
    fillHex(p, C.cyan, 0.24);
    p.text(`0x${(hash2(i, 71) * 0xffff).toString(16).slice(0, 4)}`, 398, 250 + i * 14);
  }

  // 光标
  const blink = 0.35 + 0.35 * Math.sin(t * Math.PI * 2);
  fillHex(p, C.cyan, blink);
  p.rect(318, 430, 8, 12);

  // 从屏幕底部伸出的门槛
  fillHex(p, C.cyan, 0.12);
  p.rect(240, 492, 120, 16);
  strokeHex(p, C.cyan, 0.65);
  p.strokeWeight(2);
  p.line(240, 500, 360, 500);

  // 年代小字后面的全息标签
  if (titleAlpha > 0.002) {
    fillHex(p, C.strip, 0.55 * titleAlpha);
    p.rect(206, 392, 188, 24, 2);
    strokeHex(p, C.cyan, 0.4 * titleAlpha);
    p.strokeWeight(1);
    p.rect(206, 392, 188, 24, 2);
  }
}

function drawRoadDigital(p, t) {
  // 屏幕内的数字地面
  p.noStroke();
  fillHex(p, '#07111b', 1);
  p.rect(0, 500, 500, 46);

  strokeHex(p, C.cyan, 0.16);
  p.strokeWeight(1);
  for (let x = 0; x <= 500; x += 20) p.line(x, 500, x, 546);
  for (let y = 506; y <= 544; y += 12) p.line(0, y, 500, y);

  // 少量亮起的格
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(hash2(i, 81) * 24) * 20;
    const y = 506 + Math.floor(hash2(i, 82) * 3) * 12;
    if (hash2(i, 83) > 0.55) {
      fillHex(p, C.cyan, 0.18);
      p.rect(x + 2, y + 1, 16, 10);
    }
  }

  // 屏幕门槛的光
  fillHex(p, C.cyan, 0.08);
  p.rect(236, 496, 128, 50);
  strokeHex(p, C.cyan, 0.45);
  p.strokeWeight(2);
  p.line(240, 500, 360, 500);
}

function drawRoadCity(p, t) {
  // 人行道
  p.noStroke();
  fillHex(p, '#101827', 1);
  p.rect(500, 470, 500, 30);
  strokeHex(p, C.cyan, 0.3);
  p.strokeWeight(1.4);
  p.line(500, 500, 1000, 500);
  for (let x = 510; x < 1000; x += 40) {
    strokeHex(p, C.cyan, 0.1);
    p.strokeWeight(1);
    p.line(x, 470, x, 500);
  }

  // 街面
  fillHex(p, '#131a26', 1);
  p.rect(500, 500, 500, 46);
  strokeHex(p, C.cyan, 0.18);
  p.strokeWeight(1);
  for (let x = 500; x <= 1000; x += 50) p.line(x, 500, x, 546);
  p.line(500, 522, 1000, 522);
  p.line(500, 544, 1000, 544);

  // 车道虚线
  strokeHex(p, C.cyan, 0.28);
  p.strokeWeight(2);
  for (let x = 520; x < 1000; x += 48) p.line(x, 522, x + 22, 522);

  // 城市微光点
  p.noStroke();
  for (let i = 0; i < 26; i++) {
    const x = 510 + hash2(i, 91) * 480;
    const y = 505 + hash2(i, 92) * 34;
    fillHex(p, i % 3 ? C.cyan : C.violet, 0.14 + hash2(i, 93) * 0.3);
    p.ellipse(x, y, 1.5 + hash2(i, 94) * 2, 1.5 + hash2(i, 94) * 2);
  }

  // 全息门槛
  const pulse = 0.55 + 0.25 * Math.sin(t * Math.PI * 2);
  strokeHex(p, C.cyan, pulse);
  p.strokeWeight(2);
  p.line(500, 466, 500, 548);
  fillHex(p, C.cyan, 0.06);
  p.rect(492, 466, 16, 82);
  for (let y = 470; y < 548; y += 6) {
    strokeHex(p, C.cyan, 0.18);
    p.strokeWeight(1);
    p.line(492, y, 508, y);
  }

  // 人行道上的线框行人
  for (let i = 0; i < 3; i++) {
    const x = 638 + i * 112;
    const footY = 494;
    const headY = footY - 38;
    const swing = Math.sin(t * Math.PI * 2 + i * 1.7) * 3;
    strokeHex(p, C.cyan, 0.46);
    p.strokeWeight(1.2);
    p.noFill();
    p.ellipse(x, headY, 9, 9);
    p.line(x, headY + 5, x, footY - 16);
    p.line(x, footY - 16, x - 6 + swing, footY);
    p.line(x, footY - 16, x + 6 - swing, footY);
    p.line(x - 7, footY - 28, x + 7, footY - 28);
  }

  // 下方一条更远的车道与两辆线框车
  fillHex(p, '#0a1019', 0.85);
  p.rect(520, 552, 480, 34);
  strokeHex(p, C.cyan, 0.12);
  p.strokeWeight(1);
  p.line(520, 569, 1000, 569);
  for (let x = 540; x < 1000; x += 54) p.line(x, 569, x + 24, 569);

  for (let i = 0; i < 2; i++) {
    const x = 650 + i * 170;
    const y = 560;
    strokeHex(p, i ? C.violet : C.cyan, 0.3);
    p.strokeWeight(1.1);
    p.noFill();
    p.rect(x, y, 46, 12, 3);
    p.line(x + 8, y, x + 16, y - 7);
    p.line(x + 16, y - 7, x + 30, y - 7);
    p.line(x + 30, y - 7, x + 38, y);
    p.ellipse(x + 10, y + 12, 7, 7);
    p.ellipse(x + 36, y + 12, 7, 7);
  }
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = Math.max(0, Math.min(6, state.localT || 0));
    p.noStroke();
    fillHex(p, C.bg, 1);
    p.rect(0, 0, 1000, 1000);

    drawSky(p);
    drawCity(p, t);
    drawStreams(p, t);
    drawProjectionCone(p, t);

    const titleAlpha = 1 - smoothstep(2.2, 2.8, t);
    drawScreenFrame(p, t, titleAlpha);

    // 少量漂浮的数据粒子
    p.noStroke();
    for (let i = 0; i < 24; i++) {
      const x = 520 + hash2(i, 101) * 460;
      const y = 230 + hash2(i, 102) * 240;
      const a = 0.08 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.7 + i));
      fillHex(p, i % 4 === 0 ? C.violet : C.cyan, a);
      p.ellipse(x, y, 1.5 + hash2(i, 103) * 2.5, 1.5 + hash2(i, 103) * 2.5);
    }

    drawTitleCard(p, {
      ...META,
      number: META.id,
      x: 300,
      y: 362,
      alpha: titleAlpha
    });
  },

  drawRoad(p, state) {
    drawRoadDigital(p, state.localT);
    drawRoadCity(p, state.localT);
  },

  drawActor(p, state) {
    const pose = puppetPose(state.t);
    const phase = pose.phase;
    const bob = Math.sin(phase * Math.PI * 2) * 2.5;
    const ringX = 58;
    const ringY = -86 + bob;

    p.push();
    p.translate(state.x, ROAD_Y);

    // 地面波纹
    p.noStroke();
    fillHex(p, C.cyan, 0.06);
    p.ellipse(0, 0, 110, 18);
    fillHex(p, C.cyan, 0.16);
    p.ellipse(0, 0, 54, 9);
    strokeHex(p, C.cyan, 0.35);
    p.strokeWeight(1.2);
    p.noFill();
    p.ellipse(0, 0, 82, 13);

    // 半透明人形
    const hipY = -58;
    const swing = pose.swing;
    strokeHex(p, C.cyan, 0.34);
    p.strokeWeight(2.2);
    p.line(0, hipY - 30, 0, hipY + 10);
    p.line(0, hipY - 26, -12 - 4 * swing, hipY + 4);
    p.line(0, hipY - 26, 12 + 4 * swing, hipY + 4);
    p.line(0, hipY + 10, -9 - 8 * swing, 0);
    p.line(0, hipY + 10, 9 + 8 * swing, 0);
    p.noFill();
    p.ellipse(0, hipY - 38, 8, 8);
    fillHex(p, C.cyan, 0.08);
    p.noStroke();
    p.ellipse(0, hipY - 6, 26, 44);

    // 主环
    const wobble = Math.cos(phase * Math.PI * 2) * 8;
    strokeHex(p, C.cyan, 0.08);
    p.strokeWeight(12);
    p.noFill();
    p.ellipse(0, ringY, ringX * 2, 156);
    strokeHex(p, C.cyan, 0.25);
    p.strokeWeight(4);
    p.ellipse(0, ringY, ringX * 2, 156);
    strokeHex(p, C.white, 0.9);
    p.strokeWeight(1.6);
    p.ellipse(0, ringY, ringX * 2, 156);

    // 侧向环，给一点体积感
    strokeHex(p, C.violet, 0.35);
    p.strokeWeight(1.5);
    p.ellipse(0, ringY, 22 + wobble, 156);

    // 环内核心
    fillHex(p, C.white, 0.12);
    p.noStroke();
    p.ellipse(0, ringY, 64, 64);
    fillHex(p, C.white, 0.95);
    p.ellipse(0, ringY, 9, 9);
    fillHex(p, C.cyan, 0.35);
    p.ellipse(0, ringY, 20, 20);

    // 光束
    strokeHex(p, C.cyan, 0.18);
    p.strokeWeight(2);
    p.line(0, ringY + 78, 0, 0);

    // 环绕粒子
    for (let i = 0; i < 9; i++) {
      const a = phase * Math.PI * 2 + (i / 9) * Math.PI * 2;
      const x = Math.cos(a) * (ringX + 8);
      const y = ringY + Math.sin(a) * 78;
      fillHex(p, i % 3 === 0 ? C.violet : C.cyan, 0.5);
      p.ellipse(x, y, 2.5 + (i % 2), 2.5 + (i % 2));
    }

    p.pop();
  }
};
