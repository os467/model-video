# 《计算之灵》TASK10 专项整改报告

**主题：技术审查与风格特化机制、1–5 版块动作整改、10–18 版配色递进**

日期：2026-10-26  
状态：**四项开放决策已按推荐确认；待主人下达执行指令，尚未执行任何代码升级**。  
范围：只审查与提出方案；本报告是唯一新增文件。没有修改 scene、kit、beat、main，没有安装依赖，没有下载或复制外部资产。

---

## 0. 结论摘要

1. 人类评价指出的 5 个重点问题全部能在代码和截图中复现，不是主观误判：第 1 版石头尖端确实悬空约 19–22 单位；第 2 版笔压的是路面而不是泥板；第 3 版没有深度投影；第 4 版笔在版块内 x≈292 处才出现；第 5 版是黑剪影手掌加单根食指，比例会读成“竖中指”。
2. 第 1 版的核心不是“再加一点动作”，而是把静态预生成的刻痕改成“接触—下压—二次凿击—抬起—前移”的逐次生成状态机；石头尖端必须落到 `MARKS_BASE_Y=612`，刻痕必须比现在短、成组、方向稳定，不能继续用贯穿画面的长竖线和规则网格。
3. 第 2 版的核心是让笔尖真正压在表格单元上；现在的 `drawStylus` 尖端在 `ROAD_Y=630` 附近，而表格在 `y=330–610`，表格填充和笔的动作没有因果关系。放大表格、填满 16 格、扩大主数字，并把左侧改成具体平方根图形，是比“再加装饰”更有效的整改。
4. 第 3 版不切 WEBGL。建议用 scene 内 2D 透视投影 `s = D / (D - v·sinθ - h·cosθ)`、采样圆、画家顺序和圆规多动作，做出可读的纵深；`perspective()` 官方只支持 WEBGL，切换会破坏整个 2D 管线。
5. 第 4 版笔的瞬移来自 `PEN_X_KEYS` 第一项 `[0.0, 292]`；改为相对主角基线的 `-28 → 0` 入场，并用同一套关键帧让笔先写左侧内容、再写右侧步骤、最后落印，衔接就成立。场景内英文 `algorithm` 应去掉，改成“算法”印章或纯图形；标题卡英文按 PROMPT 规格保留，除非主人另行授权。
6. 第 5 版建议不再修写实手，改为滑尺下方导轨上的黄铜两指平行夹爪/推杆：手指不挡齿轮，比例天然正确，机械动作可读，且不需要跨路面带补画。
7. 10–12 与 13–18 的审美疲劳来自共用色板和同一种深蓝底，不是单个场景画得不好。方案是保持“纸暖 → 机械铜暗 → 电子绿/琥珀 → 数据蓝紫/青 → 19 锁定霓虹 → 20 暖白微光”的总弧线，但给每块固定 3–5 个主色、1 个强调色、明确的 split toning/scanline/halftone/bloom 位置；不做全片统一 LUT。
8. 8、19 不动；19→20 转场继续后置。第 19 版如果确实需要与 13–18 统一，只能在报告里提出“不改 scene 的可选后期调色”，并且必须主人明确授权后才能做。
9. 建议建立 `docs/style-spec.md`（全片风格合同）+ 现有 `briefs/scene-XX.md` 的 `Style contract` 段 + `docs/style-review.md`（审查记录）。审查子代理先只看 3 帧/10 秒片段/参考/规格，不先读代码；实现子代理再改 scene。用 `node tools/check.mjs`、标题门控、世界坐标、确定性、8/19 零 diff 等门禁防回归。
10. 本次不安装 Rough.js、p5.grain、chroma.js、d3-scale-chromatic、p5.glitch 等任何包；只可参考算法与许可，代码由项目自己实现。

---

## 1. 审查证据与人类评价逐条核查

### 1.1 已读与已看的基线

- 规格：`TASK10.md`、`PROMPT.md`。
- 批次报告：`docs/phase3-a-batch-report.md`、`phase3-b-batch-report.md`、`phase3-c-batch-report.md`、`phase3-d-batch-report.md`。
- 关键代码：`src/scenes/scene-01.js` … `scene-20.js`，重点 1–5、10–18、20；8、19 只读锁定。
- 公共层：`src/kit/palette.js`、`road.js`、`camera.js`、`text.js`、`rng.js`；`src/beat/timeline.js`；`src/main/draw-block.js`；`src/main/snapshots.js`。
- 图像：`out/phase2-static/block01-chisel.png`；A/B/C/D 四批 contact sheet 与各批 final 帧。
- 本地参考：`E:\workspace\_refs\huashu-art-motion`（MIT，资产/字体/角色有例外）、`E:\workspace\_refs\The-Pelican-Test`（代码 MIT，媒体保留）。只读方法与配方，不复制资产或代码。

### 1.2 逐条核查表

| # | 人类评价 | 代码/画面证据 | 审查结论 |
|---|---|---|---|
| 1 | 石头没有接触/划痕感 | `drawFlint` 的 `lift = 28 + abs(wobble)*3`，尖端在局部 `+36`，缩放 1.12 后约 `y=590–593`；刻痕基线 `MARKS_BASE_Y=612`，空隙约 19–22 单位。影子仍画在 `y=614`，反而强化悬空。 | 成立。需要按旋转后的真实尖端计算接触，不是只改影子。 |
| 2 | 1/2/3 的竖横纹理不真实 | `GROUPS` 只有 1、2、3 三组，全部 `drawGroups(p)` 静态预画；`GROUP_SPACING=13`、`len=58–74`，是很长的竖向凿槽。`drawGridVertical` 每 25px 一条线，横线在 `y=550/610/670/730`，刻痕附近只断竖线，横线仍穿过。 | 成立。需要短横向刻痕、真实分组、去掉规则网格穿透，并让 3→4/5 的计数继续。 |
| 3 | 动态只是平滑前进，划痕应由石头刻出来 | `drawGroups(p)` 不接收时间，所有刻痕从第一帧就存在；`drawFlint(p,t,x)` 只有正弦摆动，`drawActor` 只调用石头。没有“接触前/凿击/完成”状态。 | 成立。需要 time-driven carve plan；刻痕在接触后才出现。 |
| 4 | 笔落下产生的东西意义不明、内容空、字太小 | `drawStylus` 尖端 `tipY = ROAD_Y - tipLift`，`ROAD_Y=630`；表格 `TABLE y=330–610`，笔在路面上压，格子在别处自己填。主平方数 `u=5.0`，约 13–26px；`drawCellContent` 有空格，`drawRoadMarks` 在路面另压一串无解释的组。 | 成立。主要不是“内容不够多”，而是笔和表格没有空间因果。 |
| 5 | 第 3 版只有平面，没有 z 轴和纵深 | 大圆 `CX=700,CY=402,R=174` 用 `p.arc`/平面直线；三角形、弦、证明链、圆规脚全在同一平面。`drawCompass` 只有脚在 2.55–2.98s 移向小方块，没有抬腿/换点/敲击。 | 成立。需要 2D 假透视 + 圆规多动作，不建议切 WEBGL。 |
| 6 | 第 4 版笔瞬移，左侧内容少，只有右侧 1/2/3 | `penPose` 在 `t<2.95` 用 `nibX = localX + track(t, PEN_X_KEYS)`，第一项是 `[0.0,292]`；版块开始时笔尖在局部 x≈292，不是从左侧连续进入。左侧只有 `drawInkwell x=468` 和小花饰 `x=101,y=694`，`STEPS` 全在 `x=646`。 | 成立。需要重写入场关键帧，并让左侧承担实际书写动作。 |
| 7 | 中国风场景里写了英文 | `const WORD={text:'algorithm'...}`，`drawAlgorithm` 用 `p.text(WORD.text,...)` 画真实英文。 | 成立。场景内应去掉；标题卡英文另按规格处理。 |
| 8 | 手像竖中指，比例不对 | `drawHandShapes`：前臂 `strokeWeight 92`，手掌 `ellipse 150×140`，拇指 40、单根食指 33，四个指节 42；黑剪影加单指，容易读成竖中指，且手挡住主齿轮。 | 成立。推荐机械夹爪替代。 |
| 9 | 10–12、13–19 主题配色相似、审美疲劳 | 10/11/12 共用 `#061614,#123c32,#2fe0a4,#e8a24a` 这一套；13–18 全部 `bg #060a16`、`navy #1a2750`、`cyan #63dfff`，差异只在内容。 | 成立。需要按块设色相锚点和光影配方，而非只换几个色值。 |
| 10 | 6–9、20 无大问题，可加元素；20 要更神秘；整体从浅到深蓝，最后暖白未知 | 6/7/9 已有蒸汽、蓝图、灯丝等；20 已有暖白、20 枚余烬、未闭合弧，但仍较空。 | 成立。增强即可，不要重做。8、19 锁定。 |

---

## 2. 重点版块 1–5 整改方案

### 2.0 所有整改的共同约束

- 只改 `src/scenes/scene-XX.js`。不改 `src/kit/`、`src/beat/`、`src/main/`，不改标题排版，不新增依赖。
- 版块内容用版块局部坐标；`drawActor` 收到的是世界坐标。需要局部位置时统一用：
  ```js
  const localX = state.x - (state.blockIndex - 1) * 1000;
  ```
  第 1 版块起点为 0，所以两者数值相同，但仍建议写成显式公式，避免以后搬版块时出错。
- 所有随机必须来自固定 seed 的 `hash2`/`mulberry32`；禁止 `Math.random()`、`Date.now()`。
- 不绘制真实产品、logo、聊天 UI、机器人形象；不复制参考项目的媒体、字体、角色、构图、文案。
- 标题卡仍由 `drawTitleCard` 画；标题门控继续用 `currentBlockAt(globalT, fallback)`。
- 曲线一律采样 `p.vertex` 折线，不用 `bezierVertex`/`curveVertex`。

---

### 2.1 第 1 版块：计数与刻痕

#### A. 现状诊断（代码坐标）

