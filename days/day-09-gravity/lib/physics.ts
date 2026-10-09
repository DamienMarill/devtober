import { Board, Sensor, SensorKind, WindmillDef } from './board';
import { CONFIG } from './config';
import { Material, Shape, bounds, closest, deg, inRect } from './geometry';
import { Rng } from './rng';

/**
 * Le moteur : des billes d'acier de 11 mm sous une gravité réelle, en sous-pas assez fins pour qu'aucune ne
 * traverse un clou. Pas de bibliothèque : des cercles, des capsules et des arcs, des chocs avec restitution et
 * frottement, et le roulement (5/7 de g le long des pentes, comme une sphère pleine).
 */

const P = CONFIG.physics;
const RB = P.ballRadius;
const CELL = 16;
const EXTENT = 240;
const COLS = Math.ceil((EXTENT * 2) / CELL);

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Normale de l'appui en cours (roulement), nulle en vol. */
  nx: number;
  ny: number;
  rolling: boolean;
  /** A quitté le couloir de lancement (sinon, une bille qui retombe est une « fausse balle »). */
  escaped: boolean;
  /** Secondes depuis le dernier contact avec la scène (Infinity : pas sur la scène). */
  stage: number;
  /** Dans le tube de la ワープ : progression de 0 à 1, ou -1. */
  warp: number;
  /** Rotation de la bille, pour le reflet qui tourne. */
  spin: number;
  /** Déjà passée par le portillon de droite. */
  right: boolean;
  /** Secondes passées immobile (une bille coincée finit secouée, comme par les vibrations du meuble). */
  still: number;
  dead: boolean;
}

export type SimEvent =
  | { kind: 'hit'; x: number; y: number; speed: number; mat: 'nail' | 'other' }
  | { kind: 'sensor'; sensor: SensorKind; ball: Ball }
  | { kind: 'foul'; ball: Ball }
  | { kind: 'warp'; ball: Ball }
  | { kind: 'stage-drop'; center: boolean; x: number };

export interface Windmill extends WindmillDef {
  angle: number;
  omega: number;
}

export class Sim {
  balls: Ball[] = [];
  g = 9807;
  doorOpen = false;
  readonly windmills: Windmill[];
  readonly events: SimEvent[] = [];
  /** Temps simulé (s). */
  time = 0;

  private readonly grid: number[][] = [];
  private readonly shapes: Shape[];
  private readonly sensors: Sensor[];
  private readonly tmp = new Float64Array(2);
  private nextId = 1;
  private readonly launchAt: [number, number];
  private readonly launchDir: [number, number];

  constructor(
    readonly board: Board,
    private readonly rng: Rng,
  ) {
    this.shapes = [...board.shapes];
    // L'axe de chaque moulin est un clou un peu plus gros.
    for (const w of board.windmills)
      this.shapes.push({ kind: 'pin', x: w.x, y: w.y, r: 1.6, mat: CONFIG.materials.plastic });
    this.sensors = board.sensors;
    this.windmills = board.windmills.map((w) => ({ ...w, angle: 0, omega: 0 }));

    for (let i = 0; i < COLS * COLS; i++) this.grid.push([]);
    const pad = RB + 2;
    this.shapes.forEach((s, index) => {
      const [x0, y0, x1, y1] = bounds(s);
      const c0 = this.cell(x0 - pad);
      const c1 = this.cell(x1 + pad);
      const r0 = this.cell(y0 - pad);
      const r1 = this.cell(y1 + pad);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.grid[r * COLS + c].push(index);
    });

    const a = deg(CONFIG.board.launchAngle);
    const R = (CONFIG.board.inner + CONFIG.board.outer) / 2;
    this.launchAt = [Math.cos(a) * R, Math.sin(a) * R];
    // Tangente dans le sens des angles croissants : vers le haut, le long du rail.
    this.launchDir = [-Math.sin(a), Math.cos(a)];
  }

  private cell(v: number): number {
    return Math.max(0, Math.min(COLS - 1, Math.floor((v + EXTENT) / CELL)));
  }

  /** Le marteau frappe une bille au bas du couloir. */
  launch(speed: number): Ball {
    const s = speed * (1 + this.rng.gauss() * CONFIG.launcher.jitter);
    const ball: Ball = {
      id: this.nextId++,
      x: this.launchAt[0],
      y: this.launchAt[1],
      vx: this.launchDir[0] * s,
      vy: this.launchDir[1] * s,
      nx: 0,
      ny: 0,
      rolling: false,
      escaped: false,
      stage: Infinity,
      warp: -1,
      spin: 0,
      right: false,
      still: 0,
      dead: false,
    };
    this.balls.push(ball);
    return ball;
  }

