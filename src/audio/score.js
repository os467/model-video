import {
  BLOCK_COUNT,
  BLOCK_DURATION,
  BLOCKS_START,
  TOTAL_DURATION
} from '../beat/timeline.js';

// P4：全片配乐的总谱。只描述“什么时候、用什么音色、弹什么”，
// 具体合成在 engine.js；实时与离线共用同一份事件表。
const BEAT = 0.5;
const BAR = 2.0;

// 三小节主题：D 小调，最后落回 D。
const THEME = [
  { b: 0, d: 1, n: 62 },
  { b: 1, d: 1, n: 65 },
  { b: 2, d: 1, n: 69 },
  { b: 3, d: 1, n: 72 },
  { b: 4, d: 2, n: 70 },
  { b: 6, d: 1, n: 69 },
  { b: 7, d: 1, n: 65 },
  { b: 8, d: 1, n: 67 },
  { b: 9, d: 1, n: 69 },
  { b: 10, d: 2, n: 74 }
];

const CHORDS = [
  [50, 53, 57], // Dm
  [46, 50, 53], // Bb
  [41, 45, 48] // F
];
const BASS = [38, 34, 41];

const LEAD = {
  1: { inst: 'flute', oct: 0, gain: 0.13, pan: -0.1 },
  2: { inst: 'lyre', oct: 0, gain: 0.15, pan: -0.12 },
  3: { inst: 'lyre', oct: 0, gain: 0.14, pan: 0.1 },
  4: { inst: 'reed', oct: 0, gain: 0.13, pan: 0 },
  5: { inst: 'musicbox', oct: 12, gain: 0.12, pan: 0.16 },
  6: { inst: 'musicbox', oct: 12, gain: 0.12, pan: -0.16 },
  7: { inst: 'pluck', oct: 0, gain: 0.14, pan: 0.12 },
  8: { inst: 'glass', oct: 0, gain: 0.13, pan: -0.12 },
  9: { inst: 'sinelead', oct: 0, gain: 0.14, pan: 0 },
  10: { inst: 'sawlead', oct: 0, gain: 0.13, pan: -0.1 },
  11: { inst: 'squarelead', oct: 0, gain: 0.12, pan: 0.1 },
  12: { inst: 'bell', oct: 0, gain: 0.14, pan: 0 },
  13: { inst: 'sawlead', oct: 0, gain: 0.15, pan: -0.1 },
  14: { inst: 'sawlead', oct: 0, gain: 0.15, pan: 0.1 },
  15: { inst: 'sawlead', oct: 0, gain: 0.16, pan: 0 },
  16: { inst: 'shimmer', oct: 0, gain: 0.15, pan: 0 },
  17: { inst: 'piano', oct: 0, gain: 0.17, pan: 0 },
  18: { inst: 'marimba', oct: 0, gain: 0.15, pan: 0.1 },
  19: { inst: 'glass', oct: -12, gain: 0.11, pan: -0.1 },
  20: { inst: 'ensemble', oct: 0, gain: 0.1, pan: 0 }
};

function groupOf(index) {
  if (index <= 4) return 'paper';
  if (index <= 8) return 'mechanical';
  if (index <= 12) return 'electronic';
  return 'data';
}

function padKind(group) {
  if (group === 'paper') return 'warm';
  if (group === 'mechanical') return 'brass';
  if (group === 'electronic') return 'glass';
  return 'synth';
}

function bassFor(index) {
  if (index >= 17) return 0.09;
  if (index >= 13) return 0.12;
  return 0.1;
}

function addNote(events, t, dur, inst, midi, gain, pan = 0, extra = {}) {
  events.push({ t, dur, inst, midi, gain, pan, ...extra });
}

function addChord(events, t, dur, inst, midis, gain, pan = 0, extra = {}) {
  events.push({ t, dur, inst, midis, gain, pan, ...extra });
}

function addPerc(events, t, kind, gain, pan = 0) {
  events.push({ t, dur: 0.2, inst: 'perc', kind, gain, pan });
}

function addNoise(events, t, dur, kind, gain, pan = 0) {
  events.push({ t, dur, inst: 'noise', kind, gain, pan });
}

function addImpact(events, t, gain = 0.14) {
  events.push({ t, dur: 1.2, inst: 'impact', gain, pan: 0 });
}