- `src/scenes/scene-01.js:30–36`：
  ```js
  const GROUPS = [
    { x: 58, count: 1 },
    { x: 124, count: 2 },
    { x: 198, count: 3 }
  ];
  const GROUP_SPACING = 13;
  const MARKS_BASE_Y = 612;
  ```
- `drawGroups(p)`（`:177`）没有 `t`，一次性画完全部 6 个刻痕；`drawChiselMark`（`:117`）是长 58–74 的竖槽，角度 `-0.16 + hash*0.32`，更像条形码，不像真实骨刻。
- `drawFlint(p,t,x)`（`:202`）：
  ```js
  const lift = 28 + Math.abs(wobble) * 3;
  p.translate(x, 582 - lift);
  p.rotate(0.08 + 0.03 * wobble);
  p.scale(1.12);
  // 尖端局部 (0,36) → 约 y=590–593
  ```
  尖端与 `y=612` 的基线之间有空隙；影子却在 `y=614`，视觉上更明显。
- `drawGridHorizontal`（`:83`）在 `y=550/610/670/730` 画贯穿线；`drawGridVertical`（`:101`）每 25px 一条，只在刻痕中心附近断竖线。横线仍从刻痕上穿过，像网格穿透骨头。
- `drawActor`（`:316`）直接调用 `drawFlint(p,state.t,state.x)`，没有“正在凿哪一槽”的状态。

#### B. 目标动作谱（6 秒）

把三个旧组保留为“祖先已经刻好的 1、2、3”，让当前石头在第二小节完成 3 的最后一组，并继续刻 4、5：

```js
// 建议的场景内常量（局部坐标，单位与现有 scene 一致）
const NOTCH_PITCH = 11.5;
const NOTCH_GROUPS = [
  { x: 86,  count: 1, old: true },
  { x: 158, count: 2, old: true },
  { x: 258, count: 3, old: false }, // 当前动作刻这 3 个
  { x: 340, count: 2, old: false }  // 继续刻 4、5
];
const CARVE_STRIKES = [
  { x: 258, t: 0.78, len: 34, angle: -0.035, tap: 1 },
  { x: 270, t: 1.10, len: 37, angle:  0.040, tap: 2 },
  { x: 282, t: 1.42, len: 32, angle: -0.020, tap: 1 },
  { x: 340, t: 2.54, len: 36, angle:  0.050, tap: 2 },
  { x: 353, t: 2.80, len: 33, angle: -0.040, tap: 1 }
];
```

- `0.0–0.55`：石头从上方落下，影子收紧；旧组 1、2 只以低对比度存在。
- `0.55–0.78`：悬停、对准第一个新槽；石头尖端降到 `y=612` 上方 12 单位。
- `0.78`：第一次接触，刻出浅槽；`0.84` 在同一位置二次下压，槽深加 1.2，骨屑翻起。
- `1.10 / 1.42`：抬刀 8–12 单位，弧线前移，再落第二、第三个槽。
- `2.54 / 2.80`：从第 3 组跨一个 26–30 的分组间隙，刻出 4、5；这两个槽比前面略浅，表示计数继续而不是新组。
- `3.0–4.0`：定格，石尖仍压在最后一个槽口，骨屑落下；`4.2–5.2` 石头抬起退出。
- 旧组 1、2 和当前组的间距不平均：组间隙约 26–32，组内节距 10–12；每个槽角度在 `-0.06..+0.06 rad` 内抖动，长度 32–38，不再有 58–74 的长槽。

#### C. 具体代码修改

1. **新增 `flintPose(t)`，替代 `drawFlint(p,t,x)` 的函数签名。**
   - 由 `CARVE_STRIKES` 找当前/最近的凿击，返回 `{x, y, rot, press, lift, contact, strikeIndex, chipAge}`。
   - 接触公式必须算旋转后的真实尖端。当前尖端局部是 `(0, 36)`，`scale(1.12)` 后为 `(0, 40.32)`：
     ```js
     const tipLen = 36 * 1.12;
     const tipX = x - Math.sin(rot) * tipLen;
     const tipY = y + Math.cos(rot) * tipLen;
     ```
     接触时令 `tipY = MARKS_BASE_Y - pressDepth`，反解 `y`。不要再用固定 `582 - lift`。
   - 接触时 `press` 0→1，`y` 额外下压 3–4 单位；抬刀 8–12 单位；二次凿击的 `press` 峰值比第一次高 0.2。
2. **`drawGroups(p,t)` 改成按时间绘制。**
   - 旧组：`fresh=0`、`alpha≈0.55`、无骨屑。
   - 新组：`const q = smoothstep(strike.t, strike.t + 0.10, t)`；`q<=0` 不画，`0<q<1` 用缩短的槽长表示“正在刻”，`q=1` 完整。
   - 每个槽的 `chipAge = clamp((t - strike.t)/0.55,0,1)`，骨屑在 `0–0.55s` 内从槽口弹起、落下并淡出。
3. **新增 `drawFreshNotch(p, strike, q, chipAge)`**，或扩展 `drawChiselMark(..., opts)`：
   - 槽口不是长竖线，而是短横向切痕：长 32–38、宽 4.2–5.2、V 形截面；
   - 暗芯用 `C.ink` 0.82–0.9；
   - 下唇亮边 `C.boneLight` 0.55–0.7，偏 1–1.5px；
   - 上唇暗边 `C.rust` 0.18–0.25；
   - 槽底两端各 1–2 粒骨屑，方向沿槽轴向外；
   - 旧槽的亮边 alpha 降到 0.35，避免旧刻痕抢戏。
4. **去掉规则网格穿透。**
   - `drawGridHorizontal` 只保留 `y≈540`、`y≈700` 两条极淡骨纹（alpha 0.018–0.025），且在工作区 `x=40–410,y=560–680` 内断开。
   - `drawGridVertical` 改成不规则骨纤维：用 `hash2(i, seed)` 生成 18–24 条短斜线（长 8–22，alpha 0.02–0.035），不再是每 25px 一条的页面网格。
   - 在骨面工作区先铺一层弱化的 `drawBoneBackground` 或半透明骨色补丁，再画刻痕，确保任何背景线不会穿过槽口。
5. **接触阴影与骨屑。**
   - 影子改为跟着 `flintPose` 的 `tipX` 走：`ellipse(tipX+3, MARKS_BASE_Y+3, 11–14, 3–4)`，alpha `0.14 + 0.18*press`。
   - 接触时从 `tipX` 两侧各抛 2–3 粒骨屑，重力参数固定 `g≈520`，寿命 0.3–0.55s；不能只在空中静态洒点。
6. **`drawActor` 改为 `drawFlint(p, flintPose(state.localT), state.x)`**，或把世界 x 转成局部 x 后画。第 1 版块 origin=0，但仍写成显式转换。

#### D. 视觉参考与真实感边界

- Ishango 骨：官方博物馆资料确认约 2 万年、狒狒腓骨、约 10cm、分组刻痕；三列 60/48/60、168 个刻痕是常见说法，但官方页面不直接确认 168 这个总数，且计数方法有争议。因此本项目只借鉴“横向短切痕、分组、手工角度抖动、分组间距不均”，不声称精确复刻 Ishango，也不在画面里标注 168。
- 真实骨刻是短促的横向刻入，不是长竖线；1/2/3 应该读成“数量组”，不是汉字笔画，也不是页面网格。
- 建议让骨面有一点曲率和边缘：在 `y≈520–700` 叠一条 2–3px 的骨缘高光/暗边，让刻痕落在“骨面”上，而不是全屏平面。

#### E. 第二小节高光/动作

- `localT 2.54–3.0` 是主要高光：石头跨组刻出第 4、5 道，尖端真实压到骨面，二次凿击产生骨屑；镜头不需要额外推拉，靠接触点和刻痕逐次出现制造动作。
- 定格 `3.0–4.0`：石尖停在最后一道槽口，影子紧贴，骨屑最后一粒落下；旧组 1/2/3 与新组 4/5 形成清楚的节奏。

#### F. 验收帧

| 文件建议 | 全局 t | 画面检查点 |
|---|---:|---|
| `out/style-review/block01/t_05-90.png` | 5.90s | 第一次接触，槽口刚出现，石尖与骨面没有空隙 |
| `out/style-review/block01/t_07-40.png` | 7.40s | 第 3 组三个槽完成，石尖抬起 8–12，骨屑在落 |
| `out/style-review/block01/t_08-00.png` | 8.00s | 高光：4/5 已刻出，组间距可读，石尖仍接触 |
| `out/style-review/block01/t_10-20.png` | 10.20s | 收尾：旧组低对比、新槽亮唇冷却，背景无规则网格穿过 |

#### G. 风险与性能

- 风险：旋转后的尖端公式如果仍用包围盒近似，会继续悬空；必须用局部尖端坐标旋转。
- 风险：5 个新槽 + 2 次凿击可能让 0.78–1.5s 太密；如果验收觉得急，可把第 3 组改成 2 个新槽，保留“3→4/5”的读数，不增加时长。
- 性能：8 个槽、约 30–50 粒骨屑，全矢量，无逐像素；新增成本可忽略。
- 世界坐标：版块 1 origin=0，`state.x` 与局部 x 相同；仍要按统一公式写，避免后续复制到别的版块出错。

---

### 2.2 第 2 版块：数与形

#### A. 现状诊断（代码坐标）

- `scene-02.js:40–51`：
  ```js
  const TABLE = { x0: 520, x1: 880, y0: 330, y1: 610, cols: 4, rows: 4, cellW: 90, cellH: 70 };
  const ROAD_Y = 630;
  ```
- `drawCellContent`（`:755`）：
  ```js
  drawCuneiform(p, n, -37, -23, 2.3, ... 'left');
  drawCuneiform(p, n * n, 0, 8, 5.0, ... 'center');
  ```
  主平方数 `u=5.0`，在 1080p 下约 13–26px；左上小序号更小。第 3、4 行有空格；表格只占 `x=520–880`，左侧 `x≈70–450` 除了小花饰和墨池基本空。
