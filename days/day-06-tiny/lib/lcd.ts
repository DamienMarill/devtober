import { CONFIG } from './config';
import { GLYPH_HEIGHT, drawText, textWidth } from './font';
import { World } from './world';

export type Lighting = keyof typeof CONFIG.palettes;

/** Ce que le bandeau affiche : le nom de la souche un instant, sinon la règle, la courbe et la génération. */
export interface Band {
  banner: string | null;
  rule: string;
  generation: number;
  trace: PopulationTrace;
}

/** Les dernières populations, une par génération, pour la mini-courbe du bandeau. */
export class PopulationTrace {
  readonly values: Float32Array;
  private head = 0;
  count = 0;

  constructor(readonly capacity = 120) {
    this.values = new Float32Array(capacity);
  }

  push(population: number): void {
    this.values[this.head] = population;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
  }

  /** La valeur d'il y a `age` générations (0 = la dernière). */
  at(age: number): number {
    return this.values[(this.head - 1 - age + this.capacity * 2) % this.capacity];
  }
}

/**
 * Le pas des pixels (en pixels physiques) pour `fit` pixels physiques disponibles par cellule : entier pour des
 * pixels nets, sauf si l'arrondi ferait perdre plus de 15 % de l'écran (petits écrans) ; jamais moins de 1.
 */
export function fitPitch(fit: number): number {
  const whole = Math.floor(fit);
  if (whole >= 1 && (whole >= 4 || fit - whole <= fit * 0.15)) return whole;
  return Math.max(fit, 1);
}

/**
 * La table des couleurs d'encre, par niveau de 0 à 255, en ABGR (l'ordre des octets d'un `ImageData` lu en
 * `Uint32` sur une machine little-endian) : l'encre se pose en transparence sur le papier, qui est le fond CSS.
 * Les niveaux bas tirent vers la teinte `fade` (agonie, rémanence), les pixels éteints gardent un voile `unlit`.
 */
