import { hash2 } from './kit/rng.js';
import { drawGlobalPost } from './kit/fx.js';

const TAU = Math.PI * 2;
const p5 = window.p5;
const params = new URLSearchParams(window.location.search);
const W = Math.max(2, Math.round(Number(params.get('w')) || 3840));
const H = Math.max(2, Math.round(Number(params.get('h')) || 2160));

const STRIPES = [
  { kind: 'bone', top: 0.1, bottom: 0.91, weight: 2.25, accent: '#d08a3e' },
  { kind: 'clay', top: 0.2, bottom: 0.8, weight: 1.0, accent: '#a45f32' },
  { kind: 'parchment', top: 0.05, bottom: 0.95, weight: 1.02, accent: '#8a7658' },
  { kind: 'brass', top: 0.16, bottom: 0.86, weight: 1.05, accent: '#d08a3e' },
  { kind: 'blueprint', top: 0.23, bottom: 0.77, weight: 0.95, accent: '#2fe0a4' },
  { kind: 'tape', top: 0.07, bottom: 0.93, weight: 1.08, accent: '#e6ebff' },
  { kind: 'crt', top: 0.18, bottom: 0.84, weight: 0.96, accent: '#2fe0a4' },
  { kind: 'neural', top: 0.03, bottom: 0.97, weight: 1.02, accent: '#63dfff' },
  { kind: 'city', top: 0.12, bottom: 0.9, weight: 1.08, accent: '#63dfff' }
];

if (!p5) throw new Error('p5 未加载');

new p5((p) => {
  p.setup = async () => {
    p.pixelDensity(1);
    const canvas = p.createCanvas(W, H);
    canvas.parent('canvas-host');
    p.pixelDensity(1);
    drawCover(p, W, H);
    p.noLoop();
    setTimeout(() => {
      window.__ready = true;
    }, 0);
  };

  p.draw = () => {};
});

function drawCover(p, width, height) {
  const ctx = p.drawingContext;
  const stripes = layoutStripes(width, height);

  ctx.save();
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, width, height);

  // 右侧暗场，让材质片有“从黑里浮出”的层次。
  const rightGlow = ctx.createLinearGradient(width * 0.4, 0, width, 0);
  rightGlow.addColorStop(0, 'rgba(7,10,16,0.96)');
  rightGlow.addColorStop(1, 'rgba(2,4,8,1)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(width * 0.4, 0, width * 0.6, height);

  for (let i = 0; i < stripes.length; i++) {
    drawStripe(ctx, stripes[i], i, width, height);
  }

  drawFocalSpill(ctx, stripes[0], width, height);
  ctx.restore();

  // 复用影片的统一后处理：颗粒、极轻边缘压暗、高光溢出。
  drawGlobalPost(
    p,
    0.48,
    { part: 'block', blockIndex: 3, localT: 0.48 },
    width,
    height
  );
}

function layoutStripes(width, height) {
  const x0 = width * 0.4;
  const rightMargin = width * 0.008;
  const gap = width * 0.006;
  const sum = STRIPES.reduce((acc, item) => acc + item.weight, 0);
  const unit = (width - x0 - rightMargin - gap * (STRIPES.length - 1)) / sum;
  let x = x0;
  return STRIPES.map((item) => {
    const sw = unit * item.weight;
    const y = height * item.top;
    const sh = height * (item.bottom - item.top);
    const stripe = { ...item, x, y, w: sw, h: sh };
    x += sw + gap;
    return stripe;
  });
}

function drawStripe(ctx, stripe, index, width, height) {
  const { x, y, w, h, accent } = stripe;

  // 错落画框的投影，给相邻切片留出黑缝。
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x + width * 0.004, y + height * 0.008, w, h);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = hexA(accent, 0.38);
  ctx.shadowBlur = width * 0.008;
  ctx.strokeStyle = hexA(accent, 0.42);
  ctx.lineWidth = Math.max(1, width * 0.0006);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  drawMaterial(ctx, stripe, index);
  drawStripeGrade(ctx, w, h, accent, index === 0);
  ctx.restore();

  // 外框：左上微亮，右下压暗。
  ctx.save();
  ctx.lineWidth = Math.max(1, width * 0.00055);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.restore();
}

