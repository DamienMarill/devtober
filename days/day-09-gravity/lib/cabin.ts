import { G0 } from './config';
import { Rng } from './rng';

/**
 * La cabine, vue de côté, dans son propre repère : x vers le nez, y vers le plafond, en mètres. Rien n'y
 * est « attiré vers le bas » : chaque objet subit l'opposé de ce qui pousse l'avion (portance, traînée,
 * poussée). En palier, ça donne 1 g vers le plancher ; dans la ressource, 1,8 g ; en apesanteur, presque
 * rien, et chacun garde la vitesse qu'il avait.
 *
 * Des corps rigides : des disques (ballon, pomme, bulle d'eau, peluche, bonbons) et des capsules (les
 * passagers), avec rotation, chocs, frottement, et une main pour les attraper.
 */

export type BodyKind = 'person' | 'ball' | 'apple' | 'water' | 'plush' | 'candy';

export interface Body {
  id: number;
  kind: BodyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Angle (rad) et vitesse de rotation (rad/s). */
  a: number;
  w: number;
  r: number;
  /** Demi-longueur de l'axe d'une capsule (0 pour un disque). */
  half: number;
  m: number;
  I: number;
  e: number;
  mu: number;
  /** Une variante de dessin (couleur de combinaison, de bonbon…). */
  variant: number;
  /** Écrasement de la bulle d'eau (0 : sphère). */
  squash: number;
  /** Oscillation de la bulle après un choc. */
  wobble: number;
  /** Paroi touchée pendant ce pas (normale), et depuis combien de temps un passager y reste collé. */
  wallNx: number;
  wallNy: number;
  touching: boolean;
  rest: number;
}

export interface Grab {
  body: Body;
  /** Point saisi, dans le repère du corps. */
  lx: number;
  ly: number;
  tx: number;
  ty: number;
}

const DRAG = 0.12;
const SPIN_DRAG = 0.35;
const SUBSTEPS = 4;
const ITERATIONS = 3;

export class Cabin {
  readonly bodies: Body[] = [];
  /** L'accélération apparente dans la cabine (m/s²), dans ses axes. */
  ax = 0;
  ay = -G0;
  /** Vitesse de tangage de l'avion et sa dérivée, et le centre de gravité (supposé au milieu, au plancher). */
  q = 0;
  qDot = 0;
  private readonly pivotX: number;
  private readonly pivotY = 0;
  grab: Grab | null = null;
  private nextId = 1;
  private readonly rng: Rng;

  constructor(
    readonly width = 7.6,
    /** 2,3 m : la hauteur de la zone d'expérience de l'A310 (guide ESA). */
    readonly height = 2.3,
    seed = 9,
  ) {
    const rng = new Rng(seed);
    this.rng = rng;
    this.pivotX = width / 2;
    // Trois passagers allongés au plancher, comme on le fait pendant la ressource.
    [1.25, 3.85, 6.35].forEach((x, i) =>
      this.add('person', x, 0.23, {
        r: 0.22,
        half: 0.62,
        m: 75,
        e: 0.08,
        mu: 0.6,
        variant: i,
        a: i === 1 ? Math.PI : 0,
      }),
    );
    this.add('ball', 2.55, 0.11, { r: 0.11, m: 0.43, e: 0.72, mu: 0.4 });
    this.add('apple', 5.1, 0.045, { r: 0.045, m: 0.2, e: 0.35, mu: 0.5 });
    this.add('water', 2.95, 0.09, { r: 0.09, m: 3, e: 0.04, mu: 0.15 });
    this.add('plush', 5.45, 0.13, { r: 0.13, m: 0.25, e: 0.2, mu: 0.8 });
    for (let i = 0; i < 12; i++)
      this.add('candy', 0.3 + rng.range(0, 0.35) + (i % 2) * 6.7, 0.025, {
        r: 0.025,
        m: 0.012,
        e: 0.5,
        mu: 0.3,
        variant: i % 6,
        a: rng.range(0, 6),
      });
  }

  private add(
    kind: BodyKind,
    x: number,
    y: number,
    o: { r: number; m: number; e: number; mu: number; half?: number; variant?: number; a?: number },
  ): Body {
    const half = o.half ?? 0;
    const len = 2 * (half + o.r);
    const I = half > 0 ? (o.m * len * len) / 12 : 0.4 * o.m * o.r * o.r;
    const b: Body = {
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      a: o.a ?? 0,
      w: 0,
      r: o.r,
      half,
      m: o.m,
      I,
      e: o.e,
      mu: o.mu,
      variant: o.variant ?? 0,
      squash: 0,
      wobble: 0,
      wallNx: 0,
      wallNy: 0,
      touching: false,
      rest: 0,
    };
    this.bodies.push(b);
    return b;
  }

