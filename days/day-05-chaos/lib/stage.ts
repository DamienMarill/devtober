import { CONFIG } from './config';
import type { Field } from './field';
import { hash2, seeded, smoothstep } from './math';
import { SineNoise } from './noise';

type Rgb = readonly [number, number, number];

const GRAIN_FRAMES = 6;
const GRAIN_SIZE = 256;
const FOG_SIZE = 128;
/** Taille d'une nappe de turbulence à l'écran (u). */
const FOG_TILE = 1.6;
/** Le rayon de l'aperture est celui où l'obscurité atteint la moitié ; le sprite va de 0,15 à 0,85. */
const APERTURE_HALF = 0.5;
/** Rayon du cœur du body dans son sprite (part du demi-côté). */
const BODY_CORE = 0.18;

function canvas(width: number, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')!];
}

function radial(size: number, stops: readonly (readonly [number, string])[]): HTMLCanvasElement {
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

function hex(color: string): Rgb {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Value noise périodique (tuilable) à trois octaves, dans [0, 1]. */
function tileableNoise(random: () => number, size: number): Float32Array {
  const out = new Float32Array(size * size);
  const octaves: [number, number][] = [
    [4, 0.55],
    [8, 0.3],
    [16, 0.15],
  ];
  for (const [period, weight] of octaves) {
    const lattice = Float32Array.from({ length: period * period }, () => random());
    const at = (i: number, j: number) => lattice[(j % period) * period + (i % period)];
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * period;
      const j = Math.floor(fy);
      const ty = smoothstep(0, 1, fy - j);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period;
        const i = Math.floor(fx);
        const tx = smoothstep(0, 1, fx - i);
        const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
        const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
        out[y * size + x] += (top + (bottom - top) * ty) * weight;
      }
    }
  }
  return out;
}

