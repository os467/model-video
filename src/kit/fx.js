import { GROUPS, groupForBlock, fillHex, strokeHex } from './palette.js';
import { clamp, hash2 } from './rng.js';

// 全片共用的“气氛层”：纸尘、黄铜火星、示波器扫描、数据流、故障带。
// 所有元素都由 hash2 和 t 决定，不读随机数；强度随笔段递增，
// 让 1–4 保持克制，13–20 逐渐进入科幻。
const TAU = Math.PI * 2;

function powerFor(index, group) {
  const base =
    group === 'paper'
      ? 0.22
      : group === 'mechanical'
        ? 0.36
        : group === 'electronic'
          ? 0.56
          : 0.76;
  const ramp = clamp((index - 1) / 19, 0, 1);
  return clamp(base + (1 - base) * Math.pow(ramp, 1.25) * 0.92, 0, 1);
}

function glowRect(p, x, y, w, h, stops) {
  const ctx = p.drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawPaperFx(p, t, index, W, H, power, accent, soft) {
  // 纸尘：慢速上浮，靠近镜头时略大。
  p.push();
  p.noStroke();
  for (let i = 0; i < 26; i++) {
    const seed = index * 131 + i;
    const x = ((hash2(i, 2, seed) * W + t * (3 + hash2(i, 1, seed) * 7)) % W + W) % W;
    const y = ((hash2(i, 3, seed) * H - t * (2 + hash2(i, 4, seed) * 4)) % H + H) % H;
    const r = 0.6 + hash2(i, 5, seed) * 2.2;
    const a = (0.035 + 0.075 * power) * (0.35 + 0.65 * hash2(i, 6, seed));
    fillHex(p, i % 4 === 0 ? accent : soft, a);
    p.ellipse(x, y, r, r * 0.72);
  }
  p.pop();

  // 右上角一层极淡的斜向暖光，避免形成圆形光斑。
  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(W, 0, W * 0.42, H * 0.52);
  grad.addColorStop(0, `rgba(255,241,211,${0.05 * power})`);
  grad.addColorStop(0.45, `rgba(255,233,197,${0.022 * power})`);
  grad.addColorStop(1, 'rgba(255,233,197,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawMechanicalFx(p, t, index, W, H, power, accent, soft) {
  // 黄铜火星：向上飘，尾迹很短。
  p.push();
  for (let i = 0; i < 20; i++) {
    const seed = index * 173 + i;
    const x = ((hash2(i, 1, seed) * W + Math.sin(t * 0.5 + i) * 10) % W + W) % W;
    let y = hash2(i, 2, seed) * H - t * (9 + hash2(i, 3, seed) * 15);
    y = ((y % H) + H) % H;
    const a = (0.06 + 0.12 * power) * (0.3 + 0.7 * hash2(i, 4, seed));
    const len = 2 + hash2(i, 5, seed) * 7;
    strokeHex(p, i % 3 === 0 ? accent : soft, a);
    p.strokeWeight(0.8 + hash2(i, 6, seed) * 0.8);
    p.line(x, y, x + Math.sin(t + i) * 1.4, y + len);
    if (i % 4 === 0) {
      fillHex(p, accent, a * 0.7);
      p.noStroke();
      p.ellipse(x, y - 1, 1.8, 1.8);
      p.strokeWeight(0.8);
    }
  }
  p.pop();

  // 顶部一盏很弱的暖光。
  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  grad.addColorStop(0, `rgba(224,154,71,${0.045 * power})`);
  grad.addColorStop(1, 'rgba(224,154,71,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H * 0.55);
  ctx.restore();
}

function drawElectronicFx(p, t, index, W, H, power, accent, soft) {
  // 扫描线：先压一层很薄的暗线，再让一条淡绿扫描带慢慢向下走。
  p.push();
  p.noStroke();
  fillHex(p, '#000000', 0.025 + 0.025 * power);
  for (let y = 0; y < H; y += 4) p.rect(0, y, W, 1);
  p.pop();

  const sweepY = ((t * 0.11 + index * 0.13) % 1) * H;
  glowRect(p, 0, sweepY - 42, W, 84, [
    [0, 'rgba(47,224,164,0)'],
    [0.45, `rgba(47,224,164,${0.034 * power})`],
    [0.5, `rgba(180,255,226,${0.05 * power})`],
    [0.55, `rgba(47,224,164,${0.034 * power})`],
    [1, 'rgba(47,224,164,0)']
  ]);

  // 荧光点与细碎噪点。
  p.push();
  p.noStroke();
  for (let i = 0; i < 28; i++) {
    const seed = index * 211 + i;
    const x = hash2(i, 1, seed) * W;
    const y = hash2(i, 2, seed) * H;
    const a = (0.03 + 0.07 * power) * (0.3 + 0.7 * hash2(i, 3, seed));
    fillHex(p, i % 5 === 0 ? '#d9fff1' : accent, a);
    p.ellipse(x, y, 0.8 + hash2(i, 4, seed) * 1.8, 0.8);
  }
  p.pop();

  // 偶发故障横带：每 7 个时间片出现一次，位置固定。
  const slot = Math.floor((t + index * 0.37) * 8);
  if (slot % 7 === 0) {
    const y = 90 + hash2(slot, 1, index) * (H - 180);
    const h = 2 + hash2(slot, 2, index) * 14;
    const off = (hash2(slot, 3, index) - 0.5) * 80;
    const ctx = p.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(47,224,164,${0.05 * power})`;
    ctx.fillRect(off, y, W, h);
    ctx.fillStyle = `rgba(120,220,255,${0.035 * power})`;
    ctx.fillRect(-off * 0.6, y + 2, W, 1.2);
    ctx.restore();
  }
}

function drawDataFx(p, t, index, W, H, power, accent, soft) {
  const violet = index >= 17 ? '#8d86ff' : '#7d8cff';
  const warm = '#ffd9a0';

  // 远处的星点 / 节点。
  p.push();
  p.noStroke();
  for (let i = 0; i < 30; i++) {
    const seed = index * 307 + i;
    const x = hash2(i, 1, seed) * W;
    const y = hash2(i, 2, seed) * H;
    const tw = 0.55 + 0.45 * Math.sin(t * (0.8 + hash2(i, 3, seed)) + i);
    const a = (0.05 + 0.16 * power) * tw;
    fillHex(p, i % 5 === 0 ? warm : i % 3 === 0 ? violet : accent, a);
    p.ellipse(x, y, 0.8 + hash2(i, 4, seed) * 2.0, 0.8 + hash2(i, 4, seed) * 1.4);
  }
  p.pop();

  // 数据流：短尾光点，向右滑动。
  p.push();
  for (let i = 0; i < 26; i++) {
    const seed = index * 359 + i;
    const y = 100 + hash2(i, 1, seed) * (H - 200);
    const speed = 34 + hash2(i, 2, seed) * 76 + index * 1.6;
    const x = ((hash2(i, 3, seed) * (W + 320) + t * speed) % (W + 320)) - 160;
    const len = 18 + hash2(i, 4, seed) * 120;
    const a = (0.07 + 0.16 * power) * (0.3 + 0.7 * hash2(i, 5, seed));
    const color = i % 7 === 0 ? warm : i % 3 === 0 ? violet : accent;
    strokeHex(p, color, a);
    p.strokeWeight(0.9 + hash2(i, 6, seed) * 1.5);
    p.line(x - len, y, x, y);
    p.noStroke();
    fillHex(p, i % 7 === 0 ? '#fff4dc' : '#dffcff', a * 1.7);
    p.ellipse(x, y, 2 + hash2(i, 7, seed) * 2.6, 2);
    p.strokeWeight(1);
  }
  p.pop();

  // 竖向数据雨：比横流更“机器”，也给画面增加纵深。
  p.push();
  for (let i = 0; i < 12; i++) {
    const seed = index * 431 + i;
    const x = 40 + hash2(i, 1, seed) * (W - 80);
    const speed = 26 + hash2(i, 2, seed) * 58;
    const y = ((hash2(i, 3, seed) * (H + 200) + t * speed) % (H + 200)) - 100;
    const len = 8 + hash2(i, 4, seed) * 30;
    const a = (0.04 + 0.1 * power) * (0.35 + 0.65 * hash2(i, 5, seed));
    strokeHex(p, i % 4 === 0 ? warm : accent, a);
    p.strokeWeight(0.7);
    p.line(x, y - len, x, y);
    p.noStroke();
    fillHex(p, accent, a * 1.3);
    p.ellipse(x, y, 1.4, 1.4);
  }
  p.pop();

  // 很淡的节点连线，像一块没完全显影的神经网络。
  p.push();
  p.noStroke();
  const nodes = [];
  for (let i = 0; i < 7; i++) {
    const seed = index * 401 + i;
    nodes.push({
      x: 80 + hash2(i, 1, seed) * (W - 160),
      y: 120 + hash2(i, 2, seed) * (H - 240),
      p: hash2(i, 3, seed) * TAU
    });
  }
  strokeHex(p, accent, 0.05 + 0.06 * power);
  p.strokeWeight(0.9);
  for (let i = 0; i < nodes.length - 1; i++) {
    p.line(nodes[i].x, nodes[i].y, nodes[i + 1].x, nodes[i + 1].y);
  }
  p.noStroke();
  for (let i = 0; i < nodes.length; i++) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 1.2 + nodes[i].p);
    fillHex(p, i === nodes.length - 1 ? warm : accent, (0.1 + 0.12 * power) * pulse);
    p.ellipse(nodes[i].x, nodes[i].y, 2.4 + pulse * 2.2, 2.4 + pulse * 2.2);
  }
  p.pop();

  // 左右边缘的轻微色差，越靠后越明显。
  if (index >= 13) {
    const ctx = p.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const edge = 46 + (index - 13) * 4;
    const left = ctx.createLinearGradient(0, 0, edge, 0);
    left.addColorStop(0, `rgba(255,105,190,${0.035 * power})`);
    left.addColorStop(1, 'rgba(255,105,190,0)');
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, edge, H);
    const right = ctx.createLinearGradient(W, 0, W - edge, 0);
    right.addColorStop(0, `rgba(99,223,255,${0.04 * power})`);
    right.addColorStop(1, 'rgba(99,223,255,0)');
    ctx.fillStyle = right;
    ctx.fillRect(W - edge, 0, edge, H);
    ctx.restore();
  }

  // 常驻的一条很淡的扫描线，避免故障带只在某些帧出现。
  const scanY = (t * 54 + index * 37) % H;
  const ctx2 = p.drawingContext;
  ctx2.save();
  ctx2.globalCompositeOperation = 'lighter';
  ctx2.fillStyle = `rgba(99,223,255,${0.045 * power})`;
  ctx2.fillRect(0, scanY, W, 1.4);
  ctx2.restore();

  // 故障切片：数据段比电子段更频繁。
  const slot = Math.floor((t + index * 0.21) * 10);
  if (slot % 6 === 0) {
    const y = 80 + hash2(slot, 1, index) * (H - 160);
    const h = 1.5 + hash2(slot, 2, index) * 10;
    const off = (hash2(slot, 3, index) - 0.5) * 120;
    const ctx = p.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(99,223,255,${0.04 * power})`;
    ctx.fillRect(off, y, W, h);
    ctx.fillStyle = `rgba(255,120,200,${0.025 * power})`;
    ctx.fillRect(-off * 0.4, y + 1, W, 1.1);
    ctx.restore();
  }

  // 17–19 的 HUD 小刻度，越靠后越明显。
  if (index >= 17) {
    p.push();
    p.noFill();
    strokeHex(p, accent, 0.16 + 0.12 * power);
    p.strokeWeight(1.2);
    const m = 26;
    const arm = 22 + (index - 17) * 6;
    p.line(m, m, m + arm, m);
    p.line(m, m, m, m + arm);
    p.line(W - m, H - m, W - m - arm, H - m);
    p.line(W - m, H - m, W - m, H - m - arm);
    p.arc(W - 96, 92, 30, 30, -0.4, Math.PI * 1.2, p.OPEN);
    p.pop();
  }
}

function drawFutureFx(p, t, index, W, H, power, accent, soft) {
  // 20 的专用气氛：星尘 + 一条很轻的中心横向光晕。
  p.push();
  p.noStroke();
  for (let i = 0; i < 34; i++) {
    const seed = 907 + i;
    const x = hash2(i, 1, seed) * W;
    const y = hash2(i, 2, seed) * H;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.5 + hash2(i, 3, seed)) + i * 0.7);
    fillHex(p, i % 6 === 0 ? '#ffd9a0' : i % 3 === 0 ? '#9fc7cf' : '#e9e2d2', (0.04 + 0.1 * power) * tw);
    p.ellipse(x, y, 0.7 + hash2(i, 4, seed) * 1.6, 0.7 + hash2(i, 4, seed) * 1.2);
  }
  p.pop();

  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cx = W * 0.5;
  const cy = H * 0.44;
  const grad = ctx.createLinearGradient(cx - 420, cy, cx + 420, cy);
  grad.addColorStop(0, 'rgba(255,220,170,0)');
  grad.addColorStop(0.45, `rgba(255,226,184,${0.04 * power})`);
  grad.addColorStop(0.5, `rgba(255,248,230,${0.075 * power})`);
  grad.addColorStop(0.55, `rgba(255,226,184,${0.04 * power})`);
  grad.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - 420, cy - 1.2, 840, 2.4);
  ctx.restore();
}

export function drawBlockFx(p, t, loc, W, H) {
  const index = clamp(Math.round(loc.blockIndex || 1), 1, 20);
  const group = groupForBlock(index);
  const palette = GROUPS[group];
  const power = powerFor(index, group);
  const accent = index === 12 ? '#d9a15e' : palette.accent;
  const soft = palette.soft;
  const lt = clamp(loc.localT || 0, 0, 6);

  if (index === 20) {
    drawFutureFx(p, lt, index, W, H, power, accent, soft);
  } else if (group === 'paper') {
    drawPaperFx(p, lt, index, W, H, power, accent, soft);
  } else if (group === 'mechanical') {
    drawMechanicalFx(p, lt, index, W, H, power, accent, soft);
  } else if (group === 'electronic') {
    drawElectronicFx(p, lt, index, W, H, power, accent, soft);
  } else {
    drawDataFx(p, lt, index, W, H, power, accent, soft);
  }
}