function buildIntro(events) {
  addChord(events, 0, 5.0, 'pad', [38, 45, 50], 0.05, 0, { kind: 'warm' });
  addNote(events, 0, 5.0, 'hum', 38, 0.05, 0);
  // 开头不要高频白噪；用低通的空气层，慢起。
  addNoise(events, 0, 5.0, 'air', 0.008, -0.2);
  addNoise(events, 0.4, 4.4, 'room', 0.006, 0.2);

  // 第二条字幕前的主题碎片，落到 5.0 强拍。
  addNote(events, 3.2, 0.48, 'horn', 69, 0.1, -0.1);
  addNote(events, 3.75, 0.48, 'horn', 72, 0.105, 0.1);
  addNote(events, 4.3, 0.8, 'horn', 74, 0.11, 0);
  addNote(events, 4.3, 0.8, 'pad', 50, 0.028, 0, { kind: 'warm' });
}

function buildBlock(events, index) {
  const start = BLOCKS_START + (index - 1) * BLOCK_DURATION;
  const group = groupOf(index);
  const lead = LEAD[index];
  const pk = padKind(group);

  // 每个版块开始都有一记低频落点，边界落在强拍。
  addImpact(events, start, index === 1 || index === 19 ? 0.18 : 0.12);

  // 主题：同一旋律，换音色/八度/叠层。
  for (let i = 0; i < THEME.length; i++) {
    const n = THEME[i];
    const t = start + n.b * BEAT;
    const dur = n.d * BEAT;
    addNote(events, t, dur, lead.inst, n.n + lead.oct * 12, lead.gain, lead.pan);
    if (index >= 5 && index <= 8) {
      addNote(events, t + 0.25, dur * 0.5, lead.inst, n.n + lead.oct * 12 + 12, lead.gain * 0.16, -lead.pan);
    }
    if (index >= 9 && index <= 12) {
      addNote(events, t + 0.125, 0.12, lead.inst, n.n + 12, lead.gain * 0.1, -lead.pan);
    }
    if (index >= 13 && index <= 16) {
      addNote(events, t, dur, 'shimmer', n.n + 12, lead.gain * 0.24, -lead.pan);
    }
    if (index === 17) {
      addNote(events, t + 0.22, 0.25, 'bell', n.n + 12, 0.03, -0.1);
    }
    if (index === 20) {
      addNote(events, t + 0.18, dur, 'glass', n.n + 12, 0.05, 0.2);
      addNote(events, t + 0.3, 0.4, 'glass', n.n + 24, 0.025, -0.2);
    }
  }

  // 和声铺底与低音：每小节一次。
  for (let bar = 0; bar < 3; bar++) {
    const t = start + bar * BAR;
    addChord(events, t, 1.9, 'pad', CHORDS[bar], group === 'paper' ? 0.035 : 0.045, 0, {
      kind: pk
    });
    addNote(events, t, 1.8, 'bass', BASS[bar], bassFor(index), 0);
    if (index >= 13) {
      addNote(events, t + BAR * 0.5, 0.9, 'bass', BASS[bar] + 12, 0.045, 0);
    }
  }

  // 电子/数据段的琶音：每小节八个八分音符。
  if (index >= 9 && index <= 16) {
    const arpInst = index <= 12 ? 'blip' : 'arp';
    const arpGain = index <= 12 ? 0.022 : 0.03;
    const pattern = [0, 1, 2, 1, 0, 1, 2, 1];
    for (let bar = 0; bar < 3; bar++) {
      for (let k = 0; k < 8; k++) {
        const midi = CHORDS[bar][pattern[k]] + 12;
        addNote(
          events,
          start + bar * BAR + k * 0.25,
          0.2,
          arpInst,
          midi,
          arpGain,
          k % 2 ? 0.18 : -0.18
        );
      }
    }
  }

  // 17–19 留出更疏的琶音，给长程任务/真实世界留空间。
  if (index >= 17 && index <= 19) {
    for (let bar = 0; bar < 3; bar++) {
      addNote(events, start + bar * BAR + 1.0, 0.5, 'arp', CHORDS[bar][2] + 12, 0.025, 0.2);
      addNote(events, start + bar * BAR + 1.5, 0.5, 'arp', CHORDS[bar][1] + 12, 0.02, -0.2);
    }
  }

  // 每个时代的节奏层。
  if (group === 'paper') {
    if (index === 1) {
      // 与 STRIKES 精确对齐：五下主凿 + 二次压印。
      for (const t of [0.78, 1.1, 1.42, 2.54, 2.8]) {
        addPerc(events, start + t, 'stone', 0.11, -0.1);
        addPerc(events, start + t + 0.08, 'stone', 0.055, 0.1);
      }
      addNoise(events, start + 4.0, 2.0, 'stoneDraw', 0.018, -0.1);
    } else if (index === 2) {
      // 16 格压印：与 FILL_START/FILL_STEP 完全同步。
      for (let i = 0; i < 16; i++) {
        addPerc(
          events,
          start + 0.58 + (i + 0.5) * 0.105,
          'clayWrite',
          0.05,
          i % 2 ? 0.12 : -0.12
        );
      }
      addNoise(events, start + 2.62, 0.3, 'scratch', 0.035, 0.1);
      addNoise(events, start + 2.98, 0.24, 'scratch', 0.03, -0.1);
      addPerc(events, start + 3.2, 'clay', 0.06, 0.1);
      addPerc(events, start + 3.5, 'clay', 0.05, -0.1);
    } else if (index === 3) {
      for (const t of [0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9]) {
        addNoise(events, start + t, 0.28, 'write', 0.022, t % 1 === 0.5 ? 0.12 : -0.12);
      }
      for (const t of [0, 2, 4]) addPerc(events, start + t, 'chalk', 0.05, -0.1);
    } else {
      for (const t of [1.42, 1.76, 2.1]) {
        addNoise(events, start + t, 0.3, 'write', 0.03, 0);
      }
      addPerc(events, start + 2.94, 'seal', 0.1, 0.1);
      addNoise(events, start + 0.6, 4.8, 'air', 0.006, 0.15);
    }
  } else if (group === 'mechanical') {
    for (let k = 0; k < 12; k++) {
      addPerc(events, start + k * 0.5, 'gear', 0.035, k % 2 ? 0.18 : -0.18);
    }
    if (index !== 8) {
      for (const t of [1.8, 3.8, 5.8]) addNoise(events, start + t, 0.4, 'steam', 0.03, 0.2);
    }
    if (index === 6) {
      for (const t of [2.0, 2.15, 2.3, 2.45]) addPerc(events, start + t, 'type', 0.04, -0.2);
    }
    if (index === 7) {
      for (const t of [0, 2, 4]) addPerc(events, start + t, 'logic', 0.045, 0.2);
    }
  } else if (group === 'electronic') {
    // 第 9 版把“计算机启动”留到后半段灯泡亮起时。
    const blipTimes = index === 9 ? [2.35, 2.65, 2.95] : [0, 2, 4];
    for (const t of blipTimes) addPerc(events, start + t, 'blip', 0.055, 0.1);
    for (const t of [1, 3, 5]) addPerc(events, start + t, 'tape', 0.04, -0.2);
    addNoise(events, start, 6, 'hum', 0.018, 0);
    if (index === 9) {
      events.push({
        t: start + 2.78,
        dur: 0.9,
        inst: 'modem',
        gain: 0.07,
        pan: 0.1
      });
    }
  } else {
    if (index <= 18) {
      for (let k = 0; k < 12; k++) {
        addPerc(events, start + k * 0.5, 'pulse', 0.05, 0);
        if (k % 2 === 1) addPerc(events, start + k * 0.5 + 0.25, 'hat', 0.025, 0.2);
      }
    }
    if (index === 18) {
      for (const t of [0.5, 2.5, 4.5]) addPerc(events, start + t, 'tool', 0.08, -0.1);
      for (const t of [1.2, 3.2, 5.2]) addPerc(events, start + t, 'debug', 0.05, 0.2);
    }
    if (index === 19) {
      addNoise(events, start, 6, 'city', 0.026, -0.15);
      for (const t of [1, 3, 5]) addPerc(events, start + t, 'tick', 0.03, 0.2);
    }
    if (index === 20) {
      addNoise(events, start, 6, 'room', 0.014, 0.1);
      addChord(events, start, 6, 'pad', [38, 45, 50], 0.03, 0, { kind: 'synth' });
    }
  }

  // 空灵/机械底噪，把每个版块的空间托住。
  if (group === 'paper') addNoise(events, start, 6, 'room', 0.007, -0.15);
  if (group === 'data' && index < 19) addNoise(events, start, 6, 'room', 0.009, 0.15);
}

