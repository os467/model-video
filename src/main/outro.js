import {
  OUTRO_DURATION,
  OUTRO_START,
  clamp,
  lerp,
  smoothstep
} from '../beat/timeline.js';
import { drawSubtitle } from '../kit/text.js';

const W = 1920;
const H = 1080;
const COLS = 7;
const ROWS = 3;
const GAP = 10;

// Outro：7×3 展墙 + 第 21 格空席位，最后定格。
export function drawOutro(p, t, snapshots) {
  const lt = clamp(t - OUTRO_START, 0, OUTRO_DURATION);
  p.background(4, 5, 8);
  drawPressRoom(p, lt);

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
  const flashMain = flashAt(lt, [4.0, 6.0]);

  let scale = 1 + 0.65 * pull;
  let fx = W / 2;
  let fy = H / 2;
  scale = lerp(scale, 1.7, push);
  fx = lerp(fx, cell21.x + cell21.w / 2, push);
  fy = lerp(fy, cell21.y + cell21.h / 2, push);

  const wallAlpha = smoothstep(0, 0.45, lt);
  const shake = flashMain * 3.4;

  p.push();
  p.translate(
    W / 2 + Math.sin(lt * 127) * shake,
    H / 2 + Math.cos(lt * 101) * shake
  );
  p.scale(scale);
  p.translate(-fx, -fy);

  // 展墙的柔光底与一圈很细的金属框。
  const wctx = p.drawingContext;
  wctx.save();
  wctx.globalCompositeOperation = 'lighter';
  const wallGlow = wctx.createRadialGradient(
    ox + wallW / 2,
    oy + wallH / 2,
    40,
    ox + wallW / 2,
    oy + wallH / 2,
    wallW * 0.62
  );
  wallGlow.addColorStop(0, `rgba(90,130,190,${0.07 * wallAlpha})`);
  wallGlow.addColorStop(0.6, `rgba(70,100,160,${0.025 * wallAlpha})`);
  wallGlow.addColorStop(1, 'rgba(60,90,150,0)');
  wctx.fillStyle = wallGlow;
  wctx.fillRect(ox - 160, oy - 100, wallW + 320, wallH + 200);
  wctx.restore();

  p.noStroke();
  p.fill(4, 6, 10, 255 * wallAlpha);
  p.rect(ox - 30, oy - 30, wallW + 60, wallH + 60, 7);
  p.fill(8, 10, 14, 255 * wallAlpha);
  p.rect(ox - 24, oy - 24, wallW + 48, wallH + 48, 6);

  p.noFill();
  p.stroke(160, 185, 220, 42 * wallAlpha);
  p.strokeWeight(1.4);
  p.rect(ox - 24, oy - 24, wallW + 48, wallH + 48, 6);
  p.stroke(235, 205, 155, 22 * wallAlpha);
  p.strokeWeight(1);
  p.rect(ox - 18, oy - 18, wallW + 36, wallH + 36, 5);

  // 推近时第 21 格的一束冷白聚光。
  if (push > 0.01) {
    wctx.save();
    wctx.globalCompositeOperation = 'lighter';
    const sx = cell21.x + cell21.w / 2;
    const sy = cell21.y + cell21.h / 2;
    const seatGlow = wctx.createRadialGradient(sx, sy, 4, sx, sy, cell21.w * 0.8);
    seatGlow.addColorStop(0, `rgba(190,215,255,${0.12 * push * wallAlpha})`);
    seatGlow.addColorStop(0.55, `rgba(120,160,220,${0.04 * push * wallAlpha})`);
    seatGlow.addColorStop(1, 'rgba(90,130,190,0)');
    wctx.fillStyle = seatGlow;
    wctx.fillRect(sx - cell21.w, sy - cell21.h, cell21.w * 2, cell21.h * 2);
    wctx.restore();
  }

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
      if (i === 21) {
        // 第 21 格的录制指示灯：不带任何真实媒体标志。
        const blink = 0.55 + 0.45 * Math.sin(lt * 5.4);
        p.noStroke();
        p.fill(210, 66, 54, 190 * wallAlpha * blink);
        p.ellipse(r.x + 14, r.y + 14, 6, 6);
        p.fill(255, 120, 100, 45 * wallAlpha * blink);
        p.ellipse(r.x + 14, r.y + 14, 16, 16);
      }
    }
  }
  p.pop();

  if (flashMain > 0.01) {
    drawFlashRays(p, flashMain);
    p.noStroke();
    p.fill(255, 255, 255, 210 * flashMain);
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

  // 最后一拍：第 20 版的火种意象从画面右下角一闪而过，头也不回。
  const figureAlpha =
    smoothstep(9.6, 9.85, lt) * (1 - smoothstep(10.15, 10.45, lt));
  if (figureAlpha > 0.001) {
    drawFinalSigil(p, lt, figureAlpha);
  }
}