- `drawStylus`（`:925`）：
  ```js
  const tipY = ROAD_Y - tipLift;
  ```
  `ROAD_Y=630`，笔在路面上压；表格在 `y=330–610`。`drawRoadMarks`（`:392`）在 `y=630` 每 0.5s 再压一组，和表格内容没有关系。`cellFilled`/`cellFillTime` 独立按时间填格，笔和格子各演各的。
- `drawRoad`（`:1126`）在裁剪区内重绘 `drawTable`，表格跨路面带时会被补画，但笔的接触点仍不在表格上。

#### B. 目标布局与内容

建议把表格扩大并把主数字放大，而不是在现有小表格里塞更多小字：

```js
const TABLE = {
  x0: 460, x1: 910,
  y0: 270, y1: 610,
  cols: 4, rows: 4,
  cellW: 112.5, cellH: 85
};
const MAIN_U = 8.4;      // 原 5.0
const SMALL_U = 3.8;     // 原 2.3
const LEFT = { x: 64, y: 548, w: 366, h: 168 };
```

- 表格面积从 360×280 增到 450×340，约 +52%；主数字从 `u=5.0` 增到 `8.4`，约 +68%，1080p 下主平方数约 34–40px 高。
- 16 格全部填满，n=1…16，主数字为 n²，左上角小号为 n。任何一格都不留空。
- 顶部/左侧加 1–4 的行列刻度：小楔形或短刻线，`u≈3.2`，让“表”的结构具体，不靠标题解释。
- 左下 `LEFT` 区域放一个“平方根/对角线”图形：一个边长 30 的方块、对角线、边 30、对角线 42;25;35、近似根 1;24,51,10。数字用楔形写，不用英文。这个图形对应 YBC 7289 的数学内容，但由项目自己重画，不复制照片或拓片。
- 由于 `LEFT` 从 `y=548` 开始，避开标题卡 `y≈286–410`，也避开当前表格；路面带 `y=466–534` 以上，不会切到图形主体。

#### C. 笔与表格的因果关系

1. **新增 `PRESS_SCHEDULE`（16 次压印，蛇形顺序）。**
   - 起始 `t=0.62`，节拍 0.13s，接触 0.055s，抬笔/移位 0.075s；第 16 次约在 `2.70s` 完成。
   - 每个格子的 `cellFilled` 改由对应 press 的 `t_contact` 决定，而不是 `FILL_START + idx*FILL_STEP` 的全局扫过。
   - `draw` 里 `drawTable` 读取同一个 `PRESS_SCHEDULE`；`drawActor` 也读取它，保证笔尖和格子同一时刻。
2. **`drawStylus` 改签名。**
   - 当前 `drawStylus(p,x,t)` 改为 `drawStylus(p, pose)`，`pose` 包含 `tipX,tipY,press,lift,tilt`。
   - 表格内接触：`tipY = cellCy + 8`（对准楔形底线），不是 `ROAD_Y`；压印时下压 2–3 单位，抬笔 12–16 单位。
   - 每格压印时，笔尖在单元内做 0–2px 的轻微横向“压—抬”，不拖拽；翻泥唇由 `drawPressMark` 的亮边表现。
3. **删除/改写 `drawRoadMarks`。**
   - 当前 `drawRoadMarks` 在路面制造与表格无关的压印，是“意义不明”的主要来源之一。建议删除该调用，或只保留入口处 2–3 个“已经压过的旧记号”，并在视觉上与表格边框对齐，不再每秒自动加一组。
4. **左侧图形。**
   - 该图形可以让笔在表格完成后（`2.70–2.95`）过去点一下对角线中心作为收笔，也可以作为“早已刻在泥板边缘的参考图形”在 `2.4–2.9` 渐显。推荐后者：不让笔在两秒内跨越整个画面，动作更可信。
   - 如需笔去点它，则必须用 `2.70–2.95` 的短程移动，目标 x 约 260，距离较远，容易再次瞬移；不建议。

#### D. 真实楔形与内容依据

- ORACC：芦苇笔以约 20° 轻压入泥，尖端压出楔头，杆边抬起形成短尾；是“压—抬”，不是拖拽。British Museum 也明确是 press，不是 draw。
- 当前 `drawPressMark` 已有三角楔口 + 短尾 + 翻泥亮边，方向正确；整改重点不是重画楔形，而是让压印在正确的位置、按正确节拍发生。
- 表格数值用平方数 1²…16²，范围 1–256，可用现有 `drawCuneiform` 的六十进制分组表达；左侧 √2 用 1;24,51,10 与 42;25,35，需要新增 scene 内 `drawSexagesimalComponents(p, [1,24,51,10], ...)`，逐组调用现有 `drawDigit`，不新增 kit API。

#### E. 第二小节高光/动作

- `localT 2.4–3.0`：最后 3–4 次压印节奏加快，表格全部填满；左侧 √2 图形显影到 70%，对角线亮唇和翻泥屑落定。
- 定格 `3.0–4.0`：笔尖停在最后一格，表格完整，左侧示例与主表形成“方法 → 表”的读法。

#### F. 验收帧

| 文件建议 | 全局 t | 画面检查点 |
|---|---:|---|
| `out/style-review/block02/t_11-80.png` | 11.80s | 笔尖在某个格子中心，格子内容随接触出现，不是路面 |
| `out/style-review/block02/t_12-60.png` | 12.60s | 表格中段已填满，笔抬起 12–16，无空格 |
| `out/style-review/block02/t_14-00.png` | 14.00s | 高光：16 格全满、主数字可读、左侧 √2 图形清楚 |
| `out/style-review/block02/t_16-20.png` | 16.20s | 离场：笔已离开表格，翻泥屑落定，路面没有无解释压印 |

#### G. 风险与性能

- 16 次压印在 2.1s 内完成，可能在 60fps 下偏快；如果验收觉得“机关枪”，可改成 9 次压印覆盖 9 个关键格，其余 7 格以低对比“旧刻”预置，但高光时必须全填满。
- 表格扩大后 `drawRoad` 仍会重绘表格内容；vector 路径约 16 格 × 最多 10 个楔形，成本仍低，但要在 Phase 5 实测。
- 数字 1–256 的六十进制分组要确保 `drawCuneiform` 对 60–59 的边界不产生空组；256 = [4,16]，400 才会出现 [6,40]，当前 4×4 不会到 400。
- 删除 `drawRoadMarks` 后，路面可能变空；可保留 3 个入口旧印作为节奏点，但不能每 0.5s 自动出现。

---

### 2.3 第 3 版块：几何与证明

#### A. 现状诊断（代码坐标）

- `scene-03.js:36–38`：`CX=700, CY=402, R=174`。
- `drawConstruction`（`:393`）的圆、内接三角形、平行弦、证明链全部是平面 `drawArc`/`line`；没有 z、没有投影、没有前後遮挡。
- `drawCompass`（`:685`）的 H、footF、footM 在同一平面：
  ```js
  const len = 116;
  const footF = { x: hx + cos(fixedAngle)*len, y: hy + sin(fixedAngle)*len };
  const footM = { x: hx + cos(movingAngle)*len, y: hy + sin(movingAngle)*len };
  ```
  2.55–2.98s 只是把画脚移向小方块，之后定格；没有定脚、旋臂、抬脚、换点、敲方块的多动作。
- `drawRoad`（`:788`）为覆盖默认路带，把整个 `drawScene` 重绘一遍，成本约翻倍；加入投影后必须先优化。

#### B. 假 3D 方案（不切 WEBGL）

在 scene 内定义平面坐标 `(u,v)` 和离面高度 `h`，使用针孔投影的 2D 形式：

```js
const D = 800;          // 相机到投影平面的距离
const TILT = 0.32;      // 平面俯仰角，约 18.3°
const CX3 = 690;
const CY3 = 370;

function project3(u, v, h = 0) {
  const z = D - v * Math.sin(TILT) - h * Math.cos(TILT);
  const s = D / z;
  return {
    x: CX3 + u * s,
    y: CY3 + (v * Math.cos(TILT) - h * Math.sin(TILT)) * s,
    s,
    z
  };
}
```

- 圆上一点：`u = R cosφ, v = R sinφ, h=0`，`φ` 采样 96 段，`R=160`。
- `v` 为正的一侧（画面下方）离相机更近，`s` 更大；`v` 为负的一侧更远，`s` 更小。圆因此成为有近大远小的椭圆，而不是正圆。
- 用 `s` 给线宽和 alpha 做轻微分层：远半 `alpha 0.55–0.65 / weight 1.8–2.0`，近半 `alpha 0.8–0.9 / weight 2.6–3.0`。先画远半，再画近半，形成遮挡。
- 加一层投影阴影：同样的圆点偏移 `u+10, v+12, h=-2`，`alpha 0.08–0.12`，无 blur。
- 平面网格：只画 5 条横向透视线和 7 条放射线，全部用 `project3`，alpha 0.04–0.07；不要再用屏幕规则网格。
- 圆的中心加一根 40–50 高的“垂线/铅垂线”，顶部一个小铜锤或光点，明确 z 方向；这不是历史器材的严格复制，只是视觉深度提示。

#### C. 圆规多动作与接触

建议把圆规从“脚在平面里滑”改成“定脚—旋臂—抬脚—换点—敲方块”：

1. `0.35–0.85`：圆规从左侧滑入，固定脚落到圆心 `(u=0,v=0)`，接触处一圈小阴影。
2. `0.85–1.65`：活动脚落到圆周 `(u=R,v=0)`，绕圆心旋转约 1.1 圈；圆按 `φ` 的当前进度绘制远半和近半，形成“正在画”的缺口。
3. `1.65–2.05`：活动脚抬离平面 `h=14–20`，跨到 `φ≈130°` 的新点，再落下；留下第二段弧或辅助弧。
4. `2.05–2.45`：换到平行弦端点，画一条 z=4 的弦，弦的投影与圆面有轻微前后关系。
5. `2.45–2.85`：活动脚移到小方块 `SQUARE` 附近，轻敲方块；方块产生 2–3px 下沉/回弹，接触点有泥/纸屑。
6. `2.85–3.0`：圆规两腿微调，圆闭合，定格。

