import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

export const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function withRenderPage(
  fn,
  { query = '', width = 1920, height = 1080 } = {}
) {
  const { port, close } = await startServer(0);
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      protocolTimeout: 180000,
      defaultViewport: { width, height, deviceScaleFactor: 1 },
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
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[page]', msg.text());
    });
    page.on('pageerror', (error) => {
      console.error('[pageerror]', error.message);
    });

    const url = `http://127.0.0.1:${port}/src/index.html?render=1&w=${width}&h=${height}${query}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);

    return await fn(page, { port, url });
  } finally {
    if (browser) await browser.close();
    await close();
  }
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[arg.slice(2)] = next;
        i++;
      } else {
        out[arg.slice(2)] = 'true';
      }
    }
  }
  return out;
}
