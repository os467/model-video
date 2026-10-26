import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';
import { CHROME_PATH, parseArgs } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const out = path.resolve(args.out ?? 'out/audio/score.wav');
const start = Number(args.start ?? 0);
const duration = args.duration == null ? null : Number(args.duration);
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, Buffer.alloc(0));

const { port, close } = await startServer(0);
let browser;
let bytes = 0;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 600000,
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    args: [
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--no-first-run',
      '--disable-extensions'
    ]
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => console.log(`  [page] ${msg.text()}`));
  await page.exposeFunction('__audioChunk', async (b64) => {
    const chunk = Buffer.from(b64, 'base64');
    await fs.appendFile(out, chunk);
    bytes += chunk.length;
  });

  await page.goto(`http://127.0.0.1:${port}/?render=1`, {
    waitUntil: 'load',
    timeout: 60000
  });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });

  console.log(
    duration == null
      ? `离线渲染 ${start ? `${start}s 起` : '全片'}音频…`
      : `离线渲染 ${start}s–${start + duration}s 音频…`
  );
  const info = await page.evaluate(
    (options) => window.__renderAudio(options),
    { start, duration }
  );
  if (errors.length) throw new Error(errors.join('\n'));
  if (!info || !info.bytes) throw new Error('音频渲染没有返回数据');
  if (bytes !== info.bytes) {
    throw new Error(`WAV 分块总字节不一致：${bytes} / ${info.bytes}`);
  }
  console.log(
    `完成：${out} · ${info.duration.toFixed(2)}s · ${info.sampleRate}Hz · ${info.channels}ch · ${(bytes / 1048576).toFixed(1)}MB`
  );
} finally {
  if (browser) await browser.close();
  await close();
}
