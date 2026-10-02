/**
 * La scène, sur un canvas 2D, en couches. Ce qui ne bouge pas est dessiné une fois par mise en page
 * sur des calques : le sol et le décor, la piste au sol, puis ce qui passe au-dessus (pont et portique).
 * À chaque image on empile : sol, fils des manettes (ils passent sous la piste), piste, voitures au
 * sol, pont, voitures sur le pont. Les coordonnées du circuit sont celles de `Track` ; `Fit` les
 * projette en pixels.
 */
import { drawDecor } from './decor';
import { drawLino } from './floor';
import { CAR_SCALE, drawToyCar } from './paint';
import { JACKS, LANE_OFFSET, bridgeSpan, drawGround, drawLeds, drawOverhead } from './road';
import { Bridge, Fit, Loop, Point, Track, elevation } from './track';

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
  const jack = JACKS[player];
  return { x: jack.x * fit.scale + fit.tx, y: jack.y * fit.scale + fit.ty };
}

/** Points de contrôle du fil : il descend du bornier, file sous la piste et remonte dans la manette. */
export function wireCurve(w: Wire): [Point, Point, Point, Point] {
  const drop = Math.max(50, Math.abs(w.to.y - w.from.y) * 0.6);
  return [w.from, { x: w.from.x, y: w.from.y + drop }, { x: w.to.x, y: w.to.y - drop }, w.to];
}

/** Point d'une courbe de Bézier cubique. */
export function bezier([p0, p1, p2, p3]: readonly [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
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
  private fit: Fit = { scale: 1, tx: 0, ty: 0 };
  private circuit?: Circuit;
  private wires: readonly [Wire | null, Wire | null] = [null, null];

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
    this.wires = wires;
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

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawWires(frame.pulses);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.ground.canvas, 0, 0);

    this.toWorld(ctx);
    drawLeds(ctx, [PLAYER_LOOKS[0].color, PLAYER_LOOKS[1].color], frame.pressed);

    // Les voitures sur le pont passent par-dessus le tablier, les autres dessous.
    const [from, to] = bridgeSpan(bridge);
    const cars = ([0, 1] as const).map((i) => {
      const d = frame.distances[i] - CAR_SETBACK;
      const lap = ((d % track.length) + track.length) % track.length;
      return { i, d, high: lap >= from && lap <= to };
    });
    for (const car of cars) if (!car.high) this.drawCar(car.i, car.d);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.overhead.canvas, 0, 0);
    this.toWorld(ctx);
    for (const car of cars) if (car.high) this.drawCar(car.i, car.d);
  }

  private toWorld(ctx: CanvasRenderingContext2D): void {
    const { scale, tx, ty } = this.fit;
    ctx.setTransform(this.dpr * scale, 0, 0, this.dpr * scale, this.dpr * tx, this.dpr * ty);
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
    this.wires.forEach((wire, i) => {
      if (!wire) return;
      const look = PLAYER_LOOKS[i];
      const curve = wireCurve(wire);
      ctx.beginPath();
      ctx.moveTo(curve[0].x, curve[0].y);
      ctx.bezierCurveTo(curve[1].x, curve[1].y, curve[2].x, curve[2].y, curve[3].x, curve[3].y);
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
        const p = bezier(curve, 1 - pulse.t);
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
