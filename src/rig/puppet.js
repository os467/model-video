import { ROAD_Y, protagonistWorldX } from '../beat/timeline.js';
import { GROUPS, groupForBlock, fillHex, strokeHex } from '../kit/palette.js';

// 阶段 1：统一剪影，两三个关节，循环运动对应两拍（1 秒）。
const LOOP_SECONDS = 1.0;

export function puppetPose(t) {
  const phase = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  const angle = phase * Math.PI * 2;
  return {
    phase,
    swing: Math.sin(angle),
    bob: Math.abs(Math.cos(angle)) * 3.5
  };
}

export function drawPuppet(
  p,
  t,
  {
    x = protagonistWorldX(t),
    group = groupForBlock(1),
    alpha = 1,
    scale = 1
  } = {}
) {
  const g = GROUPS[group];
  const pose = puppetPose(t);
  const body = g.ink;

  p.push();
  p.translate(x, ROAD_Y);
  p.scale(scale);

  p.noStroke();
  fillHex(p, '#000000', 0.18 * alpha);
  p.ellipse(0, 0, 54, 10);

  const hipX = 0;
  const hipY = -58 - pose.bob;
  const legSwing = 13 * pose.swing;
  const baseStance = 6;
  const frontFoot = baseStance + legSwing;
  const backFoot = -baseStance - legSwing;

  p.strokeCap(p.ROUND);
  strokeHex(p, body, alpha);
  p.strokeWeight(6);
  p.line(hipX, hipY, hipX + backFoot * 0.55, hipY + 28);
  p.line(hipX + backFoot * 0.55, hipY + 28, hipX + backFoot, -1);
  p.line(hipX, hipY, hipX + frontFoot * 0.55, hipY + 28);
  p.line(hipX + frontFoot * 0.55, hipY + 28, hipX + frontFoot, -1);

  const armSwing = 4 + 9 * pose.swing;
  p.strokeWeight(5);
  p.line(hipX, hipY - 28, hipX + armSwing, hipY + 2);
  p.line(hipX, hipY - 28, hipX - armSwing, hipY + 2);

  p.noStroke();
  fillHex(p, body, alpha);
  p.rectMode(p.CENTER);
  p.rect(0, hipY - 24, 26, 58, 13);
  p.rectMode(p.CORNER);
  p.ellipse(0, hipY - 64, 30, 30);

  fillHex(p, g.accent, alpha);
  p.ellipse(0, hipY - 26, 12, 12);

  p.pop();
}
