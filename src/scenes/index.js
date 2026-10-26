import s01 from './scene-01.js';
import s02 from './scene-02.js';
import s03 from './scene-03.js';
import s04 from './scene-04.js';
import s05 from './scene-05.js';
import s06 from './scene-06.js';
import s07 from './scene-07.js';
import s08 from './scene-08.js';
import s09 from './scene-09.js';
import s10 from './scene-10.js';
import s11 from './scene-11.js';
import s12 from './scene-12.js';
import s13 from './scene-13.js';
import s14 from './scene-14.js';
import s15 from './scene-15.js';
import s16 from './scene-16.js';
import s17 from './scene-17.js';
import s18 from './scene-18.js';
import s19 from './scene-19.js';
import s20 from './scene-20.js';

export const SCENES = Object.freeze([
  s01, s02, s03, s04, s05, s06, s07, s08, s09, s10,
  s11, s12, s13, s14, s15, s16, s17, s18, s19, s20
]);

for (let i = 0; i < SCENES.length; i++) {
  if (SCENES[i].id !== i + 1) {
    throw new Error(`场景顺序错误：第 ${i + 1} 个文件里 id=${SCENES[i].id}`);
  }
}

export function sceneForBlock(index) {
  return SCENES[index - 1];
}
