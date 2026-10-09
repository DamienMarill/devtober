import { COLORS, loadColor } from './colors';
import { Flight } from './flight';
import { seeded } from './rng';

/**
 * La vue de dehors : l'avion de profil au-dessus d'une mer de nuages, et derrière lui la trajectoire,
 * colorée par ce que ressent la cabine (pêche à 1,8 g, rose en apesanteur). L'échelle verticale est un peu
 * exagérée pour que la parabole tienne à l'écran : l'avion, lui, est dessiné dans le même repère, pour que
 * son nez suive la courbe.
 */

export type Marker = 'pull-up' | 'injection' | 'pull-out';

const MARKER_LABELS: Record<Marker, string> = {
  'pull-up': 'Pull up',
  injection: 'Injection',
  'pull-out': 'Pull out',
};

/** La trace du vol : un point tous les dixièmes de seconde. */
export class Track {
  x: number[] = [];
  h: number[] = [];
  n: number[] = [];
  markers: { x: number; h: number; kind: Marker }[] = [];
  private clock = 0;

  record(f: Flight, dt: number): void {
    this.clock += dt;
    if (this.clock < 0.1) return;
    this.clock = 0;
    this.x.push(f.x);
    this.h.push(f.h);
    this.n.push(f.nz);
    // On oublie ce qui est loin derrière.
    if (this.x.length > 4000) {
      this.x.splice(0, 1000);
      this.h.splice(0, 1000);
      this.n.splice(0, 1000);
      const cut = this.x[0];
      this.markers = this.markers.filter((m) => m.x >= cut);
    }
  }

  mark(f: Flight, kind: Marker): void {
    this.markers.push({ x: f.x, h: f.h, kind });
  }

  clear(): void {
    this.x = [];
    this.h = [];
    this.n = [];
    this.markers = [];
  }
}

