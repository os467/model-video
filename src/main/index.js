import {
  TOTAL_DURATION,
  clamp,
  locate
} from '../beat/timeline.js';
import { Clock } from '../kit/clock.js';
import { SCENES } from '../scenes/index.js';
import { drawBlock } from './draw-block.js';
import { drawIntro } from './intro.js';
import { drawOutro } from './outro.js';
import { makeSnapshots } from './snapshots.js';

const W = 1920;
const H = 1080;

const params = new URLSearchParams(window.location.search);
const RENDER = params.get('render') === '1';
const INITIAL_T = Number(params.get('t') || 0);
const AUTOPLAY = params.get('autoplay') === '1';
const p5 = window.p5;

if (!p5) throw new Error('p5 未加载：请通过 tools/serve.mjs 打开预览页');

new p5((p) => {
  let clock;
  let snapshots;
  let ui = null;
  let lastHud = '';

  p.setup = async () => {
    p.pixelDensity(1);
    const canvas = p.createCanvas(W, H);
    canvas.parent('canvas-host');
    p.pixelDensity(1);
    p.frameRate(60);

    document.body.classList.toggle('render', RENDER);

    clock = new Clock(TOTAL_DURATION);
    clock.seek(clamp(INITIAL_T, 0, TOTAL_DURATION));
    if (!RENDER && AUTOPLAY) clock.play();

    await document.fonts.ready;
    snapshots = makeSnapshots(p);

    window.__seek = async (time) => {
      clock.seek(clamp(Number(time) || 0, 0, TOTAL_DURATION));
      await p.redraw();
    };
    window.__state = () => {
      const loc = locate(clock.time);
      return {
        t: clock.time,
        part: loc.part,
        blockIndex: loc.blockIndex,
        name: nameFor(loc),
        snapshots: snapshots.length
      };
    };

    if (!RENDER) {
      ui = setupUI();
      setupKeys();
    } else {
      p.noLoop();
    }

    // p5 在 setup 返回后才把 _setupDone 置为 true；等一个宏任务再放行截图。
    setTimeout(() => {
      window.__ready = true;
    }, 0);
  };

  p.draw = () => {
    const t = clock.time;
    const loc = locate(t);
    renderFrame(p, t, loc);

    if (!RENDER && ui) {
      const hud = syncUI(ui, t, loc);
      if (hud !== lastHud) lastHud = hud;
    }
  };

  function renderFrame(g, t, loc) {
    g.background(0);
    if (loc.part === 'intro') {
      drawIntro(g, t);
    } else if (loc.part === 'block') {
      drawBlock(g, t, loc, W, H);
    } else {
      drawOutro(g, t, snapshots);
    }
  }

  function nameFor(loc) {
    if (loc.part === 'intro') return '序幕 · Intro';
    if (loc.part === 'outro') return '尾声 · 发布会';
    const scene = SCENES[loc.blockIndex - 1];
    return `${String(scene.id).padStart(2, '0')} ${scene.cn} · ${scene.en}`;
  }

  function setupUI() {
    const play = document.getElementById('play');
    const scrub = document.getElementById('scrub');
    const time = document.getElementById('time');
    const blockname = document.getElementById('blockname');

    scrub.max = String(TOTAL_DURATION);
    scrub.step = '0.01';
    scrub.value = String(clock.time);

    play.addEventListener('click', () => {
      if (clock.playing) {
        clock.pause();
      } else {
        if (clock.time >= TOTAL_DURATION - 1e-6) clock.seek(0);
        clock.play();
      }
    });

    scrub.addEventListener('input', () => {
      clock.seek(Number(scrub.value));
    });

    return { play, scrub, time, blockname, lastTime: '' };
  }

  function setupKeys() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        document.getElementById('play').click();
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        clock.seek(clock.time - (event.shiftKey ? 1 : 1 / 30));
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        clock.seek(clock.time + (event.shiftKey ? 1 : 1 / 30));
      }
    });
  }

  function syncUI(controls, t, loc) {
    controls.play.textContent = clock.playing ? '⏸' : '▶';
    if (document.activeElement !== controls.scrub) {
      controls.scrub.value = t.toFixed(2);
    }

    const timeText = `${formatTime(t)} / ${formatTime(TOTAL_DURATION)}`;
    if (timeText !== controls.lastTime) {
      controls.time.textContent = timeText;
      controls.lastTime = timeText;
    }

    const name = nameFor(loc);
    if (controls.blockname.textContent !== name) {
      controls.blockname.textContent = name;
    }
    return `${controls.play.textContent}|${timeText}|${name}`;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
  }
});
