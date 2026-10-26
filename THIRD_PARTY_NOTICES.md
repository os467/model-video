# Third-party notices

## Libraries

- **p5.js 2.3.4** — LGPL-2.1 — https://p5js.org
  Loaded unmodified from `node_modules/p5/lib/p5.min.js`; not bundled into this repository.
- **puppeteer-core 25.16.0** — Apache-2.0 — https://pptr.dev
  Development-only dependency used by `tools/` for headless frame capture.
- **p5.brush 2.2.3** — MIT — https://github.com/acamposuribe/p5.brush
  License verified; not installed or used. Its WebGL/framebuffer compositor is not part of
  this project's 2D p5 pipeline.

## Tools (not distributed)

- **FFmpeg** — LGPL/GPL — used to encode video; not bundled.
- **Google Chrome** — used headless for frame capture; not bundled.

## Fonts

Phase 1 uses generic CSS font families (`serif`, `sans-serif`, `monospace`) that resolve to
system fonts at render time. No font files are included in this repository.

## Inspiration

The working method — a shared drawing kit, one file per panel, pure `renderAt(t)`, headless
frame capture and contact sheets — is informed by **The Pelican Test** by RoyceBella-commits
(https://github.com/RoyceBella-commits/The-Pelican-Test). Its README and LICENSE were read;
its code, film, frames, audio, art briefs, compositions and jokes are not used or adapted.
The film and the images in its `media/` directory are © 2026 Royce Bella, all rights reserved.

Phase 3 material research also refers to **huashu-art-motion** by alchaincyf
(https://github.com/alchaincyf/huashu-art-motion), MIT, Copyright 2026 alchaincyf
(花叔 · 花生). Only its public style/technique notes were read; no engine code, fonts,
stroke data, character art or scene assets are copied. Its asset exceptions are respected.

No third-party code, media, audio, compositions or jokes from the reference projects are
included in this repository. Procedural texture and material formulas in the scenes are
original reimplementations based on published technique notes and parameters.