// 各版块“物体变化”的同步音效：与场景里的动作时间点对齐。
function buildSfx(events) {
  const s = (i) => BLOCKS_START + (i - 1) * BLOCK_DURATION;

  const s3 = s(3);
  for (const t of [1.0, 2.0, 3.0]) {
    addPerc(events, s3 + t, 'knob', 0.024, t < 2 ? -0.15 : 0.15);
  }

  const s5 = s(5);
  events.push({ t: s5, dur: 6, inst: 'gearroll', gain: 0.028, rate: 10.5, pan: 0 });
  events.push({ t: s5 + 1.65, dur: 0.55, inst: 'servo', gain: 0.045, pan: -0.15 });
  events.push({ t: s5 + 2.56, dur: 0.45, inst: 'servo', gain: 0.05, pan: 0.15 });
  events.push({ t: s5 + 4.15, dur: 0.7, inst: 'servo', gain: 0.035, pan: -0.1 });
  addPerc(events, s5 + 2.2, 'gear', 0.05, 0);
  for (let i = 0; i < 10; i++) {
    addPerc(events, s5 + 2.32 + i * 0.055, 'bead', 0.028, i % 2 ? 0.2 : -0.2);
  }

  const s6 = s(6);
  events.push({ t: s6, dur: 6, inst: 'gearroll', gain: 0.03, rate: 11.5, pan: 0 });
  events.push({ t: s6 + 0.5, dur: 5.2, inst: 'taperoll', gain: 0.012, pan: 0 });
  for (const t of [2.4, 3.2, 4.0, 5.0]) addPerc(events, s6 + t, 'stylus', 0.028, 0);

  const s7 = s(7);
  for (const t of [2.1, 2.4, 2.7]) addPerc(events, s7 + t, 'logic', 0.04, 0.15);

  const s8 = s(8);
  events.push({ t: s8 + 0.4, dur: 5.4, inst: 'taperoll', gain: 0.014, pan: 0 });
  for (const t of [1.0, 2.0, 3.0, 4.0, 5.0]) addPerc(events, s8 + t, 'stylus', 0.03, 0);

  const s9 = s(9);
  events.push({ t: s9, dur: 6, inst: 'conveyor', gain: 0.012, rate: 3.2, pan: 0 });
  for (const t of [2.35, 2.5, 2.65, 2.8]) {
    events.push({ t: s9 + t, dur: 0.25, inst: 'scope', gain: 0.035, pan: 0.1 });
  }

  const s10 = s(10);
  for (const t of [0.5, 1.2, 1.9, 2.6]) {
    events.push({ t: s10 + t, dur: 0.45, inst: 'radar', gain: 0.035, pan: -0.1 });
  }
  for (const t of [1.8, 2.05, 2.2, 2.35, 2.5]) {
    addPerc(events, s10 + t, 'knob', 0.03, t < 2.1 ? -0.15 : 0.15);
  }
  addPerc(events, s10 + 2.8, 'sign', 0.05, 0);

  const s11 = s(11);
  for (const t of [0.35, 0.55, 0.74, 0.9]) {
    addPerc(events, s11 + t, 'sign', 0.045, t < 0.7 ? -0.15 : 0.15);
  }
  for (const t of [2.78, 2.9]) addPerc(events, s11 + t, 'flip', 0.045, 0);
  addNote(events, s11 + 2.45, 0.6, 'bell', 86, 0.05, 0);
  for (const t of [1.0, 2.0]) {
    events.push({ t: s11 + t, dur: 0.4, inst: 'radar', gain: 0.028, pan: 0.1 });
  }
  for (const t of [2.1, 2.3]) addPerc(events, s11 + t, 'knob', 0.028, 0.1);

  const s12 = s(12);
  for (const t of [2.1, 2.4, 2.7, 2.9]) {
    events.push({ t: s12 + t, dur: 0.25, inst: 'scope', gain: 0.035, pan: -0.1 });
  }
  addNoise(events, s12 + 0.6, 1.2, 'write', 0.015, 0);

  const s13 = s(13);
  for (const t of [2.55, 2.72, 2.9]) {
    events.push({ t: s13 + t, dur: 0.45, inst: 'activate', gain: 0.05, pan: 0 });
  }
  addPerc(events, s13 + 2.55, 'pulse', 0.06, 0);

  const s14 = s(14);
  for (let i = 0; i < 8; i++) {
    addPerc(events, s14 + 0.4 + i * 0.1, 'tick', 0.024, i % 2 ? 0.2 : -0.2);
  }
  for (const [t, midi] of [[2.2, 81], [2.5, 84], [2.8, 88]]) {
    addNote(events, s14 + t, 0.45, 'bell', midi, 0.04, 0.1);
  }
  addPerc(events, s14 + 2.9, 'flip', 0.04, 0);

  const s15 = s(15);
  for (const t of [2.6, 2.8, 3.0]) {
    events.push({ t: s15 + t, dur: 0.5, inst: 'activate', gain: 0.055, pan: 0 });
  }
  for (let i = 0; i < 6; i++) {
    addPerc(events, s15 + 2.62 + i * 0.06, 'tick', 0.02, i % 2 ? 0.2 : -0.2);
  }

  const s17 = s(17);
  addPerc(events, s17 + 2.0, 'knob', 0.04, -0.15);
  addPerc(events, s17 + 2.6, 'knob', 0.04, 0.15);
  addNote(events, s17 + 2.35, 0.5, 'bell', 84, 0.035, 0);
}

