import { Network } from './network';
import type { Renderer } from './render';
import { Rider, Sim, SimEvent, Tram } from './sim';

const enum Mode {
  /** À quai : attiré par la station, repoussé par ses voisins. */
  Wait,
  /** Monte dans la rame : file vers elle puis disparaît. */
  Board,
  /** Arrivé : sort de la rame et s'éloigne en s'effaçant. */
  Leave,
  /** A abandonné : gris, il part à pied. */
  Walk,
}

interface Dot {
  rider: Rider | null;
  mode: Mode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Couleur (indice de ligne), -1 pour le gris des abandons. */
  color: number;
  station: number;
  tram: Tram | null;
  fx: number;
  fy: number;
  t: number;
  life: number;
  alpha: number;
}

const BOARD_TIME = 0.35;
const LEAVE_TIME = 0.7;
const WALK_TIME = 1.8;
const GREY = 'rgba(170, 170, 190, 0.85)';

/**
 * L'essaim : un point par groupe de 10 voyageurs. Les points à quai forment une nuée autour de leur station
 * (ressort vers le quai, répulsion entre voisins via une grille de hachage, un peu d'agitation). Les montées,
 * descentes et abandons sont de petites trajectoires animées en temps réel, quelle que soit la vitesse de la
 * simulation. Coordonnées en pixels CSS, celles du `Renderer`.
 */
export class Swarm {
  private readonly dots: Dot[] = [];
  private readonly byRider = new Map<number, Dot>();
  private readonly colors: string[];
  private readonly lineIndex = new Map<number, number>();
  private readonly grid = new Map<number, Dot[]>();
  private seed = 1;

  constructor(
    net: Network,
    private readonly renderer: Renderer,
  ) {
    this.colors = net.lines.map((l) => l.display);
    net.lines.forEach((l, i) => this.lineIndex.set(l.id, i));
  }

  get size(): number {
    return this.dots.length;
  }

  clear(): void {
    this.dots.length = 0;
    this.byRider.clear();
  }

  /** Recrée les nuées à partir de l'état de la simulation (après une avance rapide). */
  rebuild(sim: Sim): void {
    this.clear();
    const r = this.renderer;
    sim.waiting.forEach((lists, s) => {
      const n = lists.reduce((sum, l) => sum + l.length, 0);
      const radius = this.spacing * Math.sqrt(n) * 0.6;
      for (const list of lists) {
        for (const rider of list) {
          const a = this.random() * Math.PI * 2;
          const d = Math.sqrt(this.random()) * radius;
          this.addWait(rider, r.sx[s] + Math.cos(a) * d, r.sy[s] + Math.sin(a) * d, 1);
        }
      }
    });
  }

  /** Recale les points après un redimensionnement (ancienne et nouvelle échelle de la carte). */
  remap(map: (x: number, y: number) => { x: number; y: number }): void {
    for (const d of this.dots) {
      const p = map(d.x, d.y);
      d.x = p.x;
      d.y = p.y;
    }
  }

  private get spacing(): number {
    return 4.4 * this.renderer.unit;
  }

  private get radius(): number {
    return 1.85 * this.renderer.unit;
  }

  private random(): number {
    // Hasard visuel seulement (pas celui de la simulation) : xorshift.
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0 || 1;
    return this.seed / 4294967296;
  }

  private addWait(rider: Rider, x: number, y: number, alpha: number): Dot {
    const dot: Dot = {
      rider,
      mode: Mode.Wait,
      x,
      y,
      vx: 0,
      vy: 0,
      color: this.lineIndex.get(rider.legs[rider.leg].line)!,
      station: rider.station,
      tram: null,
      fx: x,
      fy: y,
      t: 0,
      life: 0,
      alpha,
    };
    this.dots.push(dot);
    this.byRider.set(rider.id, dot);
    return dot;
  }