function drawMaterial(ctx, stripe) {
  switch (stripe.kind) {
    case 'bone':
      drawBone(ctx, stripe.w, stripe.h);
      break;
    case 'clay':
      drawClay(ctx, stripe.w, stripe.h);
      break;
    case 'parchment':
      drawParchment(ctx, stripe.w, stripe.h);
      break;
    case 'brass':
      drawBrass(ctx, stripe.w, stripe.h);
      break;
    case 'blueprint':
      drawBlueprint(ctx, stripe.w, stripe.h);
      break;
    case 'tape':
      drawTape(ctx, stripe.w, stripe.h);
      break;
    case 'crt':
      drawCrt(ctx, stripe.w, stripe.h);
      break;
    case 'neural':
      drawNeural(ctx, stripe.w, stripe.h);
      break;
    case 'city':
      drawCity(ctx, stripe.w, stripe.h);
      break;
    default:
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, stripe.w, stripe.h);
  }
}

function drawStripeGrade(ctx, w, h, accent, isFocal) {
  // 主视觉格保持亮度，其余材质压暗一档，避免纸带/羊皮纸抢走焦点。
  if (!isFocal) {
    ctx.save();
    ctx.fillStyle = 'rgba(2,4,8,0.2)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 主视觉格：从火种向外做很轻的聚光衰减，避免整条骨片一样亮。
  if (isFocal) {
    const fx = w * 0.665;
    const fy = h * 0.47 + w * 0.2294;
    const spot = ctx.createRadialGradient(fx, fy, w * 0.12, fx, fy, h * 0.72);
    spot.addColorStop(0, 'rgba(0,0,0,0)');
    spot.addColorStop(0.45, 'rgba(0,0,0,0.04)');
    spot.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
  }

  // 先把过亮的材质压回电影暗部，再把边缘收进黑缝。
  ctx.save();
  const top = ctx.createLinearGradient(0, 0, 0, h);
  top.addColorStop(0, 'rgba(0,0,0,0.25)');
  top.addColorStop(0.12, 'rgba(0,0,0,0)');
  top.addColorStop(0.88, 'rgba(0,0,0,0)');
  top.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h);

  const sides = ctx.createLinearGradient(0, 0, w, 0);
  sides.addColorStop(0, 'rgba(0,0,0,0.24)');
  sides.addColorStop(0.08, 'rgba(0,0,0,0)');
  sides.addColorStop(0.92, 'rgba(0,0,0,0)');
  sides.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = hexA(accent, 0.7);
  ctx.fillRect(0, 0, Math.max(2, w * 0.008), h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, w, Math.max(1, h * 0.0012));
  ctx.restore();
}

// ------------------------------------------------------------
// Materials
// ------------------------------------------------------------

function drawBone(ctx, w, h) {
  const paper = ctx.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#efe1c1');
  paper.addColorStop(0.55, '#d7bd91');
  paper.addColorStop(1, '#a37d51');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  // 骨纹和细裂纹。
  for (let i = 0; i < 26; i++) {
    const x = hash2(i, 1, 31) * w;
    const y = hash2(i, 2, 31) * h;
    const len = 12 + hash2(i, 3, 31) * h * 0.16;
    ctx.strokeStyle = `rgba(72,51,32,${0.04 + hash2(i, 4, 31) * 0.1})`;
    ctx.lineWidth = 0.6 + hash2(i, 5, 31) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash2(i, 6, 31) - 0.5) * 14, y + len);
    ctx.stroke();
  }

  // 下缘的刻痕：五组短竖线。
  ctx.strokeStyle = 'rgba(44,32,23,0.62)';
  ctx.lineCap = 'round';
  for (let group = 0; group < 6; group++) {
    const gx = w * (0.12 + group * 0.13);
    const gy = h * (0.78 + (group % 2) * 0.045);
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = 2 + (k === 3 ? 2 : 0);
      ctx.beginPath();
      ctx.moveTo(gx + k * w * 0.016, gy);
      ctx.lineTo(gx + k * w * 0.016 + w * 0.008, gy + h * 0.05);
      ctx.stroke();
    }
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(gx - w * 0.018, gy + h * 0.052);
    ctx.lineTo(gx + w * 0.06, gy + h * 0.045);
    ctx.stroke();
  }

  const cx = w * 0.51;
  const cy = h * 0.47;
  const flintSize = w * 0.62;
  const ex = cx + flintSize * 0.25;
  const ey = cy + flintSize * 0.37;
  drawFireTrail(ctx, w, h, ex, ey);
  drawFlint(ctx, w, h, cx, cy, flintSize);
}