// 全片性的气氛：转场 riser + 15–20 的低频 drone/高频 sparkle。
function buildAtmosphere(events) {
  const s = (i) => BLOCKS_START + (i - 1) * BLOCK_DURATION;
  const risers = [
    [4.35, 0.65, 0.04],
    [s(5) - 0.7, 0.7, 0.045],
    [s(9) - 0.7, 0.7, 0.05],
    [s(13) - 0.7, 0.7, 0.055],
    [s(15) - 0.7, 0.7, 0.06],
    [s(17) - 0.7, 0.7, 0.06],
    [s(18) - 0.7, 0.7, 0.062],
    [s(19) - 0.7, 0.7, 0.07],
    [s(20) - 0.7, 0.7, 0.07]
  ];
  for (const [t, dur, gain] of risers) {
    events.push({ t, dur, inst: 'riser', gain, pan: 0 });
  }

  for (const [index, midi, gain] of [
    [15, 33, 0.018],
    [16, 33, 0.02],
    [17, 31, 0.014],
    [18, 33, 0.022],
    [19, 31, 0.018]
  ]) {
    events.push({
      t: s(index),
      dur: 6,
      inst: 'drone',
      midi,
      gain,
      pan: 0
    });
  }

  const sparkles = [
    [15, [[1.2, 88], [2.4, 91], [3.6, 95]]],
    [16, [[0.8, 84], [2.0, 88], [3.2, 91], [4.4, 96]]],
    [17, [[2.2, 91], [3.4, 95]]],
    [18, [[1.5, 88], [3.0, 93]]],
    [19, [[2.0, 86], [4.0, 91]]]
  ];
  for (const [index, notes] of sparkles) {
    for (const [t, midi] of notes) {
      addNote(events, s(index) + t, 0.55, 'shimmer', midi, 0.028, t % 1 ? 0.2 : -0.2);
    }
  }
}

