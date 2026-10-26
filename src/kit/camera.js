import {
  LOOK_AHEAD,
  ROAD_Y,
  cameraZoomAt,
  protagonistWorldX
} from '../beat/timeline.js';

// 1000 单位的方形作画空间里，开一个 16:9 视窗。
export const VISIBLE_HEIGHT_UNITS = (1000 * 9) / 16; // 562.5

export function cameraAt(t, override = null) {
  if (override) return override;
  return {
    x: protagonistWorldX(t) + LOOK_AHEAD,
    y: ROAD_Y,
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
