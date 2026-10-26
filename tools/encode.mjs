import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(args.dir ?? 'out/frames/sample');
const fps = Number(args.fps ?? 30);
const out = path.resolve(args.out ?? 'out/sample_1080p30.mp4');
const crf = String(args.crf ?? '18');
const preset = String(args.preset ?? 'slow');
const profile = String(args.profile ?? 'high');
const pixFmt = String(args['pix-fmt'] ?? 'yuv420p');
const fallbackBitrate = String(args.bitrate ?? '24M');

if (!fs.existsSync(path.join(dir, 'frame_000000.png'))) {
  throw new Error(`缺少起始帧：${path.join(dir, 'frame_000000.png')}`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });

function hasEncoder(name) {
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], {
    encoding: 'utf8'
  });
  if (probe.status !== 0 || !probe.stdout) return false;
  return new RegExp(`\\b${name}\\b`).test(probe.stdout);
}

// 优先使用能按 CRF 编码的 libx264；本机 ffmpeg 没有 x264 时回退到
// libopenh264 的高码率模式，保证管线仍可出片，并在日志里明确标注。
const requested = args.encoder ? String(args.encoder) : '';
const encoder = requested || (hasEncoder('libx264') ? 'libx264' : 'libopenh264');
const useCrf = encoder === 'libx264' || encoder === 'libx265';

const ffArgs = [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-framerate',
  String(fps),
  '-start_number',
  '0',
  '-i',
  path.join(dir, 'frame_%06d.png'),
  '-c:v',
  encoder,
  '-pix_fmt',
  pixFmt,
  '-movflags',
  '+faststart',
  out
];

if (useCrf) {
  ffArgs.splice(
    ffArgs.length - 1,
    0,
    '-preset',
    preset,
    '-crf',
    crf,
    '-profile:v',
    profile
  );
} else {
  ffArgs.splice(ffArgs.length - 1, 0, '-b:v', fallbackBitrate);
}

if (useCrf) {
  console.log(
    `编码：${dir} @ ${fps}fps -> ${out}（${encoder}, High Profile, CRF ${crf}, ${pixFmt}）`
  );
} else {
  console.warn(
    `编码：${dir} @ ${fps}fps -> ${out}（${encoder}, High Profile, ${fallbackBitrate}, ${pixFmt}）`
  );
  console.warn(
    '提示：当前 ffmpeg 没有 libx264，无法按 CRF 18 / High Profile 编码；已使用 libopenh264 高码率回退。'
  );
}

const result = spawnSync('ffmpeg', ffArgs, { stdio: 'inherit' });

if (result.status !== 0) throw new Error(`ffmpeg 失败：${result.status}`);
console.log(`完成：${out}`);