export class SkyView {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private hMin = 3800;
  /** Bosses de la mer de nuages, tirées une fois pour toutes (motif répété). */
  private readonly puffs: { x: number; r: number; dy: number }[] = [];
  private readonly wisps: { x: number; h: number; len: number; a: number }[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const rnd = seeded(42);
    for (let x = 0; x < 9000; x += 140 + rnd() * 220)
      this.puffs.push({ x, r: 160 + rnd() * 320, dy: rnd() * 120 });
    for (let i = 0; i < 9; i++)
      this.wisps.push({
        x: rnd() * 14000,
        h: 8500 + rnd() * 900,
        len: 900 + rnd() * 2200,
        a: 0.12 + rnd() * 0.18,
      });
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = width;
    this.h = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  draw(f: Flight, track: Track): void {
    const { ctx, w, h } = this;
    if (!w || !h) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Le cadrage : 10 à 17 km de large, l'avion aux deux tiers ; 5,2 km de haut, qui suit l'avion s'il sort.
    const spanX = Math.max(10_000, Math.min(17_000, w * 18));
    const spanH = 5200;
    const base = 3800;
    let target = base;
    if (f.h > base + spanH - 600) target = f.h - spanH + 600;
    if (f.h < base + 500) target = f.h - 500;
    this.hMin += (target - this.hMin) * 0.08;
    const sx = w / spanX;
    const sy = h / spanH;
    const camX = f.x - spanX * 0.68;
    const X = (x: number) => (x - camX) * sx;
    const Y = (alt: number) => h - (alt - this.hMin) * sy;

    this.drawSky(Y, sx, camX);
    this.drawGrid(Y, sx / sy);
    this.drawTrack(track, X, Y, camX, spanX);
    this.drawPlane(X(f.x), Y(f.h), Math.atan2(-Math.sin(f.theta) * sy, Math.cos(f.theta) * sx));
    this.drawClouds(Y, camX, sx);
  }

  private drawSky(Y: (h: number) => number, sx: number, camX: number): void {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, Y(10_500), 0, Y(3500));
    g.addColorStop(0, '#0b1f6b');
    g.addColorStop(0.45, '#2557c4');
    g.addColorStop(0.8, '#7fbcf2');
    g.addColorStop(1, '#d6ecff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Le soleil, en haut.
    const sun = ctx.createRadialGradient(w * 0.58, h * 0.1, 0, w * 0.58, h * 0.1, h * 0.55);
    sun.addColorStop(0, 'rgb(255 250 230 / 0.95)');
    sun.addColorStop(0.06, 'rgb(255 244 214 / 0.55)');
    sun.addColorStop(0.3, 'rgb(255 214 236 / 0.12)');
    sun.addColorStop(1, 'rgb(255 214 236 / 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    // Des cirrus, qui défilent plus lentement que le reste (ils sont loin).
    ctx.lineCap = 'round';
    for (const c of this.wisps) {
      const period = 14_000;
      const x = ((((c.x - camX * 0.55) % period) + period) % period) * sx - 200;
      const y = Y(c.h);
      ctx.strokeStyle = `rgb(255 255 255 / ${c.a})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + c.len * sx * 0.5, y - 6, x + c.len * sx, y + 2);
      ctx.stroke();
    }
  }

  private drawGrid(Y: (h: number) => number, ratio: number): void {
    const { ctx, w } = this;
    ctx.font = '600 11px Lato, sans-serif';
    ctx.textBaseline = 'bottom';
    for (let alt = 4000; alt <= 10_000; alt += 1000) {
      const y = Math.round(Y(alt)) + 0.5;
      ctx.strokeStyle = alt === 6000 ? 'rgb(255 255 255 / 0.35)' : 'rgb(255 255 255 / 0.14)';
      ctx.setLineDash(alt === 6000 ? [6, 5] : [2, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
      ctx.fillText(`${(alt / 1000).toFixed(0)} 000 m${alt === 6000 ? ' · palier' : ''}`, 8, y - 3);
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.fillText(`hauteurs ×${(1 / ratio).toFixed(1).replace('.', ',')}`, w - 8, this.h - 6);
    ctx.textAlign = 'left';
  }

  private drawTrack(
    t: Track,
    X: (x: number) => number,
    Y: (h: number) => number,
    camX: number,
    spanX: number,
  ): void {
    const { ctx } = this;
    const n = t.x.length;
    if (n < 2) return;
    let i0 = 0;
    while (i0 < n - 1 && t.x[i0 + 1] < camX - 200) i0++;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Une lueur sous la trace, puis la trace par tronçons de même couleur.
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgb(255 255 255 / 0.12)';
    ctx.beginPath();
    for (let i = i0; i < n; i++) {
      if (i === i0) ctx.moveTo(X(t.x[i]), Y(t.h[i]));
      else ctx.lineTo(X(t.x[i]), Y(t.h[i]));
    }
    ctx.stroke();
    ctx.lineWidth = 3;
    let i = i0;
    while (i < n - 1) {
      const color = loadColor(t.n[i]);
      ctx.strokeStyle = color;
      ctx.shadowColor = color === COLORS.zero ? COLORS.zero : 'transparent';
      ctx.shadowBlur = color === COLORS.zero ? 10 : 0;
      ctx.beginPath();
      ctx.moveTo(X(t.x[i]), Y(t.h[i]));
      let j = i + 1;
      for (; j < n; j++) {
        ctx.lineTo(X(t.x[j]), Y(t.h[j]));
        if (loadColor(t.n[j]) !== color) break;
      }
      ctx.stroke();
      i = j;
    }
    ctx.shadowBlur = 0;

    // Les annonces de l'équipage, plantées sur la trace.
    ctx.font = '700 11px Lato, sans-serif';
    ctx.textBaseline = 'middle';
    for (const m of t.markers) {
      if (m.x < camX - 500 || m.x > camX + spanX) continue;
      const x = X(m.x);
      const y = Y(m.h);
      const label = MARKER_LABELS[m.kind];
      const up = m.kind === 'pull-up';
      const ty = y + (up ? -22 : 22);
      ctx.strokeStyle = 'rgb(255 255 255 / 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, ty);
      ctx.stroke();
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgb(14 10 53 / 0.72)';
      ctx.beginPath();
      ctx.roundRect(x - tw / 2, ty - 9, tw, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, ty + 0.5);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** L'avion, de profil, nez à droite : un long-courrier blanc à liseré rose. */
  private drawPlane(x: number, y: number, angle: number): void {
    const { ctx } = this;
    const L = Math.max(40, Math.min(78, this.w * 0.075));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgb(14 10 53 / 0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    // Dérive.
    ctx.fillStyle = '#a49cff';
    ctx.beginPath();
    ctx.moveTo(-0.33 * L, -0.05 * L);
    ctx.lineTo(-0.44 * L, -0.31 * L);
    ctx.lineTo(-0.52 * L, -0.31 * L);
    ctx.lineTo(-0.5 * L, -0.04 * L);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0.42 * L, -0.065 * L);
    ctx.quadraticCurveTo(0.53 * L, -0.06 * L, 0.53 * L, 0.0 * L);
    ctx.quadraticCurveTo(0.52 * L, 0.06 * L, 0.42 * L, 0.065 * L);
    ctx.lineTo(-0.3 * L, 0.065 * L);
    ctx.quadraticCurveTo(-0.45 * L, 0.05 * L, -0.52 * L, -0.03 * L);
    ctx.lineTo(-0.5 * L, -0.065 * L);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // Liseré, hublots, pare-brise.
    ctx.fillStyle = '#ff8fd8';
    ctx.fillRect(-0.42 * L, 0.012 * L, 0.84 * L, 0.018 * L);
    ctx.fillStyle = '#2b2f6e';
    for (let i = 0; i < 16; i++)
      ctx.fillRect(-0.3 * L + i * 0.042 * L, -0.025 * L, 0.012 * L, 0.016 * L);
    ctx.beginPath();
    ctx.moveTo(0.44 * L, -0.045 * L);
    ctx.lineTo(0.5 * L, -0.03 * L);
    ctx.lineTo(0.45 * L, -0.025 * L);
    ctx.closePath();
    ctx.fill();
    // Aile et réacteur (côté visible).
    ctx.fillStyle = '#c9cbe0';
    ctx.beginPath();
    ctx.ellipse(0.0, 0.05 * L, 0.17 * L, 0.025 * L, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e9f5';
    ctx.beginPath();
    ctx.roundRect(0.03 * L, 0.07 * L, 0.15 * L, 0.055 * L, 0.025 * L);
    ctx.fill();
    ctx.fillStyle = '#2b2f6e';
    ctx.fillRect(0.165 * L, 0.078 * L, 0.012 * L, 0.04 * L);
    // Empennage horizontal.
    ctx.fillStyle = '#c9cbe0';
    ctx.beginPath();
    ctx.ellipse(-0.45 * L, -0.02 * L, 0.07 * L, 0.014 * L, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** La mer de nuages, au premier plan : elle défile un peu plus vite que la trajectoire (parallaxe). */
  private drawClouds(Y: (h: number) => number, camX: number, sx: number): void {
    const { ctx, w, h } = this;
    const top = Y(4300);
    if (top > h + 40) return;
    const period = 9000;
    const off = (camX * 1.15) % period;
    const g = ctx.createLinearGradient(0, top - 40, 0, h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#e9e4ff');
    g.addColorStop(1, '#c5bff2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let k = -1; k <= Math.ceil(w / sx / period) + 1; k++) {
      for (const p of this.puffs) {
        const x = (p.x + k * period - off) * sx;
        if (x < -p.r * sx * 2 || x > w + p.r * sx * 2) continue;
        const r = Math.max(10, p.r * sx * 1.4);
        ctx.moveTo(x + r, top + p.dy * sx);
        ctx.arc(x, top + p.dy * sx, r, 0, Math.PI * 2);
      }
    }
    ctx.rect(0, top + 6, w, h);
    ctx.fill();
  }
}