// 16→19 的连续爬升：16 保持原编排，17/18/19 逐段加低频、
// 加铜管/弦乐、加琶音与高频 sparkle，19 到全片最高点。
function buildClimax(events) {
  const s = (i) => BLOCKS_START + (i - 1) * BLOCK_DURATION;

  // 15→16 的桥：一个持续高音 + 16 的 riser，避免断崖。
  addNote(events, s(16) - 0.85, 1.7, 'shimmer', 86, 0.034, 0);
  events.push({ t: s(16) - 0.65, dur: 0.65, inst: 'riser', gain: 0.052, pan: 0 });

  // 17：推理模型。钢琴主题下加低八度锯齿与每拍低频，开始变厚。
  const s17 = s(17);
  for (const n of THEME) {
    const t = s17 + n.b * BEAT;
    const dur = n.d * BEAT;
    addNote(events, t, dur, 'sawlead', n.n - 12, 0.052, -0.15);
    addNote(events, t + 0.22, 0.25, 'bell', n.n + 12, 0.022, 0.1);
  }
  for (let b = 0; b < 12; b++) {
    const bar = Math.floor(b / 4);
    addNote(events, s17 + b * BEAT, 0.3, 'bass', BASS[bar], 0.045, 0);
  }
  for (let bar = 0; bar < 3; bar++) {
    addChord(events, s17 + bar * BAR, 1.7, 'pad', CHORDS[bar], 0.028, 0, { kind: 'synth' });
  }

  // 18：工具与调试。铜管短和弦、低八度主题、更密的琶音。
  const s18 = s(18);
  for (const n of THEME) {
    const t = s18 + n.b * BEAT;
    const dur = n.d * BEAT;
    addNote(events, t, dur, 'sawlead', n.n - 12, 0.06, 0.15);
  }
  for (let b = 0; b < 12; b++) {
    const bar = Math.floor(b / 4);
    addNote(events, s18 + b * BEAT, 0.3, 'bass', BASS[bar], 0.052, 0);
  }
  for (let bar = 0; bar < 3; bar++) {
    for (let k = 0; k < 8; k++) {
      addNote(
        events,
        s18 + bar * BAR + k * 0.25,
        0.16,
        'arp',
        CHORDS[bar][k % 3] + 24,
        0.017,
        k % 2 ? 0.22 : -0.22
      );
    }
  }

  // 19：真实世界，全片最高点。原主题升八度、弦乐铺满、16 分琶音和每拍低频。
  const s19 = s(19);
  for (const n of THEME) {
    const t = s19 + n.b * BEAT;
    const dur = n.d * BEAT;
    addNote(events, t, dur, 'sawlead', n.n + 12, 0.085, -0.08);
    addNote(events, t, dur, 'shimmer', n.n + 24, 0.026, 0.2);
  }
  for (let b = 0; b < 12; b++) {
    const bar = Math.floor(b / 4);
    addNote(events, s19 + b * BEAT, 0.28, 'bass', BASS[bar], 0.062, 0);
    addPerc(events, s19 + b * BEAT + 0.25, 'hat', 0.022, 0.2);
  }
  for (let bar = 0; bar < 3; bar++) {
    for (let k = 0; k < 16; k++) {
      addNote(
        events,
        s19 + bar * BAR + k * 0.125,
        0.1,
        'arp',
        CHORDS[bar][k % 3] + 24,
        0.019,
        k % 2 ? 0.24 : -0.24
      );
    }
  }
  addImpact(events, s19 + 2.9, 0.12);
}

