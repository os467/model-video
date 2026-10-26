import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';
import { CHROME_PATH } from './harness.mjs';

const problems = [];
const expect = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) problems.push(label);
};

const { port, close } = await startServer(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 120000,
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
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });

  const ui = await page.evaluate(() => ({
    play: !!document.getElementById('play'),
    scrub: !!document.getElementById('scrub'),
    name: !!document.getElementById('blockname'),
    time: !!document.getElementById('time'),
    hudVisible: getComputedStyle(document.getElementById('hud')).display !== 'none'
  }));
  expect('预览页有播放/进度/版块名/时间', ui.play && ui.scrub && ui.name && ui.time);
  expect('预览页显示控制条', ui.hudVisible);

  await page.evaluate(() => {
    const scrub = document.getElementById('scrub');
    scrub.value = '8';
    scrub.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(
    () => window.__state().t >= 7.99 && window.__state().t <= 8.01,
    { timeout: 60000 }
  );
  const state = await page.evaluate(() => window.__state());
  expect('拖动到 8s 命中第 1 版块', state.blockIndex === 1 && state.name.includes('计数与刻痕'));

  await page.click('#play');
  await page.waitForFunction(
    () => document.getElementById('play').textContent === '⏸',
    { timeout: 5000 }
  );
  await page.waitForFunction(() => window.__state().t > 8.2, { timeout: 5000 });
  const playingState = await page.evaluate(() => window.__state());
  expect('播放后时间前进', playingState.t > 8.2);

  await page.click('#play');
  await page.waitForFunction(
    () => document.getElementById('play').textContent === '▶',
    { timeout: 5000 }
  );
  const pausedAt = await page.evaluate(() => window.__state().t);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const stillAt = await page.evaluate(() => window.__state().t);
  expect('暂停后时间停住', Math.abs(stillAt - pausedAt) < 0.02);

  await fs.mkdir('out/preview', { recursive: true });
  await page.screenshot({ path: 'out/preview/preview.png' });
  expect('预览页无脚本错误', pageErrors.length === 0);
  if (pageErrors.length) console.error(pageErrors);
} finally {
  if (browser) await browser.close();
  await close();
}

if (problems.length) {
  console.error(`\n${problems.length} 项失败`);
  process.exit(1);
}
console.log('\n预览页全部通过');
