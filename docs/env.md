# 环境与约定（阶段 1）

## 运行时

- Node：便携版 22.20.0，位于 `E:\tools\node\node.exe`（不占 C 盘，npm 10.9.3）
- npm cache：`E:\tools\npm-cache`（见项目 `.npmrc`）
- Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`（155.0.8059.85，Puppeteer 用 puppeteer-core 调用）
- ffmpeg：`C:\Windows\system32\ffmpeg.exe`（5.0.1）；该构建**没有 libx264**，阶段 1 用 `libopenh264` 软件编码

## 依赖与协议

- p5.js 2.3.4 — LGPL-2.1
- p5.brush 2.2.3 — MIT（阶段 2 再引入；npm 查询确认）
- puppeteer-core 25.16.0 — Apache-2.0
- 系统字体仅用于本机渲染，不随项目分发

## 参考仓库

- 只读克隆：`E:\workspace\_refs\The-Pelican-Test`
- 只读了 README.md、LICENSE、THIRD_PARTY_NOTICES.md；没有读代码，也没有复用任何代码、画面、构图、简报或笑点
- 其影片、封面、`media/` 与音频保留所有权利，未使用

## 时间轴（唯一事实来源：`src/beat/timeline.js`）

- 120 BPM，一小节 2 秒；4/4
- Intro 2.5 小节 = 5.0 秒；第 i 个版块从 `5 + 6(i-1)` 秒开始；Outro 125.0–137.0 秒
- Intro 采用半小节 pickup：全片强拍落在奇数秒；第 1 版块从 5.0 秒（第 3 小节内）开始
- 第 2、4、11 版块场景内容量化到 10 次/秒；镜头与主角保持连续

## 画面约定

- 作画空间 1000×1000；16:9 视窗在方形空间内运镜
- 默认相机中心 `(protagonistX + 220, 500)`，zoom 1；边界处推近 5%
- 世界高度 562.5 单位（1000 * 9/16），世界到屏幕比例 = `屏幕高度 * zoom / 562.5`
- Outro 21 格：第 1–20 格来自 `src/main/snapshots.js` 的离屏单帧渲染；第 21 格为空席位

## 阶段 1 交付

- 无声；20 个版块为标名占位色块，不做具体美术
- 预览页：播放/暂停、拖动、当前版块名
- 逐帧导出 + 接触表 + 30/60 fps 对比片段

## p5 2.x 踩坑记录

- **不要直接改 `p.drawingContext.fillStyle` 后不恢复**：p5 的填充缓存会与 canvas 状态失步，
  下一帧可能跳过 `fill()`，背景被上一帧的渐变覆盖成黑。渐变绘制必须
  `ctx.save()` → `ctx.fillStyle = grad` → `ctx.fillRect()` → `ctx.restore()`。
- canvas 文字使用通用字体族（`serif` / `sans-serif` / `monospace`），由系统字体兜底；
  复杂字体栈在变换上下文里出现过异常，阶段 2 换开源字体时重新验证。
- `p.redraw()` 在 p5 2.x 是 async，逐帧导出必须 `await window.__seek(t)`。
- `p.createGraphics()` 是同步的；离屏快照在 setup 里一次生成。