// 乐器层累积：13 低弦进场，之后每进一个阶段加一件，19 全体合奏。
// 主旋律不变；新层只做和声、低音、节奏和高音点缀。
function buildLayers(events) {
  const s = (i) => BLOCKS_START + (i - 1) * BLOCK_DURATION;

  // 13 起：低音弦乐铺底，随阶段缓慢加厚。
  for (let i = 13; i <= 19; i++) {
    const gain = 0.022 + (i - 13) * 0.0025;
    for (let bar = 0; bar < 3; bar++) {
      addChord(
        events,
        s(i) + bar * BAR,
        1.8,
        'strings',
        [CHORDS[bar][0] - 12, CHORDS[bar][2] - 12],
        gain,
        -0.15,
        { kind: 'warm' }
      );
    }
  }
  addChord(events, s(13) + 0.15, 0.9, 'strings', [CHORDS[0][0] - 12, CHORDS[0][2] - 12], 0.035, -0.2, {
    kind: 'warm'
  });

  // 14 起：高音玻璃/钟，一小节一颗。
  for (let i = 14; i <= 19; i++) {
    const gain = 0.018 + (i - 14) * 0.002;
    for (let bar = 0; bar < 3; bar++) {
      addNote(events, s(i) + bar * BAR, 1.4, 'glass', CHORDS[bar][2] + 24, gain, 0.2);
    }
  }
  addNote(events, s(14) + 0.18, 0.9, 'glass', CHORDS[0][2] + 24, 0.04, 0.2);

  // 15 起：铜管短和弦。
  for (let i = 15; i <= 19; i++) {
    const gain = 0.03 + (i - 15) * 0.003;
    for (let bar = 0; bar < 3; bar++) {
      addChord(events, s(i) + bar * BAR, 0.55, 'brass', CHORDS[bar], gain, 0);
    }
  }
  addChord(events, s(15) + 0.16, 0.7, 'brass', CHORDS[0], 0.05, 0);

  // 16 起：高弦长音。
  for (let i = 16; i <= 19; i++) {
    const gain = 0.022 + (i - 16) * 0.0025;
    for (let bar = 0; bar < 3; bar++) {
      addChord(
        events,
        s(i) + bar * BAR,
        1.7,
        'highstrings',
        CHORDS[bar].map((n) => n + 12),
        gain,
        0.15
      );
    }
  }
  addChord(events, s(16) + 0.16, 1.0, 'highstrings', CHORDS[0].map((n) => n + 12), 0.04, 0.15);

  // 17 起：大提琴低音线。
  for (let i = 17; i <= 19; i++) {
    const gain = 0.022 + (i - 17) * 0.002;
    for (let bar = 0; bar < 3; bar++) {
      addNote(events, s(i) + bar * BAR, 1.8, 'cello', BASS[bar], gain, -0.1);
    }
  }
  addNote(events, s(17) + 0.16, 1.0, 'cello', BASS[0], 0.04, -0.1);

  // 18 起：定音鼓，每小节一记。
  for (let i = 18; i <= 19; i++) {
    const gain = 0.05 + (i - 18) * 0.012;
    for (let bar = 0; bar < 3; bar++) {
      addPerc(events, s(i) + bar * BAR, 'timpani', gain, 0);
    }
  }
  addPerc(events, s(18) + 0.16, 'timpani', 0.08, 0);

  // 19：唱诗班进来，全体合奏到顶。
  for (let bar = 0; bar < 3; bar++) {
    addChord(
      events,
      s(19) + bar * BAR,
      1.7,
      'choir',
      [CHORDS[bar][0] + 12, CHORDS[bar][2] + 12],
      0.05,
      0
    );
  }
  addChord(events, s(19) + 0.1, 1.2, 'choir', [CHORDS[0][0] + 12, CHORDS[0][2] + 12], 0.06, 0);
}

