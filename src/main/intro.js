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

function drawSigilSketch(p, paper, t) {
  const reveal = smoothstep(0.15, 1.6, t);
  if (reveal <= 0.002) return;
  const cx = FRAME.x + FRAME.w / 2;
  const cy = FRAME.y + FRAME.h * 0.56;

  p.push();
  p.translate(cx, cy);
  p.scale(1.55);
  p.noFill();
  p.strokeCap(p.ROUND);

  // 外圈三段开口弧：深浅不同，像旧图版上的多重描线。
  const arcs = [
    [104, 72, -0.18, -2.7, 4.4, 0.34, 1.25],
    [76, 52, 0.44, 0.5, 4.0, 0.28, 1.0],
    [50, 35, -0.36, 2.2, 3.2, 0.22, 0.85]
  ];
  for (const [rx, ry, rot, a0, span, alpha, weight] of arcs) {
    p.push();
    p.rotate(rot);
    strokeHex(p, paper.ink, alpha * reveal);
    p.strokeWeight(weight);
    p.arc(0, 0, rx * 2, ry * 2, a0, a0 + span * reveal, p.OPEN);
    p.pop();
  }

  // 十字轴线与刻度。
  strokeHex(p, paper.ink, 0.2 * reveal);
  p.strokeWeight(0.8);
  p.line(0, -84, 0, 84);
  p.line(-112, 84, 112, 84);
  for (let i = -3; i <= 3; i++) {
    const y = i * 24;
    p.line(-4, y, 4, y);
  }
  for (let i = -3; i <= 3; i++) {
    const x = i * 30;
    p.line(x, 80, x, 88);
  }

  // 中心火种的外形：闭合泪滴，逐段描出。
  const flame = [
    [0, -64],
    [10, -48],
    [22, -24],
    [26, 4],
    [20, 30],
    [10, 48],
    [0, 58],
    [-10, 48],
    [-20, 30],
    [-26, 4],
    [-22, -24],
    [-10, -48],
    [0, -64]
  ];
  const n = Math.max(2, Math.floor(flame.length * reveal));
  strokeHex(p, paper.ink, 0.5 * reveal);
  p.strokeWeight(1.4);
  p.beginShape();
  for (let i = 0; i < n; i++) p.vertex(flame[i][0], flame[i][1]);
  if (reveal > 0.985) p.endShape(p.CLOSE);
  else p.endShape();

  // 内层火苗线。
  strokeHex(p, paper.accent, 0.32 * reveal);
  p.strokeWeight(1.5);
  p.beginShape();
  p.vertex(0, -32);
  p.vertex(9, -6);
  p.vertex(7, 22);
  p.vertex(0, 36);
  p.vertex(-7, 22);
  p.vertex(-9, -6);
  p.endShape();

  // 一圈虚线轨道：表示“被观察、被反复描摹”。
  p.push();
  const ctx = p.drawingContext;
  ctx.save();
  ctx.setLineDash([2.2, 4.2]);
  strokeHex(p, paper.ink, 0.24 * reveal);
  p.strokeWeight(0.9);
  p.ellipse(0, 6, 146, 98);
  ctx.restore();
  p.pop();

  // 一点点还没烧起来的暖色：图上的火种芯。
  const ember = smoothstep(1.1, 1.8, t);
  if (ember > 0.002) {
    p.noStroke();
    fillHex(p, paper.accent, 0.18 * ember);
    p.ellipse(0, 8, 30, 34);
    fillHex(p, paper.accent, 0.55 * ember);
    p.ellipse(-0.5, 7, 8, 12);
    fillHex(p, '#d9a15e', 0.75 * ember);
    p.ellipse(-1, 5, 3.4, 5);
  }

  p.pop();
}
