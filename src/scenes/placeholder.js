import { GROUPS, fillHex, strokeHex } from '../kit/palette.js';
import { clamp, smoothstep } from '../kit/rng.js';
import { drawTitleCard } from '../kit/text.js';

// 标题卡只属于当前版块，避免镜头提前看到下一段时带出下一段标题。
function currentBlockAt(globalT, fallback) {
  if (!Number.isFinite(globalT)) return fallback;
  return Math.min(20, Math.max(1, Math.floor((globalT - 5) / 6) + 1));
}

// 阶段 1 的占位版块：只标名、分组、给出进场/高光/离场三段结构，不做具体美术。
export function makePlaceholderScene(config) {
  return {
    ...config,
    duration: 6,
    draw(p, state) {
      const { localT = 0 } = state;
      const t = clamp(localT, 0, 6);
      const g = GROUPS[config.group];

      p.noStroke();
      fillHex(p, g.bg, 1);
      p.rect(0, 0, 1000, 1000);

      for (let i = 0; i < 6; i++) {
        fillHex(p, g.soft, i % 2 === 0 ? 0.06 : 0.035);
        p.rect(0, 132 + i * 140, 1000, 2);
      }

      // 镜头会提前看到下一段：未轮到的占位只保留底材，
      // 不把边框、大号编号、标题、高光占位和标签带进上一段。
      const active = config.id === currentBlockAt(state.globalT, config.id);
      if (!active) return;

      p.noFill();
      strokeHex(p, g.soft, 0.7);
      p.strokeWeight(2);
      p.rect(48, 248, 904, 224, 4);

      p.noStroke();
      fillHex(p, g.soft, 0.2);
      p.textFont(g.font);
      p.textAlign(p.RIGHT, p.TOP);
      p.textSize(150);
      p.text(String(config.id).padStart(2, '0'), 930, 258);

      // 标题卡在版块起点（强拍）直接出现，第 2 小节内淡出，避免边界处空面板。
      const titleAlpha = 1 - smoothstep(2.2, 2.8, t);
      drawTitleCard(p, {
        ...config,
        number: config.id,
        x: 300,
        y: 362,
        alpha: titleAlpha
      });

      // 第 2 小节：高光占位
      const highlight =
        smoothstep(1.9, 2.3, t) * (1 - smoothstep(3.9, 4.4, t));
      if (highlight > 0.001) {
        const pulse = 0.5 + 0.5 * Math.sin((t - 2) * Math.PI * 2);
        p.noStroke();
        fillHex(p, g.accent, 0.1 * highlight);
        p.ellipse(720, 362, 124 + pulse * 22, 124 + pulse * 22);
        p.noFill();
        strokeHex(p, g.accent, 0.85 * highlight);
        p.strokeWeight(2);
        p.ellipse(720, 362, 120, 120);
        p.noStroke();
        fillHex(p, g.accent, 0.9 * highlight);
        p.textAlign(p.CENTER, p.CENTER);
        p.textFont(g.font);
        p.textSize(14);
        p.text('高光占位', 720, 362);
      }

      // 第 3 小节：离场箭头
      const exit = smoothstep(4.0, 5.1, t);
      if (exit > 0.001) {
        p.noFill();
        strokeHex(p, g.accent, 0.7 * exit);
        p.strokeWeight(3);
        for (let k = 0; k < 3; k++) {
          const x = 818 + k * 34;
          p.line(x, 338, x + 18, 362);
          p.line(x + 18, 362, x, 386);
        }
      }

      if (titleAlpha > 0.001) {
        p.noStroke();
        fillHex(p, g.soft, 0.8 * titleAlpha);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.textFont(g.font);
        p.textSize(11);
        p.text('PLACEHOLDER / 骨架占位', 60, 470);
      }
    }
  };
}
