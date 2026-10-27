```
关于 ffmpeg 缺少 libx264 的问题，我们必须解决。因为我们要输出 4K 60fps，必须用 libx264 的 CRF 18 才能保证画质顶级且文件不至于过大。

请执行以下操作：
1. 在项目的渲染脚本（tools/render-frames.mjs 或 encode.mjs）中，安装并引入 `ffmpeg-static`（通过 npm install ffmpeg-static）。
2. 使用 `ffmpeg-static` 提供的 ffmpeg 可执行文件路径（这个自带的版本 100% 包含 libx264），替换掉系统自带的 C:\Windows\system32\ffmpeg.exe。
3. 确认脚本里输出参数为：`-c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p`。

部署完 ffmpeg-static 后，先别急着跑全片。
请用这套新管线，渲染一个 **10 秒的 4K 60fps 样片**（包含最新的音频）。
把样片的文件路径和大小发给我，我看一眼终极画质，没问题咱们立刻挂机跑全片！
```