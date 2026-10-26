import {
  BLOCK_DURATION,
  BLOCK_WORLD_WIDTH,
  ROAD_Y,
  blockStartTime,
  blockWorldStart
} from '../beat/timeline.js';
import { applyCamera } from '../kit/camera.js';
import { GROUPS, groupForBlock, fillHex } from '../kit/palette.js';
import { drawRoad } from '../kit/road.js';
import { drawPuppet } from '../rig/puppet.js';
import { SCENES } from '../scenes/index.js';

const SNAP_W = 640;
const SNAP_H = 360;

// Outro 第 1–20 格的离屏单帧渲染接口：
// 每个版块在“高光时刻”渲染一次，主画面与展墙共用同一条绘制路径。
export function makeSnapshots(p) {
  return SCENES.map((scene, idx) => {
    const index = idx + 1;
    const highlightT = blockStartTime(index) + BLOCK_DURATION * 0.5;
    const cam = {
      x: blockWorldStart(index) + BLOCK_WORLD_WIDTH / 2,
      y: ROAD_Y,
      zoom: 1
    };

    const g = p.createGraphics(SNAP_W, SNAP_H);
    g.pixelDensity(1);
    g.noStroke();
    fillHex(g, GROUPS[scene.group].bg, 1);
    g.rect(0, 0, SNAP_W, SNAP_H);

    g.push();
    applyCamera(g, cam, SNAP_W, SNAP_H);

    g.push();
    g.translate(blockWorldStart(index), 0);
    scene.draw(g, {
      localT: BLOCK_DURATION * 0.5,
      rawLocalT: BLOCK_DURATION * 0.5,
      blockIndex: index,
      globalT: highlightT,
      progress: 0.5
    });
    g.pop();

    drawRoad(g, highlightT, cam.x - BLOCK_WORLD_WIDTH / 2, cam.x + BLOCK_WORLD_WIDTH / 2);

    if (typeof scene.drawRoad === 'function') {
      g.push();
      g.translate(blockWorldStart(index), 0);
      scene.drawRoad(g, {
        localT: BLOCK_DURATION * 0.5,
        rawLocalT: BLOCK_DURATION * 0.5,
        blockIndex: index,
        globalT: highlightT
      });
      g.pop();
    }

    if (typeof scene.drawActor === 'function') {
      scene.drawActor(g, {
        t: highlightT,
        localT: BLOCK_DURATION * 0.5,
        blockIndex: index,
        group: groupForBlock(index),
        x: cam.x
      });
    } else {
      drawPuppet(g, highlightT, { x: cam.x, group: groupForBlock(index) });
    }
    g.pop();

    return g;
  });
}