圆规对象也要投影：脚在 `h=0`，铰链在 `h≈80–95`；脚和铰链用 `project3` 得到 `(x,y,s)`。腿的宽度随 `s` 缩放 0.9–1.1，脚底阴影用投影后的椭圆。这样“圆规站在纸面上”与“圆在纸面上”共享同一套空间。

#### D. 代码修改点

- 新增 scene 内 `project3`、`projectCircle`、`projectPolyline`。
- 新增模块级只读缓存：
  ```js
  const CIRCLE_FAR = []; // 预计算 96 点的远半
  const CIRCLE_NEAR = []; // 预计算 96 点的近半
  ```
  `D/TILT/R/CX3/CY3` 都是常量，不需要每帧重新算三角函数数组。`drawConstruction` 只按进度取点数。
- `drawArc` 保留给平面辅助线；主圆、弦、证明链、圆规脚改用投影后的 `p.vertex` 折线。不要用 `bezierVertex`。
- `drawCompass` 改为：
  ```js
  const pose = compassPose(t); // 局部/世界位置、两脚角度、抬脚高度、敲击相位
  const hinge = project3(pose.hu, pose.hv, 90);
  const footF = project3(pose.fu, pose.fv, 0);
  const footM = project3(pose.mu, pose.mv, pose.lift);
  ```
  世界 x 只用于决定圆规整体在哪，不再直接当平面 x；局部关键帧建议 `-20 → 660 → 700(hold) → 960(exit)`。
- `drawRoad` 优化：不要重绘整屏，而是像 scene-04 一样用 `ctx.rect(0,470,1000,60)` 裁剪，然后在裁剪区内调用 `drawScene` 再画铜尺。这样保留纸纹连续，减少路面外的重复填充。裁剪仍会执行投影路径，但像素填充显著下降。
- 标题仍在 `drawTitle(p,t)` 里画；投影平面不要侵入标题安全区 `x≈120–480,y≈250–450` 的高对比区域。

#### E. 第二小节高光/动作

- `localT 2.45–3.0`：圆规抬脚换点后敲方块，方块下沉回弹；主圆近半最后闭合，远/近线宽差和投影阴影同时可见。
- 定格 `3.0–4.0`：圆规两脚落在纸面上，圆、弦、证明链和方块共享同一透视平面；不是“平面图上放一个圆规”。

#### F. 验收帧

| 文件建议 | 全局 t | 画面检查点 |
|---|---:|---|
| `out/style-review/block03/t_17-90.png` | 17.90s | 圆规定脚在圆心，影子贴纸面，圆开始有近大远小 |
| `out/style-review/block03/t_19-30.png` | 19.30s | 抬脚换点，圆规腿有 z 高度，圆有可见缺口 |
| `out/style-review/block03/t_20-00.png` | 20.00s | 高光：圆闭合、方块被敲、近/远线宽不同 |
| `out/style-review/block03/t_22-20.png` | 22.20s | 离场：圆规滑向右，投影/阴影不漂移 |

#### G. 风险与性能

- 不切 WEBGL：`perspective()` 官方只支持 WEBGL，当前项目是 2D 全局管线；切换会牵动相机、文字、混合模式、离屏快照，不符合本次“只改 scene”的约束。
- 投影是艺术近似，不追求物理正确；但必须保持圆/弦/圆规的接触点一致，否则会出现“脚悬空”。
- 画家顺序：远半、阴影、近半、圆规脚、铰链要固定顺序；如果出现前后穿插错误，按 `z` 排序而不是按绘制先后猜。
- 性能：96 点圆只画 2 条折线，成本低；风险在 `drawRoad` 重绘，先做裁剪优化。
- 文字：圆内不要新增英文；如需标记，使用几何符号/短刻线。

---

### 2.4 第 4 版块：算法一词的诞生

#### A. 现状诊断（代码坐标）

- `scene-04.js:45`：`const WORD = { text:'algorithm', x:932, y:702, size:48 };`；`drawAlgorithm`（`:864`）用 `p.text(WORD.text,...)` 画英文。
- `PEN_X_KEYS`（`:79`）第一项 `[0.0,292]`；`penPose`（`:1135`）：
  ```js
  const localX = state.x - (blockIndex - 1) * 1000;
  if (t < 2.95) {
    nibX = localX + track(t, PEN_X_KEYS);
  }
  ```
  版块开始时 `localX≈0`，笔尖却在局部 x≈292，确实是从画面中部“变出来”，不是从左侧进入。
- 左侧：`drawInkwell` 的墨池在 `x=468`；`drawOrnaments` 的小花饰在 `x=101,y=694`；`STEPS` 三个步骤都在 `x=646`。`x≈70–420` 的纵向空间基本空白。
- `STEPS` 的 `revealA/B` 为 1.32、1.66、2.0，各自逐笔写出；但笔尖路径和 `STEPS.x=646` 没有严格同步，读起来仍像“内容自己出现”。

#### B. 连续路径与新动作谱

把 `PEN_X_KEYS` 改成相对主角基线的“偏移”，并让第一项从左侧进入：

```js
const PEN_OFFSET_X_KEYS = [
  [0.00, -28],  // 版块接缝左侧，连续进入
  [0.35,  10],
  [0.60,  80],
  [0.90, 130],  // 左侧内容
  [1.15, 250],
  [1.40, 413],  // 到 x≈646 写步骤 1
  [1.70, 380],  // 步骤 2
  [2.00, 330],  // 步骤 3
  [2.35, 250],  // 回环
  [2.60, 160],
  [2.80, 100],
  [2.95, 280],  // 收笔/落印，目标 x≈936
  [3.00, 280]
];
```

- 在 `t=0` 时笔尖位于 `localX-28`，跨过版块接缝，视觉上承接第 3 版圆规的退出位置；不再额外加 292。
- `PEN_Y_KEYS` 对应改为：入场 610 → 左侧纸面 620 → 步骤 1 的 `baseY≈503` → 步骤 2 `≈578` → 步骤 3 `≈653` → 回环 `≈651` → 落印 `STAMP.y≈716`。
- 笔的 `drawActor` 仍用世界坐标：`p.translate(blockOrigin,0)` 后，用 `pose` 的局部坐标画。
- 让左侧真正被书写：新增 `drawLeftScroll(p,t)`，在 `x=72–420,y=440–700` 画出：
  - 一条纸卷/纸带边（不是 UI 卡片）；
  - 3 个抽象步骤节点：起点圆点 → 方形/分叉 → 回环/勾；
  - 2–3 条短墨线和小印章；
  - 笔在 `t≈0.6–1.3` 经过左侧，节点按 `smoothstep` 顺序亮起，和笔的位置对齐。
- 右侧 `STEPS` 保留 1/2/3，位置可微调到 `x=620` 或 `x=660`，但不要改变 title（title 在 x300）。
- 回环 `drawLoopKnot`（`:806`）和 `LOOP_POINTS` 保留，笔在 `2.3–2.6` 经过回环末端；落印 `drawStampImpact` 保留。

#### C. 去英文方案

- 删除 `WORD.text='algorithm'` 和 `drawAlgorithm` 中的 `p.text`。
- 改成场景内自绘“算法”印章/题记：
  - 方案 A（推荐）：在 `x≈930,y≈690` 画一个 76×76 的印章框，框内用 `p.textFont('serif')` 竖排/横排 `算法` 两字，墨色 `C.ink`，外加金色/朱砂边框和干笔飞白；
  - 方案 B：不用字体，纯几何画“算”的算筹/横竖笔画抽象，再压一枚小方印；更安全但识别度低。
- 标题卡英文：`drawTitleCard` 在 `src/kit/text.js:21` 用 `en.toUpperCase()`，是 PROMPT 第 76 行“中文名 + 英文名 + 年代”的规格。**本报告建议场景内英文删除，标题卡英文保留**；如果主人要求全片标题也去英文，必须另行授权并改标题层，不能在本批 scene 修复里偷偷改。
- 印章/中文只在 scene-04 内绘制，不改 kit、不改标题排版。

#### D. 左侧内容与衔接

- 第 3 版是纸/石墨/圆规，第 4 版是羊皮纸/墨/笔。为了接得更顺：
  - 在版块左缘 `x=0–90` 保留一小段第 3 版的石墨圆弧/尺痕，alpha 从 0.18 在 `0.4–1.0s` 淡出；
  - 新笔从这段圆弧的末端进入，纸面的第一笔也落在 `x≈90–120`，形成“上一张纸的构造线被带进来”的连续感；
  - 不要做硬切背景。
- 左侧 `drawLeftScroll` 的墨色、纸色要与 `drawPaper` 一致；不要引入新字体文件或外部纹理。

#### E. 第二小节高光/动作

- `localT 2.3–3.0`：笔从回环收笔，移到右下压印，印章落下；左侧的三个抽象步骤已经由笔写出，右侧 1/2/3 完成，画面左右不再失衡。
- 定格 `3.0–4.0`：笔尖停在印章上，纸面有干笔飞白和一点点墨屑。

#### F. 验收帧

| 文件建议 | 全局 t | 画面检查点 |
|---|---:|---|
| `out/style-review/block04/t_23-80.png` | 23.80s | 笔从左侧接缝进入，左侧纸卷出现第一笔，无瞬移 |
| `out/style-review/block04/t_24-60.png` | 24.60s | 笔在左侧/中段过渡，右侧步骤 1 开始，路径连续 |
| `out/style-review/block04/t_26-00.png` | 26.00s | 高光：左右内容平衡，“算法”印章清晰，无英文 |
| `out/style-review/block04/t_28-00.png` | 28.00s | 离场：笔滑出，左侧内容保留，标题卡英文按规格显示 |

#### G. 风险与性能

