import { ROAD_Y } from '../beat/timeline.js';
import { fillHex, strokeHex } from '../kit/palette.js';
import { hash2, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';
import { puppetPose } from '../rig/puppet.js';

const C = {
  bg: '#0b0b0b',
  grid: '#ffffff',
  tape: '#d8d6cf',
  tapeEdge: '#b7b4ac',
  hole: '#161616',
  ink: '#e9e6dc',
  muted: '#8f8f88',
  strip: '#b9b7b0'
};

const META = {
  id: 8,
  cn: '可计算性',
  en: 'Computability',
  era: '1936 · 图灵',
  group: 'mechanical'
};

const BITS = '01011010010110100101101001011010';

function drawGrid(p) {
  p.strokeWeight(1);
  for (let x = 0; x <= 1000; x += 25) {
    strokeHex(p, C.grid, x % 100 === 0 ? 0.09 : 0.035);
    p.line(x, 200, x, 800);
  }
  for (let y = 200; y <= 800; y += 25) {
    strokeHex(p, C.grid, y % 100 === 0 ? 0.09 : 0.035);
    p.line(0, y, 1000, y);
  }
}

function drawStateTable(p) {
  const x0 = 620;
  const y0 = 260;
  const cw = 80;
  const ch = 38;
  const cols = 4;
  const rows = 5;
  const labels = [
    ['δ', '0', '1', '▢'],
    ['q0', 'q1,R', 'q2,L', 'q0,–'],
    ['q1', 'q0,L', 'q2,R', 'q1,–'],
    ['q2', 'q3,R', 'q0,L', 'q2,–'],
    ['q3', 'q1,L', 'q3,R', 'q3,–']
  ];

  p.noStroke();
  fillHex(p, '#141414', 0.9);
  p.rect(x0, y0, cw * cols, ch * rows);
  fillHex(p, '#1d1d1d', 0.95);
  p.rect(x0, y0, cw * cols, ch);

  strokeHex(p, C.muted, 0.4);
  p.strokeWeight(1);
  for (let c = 0; c <= cols; c++) p.line(x0 + c * cw, y0, x0 + c * cw, y0 + ch * rows);
  for (let r = 0; r <= rows; r++) p.line(x0, y0 + r * ch, x0 + cw * cols, y0 + r * ch);

  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(11);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fillHex(p, r === 0 || c === 0 ? C.ink : C.muted, r === 0 || c === 0 ? 0.8 : 0.62);
      p.text(labels[r][c], x0 + cw * (c + 0.5), y0 + ch * (r + 0.5));
    }
  }

  // 表格与纸带之间的一根细引线
  strokeHex(p, C.muted, 0.18);
  p.strokeWeight(1);
  p.line(x0 + cw * 3, y0 + ch * rows, x0 + cw * 3, 478);
  p.line(x0 + cw * 2.5, y0 + ch * rows, x0 + cw * 3.5, y0 + ch * rows);
}

function drawBinaryColumn(p) {
  p.noStroke();
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(12);
  for (let i = 0; i < 15; i++) {
    fillHex(p, C.ink, 0.16 + hash2(i, 3) * 0.16);
    p.text(BITS[(i * 3) % BITS.length], 552, 248 + i * 14);
  }
}

function drawTape(p) {
  p.noStroke();
  fillHex(p, '#000000', 0.45);
  p.rect(0, 542, 1000, 9);

  fillHex(p, C.tape, 1);
  p.rect(0, 478, 1000, 60);
  fillHex(p, C.tapeEdge, 1);
  p.rect(0, 478, 1000, 3);
  p.rect(0, 535, 1000, 3);

  // 纸纤维
  for (let i = 0; i < 180; i++) {
    const x = hash2(i, 11) * 1000;
    const y = 481 + hash2(i, 12) * 53;
    fillHex(p, '#5b5a55', 0.05 + hash2(i, 13) * 0.08);
    p.rect(x, y, 2 + hash2(i, 14) * 7, 1);
  }

  // 网格
  strokeHex(p, '#171717', 0.16);
  p.strokeWeight(1);
  for (let x = 0; x <= 1000; x += 20) p.line(x, 481, x, 537);
  for (const y of [483, 493, 508, 523, 533]) p.line(0, y, 1000, y);

  // 两侧齿孔
  for (let x = 10; x < 1000; x += 24) {
    fillHex(p, C.hole, 0.92);
    p.rect(x, 483, 6, 5, 1);
    p.rect(x, 529, 6, 5, 1);
  }

  // 数据位打孔
  for (let x = 0; x < 1000; x += 20) {
    const bit = hash2(x, 7) > 0.48 ? 1 : 0;
    if (!bit) continue;
    fillHex(p, C.hole, 0.88);
    p.ellipse(x + 10, 508, 7, 7);
    fillHex(p, C.ink, 0.16);
    p.ellipse(x + 10, 507, 2, 2);
  }

  // 场景段两端的切边
  strokeHex(p, C.ink, 0.24);
  p.strokeWeight(2);
  p.line(1, 480, 1, 536);
  p.line(999, 480, 999, 536);
}

