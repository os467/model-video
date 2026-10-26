import { GROUPS, fillHex, strokeHex } from '../kit/palette.js';
import { hash2, smoothstep } from '../kit/rng.js';

const W = 1920;
const H = 1080;
const SERIF = 'serif';
const FRAME = { x: 1320, y: 190, w: 430, h: 340 };

// Intro：纸张质感、素描插图、两条字幕；第二条落在 5.0 秒强拍前。
export function drawIntro(p, t) {
  const paper = GROUPS.paper;
  p.background(paper.bg);

  drawPaper(p, paper, t);
  drawDust(p, paper, t);
  drawLightLeak(p, t);
  drawPlate(p, paper, t);
  drawSigilSketch(p, paper, t);

  p.noStroke();
  fillHex(p, paper.ink, 0.85);
  p.textFont(SERIF);
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(22);
  p.text('图一 计算之灵（摹本）', FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h + 16);

  p.textAlign(p.LEFT, p.TOP);
  p.textSize(18);
  fillHex(p, paper.ink, 0.5);
  p.text('计算与智能通史 · 卷一', 120, 92);

  const a1 = smoothstep(0.45, 0.9, t) * (1 - smoothstep(4.75, 5.0, t));
  const a2 = smoothstep(4.3, 4.62, t);

  p.textAlign(p.CENTER, p.CENTER);
  p.textFont(SERIF);
  p.textSize(40);
  fillHex(p, paper.ink, 0.94 * a1);
  p.text('人类自古以来就痴迷于把思考交给别的东西。', W / 2, 720);

  p.textSize(38);
  fillHex(p, paper.ink, 0.94 * a2);
  p.text('——早在“计算机”这个词被发明之前。', W / 2, 790);

  p.textSize(18);
  fillHex(p, paper.ink, 0.58 * smoothstep(4.5, 4.9, t));
  p.textAlign(p.CENTER, p.BOTTOM);
  p.text('——《计算与智能通史》，卷一（虚构书名）', W / 2, H - 70);

  const fade = 1 - smoothstep(0, 0.35, t);
  if (fade > 0) {
    p.noStroke();
    p.fill(0, 0, 0, 255 * fade);
    p.rect(0, 0, W, H);
  }
}

function drawPaper(p, paper, t) {
  p.noStroke();
  for (let i = 0; i < 240; i++) {
    const x = hash2(i, 1) * W;
    const y = hash2(i, 2) * H;
    fillHex(p, paper.soft, 0.035 + hash2(i, 3) * 0.05);
    p.rect(x, y, 1 + hash2(i, 4) * 3, 1);
  }

  // 几根很长的纸纤维，方向略斜。
  for (let i = 0; i < 18; i++) {
    const x = hash2(i, 11) * W;
    const y = 80 + hash2(i, 12) * (H - 160);
    const len = 18 + hash2(i, 13) * 70;
    strokeHex(p, i % 3 ? paper.soft : paper.ink, 0.018 + hash2(i, 14) * 0.025);
    p.strokeWeight(0.7);
    p.line(x, y, x + len, y + (hash2(i, 15) - 0.5) * 3.4);
  }

  const ctx = p.drawingContext;
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(60,40,20,0.26)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawDust(p, paper, t) {
  p.push();
  p.noStroke();
  for (let i = 0; i < 30; i++) {
    const x = ((hash2(i, 21) * W + t * (4 + hash2(i, 22) * 8)) % W + W) % W;
    const y = ((hash2(i, 23) * H - t * (2 + hash2(i, 24) * 4)) % H + H) % H;
    const r = 0.5 + hash2(i, 25) * 1.4;
    const a = 0.03 + hash2(i, 26) * 0.05;
    fillHex(p, i % 4 === 0 ? paper.accent : paper.soft, a);
    p.ellipse(x, y, r, r * 0.7);
  }
  p.pop();
}

function drawLightLeak(p, t) {
  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cx = W * 0.1;
  const cy = H * 0.1;
  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, W * 0.58);
  grad.addColorStop(0, 'rgba(255,244,218,0.07)');
  grad.addColorStop(0.45, 'rgba(255,238,206,0.025)');
  grad.addColorStop(1, 'rgba(255,238,206,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawPlate(p, paper, t) {
  const reveal = smoothstep(0.1, 0.55, t);
  const { x, y, w, h } = FRAME;
  p.push();
  p.noStroke();
  fillHex(p, '#3a2a1a', 0.07 * reveal);
  p.rect(x + 4, y + 5, w, h);

  p.noFill();
  strokeHex(p, paper.ink, 0.6 * reveal);
  p.strokeWeight(1.6);
  p.rect(x, y, w, h);
  strokeHex(p, paper.soft, 0.9 * reveal);
  p.strokeWeight(1);
  p.rect(x + 8, y + 8, w - 16, h - 16);

  // 四角登记线
  strokeHex(p, paper.ink, 0.35 * reveal);
  p.strokeWeight(1);
  for (const [cx, cy, sx, sy] of [
    [x - 10, y - 10, 1, 1],
    [x + w + 10, y - 10, -1, 1],
    [x - 10, y + h + 10, 1, -1],
    [x + w + 10, y + h + 10, -1, -1]
  ]) {
    p.line(cx, cy, cx + 16 * sx, cy);
    p.line(cx, cy, cx, cy + 16 * sy);
  }

  // 图版角标
  p.noStroke();
  fillHex(p, paper.ink, 0.35 * reveal);
  p.textFont(SERIF);
  p.textSize(12);
  p.textAlign(p.RIGHT, p.BOTTOM);
  p.text('图版一', x + w - 14, y - 12);
  p.pop();
}

// 图版上的椭圆弧：不用 p5.arc，避免椭圆长短轴被拉成圆。
function sketchArc(p, rx, ry, rot, a0, span, color, alpha, weight, reveal) {
  if (alpha * reveal <= 0.002) return;
  p.push();
  p.noFill();
  strokeHex(p, color, alpha * reveal);
  p.strokeWeight(weight);
  p.beginShape();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = a0 + span * reveal * (i / n);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    p.vertex(
      x * Math.cos(rot) - y * Math.sin(rot),
      x * Math.sin(rot) + y * Math.cos(rot)
    );
  }
  p.endShape();
  p.pop();
}

