import { Body, Cabin } from './cabin';
import { COLORS } from './colors';
import { G0 } from './config';

/**
 * L'intérieur de la cabine, de côté : la zone d'expérience matelassée, les hublots (l'horizon y bascule
 * avec l'assiette de l'avion), et ce qui flotte dedans. Les passagers ouvrent les bras quand ils ne pèsent
 * plus rien ; la bulle d'eau s'affaisse sous la gravité et redevient sphère en apesanteur.
 */

const SUITS = ['#4b63e6', '#ff9f4a', '#43c6a4'];
const SKIN = ['#f3c7a5', '#c98d64', '#f6d6bd'];
const HAIR = ['#3a2a22', '#141018', '#d9a441'];
const CANDY = ['#ff5a6e', '#ffd23f', '#43c6a4', '#4b63e6', '#ff8fd8', '#ff9f4a'];

export class CabinView {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** Échelle (px par mètre) et origine de la cabine à l'écran. */
  scale = 1;
  ox = 0;
  oy = 0;
  /** Pose de chaque passager : 0 plaqué au sol, 1 en apesanteur (lissée). */
  private readonly poses = new Map<number, number>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number, cabin: Cabin): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = width;
    this.h = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    const pad = Math.max(10, Math.min(width, height) * 0.06);
    this.scale = Math.min((width - pad * 2) / cabin.width, (height - pad * 2) / cabin.height);
    this.ox = (width - cabin.width * this.scale) / 2;
    this.oy = (height + cabin.height * this.scale) / 2;
  }

  /** Écran → cabine (mètres). */
  toCabin(px: number, py: number): [number, number] {
    return [(px - this.ox) / this.scale, (this.oy - py) / this.scale];
  }

  draw(cabin: Cabin, pitch: number, dt: number): void {
    const { ctx, w, h } = this;
    if (!w || !h) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1b1650';
    ctx.fillRect(0, 0, w, h);

    // Le repère de la cabine : mètres, y vers le haut.
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, -this.scale);
    this.drawShell(cabin, pitch);
    const g = Math.hypot(cabin.ax, cabin.ay) / G0;
    for (const b of cabin.bodies) {
      if (b.kind !== 'person') continue;
      const target = Math.max(0, Math.min(1, 1 - g * 1.6));
      const p = this.poses.get(b.id) ?? 0;
      this.poses.set(b.id, p + (target - p) * (1 - Math.exp(-dt * 2.5)));
    }
    // Bras et jambes peuvent dépasser de la capsule qui sert aux chocs : on les cache derrière les parois.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0.05, cabin.width, cabin.height - 0.05);
    ctx.clip();
    for (const b of cabin.bodies) if (b.kind === 'person') this.drawPerson(b);
    for (const b of cabin.bodies) if (b.kind !== 'person') this.drawThing(b, cabin);
    ctx.restore();
    if (cabin.grab) this.drawHand(cabin);
    ctx.restore();

    this.drawArrow(cabin);
  }

  private drawShell(cabin: Cabin, pitch: number): void {
    const { ctx } = this;
    const W = cabin.width;
    const H = cabin.height;
    // Paroi du fond : des coussins blancs matelassés (rien ne déborde du volume de la cabine).
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.fillStyle = '#eceaf6';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d3d0e6';
    ctx.lineWidth = 0.012;
    for (let x = 0; x < W; x += 0.76) {
      for (let y = 0.1; y < H; y += 0.52) {
        ctx.beginPath();
        ctx.roundRect(x + 0.03, y + 0.03, 0.7, 0.46, 0.08);
        ctx.stroke();
      }
    }
    // Les hublots : on y voit le ciel et la mer de nuages, l'horizon penché par l'assiette.
    for (let x = 0.38 + 0.76; x < W - 0.4; x += 1.52) this.drawPorthole(x, 1.32, pitch);
    // Rampe lumineuse au plafond, tapis bleus et sangles jaunes au plancher.
    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(0.2, H - 0.05, W - 0.4, 0.035);
    ctx.fillStyle = '#3b4aa8';
    ctx.fillRect(0, 0, W, 0.06);
    ctx.fillStyle = '#ffd23f';
    for (let x = 0.5; x < W; x += 1.5) ctx.fillRect(x, 0, 0.05, 0.06);
    // Parois avant et arrière, et le sens de la marche.
    ctx.fillStyle = '#d9d6ee';
    ctx.fillRect(0, 0, 0.05, H);
    ctx.fillRect(W - 0.05, 0, 0.05, H);
    ctx.save();
    ctx.scale(1, -1);
    ctx.fillStyle = '#9a96c0';
    ctx.font = '700 0.12px Lato, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('AVANT →', W - 0.14, -H + 0.28);
    ctx.textAlign = 'left';
    ctx.restore();
    ctx.restore();
  }

  private drawPorthole(cx: number, cy: number, pitch: number): void {
    const { ctx } = this;
    const r = 0.13;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 1.25, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    // Avec y vers le haut, le monde est tourné de −assiette dans la cabine.
    ctx.rotate(-pitch);
    ctx.fillStyle = '#4f86e0';
    ctx.fillRect(-0.4, 0, 0.8, 0.4);
    ctx.fillStyle = '#a9d4ff';
    ctx.fillRect(-0.4, 0, 0.8, 0.05);
    ctx.fillStyle = '#f4f1ff';
    ctx.fillRect(-0.4, -0.4, 0.8, 0.4);
    ctx.restore();
    ctx.strokeStyle = '#c3bfdc';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 1.25, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Un passager en combinaison, dessiné le long de son axe : pieds à −x, tête à +x. */
  private drawPerson(b: Body): void {
    const { ctx } = this;
    const pose = this.poses.get(b.id) ?? 0;
    const suit = SUITS[b.variant % SUITS.length];
    const skin = SKIN[b.variant % SKIN.length];
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.lineCap = 'round';
    // Jambes, écartées en apesanteur.
    const spread = 0.06 + pose * 0.2;
    ctx.strokeStyle = suit;
    ctx.lineWidth = 0.15;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-0.05, side * 0.07);
      ctx.lineTo(-0.72, side * spread);
      ctx.stroke();
      ctx.fillStyle = '#2a2550';
      ctx.beginPath();
      ctx.ellipse(-0.78, side * spread, 0.07, 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bras : le long du corps quand on pèse, grands ouverts quand on flotte.
    const arm = Math.PI * (1 - 0.62 * pose);
    for (const side of [-1, 1]) {
      const hx = 0.42 + Math.cos(arm) * 0.5;
      const hy = side * (0.15 + Math.sin(arm) * 0.5);
      ctx.strokeStyle = suit;
      ctx.lineWidth = 0.11;
      ctx.beginPath();
      ctx.moveTo(0.42, side * 0.14);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(hx, hy, 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    // Torse, avec l'écusson.
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.roundRect(-0.12, -0.19, 0.62, 0.38, 0.14);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    ctx.beginPath();
    ctx.arc(0.32, 0.07, 0.045, 0, Math.PI * 2);
    ctx.fill();
    // Tête : cheveux côté sommet, visage tourné vers nous.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0.65, 0, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HAIR[b.variant % HAIR.length];
    ctx.beginPath();
    ctx.arc(0.65, 0, 0.145, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.fillStyle = '#1a1433';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0.62, side * 0.05, 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    // La bouche : un trait quand ça appuie, un grand « o » ravi quand on flotte.
    ctx.strokeStyle = '#1a1433';
    ctx.lineWidth = 0.014;
    ctx.beginPath();
    if (pose > 0.5) ctx.ellipse(0.555, 0, 0.025, 0.035, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(0.555, -0.035);
      ctx.lineTo(0.555, 0.035);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 143 216 / 0.45)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0.58, side * 0.085, 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawThing(b: Body, cabin: Cabin): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(b.x, b.y);
    switch (b.kind) {
      case 'ball': {
        ctx.rotate(b.a);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#26214d';
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          this.pentagon(Math.cos(a) * b.r * 0.72, Math.sin(a) * b.r * 0.72, b.r * 0.24, a);
        }
        this.pentagon(0, 0, b.r * 0.3, 0);
        break;
      }
      case 'apple': {
        ctx.rotate(b.a);
        ctx.fillStyle = '#e8384f';
        ctx.beginPath();
        ctx.arc(-b.r * 0.35, 0, b.r * 0.85, 0, Math.PI * 2);
        ctx.arc(b.r * 0.35, 0, b.r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = b.r * 0.18;
        ctx.beginPath();
        ctx.moveTo(0, b.r * 0.6);
        ctx.lineTo(b.r * 0.1, b.r * 1.15);
        ctx.stroke();
        ctx.fillStyle = '#43c6a4';
        ctx.beginPath();
        ctx.ellipse(b.r * 0.42, b.r * 1.0, b.r * 0.32, b.r * 0.16, 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'water': {
        // S'affaisse vers la gravité apparente quand elle touche une paroi ; sinon, sphère qui tremble.
        const g = Math.hypot(cabin.ax, cabin.ay) / G0;
        const near =
          b.y - b.r < 0.02 ||
          b.y + b.r > cabin.height - 0.02 ||
          b.x - b.r < 0.02 ||
          b.x + b.r > cabin.width - 0.02;
        const sag = Math.min(0.5, (near ? g * 0.32 : 0) + b.squash);
        const wob = b.wobble * Math.sin(performance.now() / 70);
        const down = Math.atan2(cabin.ay, cabin.ax);
        ctx.rotate(g > 0.05 ? down : 0);
        const rx = b.r * (1 - sag * 0.6 + wob);
        const ry = b.r * (1 + sag * 0.55 - wob);
        ctx.translate(rx - b.r, 0);
        const grd = ctx.createRadialGradient(-b.r * 0.3, b.r * 0.3, 0, 0, 0, b.r * 1.3);
        grd.addColorStop(0, 'rgb(215 240 255 / 0.95)');
        grd.addColorStop(0.6, 'rgb(110 185 255 / 0.75)');
        grd.addColorStop(1, 'rgb(60 120 230 / 0.7)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
        ctx.beginPath();
        ctx.ellipse(-rx * 0.35, ry * 0.4, rx * 0.22, ry * 0.12, 0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'plush': {
        // Un chat en peluche rose, tout rond.
        ctx.rotate(b.a);
        ctx.fillStyle = '#ffb3e4';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * b.r * 0.85, b.r * 0.25);
          ctx.lineTo(side * b.r * 0.75, b.r * 1.15);
          ctx.lineTo(side * b.r * 0.2, b.r * 0.8);
          ctx.closePath();
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1433';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(side * b.r * 0.38, b.r * 0.12, b.r * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#1a1433';
        ctx.lineWidth = b.r * 0.07;
        ctx.beginPath();
        ctx.arc(-b.r * 0.1, -b.r * 0.12, b.r * 0.1, Math.PI * 1.1, Math.PI * 1.9, true);
        ctx.arc(b.r * 0.1, -b.r * 0.12, b.r * 0.1, Math.PI * 1.1, Math.PI * 1.9, true);
        ctx.stroke();
        ctx.fillStyle = COLORS.zero;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(side * b.r * 0.62, -b.r * 0.15, b.r * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'candy': {
        ctx.fillStyle = CANDY[b.variant % CANDY.length];
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
        ctx.beginPath();
        ctx.arc(-b.r * 0.3, b.r * 0.3, b.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  private pentagon(x: number, y: number, r: number, a: number): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const t = a + (i * Math.PI * 2) / 5;
      ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    }
    ctx.fill();
  }

  private drawHand(cabin: Cabin): void {
    const { ctx } = this;
    const g = cabin.grab!;
    const b = g.body;
    const c = Math.cos(b.a);
    const s = Math.sin(b.a);
    const px = b.x + g.lx * c - g.ly * s;
    const py = b.y + g.lx * s + g.ly * c;
    ctx.strokeStyle = 'rgb(255 143 216 / 0.8)';
    ctx.lineWidth = 0.02;
    ctx.setLineDash([0.05, 0.04]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(g.tx, g.ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.zero;
    ctx.beginPath();
    ctx.arc(g.tx, g.ty, 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

  /** En haut à gauche : la gravité ressentie dans la cabine, en direction et en intensité. */
  private drawArrow(cabin: Cabin): void {
    const { ctx } = this;
    const g = Math.hypot(cabin.ax, cabin.ay) / G0;
    const R = Math.max(13, Math.min(28, cabin.height * this.scale * 0.13));
    const cx = this.ox + R + 8;
    const cy = this.oy - cabin.height * this.scale + R + 8;
    ctx.fillStyle = 'rgb(14 10 53 / 0.65)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    if (g > 0.03) {
      const len = Math.min(1, g / 2) * (R - 6) + 4;
      const a = Math.atan2(-cabin.ay, cabin.ax);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.strokeStyle = g < 0.3 ? COLORS.zero : g > 1.4 ? COLORS.hyper : COLORS.one;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-len * 0.4, 0);
      ctx.lineTo(len * 0.6, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(len * 0.6 + 5, 0);
      ctx.lineTo(len * 0.6 - 3, -5);
      ctx.lineTo(len * 0.6 - 3, 5);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = COLORS.zero;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `700 ${R < 18 ? 9 : 11}px Lato, sans-serif`;
    const label = 'gravité ressentie';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgb(14 10 53 / 0.65)';
    ctx.beginPath();
    ctx.roundRect(cx + R + 4, cy - 9, tw + 14, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + R + 11, cy + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}
