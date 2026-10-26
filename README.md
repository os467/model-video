# 计算之灵 · 骨架（阶段 1）

《计算之灵——人类如何把思考交给机器》的代码动画短片。当前仓库是**阶段 1 骨架**：
时间轴、共用工具包、全局长路、参数化主角、20 个标名占位版块、Intro/Outro、预览页和逐帧渲染工具链。
20 个版块的具体美术还没开始（阶段 2/3）。

规格书见 `PROMPT.md`，环境与约定见 `docs/env.md`。

## 环境

- Node 22.20.0 便携版：`E:\tools\node\node.exe`（npm 缓存指向 `E:\tools\npm-cache`）
- Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`
- ffmpeg：`C:\Windows\system32\ffmpeg.exe`（阶段 1 用 `libopenh264`，该构建没有 libx264）
- 依赖：p5 2.3.4、puppeteer-core 25.16.0

## 预览

```powershell
& 'E:\tools\node\npm.cmd' run preview
# 打开 http://127.0.0.1:5180/
```

底部有播放/暂停、进度条和当前版块名；空格播放/暂停，方向键逐帧，Shift+方向键按秒跳。

## 工具

```powershell
# 关键静帧
& 'E:\tools\node\node.exe' tools/shot.mjs --times 0,3,5.2,8,29.5,125.2,137 --out out/shots

# 逐帧导出（样段 0–30s，30fps）
& 'E:\tools\node\node.exe' tools/render-frames.mjs --start 0 --end 30 --fps 30 --out out/frames/sample

# 接触表
& 'E:\tools\node\node.exe' tools/contact-sheet.mjs --dir out/frames/sample --out out/contact-sheet.png

# 编码 MP4（无声）
& 'E:\tools\node\node.exe' tools/encode.mjs --dir out/frames/sample --out out/sample_1080p30.mp4

# 时间轴 + 确定性检查
& 'E:\tools\node\node.exe' tools/check.mjs

# 预览页交互检查（播放/暂停/拖动/版块名）
& 'E:\tools\node\node.exe' tools/check-preview.mjs
```

## 阶段 1 产出

详见 `docs/phase1-report.md`。主要路径：

- 逐帧样段：`out/frames/sample/`（0–30s，900 帧）
- 接触表：`out/contact-sheet.png`
- 30fps 样片：`out/sample_1080p30.mp4`
- 30/60fps 对比：`out/ab/compare-30-vs-60.mp4`
- 关键静帧：`out/key-shots/`；Outro：`out/outro-shots/`

成片帧率建议 60fps，草稿用 30fps；先看对比片再定。

## 阶段报告与 Phase 3

- Phase 2 报告：`docs/phase2-report.md`
- Phase 3 简报模板与批次：`briefs/README.md`、`briefs/_template.md`

## 阶段 2 静态帧

- 三版块并排：`out/phase2-static/three-up.png`
- 第 1 版块：`out/phase2-static/block01-chisel.png`（尖燧石凿完第三组 `|||`，向右跃起；t=6.68）
- 第 8 版块：`out/phase2-static/block08-title.png`、`block08-art.png`
- 第 19 版块：`out/phase2-static/block19-title.png`、`block19-art.png`
- 场景通过可选 `drawRoad` / `drawActor` 接管本段路与主角；`src/kit`、`src/beat` 未改

## 结构

```
src/beat/timeline.js   时间轴：120 BPM、Intro 5s、每版块 6s、Outro 125–137s
src/kit/               画布/相机、色板、文字、路、时钟、确定性随机
src/rig/puppet.js      参数化骨骼主角（阶段 1 统一剪影，1 秒循环 = 两拍）
src/scenes/            20 个版块，每个一个文件；阶段 1 用同一占位工厂
src/main/              调度、Intro、Outro 展墙、离屏快照
tools/                 服务器、截图、逐帧、接触表、编码、检查
```

## 阶段 1 约定

- 作画空间 1000×1000，16:9 视窗在方形空间内运镜；输出 1920×1080
- 第 2、4、11 版块场景内容量化到 10 次/秒，镜头与主角保持连续
- Outro 第 1–20 格来自 `src/main/snapshots.js` 的离屏单帧渲染；第 21 格为空席位
- 15–20 版块按 2026-10 修订版命名；合并关系与音乐映射见 `PROMPT.md`
- 阶段 1 无声；时钟接口已按 Web Audio `currentTime` 预留