  /** Avance de `dt` secondes, en sous-pas adaptés à la bille la plus rapide. */
  step(dt: number): void {
    let vmax = 0;
    for (const b of this.balls) if (b.warp < 0) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
    for (const w of this.windmills)
      vmax = Math.max(vmax, Math.abs(w.omega) * w.length * 0.5);
    const n = Math.min(P.maxSubsteps, Math.max(1, Math.ceil((vmax * dt) / P.maxTravel)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
    this.time += dt;

    // Le tube de la ワープ, puis la scène.
    const S = CONFIG.stage;
    for (const b of this.balls) {
      if (b.warp >= 0) {
        b.warp += dt / S.warpDelay;
        if (b.warp >= 1) this.exitWarp(b);
        continue;
      }
      if (Math.hypot(b.vx, b.vy) < 12) {
        b.still += dt;
        if (b.still > 0.8) {
          b.still = 0;
          const a = this.rng.range(-Math.PI, 0);
          b.vx += Math.cos(a) * 140;
          b.vy += Math.sin(a) * 140;
        }
      } else b.still = 0;
      if (b.stage < 0.12) {
        b.stage += dt;
        const speed = Math.hypot(b.vx, b.vy);
        const slow = Math.max(0, 1 - speed / S.slowSpeed);
        const rate = S.dropRate + (S.dropRateSlow - S.dropRate) * slow;
        if (this.rng.chance(rate * dt)) this.dropFromStage(b);
      }
    }
    if (this.balls.some((b) => b.dead)) this.balls = this.balls.filter((b) => !b.dead);
  }

  private exitWarp(b: Ball): void {
    const [x, y] = this.board.warpPath[this.board.warpPath.length - 1];
    b.warp = -1;
    b.x = x;
    b.y = y;
    b.vx = CONFIG.stage.warpSpeed * (0.85 + 0.3 * this.rng.float());
    b.vy = 20;
    b.stage = 0;
  }

  /**
   * La scène penche vers l'avant : la bille finit par tomber du bord, là où elle se trouve. En 2D, on la
   * fait réapparaître sous le cadre. Au centre, elle tombe pile au-dessus de la ヘソ.
   */
  private dropFromStage(b: Ball): void {
    const center = Math.abs(b.x) < CONFIG.stage.center;
    b.stage = Infinity;
    b.rolling = false;
    if (center) {
      b.x = this.rng.range(-2.4, 2.4);
      b.y = 84;
      b.vx = this.rng.range(-25, 25);
      b.vy = 90;
    } else {
      const x = Math.max(-84, Math.min(84, b.x));
      const ax = Math.abs(x);
      b.x = x;
      b.y = (ax < 22 ? 76 : ax < 60 ? 76 - ((ax - 22) / 38) * 5 : 71 - ((ax - 60) / 30) * 11) + RB + 2;
      b.vx *= 0.3;
      b.vy = 60;
    }
    this.events.push({ kind: 'stage-drop', center, x: b.x });
  }

  private substep(h: number): void {
    const g = this.g;
    const drag = Math.exp(-P.drag * h);
    for (const b of this.balls) {
      if (b.warp >= 0 || b.dead) continue;
      // La gravité : entière en vol ; en roulement, sa composante le long de la pente ne vaut que 5/7.
      let ax = 0;
      let ay = g;
      if (b.rolling) {
        const gn = g * b.ny;
        ax = b.nx * gn * (1 - P.rolling);
        ay = b.ny * gn * (1 - P.rolling) + g * P.rolling;
        // Résistance au roulement, à l'opposé de la vitesse tangentielle.
        const vt = b.vx * -b.ny + b.vy * b.nx;
        if (Math.abs(vt) > 1) {
          const dec = Math.min(Math.abs(vt) / h, P.rollResistance) * Math.sign(vt);
          ax -= -b.ny * dec;
          ay -= b.nx * dec;
        }
      }
      b.vx = (b.vx + ax * h) * drag;
      b.vy = (b.vy + ay * h) * drag;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.spin += (b.vx * h) / RB;

      b.rolling = false;
      this.collideStatic(b);
      this.collideWindmills(b);
      if (!b.escaped && this.leftChannel(b)) b.escaped = true;
      this.checkSensors(b);
      if (!(Math.abs(b.x) < EXTENT && Math.abs(b.y) < EXTENT)) b.dead = true;
    }
    this.collideBalls();
    for (const w of this.windmills) {
      w.angle += w.omega * h;
      w.omega *= Math.exp(-1.8 * h);
    }
  }

  private collideStatic(b: Ball): void {
    const list = this.grid[this.cell(b.y) * COLS + this.cell(b.x)];
    const out = this.tmp;
    for (const index of list) {
      const s = this.shapes[index];
      if (s.door && this.doorOpen) continue;
      closest(s, b.x, b.y, out);
      let dx = b.x - out[0];
      let dy = b.y - out[1];
      const reach = RB + s.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        dx = 0;
        dy = -1;
      } else {
        dx /= d;
        dy /= d;
      }
      b.x += dx * (reach - d);
      b.y += dy * (reach - d);
      this.respond(b, dx, dy, 0, 0, s.mat, s.kind === 'pin');
      if (s.stage) b.stage = 0;
    }
  }

  /**
   * Réponse à un contact de normale (nx, ny), contre une surface qui bouge à (sx, sy). Un choc rebondit avec
   * restitution et frottement ; un appui (vitesse normale faible) annule la vitesse normale et fait rouler.
   */
  private respond(
    b: Ball,
    nx: number,
    ny: number,
    sx: number,
    sy: number,
    mat: Material,
    nail: boolean,
  ): void {
    const rvx = b.vx - sx;
    const rvy = b.vy - sy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const tx = -ny;
    const ty = nx;
    const vt = rvx * tx + rvy * ty;
    if (-vn > P.restSpeed) {
      const dn = -(1 + mat.e) * vn;
      const dt = -Math.sign(vt) * Math.min(Math.abs(vt), mat.mu * dn);
      b.vx += nx * dn + tx * dt;
      b.vy += ny * dn + ty * dt;
      if (-vn > 150)
        this.events.push({ kind: 'hit', x: b.x, y: b.y, speed: -vn, mat: nail ? 'nail' : 'other' });
    } else {
      // Appui : on retire la vitesse normale. Si elle ne vient que de la courbure (rail), on garde la norme.
      const before = Math.hypot(rvx, rvy);
      let ux = rvx - nx * vn;
      let uy = rvy - ny * vn;
      if (-vn < 0.06 * before) {
        const after = Math.hypot(ux, uy);
        if (after > 0) {
          ux *= before / after;
          uy *= before / after;
        }
      }
      b.vx = ux + sx;
      b.vy = uy + sy;
      b.rolling = true;
      b.nx = nx;
      b.ny = ny;
    }
  }

  /** Sortie du couloir : la bille est passée sous le rail intérieur, ou au-delà de son bout. */
  private leftChannel(b: Ball): boolean {
    const r = Math.hypot(b.x, b.y);
    if (r < CONFIG.board.inner - 2) return true;
    const a = (Math.atan2(b.y, b.x) * 180) / Math.PI;
    return a < 0 && a > CONFIG.board.tip - 360 + 4;
  }

  private collideWindmills(b: Ball): void {
    for (const w of this.windmills) {
      const ddx = b.x - w.x;
      const ddy = b.y - w.y;
      const reach = w.length + RB + 1;
      if (ddx * ddx + ddy * ddy > reach * reach) continue;
      for (let k = 0; k < w.blades; k++) {
        const a = w.angle + (k * Math.PI * 2) / w.blades;
        const ex = Math.cos(a) * w.length;
        const ey = Math.sin(a) * w.length;
        // Point le plus proche sur la pale (segment de l'axe au bout).
        let t = (ddx * ex + ddy * ey) / (w.length * w.length);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ex * t;
        const py = ey * t;
        let nx = ddx - px;
        let ny = ddy - py;
        const d = Math.hypot(nx, ny);
        const r = RB + 0.9;
        if (d >= r || d < 1e-6) continue;
        nx /= d;
        ny /= d;
        b.x += nx * (r - d);
        b.y += ny * (r - d);
        // Vitesse de la pale au point de contact, et impulsion partagée avec le moulin.
        const sx = -w.omega * py;
        const sy = w.omega * px;
        const vn = (b.vx - sx) * nx + (b.vy - sy) * ny;
        if (vn >= 0) continue;
        const cross = px * ny - py * nx;
        const j = (-(1 + 0.35) * vn) / (1 + (cross * cross) / w.inertia);
        b.vx += j * nx;
        b.vy += j * ny;
        w.omega -= (j * cross) / w.inertia;
      }
    }
  }

  private collideBalls(): void {
    const list = this.balls;
    const e = P.ballRestitution;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.warp >= 0 || a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.warp >= 0 || b.dead) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * RB * RB || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        const push = (2 * RB - d) / 2;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        const vn = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
        if (vn >= 0) continue;
        const jn = (-(1 + e) * vn) / 2;
        a.vx -= jn * dx;
        a.vy -= jn * dy;
        b.vx += jn * dx;
        b.vy += jn * dy;
        if (-vn > 150)
          this.events.push({ kind: 'hit', x: a.x, y: a.y, speed: -vn, mat: 'other' });
      }
    }
  }

  private checkSensors(b: Ball): void {
    for (const s of this.sensors) {
      if (!inRect(s.rect, b.x, b.y)) continue;
      switch (s.kind) {
        case 'right':
          if (!b.right) {
            b.right = true;
            this.events.push({ kind: 'sensor', sensor: 'right', ball: b });
          }
          break;
        case 'warp':
          b.warp = 0;
          b.rolling = false;
          this.events.push({ kind: 'warp', ball: b });
          return;
        case 'out':
          b.dead = true;
          this.events.push(b.escaped ? { kind: 'sensor', sensor: 'out', ball: b } : { kind: 'foul', ball: b });
          return;
        case 'attacker':
          if (!this.doorOpen && b.y < s.rect.y0 + 2) break;
          b.dead = true;
          this.events.push({ kind: 'sensor', sensor: s.kind, ball: b });
          return;
        default:
          b.dead = true;
          this.events.push({ kind: 'sensor', sensor: s.kind, ball: b });
          return;
      }
    }
  }

  /** Position d'une bille dans le tube de la ワープ (pour le dessin). */
  warpPoint(t: number): [number, number] {
    const path = this.board.warpPath;
    const seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
    const f = t * (path.length - 1) - seg;
    const [ax, ay] = path[seg];
    const [bx, by] = path[seg + 1];
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  }
}
