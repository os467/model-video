import {
  BLOCK_COUNT,
  BLOCK_DURATION,
  BLOCK_WORLD_WIDTH,
  blockStartTime,
  blockWorldStart,
  clamp,
  protagonistWorldX,
  quantizeHzForBlock,
  quantizeTime
} from '../beat/timeline.js';
import { applyCamera, cameraAt, visibleWorldRange } from '../kit/camera.js';
import { GROUPS, groupForBlock, fillHex, mixHex } from '../kit/palette.js';
import { drawRoad } from '../kit/road.js';
import { smoothstep } from '../kit/rng.js';
import { drawPuppet } from '../rig/puppet.js';
import { SCENES } from '../scenes/index.js';

export function drawBlock(p, t, loc, width, height) {
  const currentScene = SCENES[loc.blockIndex - 1];
  const cam = cameraAt(t);
  const { x0, x1 } = visibleWorldRange(cam, width, height);

  p.noStroke();
  fillHex(p, backdropColor(loc), 1);
  p.rect(0, 0, width, height);

  p.push();
  applyCamera(p, cam, width, height);

  const first = Math.max(1, Math.floor(x0 / BLOCK_WORLD_WIDTH) + 1);
  const last = Math.min(BLOCK_COUNT, Math.floor(x1 / BLOCK_WORLD_WIDTH) + 1);

  for (let i = first; i <= last; i++) {
    const scene = SCENES[i - 1];
    const rawLocal = clamp(t - blockStartTime(i), 0, BLOCK_DURATION);
    const hz = quantizeHzForBlock(i);
    const localT = hz ? quantizeTime(rawLocal, hz) : rawLocal;

    p.push();
    p.translate(blockWorldStart(i), 0);
    scene.draw(p, {
      localT,
      rawLocalT: rawLocal,
      blockIndex: i,
      globalT: t,
      progress: rawLocal / BLOCK_DURATION
    });
    p.pop();
  }

  drawRoad(p, t, x0, x1);

  // 场景可选接管自己的路：在默认路之上重绘本段，保持全局路连续。
  for (let i = first; i <= last; i++) {
    const scene = SCENES[i - 1];
    if (typeof scene.drawRoad !== 'function') continue;
    const rawLocal = clamp(t - blockStartTime(i), 0, BLOCK_DURATION);
    p.push();
    p.translate(blockWorldStart(i), 0);
    scene.drawRoad(p, {
      localT: rawLocal,
      rawLocalT: rawLocal,
      blockIndex: i,
      globalT: t
    });
    p.pop();
  }

  // 场景可选接管主角：有 drawActor 就用场景自己的形态，否则用默认木偶。
  if (typeof currentScene.drawActor === 'function') {
    currentScene.drawActor(p, {
      t,
      localT: clamp(t - blockStartTime(loc.blockIndex), 0, BLOCK_DURATION),
      blockIndex: loc.blockIndex,
      group: groupForBlock(loc.blockIndex),
      x: protagonistWorldX(t)
    });
  } else {
    drawPuppet(p, t, { group: groupForBlock(loc.blockIndex) });
  }
  p.pop();

  drawVignette(p, width, height);
}

function backdropColor(loc) {
  const current = groupForBlock(loc.blockIndex);
  const previous =
    loc.blockIndex > 1 ? groupForBlock(loc.blockIndex - 1) : current;
  const k = smoothstep(0, 0.35, loc.localT);
  return mixHex(GROUPS[previous].bg, GROUPS[current].bg, k);
}

function drawVignette(p, width, height) {
  const ctx = p.drawingContext;
  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.34,
    width / 2,
    height / 2,
    height * 0.78
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.26)');
  // 直接改 ctx.fillStyle 会绕过 p5 的填充缓存，必须 save/restore。
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
