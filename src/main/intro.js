import { GROUPS, fillHex, strokeHex } from '../kit/palette.js';
import { hash2, smoothstep } from '../kit/rng.js';

const W = 1920;
const H = 1080;
const SERIF = 'serif';

// Intro：纸张质感、素描插图、两条字幕；第二条落在 5.0 秒强拍前。
export function drawIntro(p, t) {
  const paper = GROUPS.paper;
  p.background(paper.bg);

  p.noStroke();
  for (let i = 0; i < 240; i++) {
    const x = hash2(i, 1) * W;
    const y = hash2(i, 2) * H;
    fillHex(p, paper.soft, 0.035 + hash2(i, 3) * 0.05);
    p.rect(x, y, 1 + hash2(i, 4) * 3, 1);
  }

  const ctx = p.drawingContext;
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(60,40,20,0.26)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const fx = 1320;
  const fy = 190;
  const fw = 430;
  const fh = 340;
  strokeHex(p, paper.ink, 0.6);
  p.strokeWeight(2);
  p.noFill();
  p.rect(fx, fy, fw, fh);
  strokeHex(p, paper.soft, 0.9);
  p.strokeWeight(1);
  p.rect(fx + 8, fy + 8, fw - 16, fh - 16);

  p.push();
  p.translate(fx + fw / 2, fy + fh * 0.64);
  p.scale(1.6);
  strokeHex(p, paper.ink, 0.5);
  p.strokeWeight(1.4);
  p.noFill();
  p.ellipse(0, -40, 34, 34);
  p.line(0, -23, 0, 20);
  p.line(0, -10, -20, 12);
  p.line(0, -10, 20, 12);
  p.line(0, 20, -18, 58);
  p.line(0, 20, 18, 58);
  p.pop();

  p.noStroke();
  fillHex(p, paper.ink, 0.85);
  p.textFont(SERIF);
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(22);
  p.text('图一 计算之灵（摹本）', fx + fw / 2, fy + fh + 16);

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
  fillHex(p, paper.soft, 0.9 * smoothstep(4.5, 4.9, t));
  p.textAlign(p.CENTER, p.BOTTOM);
  p.text('——《计算与智能通史》，卷一（虚构书名）', W / 2, H - 70);

  const fade = 1 - smoothstep(0, 0.35, t);
  if (fade > 0) {
    p.noStroke();
    p.fill(0, 0, 0, 255 * fade);
    p.rect(0, 0, W, H);
  }
}
