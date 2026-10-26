import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, withRenderPage } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const start = Number(args.start ?? 0);
const end = Number(args.end ?? 30);
const fps = Number(args.fps ?? 30);
const outDir = path.resolve(args.out ?? 'out/frames/sample');

if (!(end > start)) throw new Error('--end 必须大于 --start');
if (!(fps > 0)) throw new Error('--fps 必须大于 0');

const total = Math.round((end - start) * fps);
await fs.mkdir(outDir, { recursive: true });

console.log(`逐帧导出：${total} 帧 @ ${fps}fps，${start}s–${end}s`);
console.log(`输出：${outDir}`);

const started = Date.now();

await withRenderPage(async (page) => {
  for (let i = 0; i < total; i++) {
    const t = start + i / fps;
    await page.evaluate(async (time) => {
      await window.__seek(time);
    }, t);

    const file = path.join(outDir, `frame_${String(i).padStart(6, '0')}.png`);
    await page.screenshot({
      path: file,
      type: 'png',
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
      captureBeyondViewport: false
    });

    if (i % 60 === 0 || i === total - 1) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = (i + 1) / Math.max(elapsed, 0.001);
      const eta = (total - i - 1) / Math.max(rate, 0.001);
      console.log(
        `  ${i + 1}/${total}  t=${t.toFixed(3)}s  ${elapsed.toFixed(1)}s  ` +
          `ETA ${eta.toFixed(0)}s`
      );
    }
  }
});

const elapsed = (Date.now() - started) / 1000;
console.log(`完成：${total} 帧，用时 ${elapsed.toFixed(1)}s`);
