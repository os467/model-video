import { createHash } from 'node:crypto';
import {
  BLOCK_COUNT,
  INTRO_DURATION,
  OUTRO_START,
  TOTAL_DURATION,
  blockStartTime,
  locate
} from '../src/beat/timeline.js';
import { withRenderPage } from './harness.mjs';

const problems = [];
function expect(label, condition) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}`);
    problems.push(label);
  }
}

expect('总长 137 秒', TOTAL_DURATION === 137);
expect('Intro 5 秒', INTRO_DURATION === 5);
expect('Outro 从 125 秒开始', OUTRO_START === 125);
expect('20 个版块', BLOCK_COUNT === 20);
expect('第 1 版块从 5 秒开始', blockStartTime(1) === 5);
expect('第 20 版块从 119 秒开始', blockStartTime(20) === 119);
expect('t=0 是 Intro', locate(0).part === 'intro');
expect('t=5 是第 1 版块', locate(5).part === 'block' && locate(5).blockIndex === 1);
expect('t=125 是 Outro', locate(125).part === 'outro');

await withRenderPage(async (page) => {
  const state = await page.evaluate(() => window.__state());
  expect('离屏快照 20 格', state.snapshots === 20);

  const hashAt = async (t) => {
    await page.evaluate(async (time) => {
      await window.__seek(time);
    }, t);
    const buffer = await page.screenshot({
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
      captureBeyondViewport: false
    });
    return createHash('sha256').update(buffer).digest('hex');
  };

  const first = await hashAt(8.25);
  await hashAt(31.5);
  const second = await hashAt(8.25);
  expect('同一时刻两次渲染逐像素一致', first === second);

  const atEnd = await page.evaluate(async () => {
    await window.__seek(137);
    return window.__state();
  });
  expect('t=137 停在 Outro 尾声', atEnd.part === 'outro');
});

if (problems.length > 0) {
  console.error(`\n${problems.length} 项失败`);
  process.exit(1);
}
console.log('\n全部通过');