function drawFireTrail(ctx, w, h, cx, cy) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.8);
  glow.addColorStop(0, 'rgba(255,240,190,0.42)');
  glow.addColorStop(0.18, 'rgba(255,155,64,0.34)');
  glow.addColorStop(0.52, 'rgba(219,74,24,0.1)');
  glow.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const line = ctx.createLinearGradient(0, cy, cx, cy);
  line.addColorStop(0, 'rgba(120,42,14,0)');
  line.addColorStop(0.65, 'rgba(221,91,28,0.38)');
  line.addColorStop(1, 'rgba(255,216,151,0.82)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = line;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = (3 - i) * w * 0.009;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, cy + (i - 1) * w * 0.012);
    ctx.quadraticCurveTo(w * 0.34, cy - w * 0.02 + i * 4, cx, cy);
    ctx.stroke();
  }
  ctx.restore();

  // 火星。
  for (let i = 0; i < 16; i++) {
    const x = hash2(i, 7, 41) * w;
    const y = cy - (hash2(i, 8, 41) - 0.5) * h * 0.12;
    const r = 0.7 + hash2(i, 9, 41) * 2.8;
    ctx.fillStyle = i % 3 === 0 ? '#ffe1a8' : '#df6e2d';
    ctx.globalAlpha = 0.2 + hash2(i, 10, 41) * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFlint(ctx, w, h, cx, cy, size) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.16);

  // 燧石落地阴影。
  ctx.fillStyle = 'rgba(38,25,14,0.38)';
  ctx.beginPath();
  ctx.ellipse(s * 0.12, s * 0.47, s * 0.35, s * 0.08, 0, 0, TAU);
  ctx.fill();

  const shard = [
    [-0.02, -0.58],
    [0.34, -0.35],
    [0.5, 0.02],
    [0.3, 0.4],
    [-0.02, 0.53],
    [-0.38, 0.28],
    [-0.5, -0.06],
    [-0.3, -0.43]
  ];
  const fill = ctx.createLinearGradient(-s * 0.4, -s * 0.5, s * 0.4, s * 0.5);
  fill.addColorStop(0, '#5a625e');
  fill.addColorStop(0.45, '#303836');
  fill.addColorStop(1, '#111718');
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(174,181,170,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  for (let i = 0; i < shard.length; i++) {
    const [px, py] = shard[i];
    if (i === 0) ctx.moveTo(px * s, py * s);
    else ctx.lineTo(px * s, py * s);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 一块更亮的切面。
  ctx.fillStyle = 'rgba(153,161,151,0.2)';
  ctx.beginPath();
  ctx.moveTo(-0.22 * s, -0.3 * s);
  ctx.lineTo(0.16 * s, -0.34 * s);
  ctx.lineTo(0.02 * s, 0.02 * s);
  ctx.lineTo(-0.28 * s, -0.05 * s);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(226,231,213,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-0.22 * s, -0.3 * s);
  ctx.lineTo(0.02 * s, 0.02 * s);
  ctx.lineTo(0.3 * s, 0.38 * s);
  ctx.stroke();
  ctx.restore();

  // 接触点的暖边光，让燧石真正贴着火光，而不是悬在光斑上方。
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.16);
  ctx.strokeStyle = 'rgba(255,187,98,0.72)';
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.beginPath();
  ctx.moveTo(0.3 * s, 0.38 * s);
  ctx.lineTo(0.24 * s, 0.1 * s);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,224,170,0.38)';
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.beginPath();
  ctx.moveTo(0.3 * s, 0.38 * s);
  ctx.lineTo(-0.02 * s, 0.53 * s);
  ctx.stroke();
  ctx.restore();

  // 火星与火苗：主视觉的呼吸点。
  const ex = cx + s * 0.25;
  const ey = cy + s * 0.37;
  const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, s * 0.56);
  glow.addColorStop(0, 'rgba(255,255,232,0.58)');
  glow.addColorStop(0.14, 'rgba(255,219,145,0.46)');
  glow.addColorStop(0.44, 'rgba(255,113,39,0.18)');
  glow.addColorStop(1, 'rgba(255,80,18,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // 有方向的小火苗，而不是一个完美圆形光斑。
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(255,105,26,0.72)';
  ctx.beginPath();
  ctx.moveTo(ex - s * 0.09, ey + s * 0.06);
  ctx.bezierCurveTo(
    ex - s * 0.14,
    ey - s * 0.12,
    ex - s * 0.02,
    ey - s * 0.28,
    ex + s * 0.025,
    ey - s * 0.3
  );
  ctx.bezierCurveTo(
    ex + s * 0.02,
    ey - s * 0.12,
    ex + s * 0.12,
    ey - s * 0.02,
    ex + s * 0.075,
    ey + s * 0.08
  );
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,201,91,0.85)';
  ctx.beginPath();
  ctx.moveTo(ex - s * 0.035, ey + s * 0.04);
  ctx.bezierCurveTo(
    ex - s * 0.055,
    ey - s * 0.08,
    ex + s * 0.005,
    ey - s * 0.18,
    ex + s * 0.02,
    ey - s * 0.19
  );
  ctx.bezierCurveTo(
    ex + s * 0.03,
    ey - s * 0.07,
    ex + s * 0.07,
    ey - s * 0.01,
    ex + s * 0.035,
    ey + s * 0.045
  );
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff8dd';
  ctx.beginPath();
  ctx.ellipse(ex + s * 0.006, ey - s * 0.015, s * 0.033, s * 0.07, -0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,186,95,0.2)';
  ctx.lineWidth = Math.max(1, s * 0.008);
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(ex, ey, s * (0.62 + i * 0.22), -0.4 + i * 0.5, Math.PI * 0.9 + i * 0.4);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 18; i++) {
    const a = hash2(i, 1, 73) * TAU;
    const r = s * (0.22 + hash2(i, 2, 73) * 0.8);
    const x = ex + Math.cos(a) * r;
    const y = ey + Math.sin(a) * r * 0.7;
    ctx.fillStyle = i % 4 === 0 ? '#fff4ce' : '#ff9a3e';
    ctx.globalAlpha = 0.25 + hash2(i, 3, 73) * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, 1 + hash2(i, 4, 73) * 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawClay(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#b78252');
  bg.addColorStop(0.5, '#9a633c');
  bg.addColorStop(1, '#5d3923');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 45; i++) {
    const x = hash2(i, 1, 17) * w;
    const y = hash2(i, 2, 17) * h;
    ctx.fillStyle = `rgba(56,31,18,${0.04 + hash2(i, 3, 17) * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + hash2(i, 4, 17) * 2, 0, TAU);
    ctx.fill();
  }

  const gx = w * 0.12;
  const gy = h * 0.18;
  const gw = w * 0.76;
  const gh = h * 0.58;
  ctx.strokeStyle = 'rgba(57,31,18,0.45)';
  ctx.lineWidth = 1.4;
  for (let c = 0; c <= 4; c++) {
    ctx.beginPath();
    ctx.moveTo(gx + (gw / 4) * c, gy);
    ctx.lineTo(gx + (gw / 4) * c, gy + gh);
    ctx.stroke();
  }
  for (let r = 0; r <= 4; r++) {
    ctx.beginPath();
    ctx.moveTo(gx, gy + (gh / 4) * r);
    ctx.lineTo(gx + gw, gy + (gh / 4) * r);
    ctx.stroke();
  }

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = gx + (gw / 4) * (c + 0.18);
      const y = gy + (gh / 4) * (r + 0.22);
      ctx.strokeStyle = 'rgba(48,25,14,0.62)';
      ctx.lineWidth = 1.8;
      if ((r + c) % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * 0.065, y + h * 0.03);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.025);
        ctx.lineTo(x + w * 0.04, y + h * 0.008);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * 0.04, y + h * 0.036);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w * 0.04, y);
        ctx.lineTo(x, y + h * 0.032);
        ctx.stroke();
      }
    }
  }

  ctx.strokeStyle = 'rgba(255,220,176,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx, gy, gw, gh);
}

function drawParchment(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f2e7d0');
  bg.addColorStop(0.55, '#dfcda9');
  bg.addColorStop(1, '#b79c6d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 28; i++) {
    const x = hash2(i, 1, 13) * w;
    const y = hash2(i, 2, 13) * h;
    ctx.strokeStyle = `rgba(93,72,43,${0.05 + hash2(i, 3, 13) * 0.08})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash2(i, 4, 13) - 0.5) * 12, y + 10 + hash2(i, 5, 13) * 40);
    ctx.stroke();
  }

  const cx = w * 0.51;
  const cy = h * 0.47;
  const r = w * 0.37;
  ctx.strokeStyle = 'rgba(55,42,27,0.52)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, TAU);
  ctx.stroke();

  const tri = [
    [cx, cy - r],
    [cx - r * 0.86, cy + r * 0.5],
    [cx + r * 0.86, cy + r * 0.5]
  ];
  ctx.beginPath();
  ctx.moveTo(tri[0][0], tri[0][1]);
  ctx.lineTo(tri[1][0], tri[1][1]);
  ctx.lineTo(tri[2][0], tri[2][1]);
  ctx.closePath();
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const y = cy - r * 0.58 + i * r * 0.38;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.88, y);
    ctx.lineTo(cx + half * 0.88, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(120,54,32,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(cx + w * 0.08, cy + h * 0.31, w * 0.035 + i * 2, 0, TAU);
    ctx.stroke();
  }
}