  /** Traduit les événements de la simulation en mouvements de points. */
  consume(events: readonly SimEvent[]): void {
    const r = this.renderer;
    for (const e of events) {
      switch (e.kind) {
        case 'spawn': {
          const a = this.random() * Math.PI * 2;
          const d = 4 + this.random() * 6;
          const s = e.rider.station;
          this.addWait(e.rider, r.sx[s] + Math.cos(a) * d, r.sy[s] + Math.sin(a) * d, 0);
          break;
        }
        case 'board': {
          const dot = this.byRider.get(e.rider.id);
          if (!dot) break;
          dot.mode = Mode.Board;
          dot.tram = e.tram;
          dot.fx = dot.x;
          dot.fy = dot.y;
          dot.t = 0;
          this.byRider.delete(e.rider.id);
          break;
        }
        case 'alight': {
          const p = r.tramPoint(e.tram);
          if (e.transfer) {
            const dot = this.addWait(e.rider, p.x, p.y, 1);
            dot.vx = (this.random() - 0.5) * 40;
            dot.vy = (this.random() - 0.5) * 40;
          } else {
            const a = this.random() * Math.PI * 2;
            const speed = 8 + this.random() * 8;
            this.dots.push({
              rider: null,
              mode: Mode.Leave,
              x: p.x,
              y: p.y,
              vx: Math.cos(a) * speed,
              vy: Math.sin(a) * speed,
              color: this.lineIndex.get(e.tram.line.id)!,
              station: e.rider.station,
              tram: null,
              fx: p.x,
              fy: p.y,
              t: 0,
              life: LEAVE_TIME,
              alpha: 0.75,
            });
          }
          break;
        }
        case 'abandon':
        case 'evacuate': {
          const dot = this.byRider.get(e.rider.id);
          if (!dot) break;
          this.byRider.delete(e.rider.id);
          const s = dot.station;
          const dx = dot.x - r.sx[s];
          const dy = dot.y - r.sy[s];
          const len = Math.hypot(dx, dy) || 1;
          const speed = e.kind === 'evacuate' ? 30 : 10 + this.random() * 8;
          dot.mode = Mode.Walk;
          dot.rider = null;
          dot.color = e.kind === 'evacuate' ? dot.color : -1;
          dot.vx = (dx / len) * speed;
          dot.vy = (dy / len) * speed;
          dot.t = 0;
          dot.life = e.kind === 'evacuate' ? LEAVE_TIME : WALK_TIME;
          break;
        }
      }
    }
  }

  update(dt: number): void {
    const r = this.renderer;
    const spacing = this.spacing;
    const cell = spacing;
    const grid = this.grid;
    grid.clear();
    for (const d of this.dots) {
      if (d.mode !== Mode.Wait) continue;
      const key = ((Math.floor(d.x / cell) & 0xffff) << 16) | (Math.floor(d.y / cell) & 0xffff);
      const list = grid.get(key);
      if (list) list.push(d);
      else grid.set(key, [d]);
    }

    const damp = Math.exp(-dt * 6);
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.t += dt;
      switch (d.mode) {
        case Mode.Wait: {
          d.alpha = Math.min(1, d.alpha + dt * 4);
          const ax = r.sx[d.station] - d.x;
          const ay = r.sy[d.station] - d.y;
          let fx = ax * 9;
          let fy = ay * 9;
          // Répulsion des voisins (cellules 3 × 3).
          const gx = Math.floor(d.x / cell);
          const gy = Math.floor(d.y / cell);
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              const list = grid.get((((gx + ox) & 0xffff) << 16) | ((gy + oy) & 0xffff));
              if (!list) continue;
              for (const o of list) {
                if (o === d) continue;
                let dx = d.x - o.x;
                let dy = d.y - o.y;
                let dist2 = dx * dx + dy * dy;
                if (dist2 >= spacing * spacing) continue;
                if (dist2 < 1e-4) {
                  dx = this.random() - 0.5;
                  dy = this.random() - 0.5;
                  dist2 = 1e-4;
                }
                const dist = Math.sqrt(dist2);
                const push = ((spacing - dist) / spacing) * 900;
                fx += (dx / dist) * push;
                fy += (dy / dist) * push;
              }
            }
          }
          // Un peu d'agitation : une foule n'est jamais immobile.
          fx += (this.random() - 0.5) * 60;
          fy += (this.random() - 0.5) * 60;
          d.vx = (d.vx + fx * dt) * damp;
          d.vy = (d.vy + fy * dt) * damp;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          break;
        }
        case Mode.Board: {
          const f = Math.min(1, d.t / BOARD_TIME);
          const p = d.tram ? r.tramPoint(d.tram) : { x: d.fx, y: d.fy };
          const e = f * f * (3 - 2 * f);
          d.x = d.fx + (p.x - d.fx) * e;
          d.y = d.fy + (p.y - d.fy) * e;
          d.alpha = 1 - f * 0.6;
          if (f >= 1) this.dots.splice(i, 1);
          break;
        }
        case Mode.Leave:
        case Mode.Walk: {
          const f = d.t / d.life;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.alpha = Math.max(0, (d.mode === Mode.Leave ? 0.75 : 1) * (1 - f));
          if (f >= 1) this.dots.splice(i, 1);
          break;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const rad = this.radius;
    // Un chemin par couleur (et par palier d'opacité) : quelques milliers de points en une poignée d'appels.
    for (let c = -1; c < this.colors.length; c++) {
      for (const band of [1, 0.6, 0.3]) {
        ctx.beginPath();
        let any = false;
        for (const d of this.dots) {
          if (d.color !== c) continue;
          const a = d.alpha > 0.8 ? 1 : d.alpha > 0.45 ? 0.6 : 0.3;
          if (a !== band || d.alpha <= 0.02) continue;
          ctx.moveTo(d.x + rad, d.y);
          ctx.arc(d.x, d.y, rad, 0, Math.PI * 2);
          any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = band;
        ctx.fillStyle = c < 0 ? GREY : this.colors[c];
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
