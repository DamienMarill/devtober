import { Camera } from './camera';
import { FOCAL, project } from './projection';
import { Petal } from './petals';
import { RainField, streak } from './rain';
import { Precip } from './weather';
import { ScreenWind } from './wind';

/**
 * En deçà (m), un pétale ou une goutte passe devant les cerisiers proches (canvas avant) ; au-delà, il
 * reste derrière eux, devant ceux du pont.
 */
export const FRONT_Z = 19;
/** En deçà (m), un pétale est trop près pour être net : flou de profondeur de champ. */
const BOKEH_Z = 3;
const SPRITE = 64;

export interface StageColors {
  petal: { hi: string; mid: string; shade: string; heart: string };
  rain: string;
}

/**
 * Les deux canvases des particules : l'arrière (devant les cerisiers du pont, derrière les plus proches) et
 * l'avant (devant tout).
 * Les pétales sont des sprites pré-dessinés (4 teintes, nets et flous), posés avec une seule matrice par
 * pétale ; la pluie est un seul tracé par canvas.
 */
export class Stage {
  private readonly back: CanvasRenderingContext2D;
  private readonly front: CanvasRenderingContext2D;
  private dpr = 1;
  private camera?: Camera;
  private sprites: HTMLCanvasElement[] = [];
  private blurred: HTMLCanvasElement[] = [];
  private colorKey = '';

  constructor(
    private readonly backCanvas: HTMLCanvasElement,
    private readonly frontCanvas: HTMLCanvasElement,
  ) {
    this.back = backCanvas.getContext('2d')!;
    this.front = frontCanvas.getContext('2d')!;
  }

  resize(camera: Camera): void {
    this.camera = camera;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.backCanvas, this.frontCanvas]) {
      c.width = Math.round(camera.width * this.dpr);
      c.height = Math.round(camera.height * this.dpr);
    }
  }

  /** Redessine les sprites des pétales si la lumière a changé leur couleur. */
  colors(colors: StageColors): void {
    this.rainColor = colors.rain;
    const key = Object.values(colors.petal).join();
    if (key === this.colorKey) return;
    this.colorKey = key;
    const { hi, mid, shade, heart } = colors.petal;
    const tints: [string, string][] = [
      [hi, mid],
      [hi, shade],
      [hi, hi],
      [mid, heart],
    ];
    this.sprites = tints.map(([body, base]) => petalSprite(body, base, 0));
    this.blurred = tints.map(([body, base]) => petalSprite(body, base, 4));
  }
  private rainColor = 'rgb(220 230 240 / 0.4)';

  draw(petals: readonly Petal[], rain: RainField, precip: Precip, wind: ScreenWind): void {
    const cam = this.camera;
    if (!cam || !this.sprites.length) return;
    for (const ctx of [this.back, this.front]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    const k = cam.scale * this.dpr;
    const sx = (x: number) => (x - cam.x) * k;
    const sy = (y: number) => (y - cam.y) * k;

    // Pétales, du plus loin au plus près.
    const ordered = [...petals].sort((a, b) => b.z - a.z);
    for (const p of ordered) {
      const ctx = p.z < FRONT_Z ? this.front : this.back;
      const [x, y] = project(p.x, p.y, p.z);
      const size = ((p.size * FOCAL) / p.z) * k;
      if (size < 0.6) continue;
      const near = p.z < BOKEH_Z;
      const sprite = (near ? this.blurred : this.sprites)[p.tint % this.sprites.length];
      const w = size * (near ? 1.25 : 1);
      // Sa culbute l'amincit par moments.
      const kx = w * Math.max(0.18, Math.abs(Math.cos(p.tumble)));
      const ky = w;
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.fade)) * (near ? 0.75 : 1);
      ctx.setTransform(cos * kx, sin * kx, -sin * ky, cos * ky, sx(x), sy(y));
      ctx.drawImage(sprite, -0.5, -0.5, 1, 1);
    }
    for (const ctx of [this.back, this.front]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Pluie (ou neige) : un tracé pour le loin, un pour le près.
    if (precip === 'none' || !rain.drops.length) return;
    const snow = precip === 'snow';
    for (const [ctx, nearOnly] of [
      [this.back, false],
      [this.front, true],
    ] as const) {
      ctx.beginPath();
      for (const d of rain.drops) {
        if (d.z < FRONT_Z !== nearOnly) continue;
        if (snow) {
          const [x, y] = project(d.x, d.y, d.z);
          const r = Math.max(0.9, ((0.025 * FOCAL) / d.z) * k);
          ctx.moveTo(sx(x) + r, sy(y));
          ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2);
        } else {
          const [x0, y0, x1, y1] = streak(d, wind, precip === 'drizzle' ? 0.02 : 0.035);
          ctx.moveTo(sx(x0), sy(y0));
          ctx.lineTo(sx(x1), sy(y1));
        }
      }
      if (snow) {
        ctx.fillStyle = 'rgb(250 252 255 / 0.85)';
        ctx.fill();
      } else {
        ctx.strokeStyle = this.rainColor;
        ctx.lineWidth = (nearOnly ? 1.6 : 1.1) * this.dpr;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }
}

/**
 * Un pétale de cerisier (Somei Yoshino) : un ovale qui s'évase vers la pointe, échancré au bout, plus rose
 * à la base. `blur` (px) donne la version floue des pétales tout proches.
 */
function petalSprite(body: string, base: string, blur: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SPRITE;
  const ctx = canvas.getContext('2d')!;
  const s = SPRITE * (blur ? 0.32 : 0.42);
  ctx.translate(SPRITE / 2, SPRITE / 2);
  if (blur) ctx.filter = `blur(${blur}px)`;
  const gradient = ctx.createLinearGradient(0, s, 0, -s);
  gradient.addColorStop(0, base);
  gradient.addColorStop(0.45, body);
  gradient.addColorStop(1, body);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, s);
  ctx.bezierCurveTo(-s * 0.55, s * 0.55, -s * 0.85, -s * 0.35, -s * 0.32, -s * 0.95);
  ctx.quadraticCurveTo(-s * 0.12, -s * 0.98, 0, -s * 0.75);
  ctx.quadraticCurveTo(s * 0.12, -s * 0.98, s * 0.32, -s * 0.95);
  ctx.bezierCurveTo(s * 0.85, -s * 0.35, s * 0.55, s * 0.55, 0, s);
  ctx.fill();
  // Un liseré rose soutenu : le pétale se détache des fleurs derrière lui, comme dans un dessin animé.
  if (!blur) {
    ctx.strokeStyle = 'rgb(214 120 156 / 0.75)';
    ctx.lineWidth = SPRITE * 0.035;
    ctx.stroke();
  }
  return canvas;
}