function fogTexture(random: () => number, tint: Rgb): HTMLCanvasElement {
  const [c, ctx] = canvas(FOG_SIZE);
  const noise = tileableNoise(random, FOG_SIZE);
  const image = ctx.createImageData(FOG_SIZE, FOG_SIZE);
  for (let i = 0; i < noise.length; i++) {
    const v = smoothstep(0.3, 0.8, noise[i]);
    image.data[i * 4] = tint[0];
    image.data[i * 4 + 1] = tint[1];
    image.data[i * 4 + 2] = tint[2];
    image.data[i * 4 + 3] = Math.round(v * 255);
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

function grainTexture(random: () => number): HTMLCanvasElement {
  const [c, ctx] = canvas(GRAIN_SIZE);
  const image = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let i = 0; i < GRAIN_SIZE * GRAIN_SIZE; i++) {
    const light = random() < 0.6;
    const v = light ? 225 : 6;
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = light ? 232 : 10;
    image.data[i * 4 + 3] = Math.round(random() * random() * 255);
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

/**
 * Le rendu canvas 2D. Tout ce qui coûte est préparé une fois (sprites radiaux, nappes de turbulence,
 * images de grain, table de couleurs du fond) ; la boucle ne fait que des `drawImage` et des `fillRect`.
 */
export class Stage {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  private readonly background: string[] = [];
  private readonly darkColor: string;
  private readonly glowWarm: HTMLCanvasElement;
  private readonly glowPale: HTMLCanvasElement;
  private readonly bodyCrisp: HTMLCanvasElement;
  private readonly bodySoft: HTMLCanvasElement;
  private readonly drifter: HTMLCanvasElement;
  private readonly wash: HTMLCanvasElement;
  private readonly aperture: HTMLCanvasElement;
  private readonly fog: CanvasPattern[];
  private readonly grain: CanvasPattern[];
  private readonly fogNoise: SineNoise[];
  private readonly matrix = new DOMMatrix();
  private grainTick = -1;
  private grainX = 0;
  private grainY = 0;

  constructor(
    private readonly element: HTMLCanvasElement,
    private readonly seed: number,
    private readonly options: { reducedMotion: boolean; showPicto: boolean },
  ) {
    this.ctx = element.getContext('2d')!;
    const random = seeded(seed ^ 0x2545f491);

    const stops = CONFIG.palette.background.map(hex);
    for (let i = 0; i < 256; i++) {
      const s = (i / 255) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(s));
      const t = s - k;
      const c = stops[k].map((v, j) => Math.round(v + (stops[k + 1][j] - v) * t));
      this.background.push(`rgb(${c[0]},${c[1]},${c[2]})`);
    }
    const dark = CONFIG.palette.dark;
    this.darkColor = rgba(dark, 1);

    this.glowWarm = radial(256, [
      [0, 'rgba(255,242,218,1)'],
      [0.1, 'rgba(255,228,190,0.92)'],
      [0.32, 'rgba(250,202,152,0.4)'],
      [0.62, 'rgba(236,176,128,0.1)'],
      [1, 'rgba(230,170,120,0)'],
    ]);
    this.glowPale = radial(256, [
      [0, 'rgba(236,230,222,1)'],
      [0.1, 'rgba(226,218,208,0.85)'],
      [0.32, 'rgba(206,196,188,0.32)'],
      [0.62, 'rgba(190,180,174,0.08)'],
      [1, 'rgba(180,170,166,0)'],
    ]);
    this.bodyCrisp = radial(128, [
      [0, 'rgba(255,250,240,1)'],
      [BODY_CORE * 0.85, 'rgba(255,246,232,1)'],
      [BODY_CORE, 'rgba(255,236,212,0.5)'],
      [0.42, 'rgba(244,216,190,0.12)'],
      [1, 'rgba(230,206,190,0)'],
    ]);
    this.bodySoft = radial(128, [
      [0, 'rgba(206,192,212,0.75)'],
      [0.28, 'rgba(184,170,196,0.4)'],
      [0.62, 'rgba(156,142,174,0.1)'],
      [1, 'rgba(140,128,160,0)'],
    ]);
    this.drifter = radial(64, [
      [0, 'rgba(204,214,230,0.9)'],
      [0.22, 'rgba(186,200,222,0.42)'],
      [0.55, 'rgba(170,186,214,0.1)'],
      [1, 'rgba(160,180,210,0)'],
    ]);
    this.wash = radial(256, [
      [0, 'rgba(255,208,148,1)'],
      [0.3, 'rgba(255,188,114,0.5)'],
      [0.65, 'rgba(238,162,98,0.14)'],
      [1, 'rgba(228,152,90,0)'],
    ]);
    const vignette: [number, string][] = [];
    for (let i = 0; i <= 16; i++) {
      const r = i / 16;
      vignette.push([r, rgba(dark, smoothstep(0.15, 0.85, r))]);
    }
    this.aperture = radial(512, vignette);

    this.fog = CONFIG.turbulence.tints.map((tint) =>
      this.ctx.createPattern(fogTexture(random, tint), 'repeat')!,
    );
    this.fogNoise = CONFIG.turbulence.tints.map(() => new SineNoise(random));
    this.grain = Array.from({ length: GRAIN_FRAMES }, () =>
      this.ctx.createPattern(grainTexture(random), 'repeat')!,
    );
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.element.width = Math.max(1, Math.round(width * this.dpr));
    this.element.height = Math.max(1, Math.round(height * this.dpr));
  }

  draw(field: Field, hud: readonly string[] | null): void {
    const { ctx, width: w, height: h } = this;
    if (w === 0 || h === 0) return;
    const p = field.params;
    const d = p.density;
    const u = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const camX = field.camX;
    const camY = field.camY;
    const bx = cx + (field.body.x - camX) * u;
    const by = cy + (field.body.y - camY) * u;
    const halfDiag = Math.hypot(cx, cy);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.background[Math.round(d * 255)];
    ctx.fillRect(0, 0, w, h);

    this.drawTurbulence(field, u);
    this.drawMarks(field, u, cx, cy);

    ctx.globalCompositeOperation = 'lighter';
    for (const drifter of field.drifters.pool) {
      const a = drifter.alpha * CONFIG.drifters.alpha;
      if (a < 0.003) continue;
      const half = (CONFIG.drifters.radius * u) / 0.22;
      const x = cx + (drifter.x - camX) * u;
      const y = cy + (drifter.y - camY) * u;
      if (x < -half || y < -half || x > w + half || y > h + half) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(this.drifter, x - half, y - half, half * 2, half * 2);
    }

    const warmth = Math.min(1, field.warmth);
    if (warmth > 0.003) {
      const r = 0.3 * u * (1 + warmth * 0.3);
      ctx.globalAlpha = warmth * 0.35;
      ctx.drawImage(this.wash, bx - r, by - r, r * 2, r * 2);
    }
    const breathe = 1 + 0.035 * Math.sin(field.t * 1.1);
    const core = ((p.bodyRadius * u) / BODY_CORE) * breathe;
    ctx.globalAlpha = p.bodyCrisp * p.bodyLight;
    ctx.drawImage(this.bodyCrisp, bx - core, by - core, core * 2, core * 2);
    const soft = core * 1.8;
    ctx.globalAlpha = (1 - p.bodyCrisp) * p.bodyLight * 0.9;
    ctx.drawImage(this.bodySoft, bx - soft, by - soft, soft * 2, soft * 2);

    this.drawAperture(field, bx, by, halfDiag);

    ctx.globalCompositeOperation = 'lighter';
    const pale = smoothstep(0.2, 0.9, d);
    for (const g of field.glows.pool) {
      if (!g.active || g.alpha < 0.002) continue;
      const a = g.alpha * p.glowIntensity;
      const x = cx + (g.x - camX) * u;
      const y = cy + (g.y - camY) * u;
      const r = p.glowRadius * g.size * g.scale * u * 2.2;
      const halo = r * 3;
      ctx.globalAlpha = a * 0.12;
      ctx.drawImage(this.glowWarm, x - halo, y - halo, halo * 2, halo * 2);
      ctx.globalAlpha = a * (1 - pale);
      ctx.drawImage(this.glowWarm, x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = a * pale;
      ctx.drawImage(this.glowPale, x - r, y - r, r * 2, r * 2);
    }

    if (p.clearing > 0.002) {
      const r = halfDiag * 1.5;
      ctx.globalAlpha = p.clearing * CONFIG.clearing.veil;
      ctx.drawImage(this.wash, bx - r, by - r, r * 2, r * 2);
    }

    ctx.globalCompositeOperation = 'source-over';
    this.drawGrain(field, p.grain);
    if (this.options.showPicto && field.picto > 0)
      this.drawPicto(field.picto, bx, by + 0.17 * u, u);
    if (hud) this.drawHud(hud);
    ctx.globalAlpha = 1;
  }

  private drawTurbulence(field: Field, u: number): void {
    const { ctx, matrix } = this;
    const d = field.params.density;
    const T = CONFIG.turbulence;
    const tile = FOG_TILE * u * this.dpr;
    const scale = tile / FOG_SIZE;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < this.fog.length; i++) {
      const presence =
        i === 0
          ? 1 - smoothstep(0.05, 0.5, d)
          : smoothstep(0.1, 0.6, d) * (0.55 + 0.45 * this.fogNoise[i].at(field.t * 0.05));
      const a = field.params.turbulence * presence;
      if (a < 0.003) continue;
      const parallax = T.parallax[i];
      // Chaque nappe est tournée et glisse dans sa propre direction : pas d'axe commun visible.
      const angle = 0.4 + i * 2.1;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      matrix.a = scale * cos;
      matrix.b = scale * sin;
      matrix.c = -scale * sin;
      matrix.d = scale * cos;
      matrix.e = (-field.camX * parallax + cos * T.drift * field.t) * u * this.dpr;
      matrix.f = (-field.camY * parallax + sin * T.drift * field.t) * u * this.dpr;
      this.fog[i].setTransform(matrix);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.fog[i];
      ctx.fillRect(0, 0, this.element.width, this.element.height);
    }
    ctx.restore();
  }

  private drawMarks(field: Field, u: number, cx: number, cy: number): void {
    const level = field.params.marks;
    if (level < 0.003) return;
    const { ctx } = this;
    const cell = CONFIG.marks.cell;
    const x0 = Math.floor((field.camX - field.halfW) / cell) - 1;
    const x1 = Math.ceil((field.camX + field.halfW) / cell) + 1;
    const y0 = Math.floor((field.camY - field.halfH) / cell) - 1;
    const y1 = Math.ceil((field.camY + field.halfH) / cell) + 1;
    ctx.fillStyle = '#c4cee0';
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const wx = (i + hash2(i, j, this.seed)) * cell;
        const wy = (j + hash2(i, j, this.seed + 1)) * cell;
        const x = cx + (wx - field.camX) * u;
        const y = cy + (wy - field.camY) * u;
        ctx.globalAlpha = level * (0.3 + 0.7 * hash2(i, j, this.seed + 2));
        ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      }
    }
  }

  private drawAperture(field: Field, bx: number, by: number, halfDiag: number): void {
    const { ctx, width: w, height: h } = this;
    const p = field.params;
    const r50 = p.aperture * halfDiag * (1 + field.pulse * p.pulseAmount);
    const R = Math.round(r50 / APERTURE_HALF);
    const x = Math.round(bx);
    const y = Math.round(by);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = p.apertureDark;
    ctx.drawImage(this.aperture, x - R, y - R, R * 2, R * 2);
    ctx.fillStyle = this.darkColor;
    if (y - R > 0) ctx.fillRect(0, 0, w, y - R);
    if (y + R < h) ctx.fillRect(0, y + R, w, h - y - R);
    if (x - R > 0) ctx.fillRect(0, y - R, x - R, R * 2);
    if (x + R < w) ctx.fillRect(x + R, y - R, w - x - R, R * 2);
  }

  private drawGrain(field: Field, alpha: number): void {
    if (alpha < 0.002) return;
    const { ctx, matrix } = this;
    const fps = this.options.reducedMotion ? 6 : CONFIG.grain.fps;
    const tick = Math.floor(field.t * fps);
    if (tick !== this.grainTick) {
      this.grainTick = tick;
      this.grainX = hash2(tick, 0, this.seed) * GRAIN_SIZE;
      this.grainY = hash2(tick, 1, this.seed) * GRAIN_SIZE;
    }
    const pattern = this.grain[tick % GRAIN_FRAMES];
    matrix.a = matrix.d = 1;
    matrix.b = matrix.c = 0;
    matrix.e = this.grainX;
    matrix.f = this.grainY;
    pattern.setTransform(matrix);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, this.element.width, this.element.height);
    ctx.restore();
  }

  /** Quatre touches en T inversé, une flèche dans chacune. */
  private drawPicto(alpha: number, x: number, y: number, u: number): void {
    const { ctx } = this;
    const k = 0.04 * u;
    const gap = 0.008 * u;
    const step = k + gap;
    ctx.globalAlpha = alpha * CONFIG.picto.alpha;
    ctx.strokeStyle = '#d6dce8';
    ctx.lineWidth = 1.25;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.key(x, y - step, k, 0, -1);
    this.key(x - step, y, k, -1, 0);
    this.key(x, y, k, 0, 1);
    this.key(x + step, y, k, 1, 0);
  }

  private key(x: number, y: number, k: number, dx: number, dy: number): void {
    const { ctx } = this;
    const c = k * 0.16;
    ctx.beginPath();
    ctx.roundRect(x - k / 2, y - k / 2, k, k, k * 0.2);
    ctx.moveTo(x - dx * c + dy * c * 1.4, y - dy * c - dx * c * 1.4);
    ctx.lineTo(x + dx * c, y + dy * c);
    ctx.lineTo(x - dx * c - dy * c * 1.4, y - dy * c + dx * c * 1.4);
    ctx.stroke();
  }

  private drawHud(lines: readonly string[]): void {
    const { ctx } = this;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#d6dce8';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 12, 12 + i * 15));
  }
}
