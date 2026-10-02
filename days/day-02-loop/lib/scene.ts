/**
 * La scène, sur un canvas 2D, en couches. Ce qui ne bouge pas est dessiné une fois par mise en page
 * sur des calques : le sol et le décor, la piste au sol, puis ce qui passe au-dessus (pont et portique).
 * À chaque image on empile : sol, piste, fils des manettes (ils traînent sur la piste), voitures au
 * sol, pont, voitures sur le pont. Les coordonnées du circuit sont celles de `Track` ; `Fit` les
 * projette en pixels.
 */
import { drawDecor } from './decor';
import { drawLino, seeded } from './floor';
import { CAR_SCALE, drawToyCar } from './paint';
import { JACKS, LANE_OFFSET, drawGround, drawLeds, drawOverhead, isOnBridge } from './road';
import { Bridge, Fit, Loop, Point, Track, elevation, project } from './track';

/** Durée du trajet d'une impulsion le long d'un fil, de la manette à la piste (secondes). */
export const PULSE_DURATION = 0.22;
/** Les voitures sont dessinées un peu en arrière de leur position : au départ, elles attendent derrière la ligne. */
const CAR_SETBACK = 20;
/** Côté de la voie de chaque joueur : le joueur 1 à gauche de la route (dans le sens de la course). */
const LANE_SIDE: readonly [number, number] = [-1, 1];
/** Côté d'une dalle de lino, en unités du circuit. */
const TILE = 58;

export interface PlayerLook {
  color: string;
  glow: string;
}

export const PLAYER_LOOKS: readonly [PlayerLook, PlayerLook] = [
  { color: '#e5383b', glow: '#ff8a8c' },
  { color: '#1c7ed6', glow: '#74c0fc' },
];

/** Un fil : de la prise du bornier (`from`, en pixels) à la manette (`to`, en pixels). */
export interface Wire {
  from: Point;
  to: Point;
}

/** Impulsion électrique en route sur un fil : `t` va de 0 (manette) à 1 (piste). */
export interface Pulse {
  player: 0 | 1;
  t: number;
}

export interface Circuit {
  track: Track;
  loops: readonly Loop[];
  bridge: Bridge;
}

export interface Frame {
  /** Distance de chaque voiture depuis le départ (tours compris). */
  distances: readonly [number, number];
  pulses: readonly Pulse[];
  /** Manettes enfoncées : le voyant du bornier s'allume. */
  pressed: readonly [boolean, boolean];
}

/** Position en pixels de la prise d'un joueur sur le bornier. */
export function plugPosition(fit: Fit, player: 0 | 1): Point {
  return project(fit, JACKS[player]);
}

/** Rayon du coude du fil, quand il passe de la descente verticale à la course horizontale (pixels). */
const WIRE_BEND = 70;

/**
 * Trajectoire de base du fil, hors de la piste : il descend droit du bornier dans le creux sous le
 * croisement, tourne dans le couloir sous le circuit, puis file à l'horizontale jusqu'à la manette.
 * Points répartis à intervalles réguliers le long du fil.
 */
export function wireBase(w: Wire, steps: number): Point[] {
  const dx = w.to.x - w.from.x;
  const dy = w.to.y - w.from.y;
  const r = Math.min(WIRE_BEND, Math.abs(dx), Math.abs(dy));
  const corner = { x: w.from.x, y: w.to.y };
  const before = { x: corner.x, y: corner.y - Math.sign(dy) * r };
  const after = { x: corner.x + Math.sign(dx) * r, y: corner.y };

  const dense: Point[] = [w.from, before];
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    dense.push({
      x: u * u * before.x + 2 * u * t * corner.x + t * t * after.x,
      y: u * u * before.y + 2 * u * t * corner.y + t * t * after.y,
    });
  }
  dense.push(after, w.to);

  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  }
  const total = lengths[lengths.length - 1];
  const out: Point[] = [];
  let k = 1;
  for (let i = 0; i <= steps; i++) {
    const target = (total * i) / steps;
    while (k < dense.length - 1 && lengths[k] < target) k++;
    const span = lengths[k] - lengths[k - 1] || 1;
    const f = (target - lengths[k - 1]) / span;
    out.push({
      x: dense[k - 1].x + (dense[k].x - dense[k - 1].x) * f,
      y: dense[k - 1].y + (dense[k].y - dense[k - 1].y) * f,
    });
  }
  return out;
}

/** Nombre de segments d'un fil. */
const WIRE_STEPS = 72;

/**
 * Le fil tel qu'il traîne sur le sol : la trajectoire de base, déformée par des ondulations irrégulières
 * (quelques sinusoïdes de fréquences et de phases tirées au hasard, nulles aux deux bouts). La graine fixe
 * la forme : elle ne bouge pas d'une mise en page à l'autre.
 */
export function wirePath(w: Wire, seed: number): Point[] {
  const random = seeded(seed);
  const length = Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y);
  const waves = [0, 1, 2].map((k) => ({
    cycles: 1.2 + k * 1.3 + random() * 1.1,
    phase: random() * Math.PI * 2,
    amplitude: (1 - k * 0.28) * (0.5 + random() * 0.5),
  }));
  const reach = Math.min(22, 8 + length * 0.04);
  const base = wireBase(w, WIRE_STEPS);
  return base.map((p, i) => {
    const t = i / WIRE_STEPS;
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(WIRE_STEPS, i + 1)];
    const norm = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Normale au fil, et un décalage qui s'éteint aux extrémités (le fil reste branché).
    const nx = -(b.y - a.y) / norm;
    const ny = (b.x - a.x) / norm;
    const envelope = Math.sin(Math.PI * t) ** 0.6;
    const offset =
      envelope *
      reach *
      waves.reduce((sum, wave) => sum + wave.amplitude * Math.sin(wave.cycles * Math.PI * 2 * t + wave.phase), 0);
    return { x: p.x + nx * offset, y: p.y + ny * offset };
  });
}

