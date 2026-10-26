// 时钟接口按 Web Audio 的 currentTime 设计：
// 阶段 1 没有声音，用 performance.now；阶段 4 attachAudioContext() 后自动切到音频时钟。
export class Clock {
  constructor(duration) {
    this.duration = duration;
    this._t = 0;
    this._playing = false;
    this._wall = 0;
    this._audio = null;
    this._audioBase = 0;
  }

  get playing() {
    return this._playing;
  }

  get time() {
    if (!this._playing) return this._t;

    let t;
    if (this._audio) {
      t = this._audio.currentTime - this._audioBase;
    } else {
      t = this._t + (performance.now() - this._wall) / 1000;
    }

    if (t >= this.duration) {
      t = this.duration;
      this._t = t;
      this._playing = false;
    }
    return t;
  }

  play() {
    if (this._playing) return;
    if (this._t >= this.duration) this._t = 0;
    this._wall = performance.now();
    this._playing = true;
    if (this._audio) this._audioBase = this._audio.currentTime - this._t;
  }

  pause() {
    this._t = this.time;
    this._playing = false;
  }

  seek(t) {
    const lo = 0;
    const hi = this.duration;
    this._t = t < lo ? lo : t > hi ? hi : t;
    this._wall = performance.now();
    if (this._audio) this._audioBase = this._audio.currentTime - this._t;
  }

  attachAudioContext(ctx) {
    this._audio = ctx;
    this._audioBase = ctx.currentTime - this._t;
  }
}