// 发布会现场的暗色空间：顶光、地面反光和一层很薄的雾。
function drawPressRoom(p, lt) {
  const ctx = p.drawingContext;
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04060b');
  bg.addColorStop(0.42, '#0a111e');
  bg.addColorStop(0.72, '#070b13');
  bg.addColorStop(1, '#030408');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';
  for (const [x, alpha] of [
    [W * 0.22, 0.05],
    [W * 0.5, 0.06],
    [W * 0.79, 0.045]
  ]) {
    const spot = ctx.createRadialGradient(x, -40, 20, x, -40, H * 0.92);
    spot.addColorStop(0, `rgba(160,195,235,${alpha})`);
    spot.addColorStop(0.5, `rgba(100,140,195,${alpha * 0.32})`);
    spot.addColorStop(1, 'rgba(80,120,170,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);
  }

  const floor = ctx.createLinearGradient(0, H * 0.62, 0, H);
  floor.addColorStop(0, 'rgba(18,28,44,0)');
  floor.addColorStop(0.45, 'rgba(14,22,36,0.22)');
  floor.addColorStop(1, 'rgba(4,6,10,0)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  ctx.restore();

  p.stroke(120, 150, 190, 16);
  p.strokeWeight(1);
  p.line(0, H * 0.79, W, H * 0.79);
  p.noStroke();
}

// 闪光灯：从第 21 格方向打出的放射线，给强拍一点物理感。
function drawFlashRays(p, alpha) {
  const ctx = p.drawingContext;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.18;
    const len = 190 + ((i * 97) % 280);
    ctx.strokeStyle = `rgba(255,250,235,${0.1 * alpha})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 36, Math.sin(a) * 36);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// 结尾角落里的“计算之灵”：一颗火种 + 两段没闭合的光弧。
function drawFinalSigil(p, lt, alpha) {
  const x = W - 238;
  const y = H - 205;
  p.push();
  p.translate(x, y);

  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bloom = ctx.createRadialGradient(0, 0, 2, 0, 0, 120);
  bloom.addColorStop(0, `rgba(255,226,170,${0.4 * alpha})`);
  bloom.addColorStop(0.45, `rgba(224,150,80,${0.14 * alpha})`);
  bloom.addColorStop(1, 'rgba(224,150,80,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(-130, -130, 260, 260);
  ctx.restore();

  p.noFill();
  for (const [rx, ry, rot, a0, span, col, a, w] of [
    [46, 30, -0.35, -2.5, 4.1, '#f0a052', 0.55, 1.1],
    [62, 40, 0.55, 0.35, 3.7, '#6f9ba4', 0.42, 0.9],
    [82, 52, -0.12, 2.2, 2.8, '#ac8c5e', 0.28, 0.8]
  ]) {
    p.push();
    p.rotate(rot);
    p.stroke(...hexRgba(col, a * alpha));
    p.strokeWeight(w);
    p.arc(0, 0, rx * 2, ry * 2, a0, a0 + span, p.OPEN);
    p.pop();
  }

  // 向右后方拖出三颗很淡的余烬，表示它已经走了。
  p.noStroke();
  for (let i = 0; i < 3; i++) {
    p.fill(240, 160, 82, 90 * alpha * (1 - i * 0.24));
    p.ellipse(-30 - i * 17, 8 + i * 5, 3.2 - i * 0.5, 2.2 - i * 0.3);
  }

  p.fill(224, 130, 62, 220 * alpha);
  p.ellipse(0, 0, 15, 18);
  p.fill(255, 196, 116, 235 * alpha);
  p.ellipse(-1, -1, 9, 11);
  p.fill(255, 234, 190, 245 * alpha);
  p.ellipse(-1.5, -1.5, 3.6, 4.4);
  p.pop();
}

function hexRgba(hex, alpha) {
  const v = hex.replace('#', '');
  return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(
    v.slice(2, 4),
    16
  )},${parseInt(v.slice(4, 6), 16)},${alpha})`;
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