  /** La gravité apparente, d'après les facteurs de charge de l'avion (nx vers l'avant, nz vers le plafond). */
  setLoad(nx: number, nz: number): void {
    this.ax = -nx * G0;
    this.ay = -nz * G0;
  }

  /**
   * La rotation de l'avion : sa vitesse de tangage q (rad/s, positive nez en haut) et sa dérivée. Pendant la
   * parabole, l'avion bascule de +47° à −42° autour de son centre de gravité ; un objet libre, lui, garde son
   * orientation dans l'espace. Dans la cabine, ça se traduit par les forces d'inertie d'un repère tournant :
   * centrifuge, Coriolis et Euler (de l'ordre du millième de g), et une rotation apparente des objets.
   */
  setRotation(q: number, qDot: number): void {
    this.q = q;
    this.qDot = qDot;
  }

  /**
   * À l'injection, les passagers décollent du plancher d'une petite poussée (et un peu de rotation) ; les
   * vibrations de l'avion font décoller le reste, plus doucement.
   */
  pushOff(rng: Rng): void {
    for (const b of this.bodies) {
      if (b === this.grab?.body) continue;
      const person = b.kind === 'person';
      b.vy += person ? rng.range(0.06, 0.16) : rng.range(0.03, 0.12);
      b.vx += rng.range(-0.05, 0.05);
      b.w += person ? rng.range(-0.2, 0.2) : rng.range(-1.5, 1.5);
    }
  }