- 关键帧重写后，笔的局部 x 可能领先/落后主角世界 x；`drawActor` 用 `blockOrigin` 转世界，保持笔在镜头内。
- 左侧内容跨路面带 `y=470–530`，必须把 `drawLeftScroll` 加入 `drawArtwork`，让 `drawRoad` 的裁剪重绘把它补回来；否则会被默认路切成两段。
- 干笔/飞白用现有 `drawInkStroke`/`paintDryBrush` 的采样折线，不新增 per-frame 大数组；左侧节点位置预计算。
- 中文 `算法` 用系统 `serif`，与标题卡中文同源；不引入字体文件。若 headless Chrome 上中文回退不理想，方案 B 的纯图形印章作为备选。

---

### 2.5 第 5 版块：机械计算

#### A. 现状诊断（代码坐标）

- `scene-05.js:696`：`handPose` 在 `1.65` 后让手进入；`handX≈actorX+110→+40`，`palmY≈350+push*38`。
- `drawHandShapes`（`:712`）：
  ```js
  p.strokeWeight(92); p.line(x + 52, 96, x + 30, y - 30); // 前臂
  p.strokeWeight(40); p.line(x - 38, y + 8, thx, thy);   // 拇指
  p.strokeWeight(33); p.line(x - 6, y + 12, x - 12, tipY); // 单根食指
  p.ellipse(x, y, 150 + grow, 140 + grow);               // 手掌
  // 4 个 42×40 指节
  ```
  黑剪影手掌 150×140，单根食指 33 宽，拇指 40 宽，容易读成竖中指；高光帧手遮住主齿轮。
- `drawIndexFingerShapes`（`:759`）在 `drawRoad` 里补画跨带食指；如果换成机械夹爪，这段也要删。
- 主角 `drawActorBead`（`:770`）在 `state.x,y=602`，滑尺 `RULE_Y=606`；游标在 `actorX+34+36*overrun`。

#### B. 推荐方案：滑尺下方的黄铜两指平行夹爪/推杆

不再画写实手。做一个安装在滑尺下方的机械推杆，夹住/推动游标：

- 位置：`y≈548–710`，完全在路面带 `y=470–530` 以下，不会遮标题、不会跨路带。
- 主体：
  - 导轨/丝杆沿 x 方向，`y≈676`，长度约 260；
  - 黄铜滑座 `96×52`，中心在 `y≈648`；
  - 上方两指从滑座伸出，指根 `y≈636`，指尖 `y≈576`，长 60；两指间距开 50、合 26；
  - 指条宽 14–18，厚 10–12，方形截面，内侧有深色接触垫 14×20；
  - 指端为 45° 倒角，不做圆润手指。
- 动力：
  - 滑座中心一个偏心凸轮 `r=16`，转角 `0.4 + 1.25*close`；
  - 两根连杆从凸轮销连到左右指根，形成平行四边形/近似四杆，保持两指平行；
  - 铆钉半径 4–5，铜色高光；
  - 后端一根细软管/线缆向上，避免画面变成孤立零件。
- 调色：`C.brassDeep #4e3317`、`C.brassDark #6e4a22`、`C.brass #b8863c`、`C.brassLight #d8a75a`、`C.steam #d8c7a6`；接触垫用 `C.slot`。
- 比例参考：工业两指平行夹爪的指条长宽比约 7:1–9:1，指间距约指宽的 3–4 倍；不要画成两根细针，也不要画成手掌。

#### C. 动作谱

1. `1.65–1.95`：滑座从右侧沿导轨进入，停在游标右后方，两指张开 50。
2. `2.06–2.17`：第一次接近，两指合到 30，接触游标右缘；滑座不移动或只推 2–3 单位，作为“夹住”。
3. `2.17–2.44`：夹爪松开到 44，抬升 6，滑座回 6–8 单位；这是准备。
4. `2.56–2.67`：第二次夹紧到 26，滑座随游标向左/右移动 36 单位；`cursorOverrun` 保持现有值。
5. `2.67–2.84`：保持夹紧，游标刻度线亮，黄铜屑从接触点落下。
6. `2.84–2.97`：松开到 48，滑座回 10，完成高光。
7. `3.0–4.0`：定格；`4.2–4.85` 滑座沿导轨退出右侧，两指收拢。

#### D. 代码修改

- 删除 `drawHandShapes`、`drawHand`、`drawIndexFingerShapes` 及其调用。
- 新增 scene 内：
  - `gripperPose(t)`：基于现有 `handPose` 的推程，但把 `handX/palmY` 映射到滑座 `x/y`；不再有 `presence` 的大手掌。
  - `drawGripper(p, pose)`：滑座、两指、凸轮、连杆、铆钉、接触垫、导轨、软管。
  - `drawGripperDust(p, pose, t)`：只在接触/夹紧时产生 3–5 粒黄铜屑。
- `draw` 里用 `drawGripper` 取代 `drawHand`；因为夹爪全部在 `y>548`，不需要在 `drawRoad` 补画。
- `drawRoad` 删除 `drawIndexFingerShapes` 补画段，路面带只保留木台面和木纹。
- `drawSlideRule` 的 `cursorX` 保持 `actorX + 34 + 36*overrun`；夹爪的指尖 x 与 `cursorX + 26` 对齐，不要改游标逻辑。
- 如果高光帧夹爪仍碰到齿轮，把滑座整体下移 12–18，或把导轨放到滑尺前缘，不缩小齿轮。

#### E. 第二小节高光/动作

- `localT 2.56–2.97`：两指平行夹住游标，滑座沿丝杆移动 36；凸轮和连杆同时转，接触垫压下游标，黄铜屑落下。
- 定格 `3.0–4.0`：夹爪保持夹紧，游标停在读数位置，不再有大手挡齿轮。

#### F. 验收帧

| 文件建议 | 全局 t | 画面检查点 |
|---|---:|---|
| `out/style-review/block05/t_30-80.png` | 30.80s | 滑座进入，两指平行张开，不遮齿轮 |
| `out/style-review/block05/t_31-70.png` | 31.70s | 高光：夹爪夹住游标，凸轮/连杆可见，游标移动 36 |
| `out/style-review/block05/t_32-00.png` | 32.00s | 定格：两指平行、接触垫贴住游标，无手形 |
| `out/style-review/block05/t_33-30.png` | 33.30s | 离场：夹爪松开退回，齿轮完整可见 |

#### G. 风险/性能

- 夹爪是下方机构，不再从画面上方压下来，构图会变“轻”；可以在导轨右端加一个配重/手轮，保持机械重量感。
- 凸轮/四杆只是视觉近似，不要求真实运动学；但两指必须保持平行，不能一端张开一端闭合。
- 比大手便宜：约 20–30 个矢量形状，无逐像素；删除大手后性能更好。
- 如果主人坚持“要手”，再修手：手掌缩到 96×90，食指/中指两指并拢，拇指缩短，去掉四个大指节；这是备选，不推荐。

---

## 3. 全片配色、光影与纹理差异化

### 3.1 总弧线与分组

保持现有分组：

- 1–4 纸与刻痕：暖纸、褐墨、赭石。
- 5–8 机械与图纸：深木/铜/暗蓝绿。
- 9–12 电子与示波器：从绿磷光、琥珀 CRT 到旧纸 + 暗绿屏。
- 13–20 数据与光：从靛紫/洋红/深蓝/光谱/深青/暖铜，到 19 锁定霓虹，再到 20 暖白微光。

不把全片压成同一蓝调。每块至少有一个自己的色相锚点和一种“光的行为”（屏幕发光、金属反光、纸面漫反射、数据自发光）。

### 3.2 10–12：三种不同的电子时代

| 版块 | 底色/面板 | 主色 1 | 主色 2 | 主色 3 | 强调/异常 | 光行为 |
|---|---|---|---|---|---|---|
| 10 感知机 | `#100c07` / `#2a1f11` | `#9fe38a` 磷光绿 | `#f2a23a` 琥珀 | `#f5e5c0` 奶油 | `#e05a3a` 错误 | 琥珀主光 + 绿点阵，像老式模拟示波器 |
| 11 专家系统 | `#020c07` / `#04180d` | `#58d98c` CRT 绿 | `#b4ffcf` 亮磷光 | `#e8d9b4` 纸白 | `#e0a23c` 琥珀警告 | 全屏绿磷光、扫描线、CRT 光晕 |
| 12 统计学习 | `#0b0e09` / `#1a2113` | `#cdbb93` 旧纸 | `#b8e6b0` 暗绿屏 | `#2f4430` 纸墨 | `#b45f35` 铁锈橙 | 暖纸漫反射 + 暗绿 CRT，不用全屏蓝 |

- 10 与 11 的区别：10 是琥珀为主、绿为副，屏幕/点阵只在局部；11 是绿为主、琥珀只做错误/警告。
- 12 与 10/11 的区别：12 的背景仍是深橄榄黑（保证标题和数据组深蓝弧线），但画面主体是旧纸图表/散点/直方图；不要做成全屏米色，否则标题卡浅色字会失去对比，也会破坏“从浅到深”的总弧线。
- 建议改 scene 内 `C` 常量，不改 `src/kit/palette.js`。标题卡仍使用全局 electronic 色板 `ink #ccffe9`，所以 12 标题安全区必须保持深底。

### 3.3 13–18：递进而不是同一套深蓝

