import { GROUPS, fillHex, hexToRgb } from './palette.js';

export function drawTitleCard(p, { cn, en, era, number, x, y, alpha, group }) {
  if (alpha <= 0.002) return;
  const g = GROUPS[group];
  p.push();
  p.noStroke();
  p.textAlign(p.CENTER, p.CENTER);
  p.textFont(g.font);

  fillHex(p, g.accent, alpha);
  p.rect(x - 150, y - 58, 300, 2);

  fillHex(p, g.ink, alpha);
  p.textStyle(p.BOLD);
  p.textSize(36);
  p.text(cn, x, y - 20);

  p.textStyle(p.NORMAL);
  p.textSize(14);
  p.text(en.toUpperCase(), x, y + 16);

  fillHex(p, g.soft, alpha);
  p.textSize(12);
  p.text(era, x, y + 40);

  fillHex(p, g.accent, alpha * 0.9);
  p.textSize(11);
  p.text(`NO.${String(number).padStart(2, '0')}`, x, y - 76);
  p.pop();
}

export function drawSubtitle(
  p,
  text,
  {
    x = 960,
    y = 980,
    size = 34,
    alpha = 1,
    color = '#f5efdf',
    font = 'serif'
  } = {}
) {
  if (alpha <= 0.002) return;
  const [r, g, b] = hexToRgb(color);
  p.push();
  p.noStroke();
  p.textAlign(p.CENTER, p.CENTER);
  p.textFont(font);
  p.textSize(size);
  p.fill(r, g, b, 255 * alpha);
  p.text(text, x, y);
  p.pop();
}

export function drawScreenText(
  p,
  text,
  {
    x = 0,
    y = 0,
    size = 20,
    alpha = 1,
    color = '#ffffff',
    alignX = 'left',
    alignY = 'top',
    font = 'sans-serif'
  } = {}
) {
  if (alpha <= 0.002) return;
  const alignXMap = { left: p.LEFT, center: p.CENTER, right: p.RIGHT };
  const alignYMap = { top: p.TOP, center: p.CENTER, bottom: p.BOTTOM };
  const [r, g, b] = hexToRgb(color);
  p.push();
  p.noStroke();
  p.textAlign(alignXMap[alignX], alignYMap[alignY]);
  p.textFont(font);
  p.textSize(size);
  p.fill(r, g, b, 255 * alpha);
  p.text(text, x, y);
  p.pop();
}