/** Point d'un fil échantillonné (`t` de 0 au bornier à 1 à la manette). */
function along(path: readonly Point[], t: number): Point {
  const f = Math.min(Math.max(t, 0), 1) * (path.length - 1);
  const i = Math.min(Math.floor(f), path.length - 2);
  const k = f - i;
  return {
    x: path[i].x + (path[i + 1].x - path[i].x) * k,
    y: path[i].y + (path[i + 1].y - path[i].y) * k,
  };
}

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function layer(): Layer {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d')! };
}

export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly floor = layer();
  private readonly ground = layer();
  private readonly overhead = layer();
  private dpr = 1;
  private width = 0;
  private height = 0;
  private fit: Fit = { scale: 1, tx: 0, ty: 0, angle: 0 };
  private circuit?: Circuit;
  private wirePaths: readonly (readonly Point[] | null)[] = [null, null];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Nouvelle mise en page : taille de l'écran, projection du circuit, fils. Redessine les calques. */
  layout(
    width: number,
    height: number,
    circuit: Circuit,
    fit: Fit,
    wires: readonly [Wire | null, Wire | null],
  ): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.fit = fit;
    this.circuit = circuit;
    this.wirePaths = wires.map((wire, i) => (wire ? wirePath(wire, 11 + i * 17) : null));
    for (const c of [this.canvas, this.floor.canvas, this.ground.canvas, this.overhead.canvas]) {
      c.width = Math.round(width * this.dpr);
      c.height = Math.round(height * this.dpr);
    }

    const floor = this.floor.ctx;
    floor.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawLino(floor, width, height, TILE * fit.scale, { x: fit.tx, y: fit.ty });
    this.toWorld(floor);
    drawDecor(floor);

    this.toWorld(this.ground.ctx);
    drawGround(this.ground.ctx, circuit.track, circuit.loops);

    this.toWorld(this.overhead.ctx);
    drawOverhead(this.overhead.ctx, circuit.track, circuit.bridge);
  }

  draw(frame: Frame): void {
    const { ctx, circuit } = this;
    if (!circuit) return;
    const { track, bridge } = circuit;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.floor.canvas, 0, 0);

    ctx.drawImage(this.ground.canvas, 0, 0);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawWires(frame.pulses);

    this.toWorld(ctx);
    drawLeds(ctx, [PLAYER_LOOKS[0].color, PLAYER_LOOKS[1].color], frame.pressed);

    // Les voitures sur le pont passent par-dessus le tablier, les autres dessous.
    const cars = ([0, 1] as const).map((i) => {
      const d = frame.distances[i] - CAR_SETBACK;
      return { i, d, high: isOnBridge(bridge, track.length, d) };
    });
    for (const car of cars) if (!car.high) this.drawCar(car.i, car.d);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.overhead.canvas, 0, 0);
    this.toWorld(ctx);
    for (const car of cars) if (car.high) this.drawCar(car.i, car.d);
  }

  private toWorld(ctx: CanvasRenderingContext2D): void {
    const { scale, tx, ty, angle } = this.fit;
    const cos = this.dpr * scale * Math.cos(angle);
    const sin = this.dpr * scale * Math.sin(angle);
    ctx.setTransform(cos, sin, -sin, cos, this.dpr * tx, this.dpr * ty);
  }

  private drawCar(player: 0 | 1, distance: number): void {
    const { ctx } = this;
    const { track, bridge } = this.circuit!;
    const pose = track.offsetAt(distance, LANE_SIDE[player] * LANE_OFFSET);
    const h = elevation(bridge, track.length, distance);
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    // Sur le pont, la voiture est plus près de l'œil (un peu plus grande) et son ombre tombe plus loin.
    const zoom = CAR_SCALE * (1 + h * 0.1);
    ctx.scale(zoom, zoom);
    drawToyCar(ctx, { body: PLAYER_LOOKS[player].color, number: player + 1 }, 3 + h * 22);
    ctx.restore();
  }

  private drawWires(pulses: readonly Pulse[]): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.wirePaths.forEach((path, i) => {
      if (!path) return;
      const look = PLAYER_LOOKS[i];
      ctx.beginPath();
      path.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      // Ombre au sol, gaine sombre, puis le fil coloré.
      ctx.shadowColor = 'rgba(80, 58, 30, 0.35)';
      ctx.shadowBlur = 3 * this.dpr;
      ctx.shadowOffsetX = 1.5 * this.dpr;
      ctx.shadowOffsetY = 2.5 * this.dpr;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#2b2b31';
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 3;
      ctx.strokeStyle = look.color;
      ctx.stroke();

      // Les impulsions remontent le fil, de la manette vers le bornier.
      for (const pulse of pulses) {
        if (pulse.player !== i) continue;
        const p = along(path, 1 - pulse.t);
        ctx.shadowColor = look.glow;
        ctx.shadowBlur = 10 * this.dpr;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  }
}