| 版块 | 底色/面板 | 主色 1 | 主色 2 | 主色 3 | 强调/异常 | 差异化手段 |
|---|---|---|---|---|---|---|
| 13 深度网络 | `#070617` / `#171233` | `#9d8cff` 靛紫 | `#58e6ff` 青 | `#ece8ff` 冷白 | `#ff6b6b` 误差红 | 紫色体积光 + 青色节点；误差反向时红色脉冲只在层间 |
| 14 注意力 | `#0b0410` / `#241028` | `#ff5fb2` 洋红 | `#55e6ff` 青 | `#f0a24a` 琥珀 | `#ffd15c` 高亮黄 | 洋红注意力光束 + 青色索引；1–2px RGB 错位只给光束边缘 |
| 15 规模化/开源 | `#040a18` / `#0b1a35` | `#f2c14e` 金 | `#5ad9ff` 青 | `#f1f4ff` 冷白 | `#ff8a4c` 橙 | 参数墙金色开放光 + 深蓝阴影；缩放曲线金色 bloom |
| 16 多模态 | `#08060f` / `#151027` | `#56e6ff` 青 | `#ff63b0` 洋红 | `#ffb35c` 琥珀 | `#6ff0c0` 薄荷 | 四路信号四色，低饱和；只在棱镜边缘做 1–2px 色差 |
| 17 推理/RL | `#03100f` / `#062522` | `#4fe3d0` 深青 | `#ffd15c` 奖励金 | `#f0a052` 暖橙 | `#e05a46` 错误红 | 深青空间 + 金色奖励星/价值曲线；错误红只在死路 |
| 18 Agent | `#070d14` / `#13211e` | `#d07a43` 暖铜 | `#b8863c` 黄铜 | `#5fe6d4` 青 | `#87f0c9` 完成薄荷 | 铜色工具环 + 青色记忆/上下文；完成脉冲薄荷 |

- 13 与 14 的边界：13 是紫色体积和层间误差，14 是洋红方向性光束；不要把 14 做成紫色节点图。
- 15 与 16 的边界：15 是金色规模/参数墙，16 是四色信号合流；16 不要全屏彩虹渐变，每路信号只占一条窄带。
- 17 与 18 的边界：17 是深青 + 金色奖励，18 是暖铜 + 青色轨道；18 的铜要明显偏暖，不能继续用 13 的靛蓝。
- 所有 13–18 仍保持深色底，标题卡浅色字才可读；标题安全区不要放亮色大面积光束。

### 3.4 19 锁定与 20 神秘感

- **19 不改 scene。** 如果主人觉得 19 与 13–18 仍不统一，只能在报告/后期阶段提出“可选的整片或单块后期调色”（例如在 FFmpeg/调色软件里对 19 做轻微 color balance/curve），并标注“需主人明确授权”。不得默认改 `scene-19.js`，也不得改主进程或素材。
- 19→20 转场继续后置；本次不设计、不实现。
- 20 保持现有暖白 `#f4f0e6`、奶油 `#fff7e4`、余烬 `#c96a2c`、冷边 `#7e929b`、青灰弧 `#6f9ba4`。增强方向是“更神秘”，不是更满：
  - 在未命名形状后方加一层极淡的暖径向光，`alpha 0.05–0.09`，半径 220–300，只用 2 层，不做大半径 blur；
  - 来路增加 1–2 层空气透视，远层 alpha 0.04–0.06，近层 0.08–0.10；
  - 余烬仍 20 枚，不加数量；让 3–5 枚在定格时短暂呼吸，周期 2.4–3.2s，幅度极小；
  - 未闭合弧保持不闭合，不要补成完整圆；
  - 标题区现有深墨/深蓝灰软边衬底保留，它是浅色标题在暖白底上的可读性保障；可以压小 5–8%，但不能删。
- 20 不要加入英文、真实产品、城市地标或可识别人物；保持“留白 + 微光 + 未完成”的未知感。

### 3.5 6–9 的增强（8 锁定）

- 6 差分机：增加蒸汽尾迹的 2–3 层视差、齿轮咬合处的黄铜屑、数字轮停住时的一次金属回弹；不要改变主结构。
- 7 布尔代数：增加蓝图网格的缓慢漂移、铜尘在逻辑门脉冲处的微亮、真值表亮行的余辉；不要新增文字。
- 8 锁定：不动。
- 9 电子计算机：增加灯丝 bloom（2 层低 alpha 放大椭圆，不用 blur）、屏幕扫描线、计数器跳字时的小电流脉冲；不要改玻璃管结构。
- 6–9 的增强都应是 scene-local，不新增外部纹理，不改变路面高度和标题门控。

### 3.6 调色/光影配方与标题可读性保护

| 手法 | 用在哪 | 参数/实现 | 禁止 |
|---|---|---|---|
| Split toning | 10、12、13、18、20 | 阴影暖/高光冷或反过来，两层 `linearGradient`，`blendMode(SOFT_LIGHT)`，alpha 0.06–0.14 | 全片统一 LUT、整屏高 alpha 染色 |
| 伪 duotone | 11、12、17 | 去饱和无法在 Canvas 2D 便宜实现；用深色底 + 单色主光 + 一层低 alpha 单色 overlay 近似，alpha 0.05–0.10 | 每帧 `getImageData` 逐像素 |
| Bloom | 9、11、15、17、20 | 对发光体画 1–2 层放大 1.04–1.15 的低 alpha 副本，`ADD`/`SCREEN`，alpha 0.03–0.10 | 大半径 `blur()`、全屏 bloom |
| Chromatic aberration | 14、16 | 只对 3–8 条高光/光束画 ±1–2px 的 R/B 偏移副本，`SCREEN`，alpha 0.10–0.16 | 每帧全屏 RGB 通道位移、`getImageData` |
| Scanline | 9、11、12 | CRT 屏幕矩形内每 3–4px 一条 1px 线，alpha 0.03–0.07；可加一条缓慢下移的亮带 alpha 0.05 | 全屏扫描线、标题区扫描线 |
| Halftone | 12，少量 10 | 只在纸图/直方图上画 6–9px 点阵，alpha 0.04–0.08；静态 | 全屏逐像素半调 |
| Grain | 12、20（可选） | 预生成 512×512 单色噪声纹理，平铺 + `OVERLAY`，alpha 0.03–0.06；固定 seed | 每帧全屏随机、p5.grain 每帧逐像素 |
| Vignette | 全片已有全局 0.26；scene 内只在 9、11、20 局部加 0.08–0.15 | 径向渐变，中心透明，边缘低 alpha | scene 再叠 0.3 以上，压死标题 |
| Rim light | 13、15、18、20 | 关键物体外侧 1–2px 偏移描边，alpha 0.18–0.30，方向固定 | 所有物体统一白边，像贴纸 |
| Atmospheric depth | 13、15、17、20 | 3 层背景，alpha 0.04/0.07/0.10，尺寸/漂移幅度递增；用 `sin(localT)` 微动 | 大面积高斯模糊、每帧 createGraphics |

**标题可读性保护：**

- 标题安全区按局部坐标约 `x=120–480, y=250–450`（标题卡实际中心 x=300,y=362，`NO.` 到年代大约 y≈286–410）。
- 10–18：标题区局部平均亮度控制在 0.10–0.22 之间，不要有亮色光束/大面积金字穿过；若背景偏亮，加一层 0.10–0.20 的深色软边 scrim。
- 1–4：标题是深墨/深褐字，纸面保持干净；标题区不要加大面积深色纹理或高对比裂纹。
- 12：保持标题区深橄榄底，纸面板从 `y≈540` 开始，不要铺到标题后面。
- 20：现有深墨/深蓝灰软边衬底保留；这是浅色 `data` 组标题在暖白底上的必要保护。
- 所有 grade 在标题卡之前调用；标题卡本身不再被 scene grade 染色。`drawRoad` 的 band grade 只裁剪 `y=470–530`，不会碰到标题。

**性能原则：**

- 不用全片统一 LUT，不用每帧逐像素，不用大半径 blur。
- 优先 `blendMode` + 低 alpha 渐变 + 预计算点/线 + 局部裁剪。
- 发光效果最多 2 层；每块新增 effect 不超过 2–3 个。
- 静态纹理（halftone、grain）可缓存；缓存不能依赖 `t`，否则同 t 重渲不确定。

---

## 4. 高级算法/开源公式表

