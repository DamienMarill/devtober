/**
 * Dessin de la scène sur un canvas 2D : la piste (route, rails, ligne d'arrivée, bornier), les deux
 * voitures, et les fils qui relient le bornier aux deux manettes (des boutons HTML, dont on reçoit la
 * position en pixels). Les coordonnées du circuit sont celles de `Track` ; `Fit` les projette en pixels.
 */
import type { Fit, Point, Pose, Track } from './track';

/** Largeur de la route, dans les unités du circuit. */
export const ROAD_WIDTH = 46;
/** Écart entre un rail et le milieu de la route. */
export const LANE_OFFSET = 11.5;
/** Distance (depuis le départ) du bornier où se branchent les fils. */
export const PLUG_DISTANCE = 95;
/** Les voitures sont dessinées un peu en arrière de leur position : au départ, elles attendent derrière la ligne. */
const CAR_SETBACK = 17;
/** Durée du trajet d'une impulsion le long d'un fil, de la manette à la piste (secondes). */
export const PULSE_DURATION = 0.22;

export interface PlayerLook {
  color: string;
  glow: string;
}

export const PLAYER_LOOKS: readonly [PlayerLook, PlayerLook] = [
  { color: '#ff4d5a', glow: '#ff8a93' },
  { color: '#39b6ff', glow: '#92d9ff' },
];

/** Côté du rail de chaque joueur : le joueur 1 à gauche de la route (dans le sens de la course). */
export const LANE_SIDE: readonly [number, number] = [-1, 1];

/** Un fil : de la prise sur la piste (`from`, en pixels) à la manette (`to`, en pixels). */
export interface Wire {
  from: Point;
  to: Point;
}

/** Impulsion électrique en route sur un fil : `t` va de 0 (manette) à 1 (piste). */
export interface Pulse {
  player: 0 | 1;
  t: number;
}

export interface SceneState {
  track: Track;
  fit: Fit;
  /** Distance de chaque voiture depuis le départ (tours compris). */
  distances: readonly [number, number];
  wires: readonly [Wire | null, Wire | null];
  pulses: readonly Pulse[];
  /** Manettes enfoncées (le fil s'éclaire). */
  pressed: readonly [boolean, boolean];
}

const ROAD = '#1c1a33';
const CURB = '#4b4879';
const SLOT = '#0a0918';

function polyline(ctx: CanvasRenderingContext2D, points: readonly Point[], close: boolean): void {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}

/** Position en pixels de la prise d'un joueur sur le bornier (au bord extérieur de la route). */
export function plugPosition(track: Track, fit: Fit, player: 0 | 1): Point {
  const pose = track.offsetAt(PLUG_DISTANCE + (player ? 14 : -14), ROAD_WIDTH / 2 + 6);
  return { x: pose.x * fit.scale + fit.tx, y: pose.y * fit.scale + fit.ty };
}

