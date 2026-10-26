import {
  OUTRO_DURATION,
  OUTRO_START,
  clamp,
  lerp,
  smoothstep
} from '../beat/timeline.js';
import { drawSubtitle } from '../kit/text.js';
import { drawPuppet } from '../rig/puppet.js';

const W = 1920;
const H = 1080;
const COLS = 7;
const ROWS = 3;
const GAP = 10;

// Outro：7×3 展墙 + 第 21 格空席位，最后定格。
export function drawOutro(p, t, snapshots) {
  const lt = clamp(t - OUTRO_START, 0, OUTRO_DURATION);
  p.background(4, 5, 8);

  const wallW = W * 0.9;
  const cellW = (wallW - GAP * (COLS - 1)) / COLS;
  const cellH = (cellW * 9) / 16;
  const wallH = cellH * ROWS + GAP * (ROWS - 1);
  const ox = (W - wallW) / 2;
  const oy = (H - wallH) / 2;

  const rectFor = (index) => {
    const col = (index - 1) % COLS;
    const row = Math.floor((index - 1) / COLS);
    return {
      x: ox + col * (cellW + GAP),
      y: oy + row * (cellH + GAP),
      w: cellW,
      h: cellH
    };
  };

  const pull = 1 - smoothstep(0, 1.5, lt);
  const push = smoothstep(2.8, 4.2, lt);
  const cell21 = rectFor(21);

  let scale = 1 + 0.65 * pull;
  let fx = W / 2;
  let fy = H / 2;
  scale = lerp(scale, 1.7, push);
  fx = lerp(fx, cell21.x + cell21.w / 2, push);
  fy = lerp(fy, cell21.y + cell21.h / 2, push);

  const wallAlpha = smoothstep(0, 0.45, lt);

  p.push();
  p.translate(W / 2, H / 2);
  p.scale(scale);
  p.translate(-fx, -fy);

  p.noStroke();
  p.fill(8, 10, 14, 255 * wallAlpha);
  p.rect(ox - 24, oy - 24, wallW + 48, wallH + 48, 6);

  for (let i = 1; i <= 21; i++) {
    const r = rectFor(i);
    if (i <= 20 && snapshots[i - 1]) {
      p.push();
      p.tint(255, 255 * wallAlpha);
      p.image(snapshots[i - 1], r.x, r.y, r.w, r.h);
      p.pop();
      p.noFill();
      p.stroke(255, 255, 255, 40 * wallAlpha);
      p.strokeWeight(1);
      p.rect(r.x, r.y, r.w, r.h);
      p.noStroke();
      p.fill(255, 255, 255, 120 * wallAlpha);
      p.textFont('monospace');
      p.textSize(11);
      p.textAlign(p.LEFT, p.TOP);
      p.text(String(i).padStart(2, '0'), r.x + 5, r.y + 4);
    } else {
      drawSeatCell(p, r, wallAlpha);
    }
  }
  p.pop();

  const flash = flashAt(lt, [4.0, 6.0]);
  if (flash > 0) {
    p.noStroke();
    p.fill(255, 255, 255, 220 * flash);
    p.rect(0, 0, W, H);
  }

  drawSubtitle(p, '截至目前，人类共提交了 20 份答卷。', {
    y: 986,
    size: 34,
    alpha: smoothstep(0.5, 0.9, lt) * (1 - smoothstep(2.6, 3.0, lt)),
    color: '#f5efdf'
  });

  drawSubtitle(p, '智能本人对此尚未发表评论。', {
    y: 986,
    size: 34,
    alpha: smoothstep(5.0, 5.4, lt) * (1 - smoothstep(9.6, 10.2, lt)),
    color: '#f5efdf'
  });

  // 最后一拍：那个意象一闪而过，头也不回。
  const figureAlpha =
    smoothstep(9.6, 9.85, lt) * (1 - smoothstep(10.15, 10.45, lt));
  if (figureAlpha > 0.001) {
    p.push();
    p.translate(W - 250, H - 190);
    p.scale(0.9);
    p.translate(0, -500);
    drawPuppet(p, t, { x: 0, group: 'data', alpha: figureAlpha });
    p.pop();
  }
}

function drawSeatCell(p, r, alpha) {
  p.push();
  p.noStroke();
  p.fill(14, 16, 22, 255 * alpha);
  p.rect(r.x, r.y, r.w, r.h);

  // 空椅子
  p.fill(48, 52, 64, 255 * alpha);
  p.rect(r.x + r.w * 0.36, r.y + r.h * 0.18, r.w * 0.28, r.h * 0.42, 4);

  // 桌子
  p.fill(30, 34, 44, 255 * alpha);
  p.rect(r.x + r.w * 0.12, r.y + r.h * 0.58, r.w * 0.76, r.h * 0.3, 2);

  // 一排麦克风（不代指任何真实媒体）
  for (let k = 0; k < 4; k++) {
    const mx = r.x + r.w * (0.28 + k * 0.15);
    p.stroke(180, 190, 205, 220 * alpha);
    p.strokeWeight(1.5);
    p.line(mx, r.y + r.h * 0.56, mx, r.y + r.h * 0.43);
    p.noStroke();
    p.fill(200, 210, 225, 230 * alpha);
    p.ellipse(mx, r.y + r.h * 0.41, 5, 7);
  }

  // 席卡
  p.noStroke();
  p.fill(235, 230, 215, 255 * alpha);
  p.rect(r.x + r.w * 0.29, r.y + r.h * 0.62, r.w * 0.42, r.h * 0.13, 1);
  p.fill(30, 30, 35, 255 * alpha);
  p.textFont('sans-serif');
  p.textSize(10);
  p.textAlign(p.CENTER, p.CENTER);
  p.text('智能（本人）', r.x + r.w * 0.5, r.y + r.h * 0.685);

  p.noFill();
  p.stroke(120, 130, 150, 180 * alpha);
  p.strokeWeight(1);
  p.rect(r.x, r.y, r.w, r.h);
  p.noStroke();
  p.fill(140, 150, 170, 180 * alpha);
  p.textFont('monospace');
  p.textSize(10);
  p.textAlign(p.RIGHT, p.TOP);
  p.text('21', r.x + r.w - 5, r.y + 4);
  p.pop();
}

function flashAt(lt, times) {
  let alpha = 0;
  for (const at of times) {
    const d = lt - at;
    if (d >= 0 && d < 0.18) alpha = Math.max(alpha, 1 - d / 0.18);
  }
  return alpha;
}
