import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(args.dir ?? 'out/frames/sample');
const every = Number(args.every ?? 15);
const cols = Number(args.cols ?? 10);
const thumbWidth = Number(args.thumb ?? 320);
const out = path.resolve(args.out ?? 'out/contact-sheet.png');

const files = fs
  .readdirSync(dir)
  .filter((name) => /^frame_\d{6}\.png$/.test(name))
  .sort();
if (files.length === 0) throw new Error(`没有找到帧文件：${dir}`);
if (!(every > 0) || !(cols > 0) || !(thumbWidth > 0)) {
  throw new Error('--every / --cols / --thumb 必须是正数');
}

const selected = Math.ceil(files.length / every);
const rows = Math.ceil(selected / cols);
fs.mkdirSync(path.dirname(out), { recursive: true });

const filter = `select='not(mod(n\\,${every}))',scale=${thumbWidth}:-1,tile=${cols}x${rows}`;
console.log(`接触表：${files.length} 帧，每 ${every} 帧取一格 -> ${selected} 格，${cols}x${rows}`);

const result = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-framerate',
    '30',
    '-start_number',
    '0',
    '-i',
    path.join(dir, 'frame_%06d.png'),
    '-vf',
    filter,
    '-frames:v',
    '1',
    out
  ],
  { stdio: 'inherit' }
);

if (result.status !== 0) throw new Error(`ffmpeg 失败：${result.status}`);
console.log(`完成：${out}`);
