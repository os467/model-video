import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(args.dir ?? 'out/frames/sample');
const fps = Number(args.fps ?? 30);
const out = path.resolve(args.out ?? 'out/sample_1080p30.mp4');
const bitrate = String(args.bitrate ?? '10M');

if (!fs.existsSync(path.join(dir, 'frame_000000.png'))) {
  throw new Error(`缺少起始帧：${path.join(dir, 'frame_000000.png')}`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });

console.log(`编码：${dir} @ ${fps}fps -> ${out}（libopenh264, ${bitrate}）`);

const result = spawnSync(
  'ffmpeg',
  [
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
    'libopenh264',
    '-b:v',
    bitrate,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out
  ],
  { stdio: 'inherit' }
);

if (result.status !== 0) throw new Error(`ffmpeg 失败：${result.status}`);
console.log(`完成：${out}`);
