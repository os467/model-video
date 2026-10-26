import { BLOCK_DURATION, BLOCKS_START } from '../beat/timeline.js';
import { mulberry32 } from '../kit/rng.js';
import { buildScore } from './score.js';

// P4：程序合成配乐。没有外部采样；所有声音由振荡器/噪声/滤波器生成。
// 实时预览与离线导出共用同一套 Synth 和同一份 score 事件。
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// 整体总线预留 -3dB 余量，给 19 的全体合奏留出被限幅器推满的空间。
const MASTER_GAIN = 0.95 * Math.pow(10, -3 / 20);
const MUSIC_EASE_GAIN = Math.pow(10, -2.5 / 20);
const SFX_PRESENCE_GAIN = 3.2;

const MUSIC_PERC = new Set(['timpani', 'pulse', 'hat']);
const SFX_INSTS = new Set([
  'perc',
  'noise',
  'modem',
  'taperoll',
  'radar',
  'scope',
  'activate',
  'servo',
  'gearroll',
  'conveyor'
]);

function isSfxEvent(event) {
  if (!SFX_INSTS.has(event.inst)) return false;
  if (event.inst === 'perc' && MUSIC_PERC.has(event.kind)) return false;
  return true;
}

// 19 版块的音乐推进曲线：17 末开始蓄力，19 中后段把音乐总线推入限幅器。
const CLIMAX_START = BLOCKS_START + 18 * BLOCK_DURATION;
const CLIMAX_POINTS = [
  [0, 1],
  [CLIMAX_START - 2.4, 1],
  [CLIMAX_START - 1.0, 1.14],
  [CLIMAX_START + 1.0, 1.48],
  [CLIMAX_START + 4.8, 1.7],
  [CLIMAX_START + 6.0, 1]
];

function gainAt(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      const k = clamp((t - t0) / Math.max(0.0001, t1 - t0), 0, 1);
      return v0 + (v1 - v0) * k;
    }
  }
  return points[points.length - 1][1];
}

function makeNoiseBuffer(ctx, seconds = 2.4, seed = 0x51a7) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rng = mulberry32(seed);
  for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
  return buf;
}

function makeImpulse(ctx, seconds = 2.1, decay = 2.4) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rng = mulberry32(0x20a4 + ch * 97);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (rng() * 2 - 1) * env;
    }
  }
  return buf;
}

function env(param, when, attack, dur, release, peak) {
  const p = Math.max(0.0002, peak);
  const hold = Math.max(attack, dur);
  param.cancelScheduledValues(when);
  param.setValueAtTime(0.0001, when);
  param.exponentialRampToValueAtTime(p, when + Math.max(0.001, attack));
  param.setValueAtTime(p, when + hold);
  param.exponentialRampToValueAtTime(0.0001, when + hold + Math.max(0.02, release));
}

function cleanFreq(v) {
  return clamp(Number(v) || 0, 20, 18000);
}

