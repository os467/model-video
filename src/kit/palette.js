// 四套共用渲染风格的色板。字体先使用系统字体（阶段 2 再换开源字体）。
export const GROUPS = Object.freeze({
  paper: {
    key: 'paper',
    bg: '#efe5d2',
    ink: '#33291f',
    accent: '#a45f32',
    soft: '#cbb58c',
    font: 'serif'
  },
  mechanical: {
    key: 'mechanical',
    bg: '#1c1a17',
    ink: '#f0e6d2',
    accent: '#d08a3e',
    soft: '#4a4034',
    font: 'serif'
  },
  electronic: {
    key: 'electronic',
    bg: '#061614',
    ink: '#ccffe9',
    accent: '#2fe0a4',
    soft: '#123c32',
    font: 'monospace'
  },
  data: {
    key: 'data',
    bg: '#060a16',
    ink: '#e6ebff',
    accent: '#63dfff',
    soft: '#1a2750',
    font: 'sans-serif'
  }
});

export const GROUP_ORDER = ['paper', 'mechanical', 'electronic', 'data'];

export function groupForBlock(index) {
  if (index <= 4) return 'paper';
  if (index <= 8) return 'mechanical';
  if (index <= 12) return 'electronic';
  return 'data';
}

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${toHex(ca[0] + (cb[0] - ca[0]) * k)}${toHex(ca[1] + (cb[1] - ca[1]) * k)}${toHex(
    ca[2] + (cb[2] - ca[2]) * k
  )}`;
}

export function rgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, Math.round(Math.min(1, Math.max(0, alpha)) * 255)];
}

export function fillHex(p, hex, alpha = 1) {
  p.fill(...rgba(hex, alpha));
}

export function strokeHex(p, hex, alpha = 1) {
  p.stroke(...rgba(hex, alpha));
}