function drawBrass(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#261d13');
  bg.addColorStop(0.45, '#14100c');
  bg.addColorStop(1, '#080706');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 22; i++) {
    const x = hash2(i, 1, 23) * w;
    ctx.strokeStyle = `rgba(214,150,70,${0.025 + hash2(i, 2, 23) * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (hash2(i, 3, 23) - 0.5) * w * 0.2, h);
    ctx.stroke();
  }

  // 底部的计算尺。
  const ry = h * 0.7;
  ctx.fillStyle = '#a66d25';
  ctx.fillRect(0, ry, w, h * 0.055);
  ctx.fillStyle = 'rgba(255,219,145,0.32)';
  ctx.fillRect(0, ry, w, h * 0.008);
  ctx.strokeStyle = 'rgba(51,31,10,0.7)';
  for (let i = 0; i <= 20; i++) {
    const x = (w / 20) * i;
    const tall = i % 5 === 0;
    ctx.lineWidth = tall ? 1.4 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x, ry + (tall ? h * 0.034 : h * 0.018));
    ctx.stroke();
  }

  drawGear(ctx, w * 0.34, h * 0.3, w * 0.22, 12, '#d08a3e');
  drawGear(ctx, w * 0.64, h * 0.52, w * 0.15, 10, '#8d5b27');
  drawGear(ctx, w * 0.72, h * 0.81, w * 0.11, 9, '#b87830');

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createLinearGradient(0, ry - w * 0.3, 0, ry + w * 0.2);
  glow.addColorStop(0, 'rgba(240,164,64,0)');
  glow.addColorStop(0.55, 'rgba(240,164,64,0.08)');
  glow.addColorStop(1, 'rgba(255,205,112,0.18)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawGear(ctx, cx, cy, r, teeth, color) {
  ctx.save();
  ctx.translate(cx, cy);
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grad.addColorStop(0, '#f2c270');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, '#4b2d10');
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(255,215,140,0.34)';
  ctx.lineWidth = Math.max(1, r * 0.025);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(-r * 0.12, -r * 1.02, r * 0.24, r * 0.28);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#100c08';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,165,0.3)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBlueprint(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#08262c');
  bg.addColorStop(1, '#031117');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(79,216,207,0.13)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const x = (w / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = 0; i <= 12; i++) {
    const y = (h / 12) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(93,234,217,0.56)';
  ctx.fillStyle = 'rgba(5,30,34,0.72)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const x = w * (0.18 + (i % 2) * 0.22);
    const y = h * (0.24 + i * 0.16);
    const bw = w * 0.35;
    const bh = h * 0.08;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeRect(x, y, bw, bh);
    ctx.beginPath();
    ctx.arc(x + bw * 0.12, y + bh * 0.5, Math.min(bw, bh) * 0.2, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + bw, y + bh * 0.5);
    ctx.lineTo(w * 0.9, y + bh * 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(220,155,83,0.55)';
  for (let i = 0; i < 4; i++) {
    const y = h * (0.28 + i * 0.13);
    ctx.beginPath();
    ctx.moveTo(w * 0.1, y);
    ctx.lineTo(w * 0.58, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,155,83,0.55)';
    ctx.beginPath();
    ctx.arc(w * 0.62, y, w * 0.018, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(113,241,226,0.4)';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.75, w * 0.27, 0.2, Math.PI * 1.5);
  ctx.stroke();
}

function drawTape(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#e7dfce');
  bg.addColorStop(0.55, '#cec4ad');
  bg.addColorStop(1, '#9e9279');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 纸带边缘的黑条与穿孔。
  ctx.fillStyle = '#141517';
  ctx.fillRect(0, 0, w, h * 0.06);
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.08 + i * 0.13);
    ctx.fillStyle = '#e9e1cf';
    ctx.beginPath();
    ctx.arc(x, h * 0.03, w * 0.022, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, h * 0.97, w * 0.022, 0, TAU);
    ctx.fill();
  }

  for (let row = 0; row < 5; row++) {
    const y = h * (0.18 + row * 0.13);
    for (let col = 0; col < 5; col++) {
      const x = w * (0.12 + col * 0.19);
      ctx.fillStyle = (row + col) % 4 === 0 ? '#292b2c' : '#0b0c0d';
      ctx.beginPath();
      ctx.roundRect(x, y, w * 0.075, h * 0.045, w * 0.012);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const shine = ctx.createLinearGradient(0, 0, w, h);
  shine.addColorStop(0, 'rgba(255,255,255,0.12)');
  shine.addColorStop(0.35, 'rgba(255,255,255,0)');
  shine.addColorStop(0.7, 'rgba(255,250,232,0.08)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawCrt(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#041611');
  bg.addColorStop(0.55, '#03100c');
  bg.addColorStop(1, '#010604');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, y, w, 1);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const sweep = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.45);
  sweep.addColorStop(0, 'rgba(47,224,164,0)');
  sweep.addColorStop(0.5, 'rgba(47,224,164,0.15)');
  sweep.addColorStop(1, 'rgba(47,224,164,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, h * 0.1, w, h * 0.35);
  ctx.restore();

  ctx.strokeStyle = 'rgba(111,255,195,0.6)';
  ctx.fillStyle = 'rgba(10,53,38,0.58)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = h * (0.2 + i * 0.14);
    const bw = w * (0.62 - (i % 2) * 0.16);
    ctx.fillRect(w * 0.12, y, bw, h * 0.065);
    ctx.strokeRect(w * 0.12, y, bw, h * 0.065);
    ctx.beginPath();
    ctx.moveTo(w * 0.17, y + h * 0.032);
    ctx.lineTo(w * 0.17 + bw * 0.7, y + h * 0.032);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(47,224,164,0.55)';
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const x = (w / 35) * i;
    const y =
      h * 0.72 +
      Math.sin(i * 0.52) * h * 0.028 +
      Math.sin(i * 0.16) * h * 0.018;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(47,224,164,0.8)';
  for (let i = 0; i < 10; i++) {
    const x = w * (0.1 + hash2(i, 1, 61) * 0.8);
    const y = h * (0.14 + hash2(i, 2, 61) * 0.7);
    ctx.globalAlpha = 0.2 + hash2(i, 3, 61) * 0.5;
    ctx.fillRect(x, y, 1.4, h * 0.035);
  }
  ctx.globalAlpha = 1;
}

function drawNeural(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#081529');
  bg.addColorStop(0.55, '#050d1b');
  bg.addColorStop(1, '#02040a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const layers = [0.16, 0.4, 0.64, 0.86];
  const nodeCounts = [4, 6, 6, 4];
  const nodes = layers.map((lx, li) => {
    const list = [];
    for (let n = 0; n < nodeCounts[li]; n++) {
      list.push({
        x: w * lx,
        y: h * (0.18 + (n + 0.5) * 0.64 / nodeCounts[li]),
        warm: (n + li) % 5 === 0
      });
    }
    return list;
  });

  for (let li = 0; li < nodes.length - 1; li++) {
    for (const a of nodes[li]) {
      for (const b of nodes[li + 1]) {
        ctx.strokeStyle = `rgba(92,190,255,${0.035 + hash2(a.x | 0, b.y | 0, 19) * 0.12})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  for (const layer of nodes) {
    for (const node of layer) {
      const color = node.warm ? '#ffb364' : '#63dfff';
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, w * 0.16);
      glow.addColorStop(0, hexA(color, 0.72));
      glow.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, w * 0.022, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.arc(node.x - w * 0.005, node.y - w * 0.005, w * 0.007, 0, TAU);
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(99,223,255,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, w * 0.42, 0, TAU);
  ctx.stroke();
}

function drawCity(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#020612');
  bg.addColorStop(0.65, '#03101b');
  bg.addColorStop(1, '#01050b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.73;
  ctx.strokeStyle = 'rgba(99,223,255,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const x = (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(w * 0.5 + (x - w * 0.5) * 0.16, horizon);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const y = horizon + (h - horizon) * (i / 5) ** 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  for (let i = 0; i < 8; i++) {
    const bw = w * (0.08 + hash2(i, 1, 83) * 0.12);
    const bh = h * (0.16 + hash2(i, 2, 83) * 0.4);
    const x = w * (0.03 + i * 0.125);
    const y = horizon - bh;
    ctx.fillStyle = `rgba(8,35,51,${0.25 + hash2(i, 3, 83) * 0.35})`;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = 'rgba(99,223,255,0.4)';
    ctx.strokeRect(x, y, bw, bh);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = 'rgba(99,223,255,0.24)';
      ctx.fillRect(x + bw * 0.14, y + bh * (0.12 + k * 0.15), bw * 0.22, 1.2);
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = 'rgba(140,135,255,0.5)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.48, w * 0.48, 0.2, Math.PI * 1.55);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(99,223,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.quadraticCurveTo(w * 0.62, h * 0.25, w, h * 0.48);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,152,72,0.8)';
  ctx.beginPath();
  ctx.arc(w * 0.44, h * 0.7, w * 0.025, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const warm = ctx.createRadialGradient(w * 0.44, h * 0.7, 0, w * 0.44, h * 0.7, w * 0.22);
  warm.addColorStop(0, 'rgba(255,190,110,0.42)');
  warm.addColorStop(1, 'rgba(255,100,30,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ------------------------------------------------------------
// Global focal spill
// ------------------------------------------------------------

function drawFocalSpill(ctx, stripe, width, height) {
  const cx = stripe.x + stripe.w * 0.665;
  const cy = stripe.y + stripe.h * 0.47 + stripe.w * 0.2294;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const wide = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.19);
  wide.addColorStop(0, 'rgba(255,222,160,0.17)');
  wide.addColorStop(0.18, 'rgba(255,148,57,0.12)');
  wide.addColorStop(0.55, 'rgba(220,72,24,0.038)');
  wide.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = wide;
  ctx.fillRect(0, 0, width, height);

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.048);
  core.addColorStop(0, 'rgba(255,255,230,0.3)');
  core.addColorStop(0.35, 'rgba(255,204,120,0.18)');
  core.addColorStop(1, 'rgba(255,130,40,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function hexA(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