export default {
  ...META,
  duration: 6,

  draw(p, state) {
    const t = Math.max(0, Math.min(6, state.localT || 0));
    p.noStroke();
    fillHex(p, C.bg, 1);
    p.rect(0, 0, 1000, 1000);
    drawGrid(p);
    drawBinaryColumn(p);
    drawStateTable(p);

    const titleAlpha = 1 - smoothstep(2.2, 2.8, t);
    if (titleAlpha > 0.002) {
      // 年代小字是机械组的深色 soft，需要一条浅色标签带
      fillHex(p, C.strip, 0.62 * titleAlpha);
      p.rect(206, 392, 188, 24, 2);
      strokeHex(p, '#2c2c2c', 0.4 * titleAlpha);
      p.strokeWeight(1);
      p.rect(206, 392, 188, 24, 2);
    }

    drawTitleCard(p, {
      ...META,
      number: META.id,
      x: 300,
      y: 362,
      alpha: titleAlpha
    });
  },

  drawRoad(p) {
    drawTape(p);
  },

  drawActor(p, state) {
    const pose = puppetPose(state.t);
    const phase = pose.phase;
    const bob = Math.sin(phase * Math.PI * 2) * 2;
    const shift = Math.floor(phase * 8);

    p.push();
    p.translate(state.x, ROAD_Y);

    // 纸带上的读点阴影与光环
    p.noStroke();
    fillHex(p, '#101010', 0.22);
    p.ellipse(0, 1, 92, 14);
    fillHex(p, C.ink, 0.1);
    p.ellipse(0, 0, 48, 7);

    // 0/1 虚线后面的一层微光
    p.noStroke();
    fillHex(p, C.ink, 0.045);
    p.rect(-205, -55 + bob, 410, 28, 14);

    // 悬在纸带上方的一串 0/1
    p.textFont('monospace');
    p.textAlign(p.CENTER, p.CENTER);
    const count = 31;
    for (let i = 0; i < count; i++) {
      const rel = i - (count - 1) / 2;
      const x = rel * 13;
      const fade = 1 - Math.min(1, Math.abs(rel) / (count / 2)) * 0.72;
      const ch = BITS[(i + shift) % BITS.length];
      p.textSize(21);
      fillHex(p, C.ink, 0.12 * fade);
      p.text(ch, x + 1, -41 + bob + 1);
      fillHex(p, C.ink, 0.88 * fade);
      p.text(ch, x, -42 + bob);
    }

    // 读写头支架
    const headY = -64 + bob;
    p.noFill();
    strokeHex(p, C.ink, 0.1);
    p.strokeWeight(9);
    p.line(-31, headY, 31, headY);
    p.line(-31, headY, -31, headY + 34);
    p.line(31, headY, 31, headY + 34);
    strokeHex(p, C.ink, 0.95);
    p.strokeWeight(2.4);
    p.line(-31, headY, 31, headY);
    p.line(-31, headY, -31, headY + 34);
    p.line(31, headY, 31, headY + 34);
    for (let k = -2; k <= 2; k++) {
      strokeHex(p, C.ink, 0.3);
      p.strokeWeight(1);
      p.line(k * 9, headY + 4, k * 9, headY + 10);
    }

    // 向下的读头三角与光束
    p.noStroke();
    fillHex(p, C.ink, 1);
    p.beginShape();
    p.vertex(-10, headY + 34);
    p.vertex(10, headY + 34);
    p.vertex(0, headY + 50);
    p.endShape(p.CLOSE);
    fillHex(p, C.ink, 0.08);
    p.ellipse(0, headY + 52, 28, 28);
    fillHex(p, C.ink, 0.9);
    p.ellipse(0, headY + 50, 5, 5);

    strokeHex(p, C.ink, 0.55);
    p.strokeWeight(1.4);
    p.line(0, headY + 52, 0, 0);

    // 环绕的少量 bit
    for (let i = 0; i < 4; i++) {
      const a = phase * Math.PI * 2 + i * (Math.PI / 2);
      const x = Math.cos(a) * 54;
      const y = headY + 12 + Math.sin(a) * 22;
      p.textSize(12);
      fillHex(p, C.ink, 0.45);
      p.text(BITS[(i * 5 + shift) % BITS.length], x, y);
    }

    p.pop();
  }
};
