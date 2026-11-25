// Tiny canvas helpers shared by the interactive widgets. No dependencies.
export const cssv = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function prep(c: HTMLCanvasElement, ratio = 0.5) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = c.clientWidth || 700;
  const H = Math.round(Math.max(200, W * ratio));
  c.width = W * dpr; c.height = H * dpr; c.style.height = H + 'px';
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  return { g, W, H };
}

export interface Axes { px: (x: number) => number; py: (y: number) => number; L: number; T: number; w: number; h: number; }

export function frame(
  o: { g: CanvasRenderingContext2D; W: number; H: number },
  x0: number, x1: number, y0: number, y1: number,
  xt: number[] = [], yt: number[] = [],
  opts: { logY?: boolean; logX?: boolean; fmtY?: (v: number) => string; fmtX?: (v: number) => string } = {},
): Axes {
  const { g, W, H } = o;
  const L = 52, R = 14, T = 12, B = 30;
  const w = W - L - R, h = H - T - B;
  const tx = (v: number) => (opts.logX ? Math.log10(v) : v);
  const ty = (v: number) => (opts.logY ? Math.log10(v) : v);
  const px = (x: number) => L + ((tx(x) - tx(x0)) / (tx(x1) - tx(x0))) * w;
  const py = (y: number) => T + ((ty(y1) - ty(y)) / (ty(y1) - ty(y0))) * h;
  g.fillStyle = cssv('--surface-2'); g.fillRect(L, T, w, h);
  g.strokeStyle = cssv('--line'); g.lineWidth = 1;
  g.font = '11px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = cssv('--ink-3');
  for (const v of xt) {
    g.beginPath(); g.moveTo(px(v), T); g.lineTo(px(v), T + h); g.stroke();
    g.textAlign = 'center'; g.fillText(opts.fmtX ? opts.fmtX(v) : String(v), px(v), H - 10);
  }
  for (const v of yt) {
    g.beginPath(); g.moveTo(L, py(v)); g.lineTo(L + w, py(v)); g.stroke();
    g.textAlign = 'right'; g.fillText(opts.fmtY ? opts.fmtY(v) : String(v), L - 8, py(v) + 4);
  }
  return { px, py, L, T, w, h };
}

export function line(g: CanvasRenderingContext2D, ax: Axes, xs: ArrayLike<number>, ys: ArrayLike<number>, col: string, width = 2, dash: number[] = []) {
  g.save();
  g.beginPath(); g.rect(ax.L, ax.T, ax.w, ax.h); g.clip();
  g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'round'; g.setLineDash(dash);
  g.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const X = ax.px(xs[i]), Y = ax.py(ys[i]);
    i ? g.lineTo(X, Y) : g.moveTo(X, Y);
  }
  g.stroke(); g.restore();
}

export function fn(g: CanvasRenderingContext2D, ax: Axes, f: (x: number) => number, x0: number, x1: number, col: string, width = 2, n = 1200) {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; xs.push(x); ys.push(f(x)); }
  line(g, ax, xs, ys, col, width);
}

// Redraw on resize and on theme change.
export function live(draw: () => void) {
  draw();
  let t: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(draw, 80); });
  window.addEventListener('otb-theme', () => setTimeout(draw, 30));
}

export const chirp = (x: number) =>
  Math.sin(2 * Math.PI * x) + Math.cos(Math.PI * x * x) + Math.cos(Math.PI * x ** 3) * Math.sin(Math.PI * x ** 3);

// Round a number to the nearest bfloat16 (round half to even), returned as a JS number.
export function toBf16(v: number) {
  const f = new Float32Array([v]);
  const u = new Uint32Array(f.buffer);
  const x = u[0];
  if ((x & 0x7f800000) === 0x7f800000) return f[0];
  const lsb = (x >>> 16) & 1;
  u[0] = ((x + 0x7fff + lsb) >>> 16) << 16;
  return f[0];
}
