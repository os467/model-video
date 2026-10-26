import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';
import { CHROME_PATH } from './harness.mjs';

const { port, close } = await startServer(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    protocolTimeout: 60000,
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
  page.on('pageerror', (error) => {
    console.error('PAGEERROR');
    console.error(error.stack || error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console]', msg.text());
  });
  await page.goto(`http://127.0.0.1:${port}/src/index.html?render=1`, {
    waitUntil: 'load',
    timeout: 60000
  });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const out = await page.evaluate(() => ({
    ready: window.__ready === true,
    hasState: typeof window.__state === 'function',
    state: typeof window.__state === 'function' ? window.__state() : null
  }));
  console.log('PAGE_STATE', JSON.stringify(out));
} finally {
  if (browser) await browser.close();
  await close();
}