  step(dt: number): void {
    const h = dt / SUBSTEPS;
    for (const b of this.bodies) b.touching = false;
    for (let s = 0; s < SUBSTEPS; s++) {
      const { q, qDot } = this;
      for (const b of this.bodies) {
        // Repère tournant : centrifuge q²·r, Coriolis −2q×v, Euler −q̇×r ; et la rotation propre d'un objet
        // libre se conserve dans l'espace, donc vue de la cabine elle varie de −q̇.
        const rx = b.x - this.pivotX;
        const ry = b.y - this.pivotY;
        const vx = b.vx;
        const vy = b.vy;
        b.vx += (this.ax + q * q * rx + 2 * q * vy + qDot * ry) * h;
        b.vy += (this.ay + q * q * ry - 2 * q * vx - qDot * rx) * h;
        b.w -= qDot * h;
        const k = Math.exp(-DRAG * h);
        b.vx *= k;
        b.vy *= k;
        b.w *= Math.exp(-SPIN_DRAG * h);
      }
      if (this.grab) this.pull(this.grab, h);
      for (const b of this.bodies) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.a += b.w * h;
        b.squash *= Math.exp(-6 * h);
      }
      // Les parois en dernier : ce sont elles qui ont le dernier mot sur la position.
      for (let it = 0; it < ITERATIONS; it++) {
        this.pairs();
        for (const b of this.bodies) this.walls(b);
      }
    }
    for (const b of this.bodies) b.wobble *= Math.exp(-2.5 * dt);
    this.kickOff(dt);
  }

  /**
   * En apesanteur, un passager qui reste collé à une paroi s'en repousse doucement de la main, comme on le
   * fait à bord : la cabine ne finit pas avec tout le monde au plafond.
   */
  private kickOff(dt: number): void {
    const weightless = Math.hypot(this.ax, this.ay) < 0.15 * G0;
    for (const b of this.bodies) {
      if (b.kind !== 'person' || b === this.grab?.body) continue;
      b.rest = weightless && b.touching ? b.rest + dt : 0;
      if (b.rest < 0.6) continue;
      b.rest = 0;
      const push = this.rng.range(0.1, 0.22);
      b.vx += b.wallNx * push + this.rng.range(-0.05, 0.05);
      b.vy += b.wallNy * push + this.rng.range(-0.05, 0.05);
      b.w += this.rng.range(-0.25, 0.25);
    }
  }

  // ─────────────────────────────── la main

  /** Le corps sous le point (x, y), le plus petit d'abord (on attrape un bonbon devant un passager). */
  pick(x: number, y: number, slop: number): Body | null {
    let best: Body | null = null;
    for (const b of this.bodies) {
      const [px, py] = this.axisPoint(b, x, y);
      if (Math.hypot(x - px, y - py) <= b.r + slop && (!best || b.m < best.m)) best = b;
    }
    return best;
  }

  startGrab(b: Body, x: number, y: number): void {
    const c = Math.cos(-b.a);
    const s = Math.sin(-b.a);
    const dx = x - b.x;
    const dy = y - b.y;
    this.grab = { body: b, lx: dx * c - dy * s, ly: dx * s + dy * c, tx: x, ty: y };
  }

  moveGrab(x: number, y: number): void {
    if (!this.grab) return;
    this.grab.tx = Math.max(0, Math.min(this.width, x));
    this.grab.ty = Math.max(0, Math.min(this.height, y));
  }

  endGrab(): void {
    const b = this.grab?.body;
    this.grab = null;
    if (!b) return;
    // On lâche : l'objet garde sa vitesse (bornée, on n'est pas au lancer de poids).
    const v = Math.hypot(b.vx, b.vy);
    if (v > 4) {
      b.vx *= 4 / v;
      b.vy *= 4 / v;
    }
  }

  /** Un ressort amorti entre la main et le point saisi : il entraîne aussi la rotation. */
  private pull(g: Grab, h: number): void {
    const b = g.body;
    const c = Math.cos(b.a);
    const s = Math.sin(b.a);
    const rx = g.lx * c - g.ly * s;
    const ry = g.lx * s + g.ly * c;
    const px = b.x + rx;
    const py = b.y + ry;
    const pvx = b.vx - b.w * ry;
    const pvy = b.vy + b.w * rx;
    const stiff = 60;
    const damp = 2 * Math.sqrt(stiff) * 0.9;
    // Accélération voulue du point saisi, appliquée comme une force sur le corps.
    const fx = (stiff * (g.tx - px) - damp * pvx - this.ax) * b.m;
    const fy = (stiff * (g.ty - py) - damp * pvy - this.ay) * b.m;
    b.vx += (fx / b.m) * h;
    b.vy += (fy / b.m) * h;
    b.w += ((rx * fy - ry * fx) / b.I) * h * 0.5;
    b.w *= Math.exp(-4 * h);
  }

  // ─────────────────────────────── contacts

  /** Les deux bouts de l'axe d'un corps (confondus pour un disque). */
  private ends(b: Body): [number, number, number, number] {
    const c = Math.cos(b.a) * b.half;
    const s = Math.sin(b.a) * b.half;
    return [b.x - c, b.y - s, b.x + c, b.y + s];
  }

  /** Le point de l'axe le plus proche de (x, y). */
  private axisPoint(b: Body, x: number, y: number): [number, number] {
    if (b.half === 0) return [b.x, b.y];
    const [ax, ay, bx, by] = this.ends(b);
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return [ax + dx * t, ay + dy * t];
  }

  private walls(b: Body): void {
    const [ax, ay, bx, by] = this.ends(b);
    const pts = b.half > 0 ? [ax, ay, bx, by] : [b.x, b.y];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (y - b.r < 0) this.wallHit(b, x, y, 0, 1, b.r - y);
      if (y + b.r > this.height) this.wallHit(b, x, y, 0, -1, y + b.r - this.height);
      if (x - b.r < 0) this.wallHit(b, x, y, 1, 0, b.r - x);
      if (x + b.r > this.width) this.wallHit(b, x, y, -1, 0, x + b.r - this.width);
    }
  }

  /** Contact d'un bout de corps (cx, cy) avec une paroi de normale (nx, ny). */
  private wallHit(b: Body, cx: number, cy: number, nx: number, ny: number, depth: number): void {
    b.x += nx * depth;
    b.y += ny * depth;
    b.touching = true;
    b.wallNx = nx;
    b.wallNy = ny;
    // Point de contact par rapport au centre du corps.
    const rx = cx - nx * b.r - b.x;
    const ry = cy - ny * b.r - b.y;
    this.impulse(b, null, rx, ry, 0, 0, nx, ny);
  }

  private pairs(): void {
    const list = this.bodies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        const reach = A.r + B.r + A.half + B.half;
        if (Math.abs(A.x - B.x) > reach || Math.abs(A.y - B.y) > reach) continue;
        // Points les plus proches des deux axes (méthode des segments).
        const [pa, pb] = this.closestAxes(A, B);
        let nx = pb[0] - pa[0];
        let ny = pb[1] - pa[1];
        const d = Math.hypot(nx, ny);
        const sum = A.r + B.r;
        if (d >= sum) continue;
        if (d < 1e-9) {
          nx = 0;
          ny = 1;
        } else {
          nx /= d;
          ny /= d;
        }
        // Séparation, partagée selon les masses.
        const depth = sum - d;
        const wa = B.m / (A.m + B.m);
        A.x -= nx * depth * wa;
        A.y -= ny * depth * wa;
        B.x += nx * depth * (1 - wa);
        B.y += ny * depth * (1 - wa);
        const cx = pa[0] + nx * A.r;
        const cy = pa[1] + ny * A.r;
        this.impulse(A, B, cx - A.x, cy - A.y, cx - B.x, cy - B.y, -nx, -ny);
      }
    }
  }

  private closestAxes(A: Body, B: Body): [[number, number], [number, number]] {
    if (A.half === 0 && B.half === 0)
      return [
        [A.x, A.y],
        [B.x, B.y],
      ];
    if (A.half === 0) return [[A.x, A.y], this.axisPoint(B, A.x, A.y)];
    if (B.half === 0) return [this.axisPoint(A, B.x, B.y), [B.x, B.y]];
    // Deux capsules : on part du milieu de B, puis on alterne deux projections (assez précis ici).
    let pb = this.axisPoint(B, A.x, A.y);
    let pa = this.axisPoint(A, pb[0], pb[1]);
    pb = this.axisPoint(B, pa[0], pa[1]);
    pa = this.axisPoint(A, pb[0], pb[1]);
    return [pa, pb];
  }

  /**
   * Impulsion de contact entre `a` et `b` (ou une paroi si `b` est nul), normale (nx, ny) dirigée vers `a`.
   * Restitution seulement pour les vrais chocs (sinon tout tremble au repos), frottement de Coulomb.
   */
  private impulse(
    a: Body,
    b: Body | null,
    rax: number,
    ray: number,
    rbx: number,
    rby: number,
    nx: number,
    ny: number,
  ): void {
    let vx = a.vx - a.w * ray;
    let vy = a.vy + a.w * rax;
    if (b) {
      vx -= b.vx - b.w * rby;
      vy -= b.vy + b.w * rbx;
    }
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return;
    const e = vn < -0.35 ? (b ? Math.min(a.e, b.e) : a.e) : 0;
    const ran = rax * ny - ray * nx;
    let k = 1 / a.m + (ran * ran) / a.I;
    let rbn = 0;
    if (b) {
      rbn = rbx * ny - rby * nx;
      k += 1 / b.m + (rbn * rbn) / b.I;
    }
    const jn = (-(1 + e) * vn) / k;
    this.apply(a, b, rax, ray, rbx, rby, nx * jn, ny * jn);

    // Frottement : on freine le glissement au point de contact, dans la limite de μ·jn.
    const tx = -ny;
    const ty = nx;
    const vt = vx * tx + vy * ty;
    const rat = rax * ty - ray * tx;
    let kt = 1 / a.m + (rat * rat) / a.I;
    if (b) {
      const rbt = rbx * ty - rby * tx;
      kt += 1 / b.m + (rbt * rbt) / b.I;
    }
    const mu = b ? Math.sqrt(a.mu * b.mu) : a.mu;
    const jt = Math.max(-mu * jn, Math.min(mu * jn, -vt / kt));
    this.apply(a, b, rax, ray, rbx, rby, tx * jt, ty * jt);

    // La bulle d'eau s'écrase et tremble quand elle prend un coup.
    const hit = Math.abs(jn);
    for (const body of b ? [a, b] : [a])
      if (body.kind === 'water') {
        body.squash = Math.min(0.45, body.squash + (hit / body.m) * 0.25);
        body.wobble = Math.min(0.3, body.wobble + (hit / body.m) * 0.15);
      }
  }

  private apply(
    a: Body,
    b: Body | null,
    rax: number,
    ray: number,
    rbx: number,
    rby: number,
    jx: number,
    jy: number,
  ): void {
    a.vx += jx / a.m;
    a.vy += jy / a.m;
    a.w += (rax * jy - ray * jx) / a.I;
    if (b) {
      b.vx -= jx / b.m;
      b.vy -= jy / b.m;
      b.w -= (rbx * jy - rby * jx) / b.I;
    }
  }
}