function drawSigilSketch(p, paper, t) {
  const reveal = smoothstep(0.15, 1.7, t);
  if (reveal <= 0.002) return;
  const cx = FRAME.x + FRAME.w / 2;
  const cy = FRAME.y + FRAME.h * 0.56;

  p.push();
  p.translate(cx, cy);
  p.scale(1.5);
  p.noFill();
  p.strokeCap(p.ROUND);

  // 三条轨道：两条实线、一条点线，均不闭合。
  sketchArc(p, 118, 74, -0.26, -2.55, 5.15, paper.ink, 0.22, 1.15, reveal);
  sketchArc(p, 118, 74, -0.26, -2.55, 5.15, paper.accent, 0.05, 3.0, reveal);
  sketchArc(p, 88, 56, 0.48, 0.35, 4.5, paper.ink, 0.17, 0.9, reveal);

  // 点线轨道 + 几颗“被观测到的节点”。
  p.noStroke();
  for (let i = 0; i < 32; i += 2) {
    const a = (i / 32) * Math.PI * 2;
    const x = Math.cos(a) * 136;
    const y = Math.sin(a) * 84;
    const rot = 0.08;
    const px = x * Math.cos(rot) - y * Math.sin(rot);
    const py = x * Math.sin(rot) + y * Math.cos(rot);
    fillHex(p, paper.ink, 0.16 * reveal);
    p.ellipse(px, py, 1.5, 1.5);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.28;
    const x = Math.cos(a) * 118;
    const y = Math.sin(a) * 74;
    const rot = -0.26;
    const px = x * Math.cos(rot) - y * Math.sin(rot);
    const py = x * Math.sin(rot) + y * Math.cos(rot);
    fillHex(p, i % 4 === 0 ? paper.accent : paper.ink, 0.24 * reveal);
    p.ellipse(px, py, 2.4, 2.4);
  }

  // 十字轴线与刻度，让它继续像一页旧图版。
  strokeHex(p, paper.ink, 0.16 * reveal);
  p.strokeWeight(0.8);
  p.line(0, -98, 0, 98);
  p.line(-126, 4, 126, 4);
  for (let i = -4; i <= 4; i++) {
    const y = 4 + i * 22;
    p.line(-4, y, 4, y);
  }
  for (let i = -4; i <= 4; i++) {
    const x = i * 30;
    p.line(x, 90, x, 98);
  }

  // 火苗外廓：两条从尖端向下的曲线，底端收拢。
  p.noFill();
  const sideN = Math.max(2, Math.floor(34 * reveal));
  for (const side of [-1, 1]) {
    strokeHex(p, paper.ink, 0.46 * reveal);
    p.strokeWeight(1.3);
    p.beginShape();
    for (let i = 0; i < sideN; i++) {
      const q = i / 34;
      const y = -72 + 130 * q;
      const w = 48 * Math.pow(Math.sin(Math.PI * q), 0.78) * (0.72 + 0.28 * q);
      p.vertex(side * w, y);
    }
    p.endShape();
  }

  // 眼睛：上下眼睑 + 虹膜 + 火种瞳。
  const lidN = Math.max(2, Math.floor(30 * reveal));
  for (const [sign, h] of [[-1, 27], [1, 17]]) {
    strokeHex(p, paper.ink, 0.52 * reveal);
    p.strokeWeight(1.5);
    p.beginShape();
    for (let i = 0; i < lidN; i++) {
      const u = i / 30;
      const x = -40 + 80 * u;
      const y = 4 + sign * h * Math.sin(Math.PI * u);
      p.vertex(x, y);
    }
    p.endShape();
  }

  if (reveal > 0.48) {
    p.noFill();
    strokeHex(p, paper.accent, 0.28 * reveal);
    p.strokeWeight(1.1);
    p.ellipse(0, 4, 31, 31);
    strokeHex(p, paper.ink, 0.2 * reveal);
    p.strokeWeight(0.8);
    p.ellipse(0, 4, 39, 39);
  }

  // 眉上的三根细线，像旧图版给“灵”加的方向标。
  strokeHex(p, paper.ink, 0.2 * reveal);
  p.strokeWeight(0.9);
  for (const x of [-20, 0, 20]) {
    p.line(x, -27, x * 1.08, -35);
  }

  // 瞳心的暖色：整张图里唯一会让纸烧起来的地方。
  const ember = smoothstep(1.0, 1.75, t);
  if (ember > 0.002) {
    p.noStroke();
    fillHex(p, paper.accent, 0.13 * ember);
    p.ellipse(0, 4, 48, 36);
    fillHex(p, paper.accent, 0.62 * ember);
    p.ellipse(0, 4, 13, 13);
    fillHex(p, '#d49a58', 0.82 * ember);
    p.ellipse(-1, 3, 7.5, 7.5);
    fillHex(p, '#f3d6a2', 0.9 * ember);
    p.ellipse(-2, 1.5, 3.2, 3.2);
  }

  // 眼下一条很轻的测量括号。
  strokeHex(p, paper.ink, 0.14 * reveal);
  p.strokeWeight(0.8);
  p.line(-40, 50, 40, 50);
  p.line(-40, 46, -40, 54);
  p.line(40, 46, 40, 54);

  p.pop();
}
