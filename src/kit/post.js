import { clamp } from './rng.js';

// 全片共用的电影后处理：高光 bloom、5% 边缘衰减、胶片颗粒。
// 全部由时间 t 决定，逐帧结果可复现；不使用 Math.random。
const BASE_BLOOM_W = 384;
const BASE_BLOOM_H = 216;
const BASE_BLUR_W = 192;
const BASE_BLUR_H = 108;
const BASE_GRAIN_W = 640;
const BASE_GRAIN_H = 360;

let state = null;

function makeCanvas(w, h, willRead = false) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext(
    '2d',
    willRead ? { willReadFrequently: true } : undefined
  );
  return { canvas, ctx };
}

function ensureState(W, H) {
  if (state && state.width === W && state.height === H) return state;

  // 后处理缓冲随笔面分辨率一起放大；4K 下颗粒仍是细颗粒，不会被拉成大块。
  const scale = clamp(W / 1920, 1, 2);
  const bloomW = Math.round(BASE_BLOOM_W * scale);
  const bloomH = Math.round(BASE_BLOOM_H * scale);
  const blurW = Math.round(BASE_BLUR_W * scale);
  const blurH = Math.round(BASE_BLUR_H * scale);
  const grainW = Math.round(BASE_GRAIN_W * scale);
  const grainH = Math.round(BASE_GRAIN_H * scale);

  const bloom = makeCanvas(bloomW, bloomH, true);
  const blur = makeCanvas(blurW, blurH);
  const grain = makeCanvas(grainW, grainH);
  const grainData = grain.ctx.createImageData(grainW, grainH);

  state = {
    width: W,
    height: H,
    bloomW,
    bloomH,
    blurW,
    blurH,
    bloomCanvas: bloom.canvas,
    bloomCtx: bloom.ctx,
    blurCanvas: blur.canvas,
    blurCtx: blur.ctx,
    grainCanvas: grain.canvas,
    grainCtx: grain.ctx,
    grainData,
    bloomFrame: -1,
    bloomKey: ''
  };
  return state;
}

function bloomSettings(loc) {
  if (loc.part === 'intro') return { threshold: 0.93, strength: 0.2 };
  if (loc.part === 'outro') return { threshold: 0.7, strength: 0.34 };
  const index = clamp(loc.blockIndex || 1, 1, 20);
  if (index === 20) return { threshold: 0.97, strength: 0.045 };
  if (index <= 4) return { threshold: 0.9, strength: 0.22 };
  if (index <= 8) return { threshold: 0.73, strength: 0.34 };
  if (index <= 12) return { threshold: 0.66, strength: 0.4 };
  if (index <= 16) return { threshold: 0.62, strength: 0.44 };
  return { threshold: 0.58, strength: 0.5 };
}

function drawBloom(p, t, loc, W, H) {
  const { threshold, strength } = bloomSettings(loc);
  const st = ensureState(W, H);
  const source = p.drawingContext.canvas;
  const frame = Math.floor(t * (window.__renderMode ? 240 : 30));
  const key = `${loc.part}:${loc.blockIndex}:${threshold}:${strength}`;

  // 实时预览 30Hz 更新 bloom；离线渲染每帧更新，保证 60fps 样片无阶梯。
  if (frame !== st.bloomFrame || key !== st.bloomKey) {
    // 降到低分辨率做亮部提取，再二次降采样形成柔和扩散。
    // 比全屏 canvas blur 便宜得多，且不会把整张纸面一起糊掉。
    st.bloomCtx.globalCompositeOperation = 'copy';
    st.bloomCtx.imageSmoothingEnabled = true;
    st.bloomCtx.drawImage(source, 0, 0, st.bloomW, st.bloomH);
    st.bloomCtx.globalCompositeOperation = 'source-over';

    const image = st.bloomCtx.getImageData(0, 0, st.bloomW, st.bloomH);
    const data = image.data;
    const cut = threshold * 255;
    const span = Math.max(1, 255 - cut);

    for (let i = 0; i < data.length; i += 4) {
      const luma =
        data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      let k = (luma - cut) / span;
      if (k <= 0.015) {
        data[i + 3] = 0;
        continue;
      }
      k = k > 1 ? 1 : k;
      k = k * k * (3 - 2 * k);
      data[i + 3] = Math.round(k * 255);
    }
    st.bloomCtx.putImageData(image, 0, 0);

    st.blurCtx.globalCompositeOperation = 'copy';
    st.blurCtx.imageSmoothingEnabled = true;
    st.blurCtx.drawImage(st.bloomCanvas, 0, 0, st.blurW, st.blurH);
    st.bloomFrame = frame;
    st.bloomKey = key;
  }

  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(st.blurCanvas, 0, 0, W, H);
  ctx.restore();
}

// 只压最外围 5%：四条线性渐变，不形成居中晕影，也不碰画面中段。
// 用 multiply 让纸面/暗场都自然融进边界，而不是盖一层灰雾。
function drawEdgeFalloff(p, loc, W, H) {
  const edgeX = Math.max(24, W * 0.05);
  const edgeY = Math.max(18, H * 0.05);
  const strength = loc.blockIndex === 20 ? 0.025 : 0.05;
  if (strength <= 0) return;

  const ctx = p.drawingContext;
  const dark = `rgba(18,16,14,${strength})`;
  const clear = 'rgba(18,16,14,0)';
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  const left = ctx.createLinearGradient(0, 0, edgeX, 0);
  left.addColorStop(0, dark);
  left.addColorStop(1, clear);
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, edgeX, H);

  const right = ctx.createLinearGradient(W, 0, W - edgeX, 0);
  right.addColorStop(0, dark);
  right.addColorStop(1, clear);
  ctx.fillStyle = right;
  ctx.fillRect(W - edgeX, 0, edgeX, H);

  const top = ctx.createLinearGradient(0, 0, 0, edgeY);
  top.addColorStop(0, dark);
  top.addColorStop(1, clear);
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, edgeY);

  const bottom = ctx.createLinearGradient(0, H, 0, H - edgeY);
  bottom.addColorStop(0, dark);
  bottom.addColorStop(1, clear);
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - edgeY, W, edgeY);

  ctx.restore();
}

function drawGrain(p, t, W, H, strength) {
  if (strength <= 0.001) return;
  const st = ensureState(W, H);
  const data = st.grainData.data;
  let seed = (Math.floor(t * 60) * 1664525 + 1013904223) >>> 0;

  // 每帧重新生成一组低分辨率噪点，保证颗粒逐帧漂移。
  for (let i = 0; i < data.length; i += 4) {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    const v = 128 + ((seed & 255) - 128) * 0.55;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  st.grainCtx.putImageData(st.grainData, 0, 0);
  const ctx = p.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = strength;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(st.grainCanvas, 0, 0, W, H);
  ctx.restore();
}

export function drawGlobalPost(p, t, loc, W, H) {
  drawBloom(p, t, loc, W, H);
  drawEdgeFalloff(p, loc, W, H);
  const grain =
    loc.part === 'intro'
      ? 0.045
      : loc.blockIndex === 20
        ? 0.026
        : loc.part === 'outro'
          ? 0.055
          : 0.06;
  drawGrain(p, t, W, H, grain);
}
