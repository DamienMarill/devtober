import { COLORS, loadColor } from './colors';

/**
 * Les deux instruments de la force ressentie : un accéléromètre à aiguille, comme au tableau de bord (avec
 * ses aiguilles de mémoire, qui gardent le minimum et le maximum de la parabole), et la courbe des 80
 * dernières secondes, où l'on reconnaît le profil 1,8 g, 0 g, 1,8 g.
 */

const N_MIN = -1;
const N_MAX = 2.5;
const SWEEP = (270 * Math.PI) / 180;
const START = Math.PI * 0.75;

function setup(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export class GMeter {
  private ctx: CanvasRenderingContext2D | null = null;
  private size = 0;
  private shown = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  resize(size: number): void {
    this.size = size;
    this.ctx = setup(this.canvas, size, size);
  }

  draw(n: number, lo: number, hi: number, dt: number): void {
    const ctx = this.ctx;
    const S = this.size;
    if (!ctx || !S) return;
    // Une aiguille a de l'inertie : elle rattrape la mesure en quelques centièmes de seconde.
    this.shown += (n - this.shown) * (1 - Math.exp(-dt / 0.06));
    const angle = (v: number) =>
      START + ((Math.max(N_MIN, Math.min(N_MAX, v)) - N_MIN) / (N_MAX - N_MIN)) * SWEEP;
    const c = S / 2;
    const R = S * 0.46;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#16123f';
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgb(255 255 255 / 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Les plages colorées.
    const band = (from: number, to: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = R * 0.1;
      ctx.beginPath();
      ctx.arc(c, c, R * 0.84, angle(from), angle(to));
      ctx.stroke();
    };
    band(-1, -0.12, COLORS.danger);
    band(-0.06, 0.06, COLORS.zero);
    band(0.85, 1.15, COLORS.one);
    band(1.6, 2.0, COLORS.hyper);
    band(2.3, 2.5, COLORS.danger);

    // Graduations et chiffres.
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(S * 0.075)}px Lato, sans-serif`;
    for (let v = N_MIN; v <= N_MAX + 1e-6; v += 0.25) {
      const a = angle(v);
      const major = Math.abs(v - Math.round(v * 2) / 2) < 1e-6;
      const r0 = R * (major ? 0.68 : 0.73);
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * R * 0.78, c + Math.sin(a) * R * 0.78);
      ctx.stroke();
      if (major && Number.isInteger(v))
        ctx.fillText(String(v), c + Math.cos(a) * R * 0.54, c + Math.sin(a) * R * 0.54);
    }
    ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
    ctx.font = `700 ${Math.round(S * 0.06)}px Lato, sans-serif`;
    ctx.fillText('g', c, c + R * 0.42);

    // Aiguilles de mémoire, puis l'aiguille.
    const needle = (v: number, color: string, width: number, len: number) => {
      const a = angle(v);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c - Math.cos(a) * R * 0.12, c - Math.sin(a) * R * 0.12);
      ctx.lineTo(c + Math.cos(a) * R * len, c + Math.sin(a) * R * len);
      ctx.stroke();
    };
    needle(lo, 'rgb(255 143 216 / 0.55)', 2, 0.7);
    needle(hi, 'rgb(255 179 92 / 0.55)', 2, 0.7);
    needle(this.shown, loadColor(this.shown), 3.5, 0.82);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c, c, R * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** La courbe du facteur de charge : un point tous les dixièmes de seconde. */
export class LoadChart {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private readonly values: number[] = [];
  private clock = 0;
  static readonly SECONDS = 80;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.ctx = setup(this.canvas, w, h);
  }

  push(n: number, dt: number): void {
    this.clock += dt;
    if (this.clock < 0.1) return;
    this.clock = 0;
    this.values.push(n);
    if (this.values.length > LoadChart.SECONDS * 10) this.values.shift();
  }

  clear(): void {
    this.values.length = 0;
  }

  draw(): void {
    const { ctx, w, h } = this;
    if (!ctx || !w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const lo = -0.4;
    const hi = 2.2;
    const left = 26;
    const Y = (v: number) => 4 + (1 - (v - lo) / (hi - lo)) * (h - 8);
    ctx.font = '700 10px Lato, sans-serif';
    ctx.textBaseline = 'middle';
    for (const [v, label, color] of [
      [0, '0 g', COLORS.zero],
      [1, '1 g', COLORS.one],
      [1.8, '1,8', COLORS.hyper],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(left, Y(v) + 0.5);
      ctx.lineTo(w, Y(v) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.fillText(label, 0, Y(v));
    }
    const n = this.values.length;
    if (n < 2) return;
    const step = (w - left) / (LoadChart.SECONDS * 10);
    const x0 = w - (n - 1) * step;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    let i = 0;
    while (i < n - 1) {
      const color = loadColor(this.values[i]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x0 + i * step, Y(Math.max(lo, Math.min(hi, this.values[i]))));
      let j = i + 1;
      for (; j < n; j++) {
        ctx.lineTo(x0 + j * step, Y(Math.max(lo, Math.min(hi, this.values[j]))));
        if (loadColor(this.values[j]) !== color) break;
      }
      ctx.stroke();
      i = j;
    }
  }
}