class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.sources = new Set();
    this.noiseBuffer = makeNoiseBuffer(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.24;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.06;
    this.master.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // 音乐与物理音效分总线：高光时刻只轻推 SFX presence，必要时才让音乐缓慢让路。
    this.musicEase = ctx.createGain();
    this.musicEase.gain.value = 1;
    this.musicDrive = ctx.createGain();
    this.musicDrive.gain.value = 1;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBody = ctx.createBiquadFilter();
    this.sfxBody.type = 'peaking';
    this.sfxBody.frequency.value = 300;
    this.sfxBody.Q.value = 0.8;
    this.sfxBody.gain.value = 0;
    this.sfxPresence = ctx.createBiquadFilter();
    this.sfxPresence.type = 'peaking';
    this.sfxPresence.frequency.value = 1600;
    this.sfxPresence.Q.value = 0.9;
    this.sfxPresence.gain.value = 0;
    this.musicBus.connect(this.musicEase);
    this.musicEase.connect(this.musicDrive);
    this.musicDrive.connect(this.master);
    this.sfxBus.connect(this.sfxBody);
    this.sfxBody.connect(this.sfxPresence);
    this.sfxPresence.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.18;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.musicEase);

    // 主旋律/琶音的附点八分延迟，给 13–20 的“数据感”留空间。
    this.delay = ctx.createDelay(1.2);
    this.delay.delayTime.value = 0.375;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2600;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.27;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.24;
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delayFilter.connect(this.delayGain);
    this.delayGain.connect(this.musicEase);
  }

  track(source) {
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    return source;
  }

  stopAll() {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.sources.clear();
    this.resetMusicEase();
  }

  setMuted(muted) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0.0001 : MASTER_GAIN, now, 0.03);
  }

  resetMusicEase() {
    const now = this.ctx.currentTime;
    const gain = this.musicEase.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(1, now);
    for (const node of [this.sfxBody, this.sfxPresence]) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(0, now);
    }
  }

  // 只在较长的高光音效上轻轻让路：0.3s 下压 −2.5dB，结束后 0.5s 回升。
  easeMusic(when, hold = 0.14) {
    const at = Math.max(when, this.ctx.currentTime + 0.001);
    const gain = this.musicEase.gain;
    gain.cancelScheduledValues(at);
    gain.linearRampToValueAtTime(MUSIC_EASE_GAIN, at + 0.3);
    gain.setValueAtTime(MUSIC_EASE_GAIN, at + 0.3 + hold);
    gain.linearRampToValueAtTime(1, at + 0.3 + hold + 0.5);
  }

  // 给物理音效的 body / presence 频段一点提升，让敲击/翻面/滴答自己站出来。
  highlightSfx(when, hold = 0.14) {
    const at = Math.max(when, this.ctx.currentTime + 0.001);
    const settings = [
      [this.sfxBody.gain, 1.8],
      [this.sfxPresence.gain, SFX_PRESENCE_GAIN]
    ];
    for (const [param, amount] of settings) {
      param.cancelScheduledValues(at);
      param.linearRampToValueAtTime(amount, at + 0.06);
      param.setValueAtTime(amount, at + 0.06 + hold);
      param.linearRampToValueAtTime(0, at + 0.06 + hold + 0.3);
    }
  }

  // 19 版块全体合奏的响度弧线；离线渲染也从 0 秒排同一条曲线。
  scheduleClimax(t0, startCtx) {
    const gain = this.musicDrive.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gainAt(CLIMAX_POINTS, t0), Math.max(now, startCtx));
    for (const [time, value] of CLIMAX_POINTS) {
      if (time <= t0 + 0.02) continue;
      gain.linearRampToValueAtTime(value, startCtx + (time - t0));
    }
  }

  busFor(event) {
    const bus = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = clamp(event.pan || 0, -1, 1);
    bus.connect(pan);
    pan.connect(isSfxEvent(event) ? this.sfxBus : this.musicBus);
    const rev = this.ctx.createGain();
    const revAmount =
      event.reverb != null
        ? event.reverb
        : event.inst === 'pad' || event.inst === 'strings'
          ? 0.28
          : event.inst === 'perc'
            ? 0.04
            : event.inst === 'noise'
              ? 0.1
              : 0.15;
    rev.gain.value = revAmount;
    bus.connect(rev);
    rev.connect(this.reverb);

    const dryEcho = ['lead', 'pad', 'strings', 'perc', 'noise', 'impact', 'taperoll', 'modem'];
    let echoAmount = event.inst === 'pad' || event.inst === 'strings' ? 0.05 : 0.12;
    if (dryEcho.includes(event.inst) && event.inst !== 'pad' && event.inst !== 'strings') {
      echoAmount = 0;
    }
    if (
      event.inst === 'perc' ||
      event.inst === 'noise' ||
      event.inst === 'impact' ||
      event.inst === 'riser' ||
      event.inst === 'drone' ||
      event.inst === 'gearroll' ||
      event.inst === 'conveyor'
    ) {
      echoAmount = 0;
    }
    if (echoAmount > 0) {
      const echo = this.ctx.createGain();
      echo.gain.value = echoAmount;
      bus.connect(echo);
      echo.connect(this.delay);
    }
    return bus;
  }

  play(event, when) {
    if (event.highlight) {
      const hold = event.highlightHold ?? 0.14;
      this.highlightSfx(when, hold);
      // 只给持续较久的高光让路，短促敲击交给 presence 提升。
      if (hold >= 0.24) this.easeMusic(when, hold);
    }
    const bus = this.busFor(event);
    const inst = event.inst;
    if (inst === 'pad' || inst === 'strings') {
      this.pad(event, when, bus);
    } else if (inst === 'bass') {
      this.bass(event, when, bus);
    } else if (inst === 'perc') {
      this.perc(event, when, bus);
    } else if (inst === 'noise') {
      this.noise(event, when, bus);
    } else if (inst === 'impact') {
      this.impact(event, when, bus);
    } else if (inst === 'modem') {
      this.modem(event, when, bus);
    } else if (inst === 'hum') {
      this.hum(event, when, bus);
    } else if (inst === 'taperoll') {
      this.taperoll(event, when, bus);
    } else if (inst === 'radar') {
      this.radar(event, when, bus);
    } else if (inst === 'scope') {
      this.scope(event, when, bus);
    } else if (inst === 'activate') {
      this.activate(event, when, bus);
    } else if (inst === 'servo') {
      this.servo(event, when, bus);
    } else if (inst === 'riser') {
      this.riser(event, when, bus);
    } else if (inst === 'drone') {
      this.drone(event, when, bus);
    } else if (inst === 'gearroll') {
      this.gearroll(event, when, bus);
    } else if (inst === 'conveyor') {
      this.conveyor(event, when, bus);
    } else if (inst === 'brass') {
      this.brass(event, when, bus);
    } else if (inst === 'cello') {
      this.cello(event, when, bus);
    } else if (inst === 'highstrings') {
      this.highstrings(event, when, bus);
    } else if (inst === 'choir') {
      this.choir(event, when, bus);
    } else {
      this.lead(event, when, bus);
    }
  }

  tone(bus, when, midi, dur, gain, type, opts = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = cleanFreq(mtof(midi));
    if (opts.detune) osc.detune.value = opts.detune;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || 'lowpass';
    filter.frequency.value = cleanFreq(opts.cutoff || 4200);
    filter.Q.value = opts.q || 0.6;
    const envGain = ctx.createGain();
    const attack = opts.attack ?? 0.02;
    const release = opts.release ?? 0.12;
    env(envGain.gain, when, attack, dur, release, gain);
    osc.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = opts.vibratoRate || 5.2;
      lfoGain.gain.value = opts.vibrato;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      this.track(lfo);
      lfo.start(when);
      lfo.stop(when + dur + release + 0.05);
    }
    this.track(osc);
    osc.start(when);
    osc.stop(when + dur + release + 0.04);
  }

  lead(event, when, bus) {
    const e = event;
    const midi = e.midi;
    const dur = e.dur;
    const g = e.gain;
    switch (e.inst) {
      case 'flute':
        this.tone(bus, when, midi, dur, g, 'sine', {
          attack: 0.08,
          release: 0.2,
          vibrato: 3,
          vibratoRate: 4.6,
          cutoff: 3500
        });
        this.tone(bus, when, midi + 12, dur * 0.8, g * 0.12, 'triangle', {
          attack: 0.1,
          release: 0.25,
          cutoff: 4500
        });
        break;
      case 'reed':
        this.tone(bus, when, midi, dur, g, 'sawtooth', {
          attack: 0.06,
          release: 0.22,
          cutoff: 1600,
          q: 1.1,
          vibrato: 2.4,
          vibratoRate: 5.4
        });
        break;
      case 'lyre':
      case 'pluck':
      case 'marimba':
        this.pluck(bus, when, midi, dur, g, e.inst === 'marimba');
        break;
      case 'musicbox':
      case 'bell':
      case 'shimmer':
        this.bell(bus, when, midi, dur, g, e.inst);
        break;
      case 'glass':
        this.glass(bus, when, midi, dur, g);
        break;
      case 'piano':
        this.piano(bus, when, midi, dur, g);
        break;
      case 'sinelead':
        this.tone(bus, when, midi, dur, g, 'sine', {
          attack: 0.02,
          release: 0.16,
          vibrato: 1.4,
          vibratoRate: 5.1,
          cutoff: 5000
        });
        break;
      case 'sawlead':
        this.tone(bus, when, midi, dur, g, 'sawtooth', {
          attack: 0.015,
          release: 0.18,
          cutoff: 2400,
          q: 1.2
        });
        break;
      case 'squarelead':
        this.tone(bus, when, midi, dur, g, 'square', {
          attack: 0.012,
          release: 0.14,
          cutoff: 1800,
          q: 0.9
        });
        break;
      case 'ensemble':
        this.tone(bus, when, midi, dur, g * 0.7, 'triangle', {
          attack: 0.18,
          release: 0.4,
          cutoff: 2200
        });
        this.tone(bus, when, midi + 12, dur, g * 0.18, 'sine', {
          attack: 0.3,
          release: 0.5,
          cutoff: 4000
        });
        break;
      case 'horn':
        this.tone(bus, when, midi, dur, g, 'sawtooth', {
          attack: 0.14,
          release: 0.35,
          cutoff: 900,
          q: 0.8
        });
        this.tone(bus, when, midi - 12, dur, g * 0.4, 'sine', {
          attack: 0.18,
          release: 0.4,
          cutoff: 1200
        });
        break;
      default:
        this.tone(bus, when, midi, dur, g, 'triangle', {});
    }
  }

  pluck(bus, when, midi, dur, gain, short) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = short ? 'sine' : 'triangle';
    osc.frequency.value = cleanFreq(mtof(midi));
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cleanFreq(short ? 3200 : 2400), when);
    filter.frequency.exponentialRampToValueAtTime(500, when + Math.min(0.5, dur + 0.1));
    const envGain = ctx.createGain();
    const peak = Math.max(0.0002, gain);
    envGain.gain.setValueAtTime(0.0001, when);
    envGain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    envGain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.18);
    osc.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    this.track(osc);
    osc.start(when);
    osc.stop(when + dur + 0.22);
    if (!short) {
      this.noiseBurst(bus, when, 0.035, 0.035, 'bandpass', 1800, 0.8, 0.02);
    }
  }

  bell(bus, when, midi, dur, gain, kind) {
    const f = mtof(midi);
    const partials =
      kind === 'musicbox'
        ? [[1, 0.55], [2.76, 0.2], [5.4, 0.08]]
        : kind === 'shimmer'
          ? [[1, 0.4], [2.01, 0.16], [3.99, 0.08], [8.1, 0.03]]
          : [[1, 0.5], [2.76, 0.22], [5.4, 0.1]];
    for (let i = 0; i < partials.length; i++) {
      const [ratio, amp] = partials[i];
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = cleanFreq(f * ratio);
      const envGain = ctx.createGain();
      const attack = kind === 'shimmer' ? 0.08 : 0.004;
      const release = kind === 'shimmer' ? 0.55 : 0.28;
      env(envGain.gain, when, attack, dur, release, gain * amp);
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + dur + release + 0.05);
    }
  }

  glass(bus, when, midi, dur, gain) {
    const f = mtof(midi);
    for (const [ratio, amp] of [[1, 0.55], [2.005, 0.2], [3.99, 0.08]]) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = cleanFreq(f * ratio);
      const envGain = ctx.createGain();
      env(envGain.gain, when, 0.06, dur, 0.4, gain * amp);
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + dur + 0.45);
    }
  }

  piano(bus, when, midi, dur, gain) {
    const f = mtof(midi);
    const partials = [[1, 0.6], [2.001, 0.24], [3.003, 0.1], [4.01, 0.04]];
    for (let i = 0; i < partials.length; i++) {
      const [ratio, amp] = partials[i];
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = cleanFreq(f * ratio);
      const envGain = ctx.createGain();
      const peak = gain * amp;
      envGain.gain.setValueAtTime(0.0001, when);
      envGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.008);
      envGain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + dur + 0.55);
    }
    this.noiseBurst(bus, when, 0.05, 0.025, 'lowpass', 1300, 0.5, 0.005);
  }

  pad(event, when, bus) {
    const notes = event.midis || [event.midi];
    const dur = event.dur;
    const gain = event.gain;
    const kind = event.kind || 'warm';
    const type = kind === 'glass' ? 'sine' : 'triangle';
    const cutoff = kind === 'brass' ? 1450 : kind === 'glass' ? 2600 : 1800;
    for (let i = 0; i < notes.length; i++) {
      const level = gain * (1 / Math.max(1, notes.length * 0.7));
      this.tone(bus, when, notes[i], dur, level, type, {
        attack: 0.38,
        release: 0.9,
        cutoff,
        q: 0.7,
        detune: (i - (notes.length - 1) / 2) * 4
      });
      if (kind !== 'glass') {
        this.tone(bus, when, notes[i] + 12, dur, level * 0.16, 'sine', {
          attack: 0.5,
          release: 0.8,
          cutoff: 3200
        });
      }
    }
  }

  bass(event, when, bus) {
    const f = mtof(event.midi);
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = cleanFreq(f);
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = cleanFreq(f / 2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const envGain = ctx.createGain();
    env(envGain.gain, when, 0.02, event.dur, 0.24, event.gain);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    for (const src of [osc, sub]) {
      this.track(src);
      src.start(when);
      src.stop(when + event.dur + 0.3);
    }
  }

  hum(event, when, bus) {
    const f = mtof(event.midi);
    for (const [ratio, amp] of [[1, 1], [1.006, 0.35], [2, 0.12]]) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = cleanFreq(f * ratio);
      const envGain = ctx.createGain();
      env(envGain.gain, when, 0.7, event.dur, 0.7, event.gain * amp);
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + event.dur + 0.8);
    }
  }

  noise(event, when, bus) {
    const kind = event.kind || 'room';
    const dur = event.dur;
    const cfg = {
      paper: ['highpass', 1200, 0.5],
      air: ['bandpass', 760, 0.45],
      room: ['lowpass', 550, 0.5],
      scratch: ['bandpass', 900, 1.1],
      write: ['bandpass', 1700, 0.8],
      stoneDraw: ['bandpass', 1150, 0.7],
      steam: ['highpass', 2400, 0.7],
      city: ['lowpass', 480, 0.5],
      hum: ['lowpass', 260, 0.8]
    }[kind] || ['lowpass', 900, 0.6];
    const attack =
      kind === 'air' || kind === 'room' || kind === 'paper' ? 0.3 : 0.04;
    this.noiseBurst(bus, when, dur, event.gain, cfg[0], cfg[1], cfg[2], attack);
    if (kind === 'city') {
      this.tone(bus, when, 45, dur, event.gain * 0.35, 'sine', {
        attack: 0.8,
        release: 1.2,
        cutoff: 600,
        vibrato: 2.5,
        vibratoRate: 0.18
      });
    }
  }

  noiseBurst(bus, when, dur, gain, type, freq, q, attack = 0.01) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = dur > 1.8;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cleanFreq(freq);
    filter.Q.value = q;
    const envGain = ctx.createGain();
    env(envGain.gain, when, attack, dur, 0.06, gain);
    src.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    this.track(src);
    src.start(when);
    src.stop(when + dur + 0.1);
  }

  sineAt(bus, when, freq, dur, gain, type = 'sine', cutoff = 3000) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = cleanFreq(freq);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cleanFreq(cutoff);
    const envGain = ctx.createGain();
    env(envGain.gain, when, 0.002, dur, Math.max(0.02, dur * 0.6), gain);
    osc.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    this.track(osc);
    osc.start(when);
    osc.stop(when + dur + 0.1);
  }

  perc(event, when, bus) {
    const kind = event.kind;
    const gain = event.gain;
    switch (kind) {
      case 'bone':
        this.noiseBurst(bus, when, 0.05, gain, 'bandpass', 1300, 1.2, 0.002);
        this.sineAt(bus, when, 180, 0.06, gain * 0.5, 'sine', 500);
        break;
      case 'clay':
        this.noiseBurst(bus, when, 0.09, gain * 0.8, 'lowpass', 900, 0.6, 0.003);
        break;
      case 'chalk':
        this.noiseBurst(bus, when, 0.09, gain * 0.6, 'highpass', 2800, 0.7, 0.003);
        break;
      case 'seal':
        this.noiseBurst(bus, when, 0.12, gain, 'lowpass', 700, 0.6, 0.002);
        this.sineAt(bus, when, 110, 0.18, gain * 0.6, 'sine', 320);
        break;
      case 'gear':
        this.noiseBurst(bus, when, 0.035, gain, 'highpass', 4200, 0.8, 0.001);
        this.sineAt(bus, when, 720, 0.025, gain * 0.5, 'sine', 2200);
        break;
      case 'type':
        this.noiseBurst(bus, when, 0.03, gain, 'bandpass', 2400, 1.0, 0.001);
        break;
      case 'logic':
        this.sineAt(bus, when, 880, 0.07, gain, 'square', 1600);
        this.sineAt(bus, when + 0.04, 1320, 0.06, gain * 0.7, 'square', 1800);
        break;
      case 'blip':
        this.sineAt(bus, when, 784, 0.08, gain, 'sine', 2600);
        break;
      case 'tape':
        this.noiseBurst(bus, when, 0.04, gain, 'highpass', 2200, 0.6, 0.001);
        this.sineAt(bus, when, 900, 0.02, gain * 0.3, 'sine', 2600);
        break;
      case 'pulse':
        this.sineAt(bus, when, 55, 0.16, gain, 'sine', 220);
        break;
      case 'hat':
        this.noiseBurst(bus, when, 0.035, gain, 'highpass', 6800, 0.5, 0.001);
        break;
      case 'tool':
        this.noiseBurst(bus, when, 0.06, gain, 'bandpass', 1700, 0.9, 0.001);
        this.sineAt(bus, when, 140, 0.08, gain * 0.5, 'sine', 420);
        break;
      case 'debug':
        this.sineAt(bus, when, 700, 0.06, gain, 'square', 1500);
        break;
      case 'tick':
        this.sineAt(bus, when, 2400, 0.02, gain, 'sine', 4000);
        break;
      case 'stone':
        this.noiseBurst(bus, when, 0.06, gain, 'bandpass', 1550, 1.0, 0.002);
        this.sineAt(bus, when, 150, 0.08, gain * 0.55, 'sine', 420);
        break;
      case 'stylus':
        this.noiseBurst(bus, when, 0.035, gain, 'bandpass', 2200, 0.9, 0.002);
        this.sineAt(bus, when, 880, 0.03, gain * 0.3, 'sine', 1600);
        break;
      case 'clayWrite':
        // 泥板压印：低通泥面 + 很钝的闷响，不要电子板的尖 click。
        this.noiseBurst(bus, when, 0.075, gain, 'lowpass', 720, 0.55, 0.004);
        this.sineAt(bus, when, 145, 0.07, gain * 0.45, 'sine', 380);
        this.noiseBurst(bus, when + 0.012, 0.05, gain * 0.45, 'bandpass', 500, 1.2, 0.003);
        break;
      case 'bead':
        // 木/黄铜算珠：低通咔哒 + 低闷芯，不要高频电子音。
        this.noiseBurst(bus, when, 0.035, gain, 'lowpass', 900, 0.7, 0.002);
        this.sineAt(bus, when, 240, 0.04, gain * 0.72, 'sine', 620);
        this.sineAt(bus, when + 0.012, 330, 0.03, gain * 0.35, 'sine', 820);
        break;
      case 'knob':
        this.noiseBurst(bus, when, 0.03, gain, 'highpass', 2600, 0.7, 0.001);
        this.sineAt(bus, when, 520, 0.03, gain * 0.4, 'sine', 900);
        break;
      case 'sign':
        this.noiseBurst(bus, when, 0.07, gain, 'lowpass', 800, 0.6, 0.003);
        this.sineAt(bus, when, 190, 0.08, gain * 0.5, 'sine', 500);
        break;
      case 'flip':
        this.noiseBurst(bus, when, 0.035, gain, 'highpass', 3200, 0.6, 0.001);
        this.sineAt(bus, when, 980, 0.04, gain * 0.5, 'sine', 2000);
        break;
      case 'timpani': {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(88, when);
        osc.frequency.exponentialRampToValueAtTime(44, when + 0.32);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const envGain = ctx.createGain();
        env(envGain.gain, when, 0.005, 0.28, 0.32, gain);
        osc.connect(filter);
        filter.connect(envGain);
        envGain.connect(bus);
        this.track(osc);
        osc.start(when);
        osc.stop(when + 0.7);
        this.noiseBurst(bus, when, 0.12, gain * 0.35, 'lowpass', 240, 0.6, 0.003);
        break;
      }
      default:
        this.noiseBurst(bus, when, 0.05, gain, 'bandpass', 1500, 0.8, 0.002);
    }
  }

  impact(event, when, bus) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, when);
    osc.frequency.exponentialRampToValueAtTime(36, when + 0.55);
    const envGain = ctx.createGain();
    env(envGain.gain, when, 0.005, 0.45, 0.35, event.gain);
    osc.connect(envGain);
    envGain.connect(bus);
    this.track(osc);
    osc.start(when);
    osc.stop(when + 0.9);
    this.noiseBurst(bus, when, 0.32, event.gain * 0.5, 'lowpass', 900, 0.5, 0.004);
  }

  modem(event, when, bus) {
    const pattern = [1200, 2200, 600, 1800, 900, 2400, 1500, 700];
    for (let i = 0; i < pattern.length; i++) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = pattern[i];
      const envGain = ctx.createGain();
      const t = when + i * 0.09;
      env(envGain.gain, t, 0.005, 0.07, 0.02, event.gain);
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(t);
      osc.stop(t + 0.11);
    }
  }

  taperoll(event, when, bus) {
    const ctx = this.ctx;
    const dur = event.dur;
    const gain = event.gain;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1150;
    filter.Q.value = 0.8;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gain, when + 0.3);
    amp.gain.setValueAtTime(gain, when + Math.max(0.35, dur - 0.25));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.62;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gain * 0.32;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(bus);
    for (const node of [src, lfo]) {
      this.track(node);
      node.start(when);
      node.stop(when + dur + 0.05);
    }
  }

  radar(event, when, bus) {
    const ctx = this.ctx;
    for (let k = 0; k < 2; k++) {
      const t = when + k * 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.32);
      const envGain = ctx.createGain();
      env(envGain.gain, t, 0.008, 0.26, 0.08, event.gain * (k ? 0.45 : 1));
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  scope(event, when, bus) {
    const ctx = this.ctx;
    for (let k = 0; k < 2; k++) {
      const t = when + k * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700 + k * 260, t);
      osc.frequency.exponentialRampToValueAtTime(1450 + k * 320, t + 0.18);
      const envGain = ctx.createGain();
      env(envGain.gain, t, 0.004, 0.14, 0.05, event.gain * (k ? 0.5 : 1));
      osc.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  activate(event, when, bus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(450, when);
    filter.frequency.exponentialRampToValueAtTime(4200, when + 0.32);
    const envGain = ctx.createGain();
    env(envGain.gain, when, 0.02, 0.28, 0.14, event.gain);
    src.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    this.track(src);
    src.start(when);
    src.stop(when + 0.48);
    this.sineAt(bus, when + 0.05, 1600, 0.22, event.gain * 0.45, 'sine', 4200);
  }

  servo(event, when, bus) {
    const ctx = this.ctx;
    const dur = event.dur || 0.4;
    const gain = event.gain;

    // 低齿轮电机：不要尖的电子 whine。
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(155, when);
    osc.frequency.exponentialRampToValueAtTime(105, when + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.8;
    const envGain = ctx.createGain();
    env(envGain.gain, when, 0.03, dur, 0.07, gain * 0.75);
    osc.connect(filter);
    filter.connect(envGain);
    envGain.connect(bus);
    this.track(osc);
    osc.start(when);
    osc.stop(when + dur + 0.12);

    // 导轨摩擦层。
    this.noiseBurst(bus, when, dur, gain * 0.32, 'bandpass', 900, 0.8, 0.04);

    // 棘轮一格一格咬合。
    for (let k = 0; k < 4; k++) {
      const t = when + dur * (0.12 + k * 0.2);
      this.noiseBurst(bus, t, 0.025, gain * 0.22, 'bandpass', 1500, 1.1, 0.001);
      this.sineAt(bus, t, 92, 0.04, gain * 0.12, 'sine', 260);
    }
  }

  riser(event, when, bus) {
    const ctx = this.ctx;
    const dur = event.dur || 0.7;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(240, when);
    filter.frequency.exponentialRampToValueAtTime(5600, when + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(event.gain, when + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.12);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(bus);
    this.track(src);
    src.start(when);
    src.stop(when + dur + 0.14);
    this.tone(bus, when, 45, dur, event.gain * 0.25, 'sawtooth', {
      attack: dur * 0.8,
      release: 0.1,
      cutoff: 900
    });
  }

  drone(event, when, bus) {
    const ctx = this.ctx;
    const f = mtof(event.midi || 33);
    for (const [ratio, amp] of [[1, 0.5], [1.006, 0.3], [2, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = cleanFreq(f * ratio);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const envGain = ctx.createGain();
      env(envGain.gain, when, 0.8, event.dur, 0.8, event.gain * amp);
      osc.connect(filter);
      filter.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + event.dur + 0.9);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 150;
    const ng = ctx.createGain();
    env(ng.gain, when, 0.9, event.dur, 0.8, event.gain * 0.5);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(bus);
    this.track(noise);
    noise.start(when);
    noise.stop(when + event.dur + 0.9);
  }

  gearroll(event, when, bus) {
    const ctx = this.ctx;
    const dur = event.dur;
    const gain = event.gain;
    const rate = event.rate || 10.5;

    // 齿面摩擦：带通噪声被方波 LFO 斩成一齿一齿的“咔哒”层。
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1450;
    band.Q.value = 1.0;
    const amp = ctx.createGain();
    const base = gain * 0.55;
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(base, when + 0.18);
    amp.gain.setValueAtTime(base, when + Math.max(0.2, dur - 0.16));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gain * 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    src.connect(band);
    band.connect(amp);
    amp.connect(bus);
    for (const node of [src, lfo]) {
      this.track(node);
      node.start(when);
      node.stop(when + dur + 0.05);
    }

    // 齿轮轴的低频转动。
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 62;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 240;
    const humGain = ctx.createGain();
    env(humGain.gain, when, 0.2, dur, 0.16, gain * 0.26);
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(bus);
    this.track(hum);
    hum.start(when);
    hum.stop(when + dur + 0.2);
  }

  conveyor(event, when, bus) {
    const ctx = this.ctx;
    const dur = event.dur;
    const gain = event.gain;
    const rate = event.rate || 3.4;

    // 皮带：低通噪声被慢方波斩成一段一段的“带面”摩擦。
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.7;
    const amp = ctx.createGain();
    const base = gain * 0.55;
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(base, when + 0.35);
    amp.gain.setValueAtTime(base, when + Math.max(0.4, dur - 0.2));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gain * 0.4;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    src.connect(band);
    band.connect(amp);
    amp.connect(bus);
    for (const node of [src, lfo]) {
      this.track(node);
      node.start(when);
      node.stop(when + dur + 0.05);
    }

    // 电机：两条很低的锯齿，几乎只留一点转动的底噪。
    for (const [freq, level] of [[54, 0.22], [81, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 170;
      const envGain = ctx.createGain();
      env(envGain.gain, when, 0.35, dur, 0.2, gain * level);
      osc.connect(filter);
      filter.connect(envGain);
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + dur + 0.25);
    }
  }

  brass(event, when, bus) {
    const ctx = this.ctx;
    const notes = event.midis || [event.midi];
    const dur = event.dur;
    for (const note of notes) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = cleanFreq(mtof(note));
        osc.detune.value = detune;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 1.1;
        filter.frequency.setValueAtTime(650, when);
        filter.frequency.exponentialRampToValueAtTime(2300, when + 0.12);
        filter.frequency.exponentialRampToValueAtTime(900, when + dur + 0.1);
        const envGain = ctx.createGain();
        env(envGain.gain, when, 0.04, dur, 0.32, event.gain * 0.3);
        osc.connect(filter);
        filter.connect(envGain);
        envGain.connect(bus);
        this.track(osc);
        osc.start(when);
        osc.stop(when + dur + 0.38);
      }
    }
  }

  cello(event, when, bus) {
    const ctx = this.ctx;
    const midi = event.midi;
    for (const detune of [-3, 3]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = cleanFreq(mtof(midi));
      osc.detune.value = detune;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 820;
      filter.Q.value = 0.9;
      const envGain = ctx.createGain();
      env(envGain.gain, when, 0.14, event.dur, 0.45, event.gain * 0.5);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 4.7;
      lfoGain.gain.value = 2.2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(filter);
      filter.connect(envGain);
      envGain.connect(bus);
      for (const node of [osc, lfo]) {
        this.track(node);
        node.start(when);
        node.stop(when + event.dur + 0.5);
      }
    }
  }

  highstrings(event, when, bus) {
    const ctx = this.ctx;
    const notes = event.midis || [event.midi];
    for (const note of notes) {
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = cleanFreq(mtof(note));
        osc.detune.value = detune;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3200;
        const envGain = ctx.createGain();
        env(envGain.gain, when, 0.38, event.dur, 0.75, event.gain * 0.34);
        osc.connect(filter);
        filter.connect(envGain);
        envGain.connect(bus);
        this.track(osc);
        osc.start(when);
        osc.stop(when + event.dur + 0.8);
      }
    }
  }

  choir(event, when, bus) {
    const ctx = this.ctx;
    const notes = event.midis || [event.midi];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = cleanFreq(mtof(note));
      const envGain = ctx.createGain();
      env(envGain.gain, when, 0.5, event.dur, 0.9, event.gain * 0.36);
      for (const [freq, q, amp] of [[720, 4.5, 0.5], [1240, 5.5, 0.28]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = q;
        const fg = ctx.createGain();
        fg.gain.value = amp;
        osc.connect(bp);
        bp.connect(fg);
        fg.connect(envGain);
      }
      envGain.connect(bus);
      this.track(osc);
      osc.start(when);
      osc.stop(when + event.dur + 0.95);
    }
  }
}

function lowerBound(events, t) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createAudioEngine() {
  let ctx = null;
  let synth = null;
  let score = null;
  let timer = null;
  let playing = false;
  let muted = false;
  let nextIndex = 0;
  let startCtx = 0;
  let startScore = 0;

  function ensure() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('当前浏览器不支持 Web Audio');
      ctx = new Ctx();
      synth = new Synth(ctx);
      synth.setMuted(muted);
      score = buildScore();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function schedule() {
    if (!playing || !synth) return;
    const horizon = ctx.currentTime + 0.9;
    while (nextIndex < score.events.length) {
      const e = score.events[nextIndex];
      if (e.t < startScore) {
        nextIndex++;
        continue;
      }
      const when = startCtx + (e.t - startScore);
      if (when > horizon) break;
      if (when >= ctx.currentTime - 0.03) synth.play(e, when);
      nextIndex++;
    }
  }

  function start(t0) {
    ensure();
    stopSources();
    startScore = clamp(t0, 0, score.duration);
    startCtx = ctx.currentTime + 0.05;
    synth.scheduleClimax(startScore, startCtx);
    nextIndex = lowerBound(score.events, startScore);
    playing = true;
    schedule();
    if (timer) clearInterval(timer);
    timer = setInterval(schedule, 80);
  }

  function stopSources() {
    if (synth) synth.stopAll();
  }

  function pause() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    stopSources();
  }

  function seek(t) {
    if (playing) start(t);
    else stopSources();
  }

  function setMuted(value) {
    muted = !!value;
    if (synth) synth.setMuted(muted);
  }

  return {
    ensure,
    start,
    pause,
    seek,
    setMuted,
    get muted() {
      return muted;
    },
    get playing() {
      return playing;
    },
    get context() {
      return ctx;
    },
    get synth() {
      return synth;
    }
  };
}

export async function renderAudioOffline(sampleRate = 44100) {
  const score = buildScore();
  const total = Math.ceil(score.duration * sampleRate);
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('当前浏览器不支持 OfflineAudioContext');
  const ctx = new Ctx(2, total, sampleRate);
  const synth = new Synth(ctx);
  synth.scheduleClimax(0, 0);
  for (const event of score.events) synth.play(event, Math.max(0, event.t));
  return ctx.startRendering();
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytes = frames * channels * 2;
  const out = new Uint8Array(44 + bytes);
  const view = new DataView(out.buffer);
  const str = (offset, text) => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, bytes, true);
  const data = [];
  for (let ch = 0; ch < channels; ch++) data.push(buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const v = clamp(data[ch][i], -1, 1);
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}
