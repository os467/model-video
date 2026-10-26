import {
  BLOCK_COUNT,
  BLOCK_WORLD_WIDTH,
  ROAD_Y,
  boundaryPulse
} from '../beat/timeline.js';
import { GROUPS, groupForBlock, fillHex, strokeHex } from './palette.js';
import { hash01 } from './rng.js';

const HALF = 14;

// 整片一条全局长路：每个版块一段，边界换材质。
export function drawRoad(p, t, x0, x1) {
  const first = Math.max(1, Math.floor(x0 / BLOCK_WORLD_WIDTH) + 1);
  const last = Math.min(BLOCK_COUNT, Math.floor(x1 / BLOCK_WORLD_WIDTH) + 1);

  for (let i = first; i <= last; i++) {
    const start = (i - 1) * BLOCK_WORLD_WIDTH;
    const a = Math.max(x0, start);
    const b = Math.min(x1, start + BLOCK_WORLD_WIDTH);
    if (b > a) drawSegment(p, t, i, groupForBlock(i), a, b, start);
  }

  drawSeams(p, t, x0, x1);
}

function drawSegment(p, t, index, group, a, b, start) {
  const g = GROUPS[group];
  const width = b - a;

  p.noStroke();
  fillHex(p, g.soft, 0.95);
  p.rect(a, ROAD_Y - HALF, width, HALF * 2);

  if (group === 'paper') {
    p.strokeWeight(1.5);
    strokeHex(p, g.ink, 0.45);
    for (let x = Math.ceil(a / 24) * 24; x < b; x += 24) {
      const h = 4 + hash01(x * 7 + index) * 11;
      p.line(x, ROAD_Y - HALF, x, ROAD_Y - HALF - h);
    }
    strokeHex(p, g.ink, 0.2);
    p.line(a, ROAD_Y, b, ROAD_Y);
  } else if (group === 'mechanical') {
    p.noStroke();
    for (let x = Math.ceil(a / 30) * 30; x < b; x += 30) {
      fillHex(p, g.accent, 0.5);
      p.rect(x, ROAD_Y - HALF - 5, 14, 5);
      fillHex(p, g.ink, 0.16);
      p.rect(x + 7, ROAD_Y + HALF, 10, 4);
    }
    strokeHex(p, g.ink, 0.35);
    p.strokeWeight(1.5);
    p.line(a, ROAD_Y - 5, b, ROAD_Y - 5);
    p.line(a, ROAD_Y + 5, b, ROAD_Y + 5);
  } else if (group === 'electronic') {
    strokeHex(p, g.accent, 0.55);
    p.strokeWeight(1.5);
    p.line(a, ROAD_Y, b, ROAD_Y);
    p.noStroke();
    for (let x = Math.ceil(a / 90) * 90; x < b; x += 90) {
      fillHex(p, g.accent, 0.8);
      p.ellipse(x, ROAD_Y, 6, 6);
      fillHex(p, g.soft, 0.9);
      p.ellipse(x, ROAD_Y, 3, 3);
    }
    strokeHex(p, g.ink, 0.18);
    p.strokeWeight(1);
    p.line(a, ROAD_Y - 9, b, ROAD_Y - 9);
    p.line(a, ROAD_Y + 9, b, ROAD_Y + 9);
  } else {
    p.noStroke();
    fillHex(p, g.bg, 0.85);
    p.rect(a, ROAD_Y - HALF, width, HALF * 2);
    strokeHex(p, g.accent, 0.5);
    p.strokeWeight(1);
    p.line(a, ROAD_Y, b, ROAD_Y);
    for (let k = 0; k < 14; k++) {
      const speed = 100 + hash01(k * 31 + index) * 90;
      const span = 1000;
      const px = start + ((hash01(k * 131 + index * 17) * span + t * speed) % span);
      if (px < a || px > b) continue;
      const py = ROAD_Y - 6 + hash01(k * 17 + 5) * 12;
      fillHex(p, g.accent, 0.35 + hash01(k * 7 + 9) * 0.5);
      p.ellipse(px, py, 2 + hash01(k * 3 + 1) * 3, 2 + hash01(k * 3 + 1) * 3);
    }
  }

  p.noFill();
  strokeHex(p, g.ink, 0.35);
  p.strokeWeight(1);
  p.line(a, ROAD_Y - HALF, b, ROAD_Y - HALF);
  p.line(a, ROAD_Y + HALF, b, ROAD_Y + HALF);
}

function drawSeams(p, t, x0, x1) {
  const pulse = boundaryPulse(t);
  for (let i = 1; i < BLOCK_COUNT; i++) {
    const bx = i * BLOCK_WORLD_WIDTH;
    if (bx < x0 - 40 || bx > x1 + 40) continue;
    const next = groupForBlock(i + 1);
    const g = GROUPS[next];
    strokeHex(p, g.accent, 0.22 + pulse * 0.6);
    p.strokeWeight(2);
    p.line(bx, ROAD_Y - 72, bx, ROAD_Y + 72);
    p.strokeWeight(1);
    for (let k = -3; k <= 3; k++) {
      p.line(bx - 7, ROAD_Y + k * 18, bx + 7, ROAD_Y + k * 18);
    }
  }
}