| # | 技术 | 用途 | 公式/参数 | 来源 | 许可 | 本次安装？ | 集成风险 |
|---|---|---|---|---|---|---|---|
| 1 | 2D 针孔投影 | 第 3 版假 3D 圆/平面 | `z=D-v·sinθ-h·cosθ`，`s=D/z`，`x'=cx+u·s`，`y'=cy+(v·cosθ-h·sinθ)·s`；`D=800, θ=0.32, R=160` | [S10][S11] | 教材/公开公式，自行实现 | 否 | 低；注意画家顺序与接触点一致 |
| 2 | 画家算法/深度分层 | 圆远半/近半、前后遮挡 | 先画 `v<0` 远半，再画阴影/近半；按 `z` 排序 | [S10] | 公开算法 | 否 | 低；排序错会穿插 |
| 3 | Rough.js hachure | 纸/骨/泥的排线纹理 | 按 `hachureAngle` 旋转，水平扫描线步进 `hachureGap`，转回；gap≈4×strokeWidth；roughness/bowing/seed 固定 | [S12] | MIT | 否 | 中；引入依赖/API 不匹配；建议自写扫描线 |
| 4 | p5.grain 噪声 | 12/20 的胶片颗粒 | 单色 grain：每像素随机值加到 RGB；彩色 grain 每通道独立；建议 512² 缓存平铺 | [S13] | MIT | 否 | 高（每帧全屏逐像素）；只可缓存 |
| 5 | chroma.js Lab/Lch 插值 | 生成渐变/色板审查 | Lab/Lch 空间插值，`scale(...).mode('lab')`；避免 RGB 中点发灰 | [S14] | BSD-3-Clause AND Apache-2.0 | 否 | 低；本项目色板固定，可不引入 |
| 6 | d3-scale-chromatic | 顺序/发散色板方法 | 顺序 scale、发散 scale 的亮度/色相控制；只学方法，不复制 ColorBrewer 方案 | [S15] | ISC；ColorBrewer 方案 Apache-2.0 归属 | 否 | 低；若使用 ColorBrewer 具体方案需保留归属 |
| 7 | p5 `blendMode` | split toning、bloom、色差 | `SOFT_LIGHT/OVERLAY/HARD_LIGHT`，仅 2D；低 alpha 局部叠加；用 push/pop 或恢复 `BLEND` | [S1][S24] | p5 LGPL-2.1 | 已内置，否 | 低；忘记恢复会污染后续绘制 |
| 8 | RGB 错位/扫描线 | 14/16 故障感、11 CRT | 对高光笔画做 ±1–2px R/B 偏移副本，`SCREEN`，alpha 0.10–0.16；扫描线 3–4px 间距 | 自行实现；[S16] 为概念参考 | 自写；p5.glitch MIT | 否 | 低；不要全屏逐像素 |
| 9 | p5.glitch | 图像字节故障 | `loadImage`/`buildImage` 类字节操作，适合静态图，不适合每帧全屏 | [S16] | MIT | 否 | 高；与 60fps 实时管线不合 |
| 10 | 有序半调/点阵 | 12 旧纸图表 | 6–9px 网格点，alpha 0.04–0.08；可按亮度阈值增减半径 | 公开算法，自写 | 无 | 否 | 低；只在局部图表面 |
| 11 | Ishango 分组刻痕 | 第 1 版骨刻 | 三列/分组只是灵感；横向短切痕 32–38，组内节距 10–12，组间隙 26–32；不声称 168 | [S4][S5] | 事实参考，无资产复制 | 否 | 低；避免伪造精确考古结论 |
| 12 | 楔形压印 | 第 2 版数字/表格 | 约 20° 压入，尖端压出楔头，杆边抬升形成短尾；压—抬不拖拽 | [S6][S7] | 事实参考，无资产复制 | 否 | 低；`drawPressMark` 已有基础 |
| 13 | YBC 7289 数学内容 | 第 2 版左侧 √2 示例 | 1;24,51,10 ≈ 1.41421296；42;25,35；边长 30 | [S8][S9] | 文物图 CC0；本报告只重画数学图，不复制照片 | 否 | 低；数字分组需自写 |
| 14 | 两指平行夹爪/四杆 | 第 5 版机械交互 | 每指两关节 + 连杆形成平行四边形；单驱动；指条长宽比 7:1–9:1；开口 50/闭合 26 | [S19][S20] | 工程资料参考，自写 | 否 | 低；不要复制产品外观/logo |
| 15 | huashu cave relief | 骨/洞窟浮雕明暗 | 缓存高度场 FBM + 方向光 `L=(-0.55,-0.62,0.56)`，normal dot 定向明暗 | [S17] | MIT（资产/字体/角色例外） | 否 | 低；只参考公式，不复制资产 |
| 16 | huashu ink 配方 | 第 1/4 版纸/墨 | 宣纸纹理、短纤维、径向 vignette、roughPath/brush/inkWash；本项目已有干笔函数 | [S17] | MIT（同上） | 否 | 低；保持自写 |
| 17 | Pelican 工作流 | 场景/审查流程 | 每版一文件、纯 `renderAt(t)`、headless 截帧、contact sheet | [S18] | 代码 MIT；媒体保留 | 否 | 低；不复制影片/帧/音频/文案 |
| 18 | p5 `perspective()` | 3D 相机 | `perspective(fovy,aspect,near,far)`；官方明确 WebGL only | [S2] | p5 LGPL-2.1 | 已内置，不用 | 高；切换 WEBGL 会破坏 2D 管线，不采用 |
| 19 | Catppuccin/Nord/Gruvbox | 配色审查参考 | 只学“底色/表面/文字/强调”的层级，不复制整套色板 | [S21][S22][S23] | MIT（Gruvbox MIT/X11） | 否 | 低；不要直接套主题色 |
| 20 | 露光/大气透视 | 13–18/20 深度 | `alpha = a0 * (1 - clamp((z-zNear)/(zFar-zNear)))`；3 层；低 alpha | 公开公式，自写 | 无 | 否 | 低；不要大面积 blur |

**许可结论：**

- 以上所有包都没有安装。项目 `package.json` 仍只有 p5 2.3.4 与 puppeteer-core（dev）。
- 不复制任何参考项目的代码、媒体、字体、角色、构图或文案；只使用公开事实、公式和算法思路。
- 若未来要安装 Rough.js/p5.grain/chroma.js 等，必须先补 `THIRD_PARTY_NOTICES.md`、锁定版本、验证 headless 确定性；本次不允许。
- ColorBrewer 具体配色方案如果被直接使用，需要保留 Cynthia Brewer / Mark Harrower / Penn State 的版权与 Apache-2.0 声明；本方案使用自选色值，不直接复制方案。
- Gruvbox 仓库没有正式 LICENSE 文件，README 声明 MIT/X11；本次只作为参考，不复制。

---

## 5. “技术审查与风格特化”机制

### 5.1 规格文件结构

建议新增 `docs/style-spec.md` 作为全片风格合同；现有 `briefs/scene-XX.md` 每块追加一个 `Style contract` 段。不要让一个文件膨胀成 20 份完整 brief，现有 brief 继续负责构图/内容，style-spec 负责可验收的视觉参数。

每个版块的字段建议：

```yaml
id: 10
title: 感知机
group: electronic
palette:
  bg: '#100c07'
  panel: '#2a1f11'
  primary: '#9fe38a'
  secondary: '#f2a23a'
  tertiary: '#f5e5c0'
  accent: '#e05a3a'
  titleSafe: '#0e0a06'
lighting:
  key: '右上 35° 琥珀主光'
  fill: '低强度绿磷光'
  rim: '1px 冷绿 0.20'
  atmosphere: '2 层，alpha 0.05/0.08'
grade:
  splitShadow: '#3a210c'
  splitHighlight: '#b8e6a0'
  blend: 'SOFT_LIGHT'
  strength: 0.08
  vignette: 0.14
  grain: 0.035
  scanline: '仅屏幕，3px 间距，0.05'
texture:
  material: '旧金属/示波器玻璃'
  methods: ['hachure', '低 alpha 点阵', '边缘磨损']
  forbidden: ['全屏逐像素', '大半径 blur']
depth:
  layers: 3
  parallax: '0.04/0.08/0.12'
protagonist:
  form: '带铜坠的阈值节点'
  contact: '节点压在权重线束 y≈500，接触阴影 0.18'
  interaction: '判定线卡住时节点下压 3，回弹 2'
beats:
  entry: '0.0–2.0'
  highlight: '2.0–4.0，硬定格 3.0–4.0'
  exit: '4.0–6.0'
acceptanceFrames:
  - { localT: 0.9, path: 'out/style-review/block10/t_59-90.png', checks: ['标题可读', '主色锚点'] }
  - { localT: 3.0, path: 'out/style-review/block10/t_62-00.png', checks: ['高光动作', '接触阴影', '无过曝'] }
  - { localT: 5.2, path: 'out/style-review/block10/t_64-20.png', checks: ['离场干净', '相邻版块无标题泄漏'] }
performance:
  addedCostMs: '≤2ms/帧'
  forbidden: ['getImageData 每帧', '全屏 createGraphics 每帧', '大半径 blur']
```

### 5.2 审查流程

1. **实现前**：实现子代理只读 `PROMPT.md`、对应 `briefs/scene-XX.md`、`docs/style-spec.md` 的该块段；先确认标题门控、世界坐标、路面高度、锁定版块。
2. **实现后**：只改一个 scene，提交前跑 `node --check`。生成 3 帧（进场/高光/离场）+ 一条 10 秒片段（版块开始前 2 秒到结束后 2 秒）。帧存 `out/style-review/blockXX/`。
3. **视觉审查**：审查子代理先只看帧、10 秒片段、contact sheet、参考板、style-spec，不读代码。先判断“人眼是否成立”：色相是否可区分、标题是否可读、接触是否有因果、深度是否成立、是否过曝/过脏。
4. **代码审查**：视觉通过后再看 diff，检查确定性、世界坐标、标题门控、禁用 API、性能、8/19 零 diff。
5. **记录**：审查结果写入 `docs/style-review.md`，每条问题带时间码、帧文件名、坐标区域、严重级别；审查子代理不改 scene。
6. **修复—复验**：实现子代理按记录修复，再出同样 3 帧/10 秒；审查子代理复验同一位置，直到通过或标记 blocked。

### 5.3 评分与门禁

建议每块 6 个维度，0–2 分，总分 12：

| 维度 | 0 | 1 | 2 |
|---|---|---|---|
| 色相辨识 | 与相邻块分不清 | 能看出差异 | 不看标题也能认出阶段 |
| 标题可读 | 背景干扰 | 勉强可读 | 1080p 清楚，边缘不糊 |
| 接触/动作因果 | 道具悬空/内容自现 | 有动作但不同步 | 接触点、影子、物体反应完整 |
| 空间/纵深 | 纯平面 | 有前后层 | 透视/遮挡/阴影一致 |
| 材质/纹理 | 通用噪点 | 有材料感 | 材料与时代/主题一致 |
| 主体识别 | 看不清主角 | 主角可辨 | 主角与动作/主题强绑定 |

通过线：总分 ≥10，且“标题可读”必须 2，任意维度不得 0。未通过则标记 `revise`，不进入下一批。

### 5.4 防回归门禁

- `node tools/check.mjs` 全部通过：同 t 逐像素一致、20 格离屏快照。
- `node tools/check-preview.mjs`：播放/暂停/拖动/版块名/无脚本错误。
- 每个 scene `node --check` 通过。
- `git diff --stat` 只允许目标 scene 文件；`src/kit/`、`src/beat/`、`src/main/`、`package.json` 零 diff。
- `scene-08.js`、`scene-19.js` 零 diff；19→20 转场文件零 diff。
- 标题门控：每个 scene 的标题调用都在 `state.blockIndex === currentBlockAt(state.globalT, state.blockIndex)` 条件下；第 1 版块虽无前一块，也建议加同样门控。
- 世界坐标：`drawActor` 不得把 `state.x` 再减版块偏移后直接当世界坐标；需要局部坐标时用统一公式并在 `p.translate(blockOrigin,0)` 内绘制。
- 禁用：`bezierVertex`、`curveVertex`、`Math.random`、`Date.now`、外部图片/字体资产、每帧全屏 `getImageData`、每帧大半径 `blur`。
- 路面高度：第 2 版块 `ROAD_Y=630` 与其他块不同，新增内容不得改变现有路面接缝；第 3 版若做 clip 优化，必须保持 470–530 的默认路覆盖关系。
- 性能：1080p 单帧新增成本 ≤2ms（在目标机 headless 下测），p95 不超过 16ms（60fps 目标）或 33ms（30fps 目标）；若超，先删效果，不加机器。