export function inkLut(lighting: Lighting): Uint32Array {
  const { ink, fade } = CONFIG.palettes[lighting];
  const unlit = CONFIG.lcd.unlit;
  const lut = new Uint32Array(256);
  for (let l = 0; l < 256; l++) {
    const t = l / 255;
    const hue = Math.pow(t, 0.6);
    const r = Math.round(fade[0] + (ink[0] - fade[0]) * hue);
    const g = Math.round(fade[1] + (ink[1] - fade[1]) * hue);
    const b = Math.round(fade[2] + (ink[2] - fade[2]) * hue);
    const a = Math.round((unlit + (1 - unlit) * t) * 255);
    lut[l] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return lut;
}

/** Niveau d'encre de chaque état pour une règle à `states` états : 1 vivante, 0 morte, l'agonie entre les deux. */
export function stateLevels(states: number): Float32Array {
  const levels = new Float32Array(256);
  levels[1] = 1;
  const [from, to] = CONFIG.lcd.dying;
  for (let s = 2; s < states; s++) {
    const t = states > 3 ? (s - 2) / (states - 3) : 0;
    levels[s] = from + (to - from) * t;
  }
  return levels;
}

/**
 * L'écran LCD, dessiné dans un canvas 2D. La matrice (le monde, une ligne pointillée et le bandeau) est calculée
 * à un point par pixel dans un `ImageData`, puis agrandie sans lissage ; un masque creuse les interstices entre
 * les pixels et une copie décalée et pâle fait l'ombre portée sur le papier. Chaque pixel a un niveau d'encre qui
 * rejoint sa cible avec un temps de réponse : c'est la rémanence des cristaux liquides.
 */
export class Lcd {
  readonly cols = CONFIG.grid.width;
  readonly gridRows = CONFIG.grid.height;
  readonly rows = CONFIG.grid.height + CONFIG.lcd.bandRows;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly matrix = document.createElement('canvas');
  private readonly matrixCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private readonly inkLayer = document.createElement('canvas');
  private readonly inkCtx: CanvasRenderingContext2D;
  private readonly gapMask = document.createElement('canvas');
  private readonly target: Float32Array;
  private readonly level: Float32Array;
  private lut = inkLut('backlight');
  private levels = stateLevels(2);
  private readonly fall: number;
  private pitch = 1;
  private gap = 0;
  private shadow = 1;
  private dpr = 1;
  /** Vrai tant que des pixels n'ont pas rejoint leur cible (il faut redessiner). */
  private moving = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: { reducedMotion: boolean },
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.matrix.width = this.cols;
    this.matrix.height = this.rows;
    this.matrixCtx = this.matrix.getContext('2d')!;
    this.image = this.matrixCtx.createImageData(this.cols, this.rows);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.inkCtx = this.inkLayer.getContext('2d')!;
    this.target = new Float32Array(this.cols * this.rows);
    this.level = new Float32Array(this.cols * this.rows);
    this.fall = options.reducedMotion ? CONFIG.lcd.fallReduced : CONFIG.lcd.fall;
  }

  setLighting(lighting: Lighting): void {
    this.lut = inkLut(lighting);
    this.moving = true;
  }

  setStates(states: number): void {
    this.levels = stateLevels(states);
  }

  /** Cale la matrice dans la place disponible (en pixels CSS), au pas entier le plus grand possible. */
  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = Math.min((width * this.dpr) / this.cols, (height * this.dpr) / this.rows);
    this.pitch = fitPitch(fit);
    const crisp = Number.isInteger(this.pitch);
    this.gap =
      crisp && this.pitch >= CONFIG.lcd.gapFrom ? Math.max(1, Math.round(this.pitch * 0.1)) : 0;
    this.shadow = Math.max(1, Math.round(this.pitch * CONFIG.lcd.shadow.offset));
    const w = Math.round(this.cols * this.pitch);
    const h = Math.round(this.rows * this.pitch);
    for (const c of [this.inkLayer, this.gapMask]) {
      c.width = w;
      c.height = h;
    }
    this.canvas.width = w + this.shadow;
    this.canvas.height = h + this.shadow;
    this.canvas.style.width = `${(w + this.shadow) / this.dpr}px`;
    this.canvas.style.height = `${(h + this.shadow) / this.dpr}px`;
    this.buildGapMask(w, h);
    this.moving = true;
  }

  /** La cellule du monde sous un point de l'écran, ou null hors du monde (bandeau compris). */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) * this.dpr) / this.pitch);
    const y = Math.floor(((clientY - rect.top) * this.dpr) / this.pitch);
    return x >= 0 && x < this.cols && y >= 0 && y < this.gridRows ? { x, y } : null;
  }

  /** Fait avancer les niveaux d'encre de `dt` secondes vers l'état du monde et du bandeau. */
  update(world: World, band: Band, dt: number): void {
    const { target, level, levels } = this;
    const cells = world.cells;
    for (let i = 0; i < cells.length; i++) target[i] = levels[cells[i]];
    this.writeBand(band);

    const up = 1 - Math.exp(-dt / CONFIG.lcd.rise);
    const down = 1 - Math.exp(-dt / this.fall);
    let moving = false;
    for (let i = 0; i < target.length; i++) {
      const d = target[i] - level[i];
      if (d > 0.002) {
        level[i] += d * up;
        moving = true;
      } else if (d < -0.002) {
        level[i] += d * down;
        moving = true;
      } else {
        level[i] = target[i];
      }
    }
    if (moving) this.moving = true;
  }

  /** Redessine si quelque chose a bougé depuis la dernière image. */
  draw(): void {
    if (!this.moving) return;
    this.moving = false;
    const { pixels, level, lut } = this;
    for (let i = 0; i < level.length; i++) pixels[i] = lut[(level[i] * 255) | 0];
    this.matrixCtx.putImageData(this.image, 0, 0);

    const w = this.inkLayer.width;
    const h = this.inkLayer.height;
    const ink = this.inkCtx;
    ink.globalCompositeOperation = 'source-over';
    ink.imageSmoothingEnabled = false;
    ink.clearRect(0, 0, w, h);
    ink.drawImage(this.matrix, 0, 0, w, h);
    if (this.gap) {
      ink.globalCompositeOperation = 'destination-out';
      ink.drawImage(this.gapMask, 0, 0);
      ink.globalCompositeOperation = 'source-over';
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = CONFIG.lcd.shadow.alpha;
    ctx.drawImage(this.inkLayer, this.shadow, this.shadow);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.inkLayer, 0, 0);
  }

  /** Force un dessin complet à la prochaine image (après un changement de mise en page). */
  invalidate(): void {
    this.moving = true;
  }

  private writeBand(band: Band): void {
    const { target, cols } = this;
    const top = this.gridRows;
    target.fill(0, top * cols);
    // La ligne pointillée qui sépare le monde du bandeau.
    for (let x = 0; x < cols; x += 2) target[top * cols + x] = 0.35;
    const textRows = target.subarray((top + 2) * cols);
    const rows = GLYPH_HEIGHT;

    if (band.banner) {
      const w = textWidth(band.banner);
      drawText(textRows, cols, rows, Math.max(1, Math.round((cols - w) / 2)), 0, band.banner, 1);
      return;
    }
    const gen = String(band.generation);
    const genX = cols - 1 - textWidth(gen);
    const ruleEnd = drawText(textRows, cols, rows, 1, 0, band.rule, 1);
    drawText(textRows, cols, rows, genX, 0, gen, 1);
    this.writeTrace(textRows, ruleEnd + 3, genX - 4, band.trace);
  }

  /** La mini-courbe de population, de `x0` à `x1` inclus, la génération la plus récente à droite. */
  private writeTrace(rows: Float32Array, x0: number, x1: number, trace: PopulationTrace): void {
    const width = Math.min(x1 - x0 + 1, trace.count);
    if (width < 8) return;
    let min = Infinity;
    let max = -Infinity;
    for (let age = 0; age < width; age++) {
      const v = trace.at(age);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min;
    for (let age = 0; age < width; age++) {
      const v = trace.at(age);
      const h = span > 0 ? Math.round(((v - min) / span) * (GLYPH_HEIGHT - 1)) : 2;
      rows[(GLYPH_HEIGHT - 1 - h) * this.cols + x1 - age] = 0.8;
    }
  }

  private buildGapMask(w: number, h: number): void {
    const ctx = this.gapMask.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!this.gap) return;
    ctx.fillStyle = '#000';
    for (let x = 1; x <= this.cols; x++) ctx.fillRect(x * this.pitch - this.gap, 0, this.gap, h);
    for (let y = 1; y <= this.rows; y++) ctx.fillRect(0, y * this.pitch - this.gap, w, this.gap);
  }
}