/** Points de contrôle du fil : il tombe de la prise, pend, et remonte dans la manette. */
function wireCurve(w: Wire): [Point, Point, Point, Point] {
  const drop = Math.max(60, Math.abs(w.to.y - w.from.y) * 0.55);
  return [w.from, { x: w.from.x, y: w.from.y + drop }, { x: w.to.x, y: w.to.y - drop * 0.8 }, w.to];
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

/** Trace un rectangle arrondi (sans le remplir). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  /** Rails et route, calculés une fois par circuit. */
  private lanes: Point[][] = [];
  private lanesFor: Track | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  draw(state: SceneState): void {
    const { ctx } = this;
    const { track, fit } = state;
    if (this.lanesFor !== track) {
      this.lanes = LANE_SIDE.map((side) => track.lane(side * LANE_OFFSET));
      this.lanesFor = track;
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawWires(state);

    ctx.save();
    ctx.transform(fit.scale, 0, 0, fit.scale, fit.tx, fit.ty);
    this.drawRoad(track);
    this.drawPlugs(track, state.pressed);
    for (const i of [0, 1] as const) {
      const pose = track.offsetAt(state.distances[i] - CAR_SETBACK, LANE_SIDE[i] * LANE_OFFSET);
      this.drawCar(pose, PLAYER_LOOKS[i]);
    }
    ctx.restore();
  }

  private drawRoad(track: Track): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Bordure claire, puis la route par-dessus : il ne reste de la bordure qu'un liseré de chaque côté.
    polyline(ctx, track.points, true);
    ctx.lineWidth = ROAD_WIDTH + 5;
    ctx.strokeStyle = CURB;
    ctx.stroke();
    ctx.lineWidth = ROAD_WIDTH;
    ctx.strokeStyle = ROAD;
    ctx.stroke();

    // Les deux rails (la rainure où s'accroche la voiture), chacun teinté de la couleur de son joueur.
    for (const i of [0, 1] as const) {
      polyline(ctx, this.lanes[i], true);
      ctx.lineWidth = 3;
      ctx.strokeStyle = SLOT;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = PLAYER_LOOKS[i].color;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Ligne de départ : damier en travers de la route.
    const start = track.poseAt(0);
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(start.angle);
    const cell = ROAD_WIDTH / 8;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#e8e6ff' : '#15132a';
        ctx.fillRect(-cell + col * cell, -ROAD_WIDTH / 2 + row * cell, cell, cell);
      }
    }
    ctx.restore();
  }

  /** Le bornier : une petite boîte au bord de la route, avec une prise par joueur. */
  private drawPlugs(track: Track, pressed: readonly [boolean, boolean]): void {
    const { ctx } = this;
    const base = track.offsetAt(PLUG_DISTANCE, ROAD_WIDTH / 2 + 1);
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.rotate(base.angle);
    roundRect(ctx, -24, -2, 48, 11, 2.5);
    ctx.fillStyle = '#2a2750';
    ctx.fill();
    ctx.strokeStyle = CURB;
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const i of [0, 1] as const) {
      const look = PLAYER_LOOKS[i];
      ctx.fillStyle = look.color;
      ctx.shadowColor = look.glow;
      ctx.shadowBlur = pressed[i] ? 10 : 0;
      roundRect(ctx, (i ? 14 : -14) - 5, 2, 10, 7, 1.5);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCar(pose: Pose, look: PlayerLook): void {
    const { ctx } = this;
    const length = 28;
    const width = 14;
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);

    // Halo au sol.
    ctx.shadowColor = look.glow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = look.color;
    roundRect(ctx, -length / 2, -width / 2, length, width, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Pare-brise et lunette arrière.
    ctx.fillStyle = 'rgba(10, 9, 24, 0.75)';
    roundRect(ctx, 1.5, -width / 2 + 2.5, 7, width - 5, 1.5);
    ctx.fill();
    roundRect(ctx, -9, -width / 2 + 2.5, 4.5, width - 5, 1.5);
    ctx.fill();

    // Phares.
    ctx.fillStyle = '#fff6c2';
    ctx.shadowColor = '#fff6c2';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(length / 2 - 2, -width / 2 + 3, 1.6, 0, Math.PI * 2);
    ctx.arc(length / 2 - 2, width / 2 - 3, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawWires(state: SceneState): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const i of [0, 1] as const) {
      const wire = state.wires[i];
      if (!wire) continue;
      const look = PLAYER_LOOKS[i];
      const curve = wireCurve(wire);
      ctx.beginPath();
      ctx.moveTo(curve[0].x, curve[0].y);
      ctx.bezierCurveTo(curve[1].x, curve[1].y, curve[2].x, curve[2].y, curve[3].x, curve[3].y);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = look.color;
      ctx.globalAlpha = state.pressed[i] ? 1 : 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Les impulsions remontent le fil, de la manette vers la piste.
      for (const pulse of state.pulses) {
        if (pulse.player !== i) continue;
        const p = bezier(curve, 1 - pulse.t);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = look.glow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
}