### 5.5 `docs/style-review.md` 记录格式

```md
## Block 03 · 几何与证明 · 2026-10-26

- commit: <hash>
- frames: out/style-review/block03/t_17-90.png, t_19-30.png, t_20-00.png
- clip: out/style-review/block03/clip_15-23s.mp4
- verdict: revise
- scores: 色相 2 / 标题 2 / 接触 1 / 纵深 1 / 材质 2 / 主体 2 = 10
- issue 1: 18.4s 圆规活动脚在换点时离纸面高度不足，脚底阴影仍贴地，读成滑脚；坐标约 (620,450)–(700,520)。
- issue 2: 19.1s 圆近半线宽 3.0，远半 1.8，但阴影没有随 z 变淡；建议远半阴影 alpha 0.05，近半 0.10。
- fix request: 只改 scene-03 的 project3/compassPose；不改 kit/main。
```

### 5.6 执行批次建议（本次不执行）

- R0：批准后先写 `docs/style-spec.md` 与 `docs/style-review.md` 模板，不改 scene。
- R1：第 1–5 版块，逐块实现、逐块审查；每块通过后再下一块，不并行改 5 个 scene。
- R2：第 10–12 版块，先做 10 作为“琥珀 + 绿”的试点，再做 11、12。
- R3：第 13–18 版块，先 13/14/16（色相差异最大）验证，再 15/17/18。
- R4：6、7、9、20 增强；8 不动，19 不动；19→20 继续后置。
- R5：全片 contact sheet、标题门控、性能、离屏快照、预览页总检。

---

## 6. 需要主人拍板的开放决策

### Q1. 第 4 版“去掉英文”的范围

- 建议：**只去掉场景内英文**（`WORD.text='algorithm'` 改为“算法”印章/纯图形），**标题卡英文按 PROMPT 第 76 行保留**。
- 如果主人要求连标题卡也去英文，则必须改 `src/kit/text.js` 的 `drawTitleCard`，会影响全片 20 个标题，属于规格变更，需要单独授权。
- 本报告不擅自改标题排版。

### Q2. 第 19 版是否允许主进程后期调色

- 建议：`scene-19.js` **零改动**。如果 19 与 13–18 的色相仍不统一，只在后期阶段对 19 做可选的轻微 color balance/curve，并标注“需主人授权”。
- 任何“为了统一 19 而改 scene 或改主进程”的做法都不默认执行；19→20 转场继续后置。

### Q3. 第 5 版选机械夹爪还是修手

- 建议：**选滑尺下方的黄铜两指平行夹爪/推杆**。理由是比例天然正确、不挡齿轮、动作机械感强、不会跨路带。
- 备选：继续画手，但把手掌缩到 96×90、食指/中指并拢、拇指缩短、去掉四个大指节。备选成本更高，且仍可能被读成手势错误。
- 请主人确认采用哪种。

### Q4. 第 12 版是否接受“暖纸面板 + 深色底”，而不是全屏米色

- 建议：**接受**。12 的背景保持深橄榄黑，旧纸/奶油只出现在图表/散点/直方图面板；这样既与 10/11 区分，又不破坏“从浅到深”的总弧线和浅色标题卡的可读性。
- 如果主人要全屏米色旧纸，12 会与 1–4 纸组混淆，标题卡需要另加深色 scrim，且 13 的深蓝转场会更硬；需要额外设计。
- 请确认是否按“暖纸面板 + 深底”执行。

### 6.1 已决（2026-10-27 主人确认）

- **Q1：只去场景内英文**；`algorithm` 改成“算法”印章/图形，标题卡英文按 PROMPT 规格保留。
- **Q2：第 19 版锁定不动**；不做主进程后期调色，19→20 转场继续后置。
- **Q3：第 5 版采用黄铜两指平行夹爪/推杆**；不再修写实手。
- **Q4：第 12 版采用暖纸面板 + 深色底**；不做全屏米色。

---

## 7. 参考来源

> 说明：本次 WebSearch 正常使用；WebFetch 在尝试 GitHub、raw.githubusercontent.com、ORACC、naturalsciences.be 等域名时被本机安全策略拦截（“Unable to verify if domain is safe to fetch”），因此没有直接抓取网页、没有下载任何文件。以下事实/许可来自搜索摘要与本地 `LICENSE` / `THIRD_PARTY_NOTICES.md`，报告不声称抓取过网页正文。

- [S1] p5.js `blendMode()` reference，2D-only 的 OVERLAY/SOFT_LIGHT/HARD_LIGHT：https://p5js.org/reference/p5/blendMode/
- [S2] p5.js `perspective()` reference，明确 WebGL only：https://p5js.org/reference/p5/perspective/
- [S3] p5.js Copyright / LGPL-2.1：https://p5js.org/copyright/
- [S4] Royal Belgian Institute of Natural Sciences，Ishango bone 官方页（法文）：https://www.naturalsciences.be/fr/musee/expositions-activites/expositions/250-ans-de-sciences-naturelles/le-baton-dishango
- [S5] UNESCO/IAU Astronomical Heritage，Ishango bone 条目（三列 60/48/60、168 个刻痕的常见说法与解释争议）：https://web.astronomicalheritage.net/show-entity?identity=000004&idsubentity=001
- [S6] ORACC, “Wedges and signs”（约 20° 压入、楔头/短尾）：https://oracc.museum.upenn.edu/saao/knpp/CuneiformRevealed/Aboutcuneiform/Wedgesandsigns/
- [S7] British Museum, “How to write cuneiform”（压印，不是拖拽）：https://www.britishmuseum.org/blog/how-write-cuneiform
- [S8] Yale Peabody Museum，YBC 7289 记录（YPM BC 021354；CC0/Open Access 元数据；1;24,51,10 与 42;25,35）：https://collections.peabody.yale.edu/search/Record/YPM-BC-021354/Details
- [S9] Wikimedia Commons，YBC 7289 图像（CC0 1.0；本项目不复制该图）：https://commons.wikimedia.org/wiki/File:YBC-7289-OBV-REV.jpg
- [S10] Computer Graphics from Scratch, Ch.9 Perspective Projection（针孔投影/相似三角形）：https://github.com/ggambetta/computer-graphics-from-scratch/blob/master/09-perspective-projection.md
- [S11] Dankook University, “Viewing” 讲义（`x'=x·d/(z+d)` 形式）：http://dis.dankook.ac.kr/lectures/cg07/wp-content/uploads/sites/6/1/1408214831.pdf
- [S12] Rough.js（MIT，hachure/roughness/seed）：https://github.com/rough-stuff/rough
- [S13] p5.grain（MIT；单色/彩色 grain；作者 meezwhite）：https://github.com/meezwhite/p5.grain
- [S14] chroma.js（BSD-3-Clause；部分版本 BSD-3-Clause AND Apache-2.0；Lab/Lch 插值）：https://github.com/gka/chroma.js
- [S15] d3-scale-chromatic（ISC；ColorBrewer 方案 Apache-2.0 归属）：https://github.com/d3/d3-scale-chromatic
- [S16] p5.glitch（MIT；图像/二进制字节故障，不适合每帧全屏）：https://github.com/ffd8/p5.glitch
- [S17] huashu-art-motion（MIT，资产/字体/角色例外；仅参考 cave/ink 配方）：https://github.com/alchaincyf/huashu-art-motion
- [S18] The Pelican Test（代码 MIT，媒体/影片保留；仅参考工作流）：https://github.com/RoyceBella-commits/The-Pelican-Test
- [S19] Robotiq 2F-85/2F-140 官方手册（两指平行夹爪、平行四边形四杆、指端保持姿态）：https://assets.robotiq.com/website-assets/support_documents/document/2F-85_2F-140_TM-OMRON_20210623.pdf
- [S20] CCToMM 2021 论文（2F-85 的平行四边形四杆建模与奇异问题）：http://www.cctomm.ca/2021/2021_CCToMM_M3_Symposium_paper_10.pdf
- [S21] Catppuccin（MIT）：https://github.com/catppuccin/catppuccin
- [S22] Nord（MIT）：https://github.com/nordtheme/nord
- [S23] Gruvbox（README 声明 MIT/X11；仓库无正式 LICENSE 文件）：https://github.com/morhetz/gruvbox
- [S24] MDN `CanvasRenderingContext2D.globalCompositeOperation`（canvas 混合模式）：https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation

**额外本地许可核对：**

- `THIRD_PARTY_NOTICES.md`：p5.js 2.3.4 LGPL-2.1；puppeteer-core Apache-2.0；p5.brush 2.2.3 MIT 但未安装；Pelican 代码 MIT、媒体 © Royce Bella；huashu MIT，资产例外。
- `E:\workspace\_refs\huashu-art-motion\LICENSE`：MIT，Copyright 2026 alchaincyf。
- `E:\workspace\_refs\The-Pelican-Test\LICENSE`：MIT，Copyright 2026 Royce Bella；`THIRD_PARTY_NOTICES.md` 明确媒体保留。

---

## 8. 最终声明

- 本次**没有修改任何代码、scene、kit、beat、main、标题排版、配置或依赖**。
- 本次**没有安装任何依赖**，`package.json` 未变。
- 本次**没有下载、复制或运行任何外部项目、媒体、字体、角色、构图或文案**。
- 本次**只新增** `E:\workspace\model-video\docs\task10-review.md`。
- 报告已经停在“待主人确认”状态；确认方案后，再派子代理按批次逐个改 scene。
