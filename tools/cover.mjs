import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';
import { CHROME_PATH, parseArgs } from './harness.mjs';

const args = parseArgs(process.argv.slice(2));
const width = Number(args.width ?? 3840);
const height = Number(args.height ?? 2160);
const out = path.resolve(args.out ?? 'out/cover/cover-bg-4k.png');

await fs.mkdir(path.dirname(out), { recursive: true });

const { port, close } = await startServer(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 180000,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: [
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
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page] ${msg.text()}`);
  });
  await page.goto(
    `http://127.0.0.1:${port}/src/cover.html?w=${width}&h=${height}`,
    { waitUntil: 'load', timeout: 60000 }
  );
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  if (errors.length) throw new Error(errors.join('\n'));
  await page.screenshot({
    path: out,
    type: 'png',
    clip: { x: 0, y: 0, width, height },
    captureBeyondViewport: false
  });
  const info = await fs.stat(out);
  console.log(
    `完成：${out} · ${width}×${height} · ${(info.size / 1048576).toFixed(1)}MB`
  );
} finally {
  if (browser) await browser.close();
  await close();
}
