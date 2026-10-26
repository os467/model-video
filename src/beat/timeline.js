// 全片时间轴：唯一事实来源。
// 120 BPM，4/4，一小节 2 秒。Intro 采用半小节 pickup：
// 全片强拍落在奇数秒，第 i 个版块从 5 + 6(i-1) 秒开始。

export const BPM = 120;
export const BEATS_PER_BAR = 4;
export const SECONDS_PER_BEAT = 60 / BPM; // 0.5
export const SECONDS_PER_BAR = SECONDS_PER_BEAT * BEATS_PER_BAR; // 2

export const BLOCK_COUNT = 20;
export const INTRO_BARS = 2.5;
export const BLOCK_BARS = 3;
export const OUTRO_BARS = 6;

export const INTRO_DURATION = INTRO_BARS * SECONDS_PER_BAR; // 5
export const BLOCK_DURATION = BLOCK_BARS * SECONDS_PER_BAR; // 6
export const OUTRO_DURATION = OUTRO_BARS * SECONDS_PER_BAR; // 12

export const BLOCKS_START = INTRO_DURATION; // 5
export const OUTRO_START = BLOCKS_START + BLOCK_COUNT * BLOCK_DURATION; // 125
export const TOTAL_DURATION = OUTRO_START + OUTRO_DURATION; // 137

// 世界坐标：整片一条全局长路，每个版块占 1000 单位。
export const BLOCK_WORLD_WIDTH = 1000;
export const ROAD_Y = 500;
export const LOOK_AHEAD = 220;
export const CAMERA_ZOOM_PULSE = 0.05;
export const QUANTIZE_HZ = 10;

export const BLOCK_START_TIMES = Object.freeze(
  Array.from({ length: BLOCK_COUNT }, (_, i) => BLOCKS_START + i * BLOCK_DURATION)
);
export const BOUNDARIES = Object.freeze([...BLOCK_START_TIMES, OUTRO_START]);

// 强拍偏移：0.5s 一拍，奇数秒是 4/4 的第三拍（半小节 pickup）。
export const STRONG_BEAT_OFFSET = 1.0;

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function blockStartTime(index) {
  return BLOCKS_START + (index - 1) * BLOCK_DURATION;
}

export function blockWorldStart(index) {
  return (index - 1) * BLOCK_WORLD_WIDTH;
}

export function blockWorldEnd(index) {
  return index * BLOCK_WORLD_WIDTH;
}

export function protagonistWorldX(t) {
  const blocks = clamp((t - BLOCKS_START) / BLOCK_DURATION, 0, BLOCK_COUNT);
  return blocks * BLOCK_WORLD_WIDTH;
}

export function locate(t) {
  const time = clamp(t, 0, TOTAL_DURATION);

  if (time < BLOCKS_START) {
    return {
      part: 'intro',
      time,
      blockIndex: 0,
      localT: time,
      progress: time / BLOCKS_START,
      bar: time / SECONDS_PER_BAR,
      beat: time / SECONDS_PER_BEAT
    };
  }

  if (time >= OUTRO_START) {
    const localT = time - OUTRO_START;
    return {
      part: 'outro',
      time,
      blockIndex: 0,
      localT,
      progress: localT / OUTRO_DURATION,
      bar: localT / SECONDS_PER_BAR,
      beat: localT / SECONDS_PER_BEAT
    };
  }

  const blockIndex = Math.min(
    BLOCK_COUNT,
    Math.floor((time - BLOCKS_START) / BLOCK_DURATION) + 1
  );
  const localT = time - blockStartTime(blockIndex);
  return {
    part: 'block',
    time,
    blockIndex,
    localT,
    progress: localT / BLOCK_DURATION,
    bar: localT / SECONDS_PER_BAR,
    beat: localT / SECONDS_PER_BEAT
  };
}

export function quantizeTime(t, hz = QUANTIZE_HZ) {
  return Math.floor(t * hz + 1e-9) / hz;
}

export function quantizeHzForBlock(index) {
  return index === 2 || index === 4 || index === 11 ? QUANTIZE_HZ : 0;
}

// 版块边界处镜头推近的包络：边界处为 1，半宽之外为 0。
export function boundaryPulse(t, halfWidth = 0.45) {
  let pulse = 0;
  for (const boundary of BOUNDARIES) {
    const d = Math.abs(t - boundary) / halfWidth;
    if (d < 1) {
      const c = Math.cos((d * Math.PI) / 2);
      pulse = Math.max(pulse, c * c);
    }
  }
  return pulse;
}

export function cameraZoomAt(t) {
  return 1 + CAMERA_ZOOM_PULSE * boundaryPulse(t);
}

export function isStrongBeat(t, tolerance = 0.02) {
  const beats = (t - STRONG_BEAT_OFFSET) / SECONDS_PER_BEAT;
  return Math.abs(beats - Math.round(beats)) < tolerance;
}
