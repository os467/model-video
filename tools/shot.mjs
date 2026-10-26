import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, withRenderPage } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const times = String(args.times ?? args.t ?? '0,2.5,5,8,11,29,125,130,137')
  .split(',')
  .map(Number)
  .filter((v) => Number.isFinite(v));
const outDir = path.resolve(args.out ?? 'out/shots');

await fs.mkdir(outDir, { recursive: true });
console.log(`静帧截图：${times.join(', ')}s -> ${outDir}`);

await withRenderPage(async (page) => {
  for (const t of times) {
    await page.evaluate(async (time) => {
      await window.__seek(time);
    }, t);
    const file = path.join(outDir, `t_${t.toFixed(2).replace('.', '-')}.png`);
    await page.screenshot({
      path: file,
      type: 'png',
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
      captureBeyondViewport: false
    });
    console.log(`  ${t.toFixed(2)}s -> ${file}`);
  }
});
