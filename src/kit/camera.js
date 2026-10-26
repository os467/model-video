import {
  BOUNDARIES,
  LOOK_AHEAD,
  ROAD_Y,
  cameraZoomAt,
  protagonistWorldX
} from '../beat/timeline.js';

// 1000 单位的方形作画空间里，开一个 16:9 视窗。
export const VISIBLE_HEIGHT_UNITS = (1000 * 9) / 16; // 562.5
const SHAKE_AMP = 3.2;
const SHAKE_ATTACK = 0.035;
const SHAKE_DECAY = 10.5;

// 穿过版块边界后的极小阻尼回弹：先迅速起振，再自然衰减。
// 振幅只有几个世界单位（1080p 下约数像素），不改变镜头构图。
function cameraShakeAt(t) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < BOUNDARIES.length; i++) {
    const dt = t - BOUNDARIES[i];
    if (dt < 0 || dt > 0.6) continue;
    const attack = dt < SHAKE_ATTACK ? dt / SHAKE_ATTACK : 1;
    const decay =
      dt < SHAKE_ATTACK ? 1 : Math.exp(-(dt - SHAKE_ATTACK) * SHAKE_DECAY);
    const amp = SHAKE_AMP * attack * decay;
    const phase = i * 2.399;
    x += Math.sin(dt * 54 + phase) * amp;
    y += Math.cos(dt * 45 + phase * 1.7) * amp * 0.45;
  }
  return { x, y };
}

export function cameraAt(t, override = null) {
  if (override) return override;
  const shake = cameraShakeAt(t);
  return {
    x: protagonistWorldX(t) + LOOK_AHEAD + shake.x,
    y: ROAD_Y + shake.y,
    zoom: cameraZoomAt(t)
  };
}

// 把世界坐标映射到 width×height 的画布/离屏画布。
export function applyCamera(p, cam, width, height) {
  const scale = (height * cam.zoom) / VISIBLE_HEIGHT_UNITS;
  p.translate(width * 0.5, height * 0.5);
  p.scale(scale);
  p.translate(-cam.x, -cam.y);
  return scale;
}

export function worldToScreen(cam, x, y, width, height) {
  const scale = (height * cam.zoom) / VISIBLE_HEIGHT_UNITS;
  return {
    x: width * 0.5 + (x - cam.x) * scale,
    y: height * 0.5 + (y - cam.y) * scale,
    scale
  };
}

export function visibleWorldRange(cam, width, height) {
  const scale = (height * cam.zoom) / VISIBLE_HEIGHT_UNITS;
  const halfWidth = width / (2 * scale);
  return {
    x0: cam.x - halfWidth,
    x1: cam.x + halfWidth
  };
}
