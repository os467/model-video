import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
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
const audio = args.audio ? path.resolve(String(args.audio)) : null;
const FFMPEG = args.ffmpeg
  ? path.resolve(String(args.ffmpeg))
  : ffmpegStatic || 'ffmpeg';

if (!fs.existsSync(path.join(dir, 'frame_000000.png'))) {
  throw new Error(`缺少起始帧：${path.join(dir, 'frame_000000.png')}`);
}
if (audio && !fs.existsSync(audio)) {
  throw new Error(`缺少音频：${audio}`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });

function hasEncoder(name) {
  const probe = spawnSync(FFMPEG, ['-hide_banner', '-encoders'], {
    encoding: 'utf8'
  });
  if (probe.status !== 0 || !probe.stdout) return false;
  return new RegExp(`\\b${name}\\b`).test(probe.stdout);
}

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
  path.join(dir, 'frame_%06d.png')
];

if (audio) ffArgs.push('-i', audio);
ffArgs.push('-map', '0:v:0');
if (audio) ffArgs.push('-map', '1:a:0');

ffArgs.push('-c:v', encoder);
if (useCrf) {
  ffArgs.push('-preset', preset, '-crf', crf, '-profile:v', profile);
} else {
  ffArgs.push('-b:v', fallbackBitrate);
}
ffArgs.push('-pix_fmt', pixFmt);
if (audio) ffArgs.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
ffArgs.push('-movflags', '+faststart', out);

if (useCrf) {
  console.log(
    `编码：${dir} @ ${fps}fps -> ${out}（${encoder}, High Profile, CRF ${crf}, ${pixFmt}${audio ? ', AAC 320k' : ''}）`
  );
} else {
  console.warn(
    `编码：${dir} @ ${fps}fps -> ${out}（${encoder}, ${fallbackBitrate}, ${pixFmt}${audio ? ', AAC 320k' : ''}）`
  );
  console.warn(
    '提示：当前 ffmpeg 没有 libx264，无法按 CRF 18 / High Profile 编码；已使用 libopenh264 高码率回退。'
  );
}
console.log(`ffmpeg：${FFMPEG}`);

const result = spawnSync(FFMPEG, ffArgs, { stdio: 'inherit' });

if (result.status !== 0) throw new Error(`ffmpeg 失败：${result.status}`);
console.log(`完成：${out}`);