function buildOutro(events) {
  const start = 125;
  addImpact(events, start, 0.18);
  addChord(events, start, 6.0, 'pad', [50, 53, 57], 0.05, 0, { kind: 'warm' });
  addNote(events, start, 6.0, 'hum', 38, 0.04, 0);
  addNoise(events, start, 12, 'room', 0.012, 0.1);

  // 两组主题：陈述与余韵；第二组提前 1s，给最后的电流声留尾巴。
  for (const base of [start, start + 5]) {
    for (const n of THEME) {
      addNote(events, base + n.b * BEAT, n.d * BEAT, 'piano', n.n + 12, 0.1, 0);
    }
    addChord(events, base, 1.9, 'strings', [50, 53, 57], 0.04, 0, { kind: 'warm' });
    addChord(events, base + 2, 1.9, 'strings', [46, 50, 53], 0.04, 0, { kind: 'warm' });
    addChord(events, base + 4, 1.9, 'strings', [41, 45, 48], 0.04, 0, { kind: 'warm' });
  }

  // 闪光灯落在强拍。
  addImpact(events, 129, 0.16);
  addImpact(events, 131, 0.16);
  addNote(events, 134.4, 0.7, 'bell', 86, 0.08, -0.1);
  addNote(events, 134.4, 0.7, 'bell', 81, 0.06, 0.1);
  addNote(events, 134.6, 1.2, 'hum', 38, 0.06, 0);
  addNoise(events, 134.6, 1.8, 'room', 0.012, 0);
}

export function buildScore() {
  const events = [];
  buildIntro(events);
  for (let i = 1; i <= BLOCK_COUNT; i++) buildBlock(events, i);
  buildSfx(events);
  buildAtmosphere(events);
  buildClimax(events);
  buildLayers(events);
  buildOutro(events);
  events.sort((a, b) => a.t - b.t || a.inst.localeCompare(b.inst));
  return { duration: TOTAL_DURATION, events };
}
