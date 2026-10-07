import { CONFIG } from './config';
import { DEVIATIONS } from './deviations';
import { IncidentEngine } from './incidents';
import { Network, Path, project, segmentKey } from './network';
import { deviationSlow } from './plan';
import { Sim, Tram } from './sim';
import type { Swarm } from './swarm';

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Ping {
  station: number;
  color: string;
  t: number;
}

const BG = '#0b0830';
const NIGHT_INK = '#0e0a35';

/**
 * La carte du PC : un fond « écran de régulation » mis en cache (anneaux de la loupe, lignes décalées sur les
 * tronçons partagés, stations, étiquettes), puis à chaque image les foules, les rames et les alertes.
 * Coordonnées : `x`, `y` des stations en km « loupés », converties en pixels CSS par `scale` et `ox`, `oy`.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private width = 0;
  private height = 0;
  /** Zone de la carte (hors panneau) : les étiquettes n'en sortent pas. */
  private view: Viewport = { x: 0, y: 0, w: 0, h: 0 };
  private dpr = 1;
  scale = 1;
  private ox = 0;
  private oy = 0;
  /** Positions écran des stations. */
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  private selected: number | null = null;
  private dirty = true;
  private readonly pings: Ping[] = [];
  private clock = 0;
  /** Le plan dessiné (recalculé quand la version du réseau change). */
  private planVersion = -1;
  private unserved: { path: Path; k: number }[] = [];
  private deviated: { path: Path; k: number }[] = [];
  private provisional: { station: number; colors: string[] }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly net: Network,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.sx = new Float32Array(net.stations.length);
    this.sy = new Float32Array(net.stations.length);
  }

  /** Taille du canvas et zone libre pour la carte (hors panneau), en pixels CSS. */
  resize(width: number, height: number, dpr: number, view: Viewport): void {
    this.width = width;
    this.height = height;
    this.view = view;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.layer.width = this.canvas.width;
    this.layer.height = this.canvas.height;
    const b = this.net.bounds;
    // De la marge pour les étiquettes des terminus, surtout sur les côtés.
    const pad = Math.max(18, Math.min(view.w, view.h) * 0.05);
    const padX = Math.min(pad + 48, view.w * 0.14);
    this.scale = Math.max(
      1,
      Math.min((view.w - padX * 2) / (b.maxX - b.minX), (view.h - pad * 2) / (b.maxY - b.minY)),
    );
    this.ox = view.x + view.w / 2 - ((b.minX + b.maxX) / 2) * this.scale;
    this.oy = view.y + view.h / 2 - ((b.minY + b.maxY) / 2) * this.scale;
    for (const s of this.net.stations) {
      this.sx[s.index] = this.ox + s.x * this.scale;
      this.sy[s.index] = this.oy + s.y * this.scale;
    }
    this.dirty = true;
  }

  select(line: number | null): void {
    if (line === this.selected) return;
    this.selected = line;
    this.dirty = true;
  }

  /** Un cercle qui s'élargit sur une station (alerte, événement). */
  ping(station: number, color: string): void {
    this.pings.push({ station, color, t: 0 });
  }

  /** Épaisseurs qui suivent l'échelle de la carte, dans des bornes lisibles. */
  get unit(): number {
    return Math.max(0.75, Math.min(1.6, this.scale / 110));
  }

  private get gap(): number {
    return 3.6 * this.unit;
  }

  /** La rame la plus proche du pointeur, à moins de 12 px (pour lui donner un ordre). */
  tramAt(x: number, y: number, trams: readonly Tram[]): Tram | null {
    let best: Tram | null = null;
    let bestD = 12 * 12;
    for (const t of trams) {
      const p = this.tramPoint(t);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** La station la plus proche du pointeur, à moins de 14 px. */
  stationAt(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = 14 * 14;
    for (let s = 0; s < this.sx.length; s++) {
      const d = (this.sx[s] - x) ** 2 + (this.sy[s] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Position écran d'une rame (décalage de sa ligne compris, et un peu à droite dans le sens de marche). */
  tramPoint(tram: Tram): { x: number; y: number; angle: number } {
    const path = tram.path;
    const n = path.stations.length;
    const k = tram.k;
    const k2 = path.loop ? (k + 1) % n : Math.min(k + 1, n - 1);
    const a = path.stations[k];
    const b = path.stations[k2];
    const p = tram.state === 'run' ? tram.p : 0;
    const g = this.gap;
    const ax = this.sx[a] + path.offsets[k * 2] * g;
    const ay = this.sy[a] + path.offsets[k * 2 + 1] * g;
    const bx = this.sx[b] + path.offsets[k2 * 2] * g;
    const by = this.sy[b] + path.offsets[k2 * 2 + 1] * g;
    let dx = bx - ax;
    let dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const side = 1.6 * this.unit;
    return {
      x: ax + (bx - ax) * p - dy * side,
      y: ay + (by - ay) * p + dx * side,
      angle: Math.atan2(dy, dx),
    };
  }

  // ------------------------------------------------------------ dessin

  draw(
    sim: Sim,
    swarm: Swarm,
    dt: number,
    hover: number | null,
    selectedTram: Tram | null = null,
  ): void {
    if (this.dirty) this.paintLayer();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.clock += dt;

    // La nuit tombe sur l'écran du PC (légèrement : c'est un écran, pas un ciel).
    const night = nightness(sim.time);
    if (night > 0) {
      ctx.fillStyle = `rgba(4, 2, 20, ${0.28 * night})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    this.paintPlan(sim);
    this.paintCrowdHalos(sim);
    swarm.draw(ctx);
    this.paintCortege(sim);
    this.paintTrams(sim, selectedTram);
    this.paintIncidents(sim);
    if (sim.slow > 1) this.paintRain();
    this.paintPings(dt);
    if (hover !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.sx[hover], this.sy[hover], 7 * this.unit, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Halo sous les foules : ambre quand ça s'accumule, rouge au-delà du seuil de saturation. */
  private paintCrowdHalos(sim: Sim): void {
    const ctx = this.ctx;
    for (let s = 0; s < this.sx.length; s++) {
      const n = sim.crowdAt(s);
      if (n < CONFIG.crowd.alert * 0.6) continue;
      const hot = Math.min(
        1,
        (n - CONFIG.crowd.alert * 0.6) / (CONFIG.crowd.saturated - CONFIG.crowd.alert * 0.6),
      );
      const r = (10 + Math.sqrt(n) * 2.6) * this.unit;
      const g = ctx.createRadialGradient(this.sx[s], this.sy[s], 0, this.sx[s], this.sy[s], r);
      const pulse = hot >= 1 ? 0.75 + 0.25 * Math.sin(this.clock * 6) : 1;
      const color = hot >= 1 ? '255, 70, 90' : '255, 170, 60';
      g.addColorStop(0, `rgba(${color}, ${0.32 * Math.max(0.3, hot) * pulse})`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.sx[s], this.sy[s], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintTrams(sim: Sim, selected: Tram | null): void {
    const ctx = this.ctx;
    const u = this.unit;
    for (const tram of sim.trams) {
      const { x, y, angle } = this.tramPoint(tram);
      const long = tram.line.capacity > CONFIG.tram.defaultCapacity;
      const len = (long ? 12 : 10) * u;
      const wid = 4.6 * u;
      const load = tram.riders.length / tram.line.capacity;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const dim = this.selected !== null && tram.line.id !== this.selected;
      ctx.globalAlpha = (tram.retire ? 0.45 : 1) * (dim ? 0.35 : 1);
      ctx.fillStyle = NIGHT_INK;
      roundRect(ctx, -len / 2 - 1, -wid / 2 - 1, len + 2, wid + 2, wid / 2 + 1);
      ctx.fill();
      ctx.fillStyle = tram.line.display;
      roundRect(ctx, -len / 2, -wid / 2, len, wid, wid / 2);
      if (tram.mode === 'deadhead') {
        // Haut-le-pied : une rame vide, juste le contour.
        ctx.strokeStyle = tram.line.display;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        ctx.fill();
      }
      // Jauge de remplissage : la part blanche avance de l'arrière vers l'avant.
      if (load > 0) {
        ctx.fillStyle = load >= 0.95 ? '#ffffff' : 'rgba(255,255,255,0.78)';
        const inner = (len - 2.4 * u) * Math.min(1, load);
        roundRect(
          ctx,
          -len / 2 + 1.2 * u,
          -wid / 2 + 1.2 * u,
          inner,
          wid - 2.4 * u,
          (wid - 2.4 * u) / 2,
        );
        ctx.fill();
      }
      if (tram.immobile > 0 && Math.sin(this.clock * 10) > 0) {
        ctx.strokeStyle = '#ff4d5e';
        ctx.lineWidth = 2;
        roundRect(ctx, -len / 2 - 2, -wid / 2 - 2, len + 4, wid + 4, wid / 2 + 2);
        ctx.stroke();
      }
      if (tram.order || tram.holdUntil > sim.time) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1.2;
        roundRect(ctx, -len / 2 - 2.5, -wid / 2 - 2.5, len + 5, wid + 5, wid / 2 + 2.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      if (tram === selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 11 * u, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (tram.immobile > 0)
        this.badge(x, y - 9 * u, tram.cause === 'illness' ? '+' : '!', '#ff4d5e');
    }
  }

  /** Le plan du joueur : tronçons sans service estompés, déviation en pointillés, stations coupées ou sautées. */
  private paintPlan(sim: Sim): void {
    if (sim.netVersion !== this.planVersion) this.measurePlan(sim);
    const ctx = this.ctx;
    const u = this.unit;
    const g = this.gap;
    const width = 3.4 * u;
    const point = (path: Path, k: number) => ({
      x: this.sx[path.stations[k]] + path.offsets[k * 2] * g,
      y: this.sy[path.stations[k]] + path.offsets[k * 2 + 1] * g,
    });
    const segment = (path: Path, k: number) => {
      const a = point(path, k);
      const b = point(path, (k + 1) % path.stations.length);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    };
    if (this.unserved.length) {
      ctx.strokeStyle = 'rgba(11, 8, 48, 0.78)';
      ctx.lineWidth = width + 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const { path, k } of this.unserved) segment(path, k);
      ctx.stroke();
    }
    for (const { path, k } of this.deviated) {
      const line = this.net.lines.find((l) => l.id === path.line)!;
      ctx.strokeStyle = line.display;
      ctx.lineWidth = width;
      ctx.setLineDash([5 * u, 4 * u]);
      ctx.lineDashOffset = -this.clock * 12;
      ctx.beginPath();
      segment(path, k);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const { station, colors } of this.provisional) {
      colors.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.sx[station], this.sy[station], (6.5 + i * 2.6) * u, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    for (let s = 0; s < this.sx.length; s++) {
      const x = this.sx[s];
      const y = this.sy[s];
      if (sim.plan.isCut(s)) {
        const r = 6 * u;
        ctx.fillStyle = 'rgba(255, 77, 94, 0.25)';
        ctx.strokeStyle = '#ff4d5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.moveTo(x - r * 0.7, y + r * 0.7);
        ctx.lineTo(x + r * 0.7, y - r * 0.7);
        ctx.stroke();
      } else if (sim.plan.isSkipped(s)) {
        ctx.fillStyle = BG;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(x, y, 4 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /** Ce qui a changé dans le plan : tronçons sans service, morceaux déviés, terminus provisoires. */
  private measurePlan(sim: Sim): void {
    this.planVersion = sim.netVersion;
    this.unserved = [];
    this.deviated = [];
    this.provisional = [];
    for (const line of this.net.lines) {
      const svc = sim.serviceOf(line.id);
      const served = new Set<string>();
      for (const p of svc.paths) {
        const n = p.loop ? p.stations.length : p.stations.length - 1;
        for (let k = 0; k < n; k++)
          served.add(segmentKey(p.stations[k], p.stations[(k + 1) % p.stations.length]));
        const dev = DEVIATIONS.find((d) => d.id === p.deviation);
        if (dev && p.dir === 1) {
          const edges = deviationSlow(this.net, dev).edges;
          for (let k = 0; k < n; k++) {
            if (edges.has(segmentKey(p.stations[k], p.stations[k + 1])))
              this.deviated.push({ path: p, k });
          }
        }
      }
      for (const p of line.paths) {
        if (p.dir !== 1) continue;
        const n = p.loop ? p.stations.length : p.stations.length - 1;
        for (let k = 0; k < n; k++) {
          if (!served.has(segmentKey(p.stations[k], p.stations[(k + 1) % p.stations.length]))) {
            this.unserved.push({ path: p, k });
          }
        }
      }
    }
    for (let s = 0; s < this.sx.length; s++) {
      const lines = sim.stationState(s).provisional;
      if (lines.length) {
        this.provisional.push({
          station: s,
          colors: lines.map((id) => this.net.lines.find((l) => l.id === id)!.display),
        });
      }
    }
  }

  /** Les imprévus sur la carte : stations bloquées ou évacuées, courant coupé, voiture sur la voie. */
  private paintIncidents(sim: Sim): void {
    const ctx = this.ctx;
    const u = this.unit;
    const obs = sim.obstructions;
    const pulse = 0.6 + 0.4 * Math.sin(this.clock * 5);
    for (const s of obs.stations) {
      const x = this.sx[s];
      const y = this.sy[s];
      const r = 11 * u;
      if (obs.frozen.has(s)) {
        this.badge(x + 8 * u, y - 8 * u, '⚡', '#ffd23f');
        continue;
      }
      ctx.strokeStyle = obs.closed.has(s)
        ? `rgba(255, 77, 94, ${pulse})`
        : `rgba(255, 170, 60, ${pulse})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (obs.closed.has(s)) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.55, y - r * 0.55);
        ctx.lineTo(x + r * 0.55, y + r * 0.55);
        ctx.moveTo(x + r * 0.55, y - r * 0.55);
        ctx.lineTo(x - r * 0.55, y + r * 0.55);
        ctx.stroke();
      } else {
        this.badge(x + 9 * u, y - 9 * u, '!', '#ffaa3c');
      }
    }
    for (const key of obs.edges) {
      const [a, b] = key.split('-').map(Number);
      const x = (this.sx[a] + this.sx[b]) / 2;
      const y = (this.sy[a] + this.sy[b]) / 2;
      // Une petite voiture rouge en travers de la voie.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(this.sy[b] - this.sy[a], this.sx[b] - this.sx[a]) + Math.PI / 2);
      ctx.fillStyle = `rgba(255, 77, 94, ${0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, 10 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4d5e';
      roundRect(ctx, -5 * u, -2.6 * u, 10 * u, 5.2 * u, 1.6 * u);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2.2 * u, -1.6 * u, 4.4 * u, 1.4 * u);
      ctx.fillStyle = NIGHT_INK;
      for (const wx of [-3 * u, 3 * u]) {
        ctx.beginPath();
        ctx.arc(wx, 2.8 * u, 1.2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Le cortège : un essaim de manifestants qui avance le long de son parcours, de la queue à la tête. */
  private paintCortege(sim: Sim): void {
    const engine = sim.incidents instanceof IncidentEngine ? sim.incidents : null;
    if (!engine) return;
    const ctx = this.ctx;
    const u = this.unit;
    for (const inc of engine.active) {
      if (inc.spec.kind !== 'cortege') continue;
      const route = inc.spec.stations;
      const arc = engine.arc(inc.spec.id);
      const total = arc[arc.length - 1];
      const at = (m: number) => {
        const d = Math.max(0, Math.min(total, m));
        let i = 0;
        while (i + 2 < arc.length && arc[i + 1] < d) i++;
        const f = (d - arc[i]) / Math.max(1, arc[i + 1] - arc[i]);
        const a = route[i];
        const b = route[i + 1];
        return {
          x: this.sx[a] + (this.sx[b] - this.sx[a]) * f,
          y: this.sy[a] + (this.sy[b] - this.sy[a]) * f,
          nx: -(this.sy[b] - this.sy[a]),
          ny: this.sx[b] - this.sx[a],
        };
      };
      const head = Math.min(inc.head, total);
      const tail = Math.max(0, inc.tail);
      if (head <= tail) continue;
      const count = 140;
      ctx.fillStyle = 'rgba(255, 143, 200, 0.9)';
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const r1 = seed - Math.floor(seed);
        const r2 = Math.sin(i * 78.233) * 0.5 + 0.5;
        const p = at(tail + (head - tail) * r1);
        const len = Math.hypot(p.nx, p.ny) || 1;
        const spread = (r2 - 0.5) * 9 * u + Math.sin(this.clock * 3 + i) * 0.8 * u;
        const x = p.x + (p.nx / len) * spread;
        const y = p.y + (p.ny / len) * spread;
        ctx.moveTo(x + 1.6 * u, y);
        ctx.arc(x, y, 1.6 * u, 0, Math.PI * 2);
      }
      ctx.fill();
      const front = at(head);
      this.badge(front.x, front.y - 12 * u, '✊', '#ff8fc8');
    }
  }

  /** Pluie : de fines traînées en biais, discrètes (le ton reste sobre). */
  private paintRain(): void {
    const ctx = this.ctx;
    const v = this.view;
    ctx.strokeStyle = 'rgba(146, 217, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 140; i++) {
      const rx = Math.sin(i * 91.7) * 0.5 + 0.5;
      const ry = Math.sin(i * 37.3) * 0.5 + 0.5;
      const x = v.x + ((rx * v.w + this.clock * 40) % v.w);
      const y = v.y + ((ry * v.h + this.clock * 160) % v.h);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 12);
    }
    ctx.stroke();
  }

  /** Une pastille ronde avec un signe (incident). */
  private badge(x: number, y: number, glyph: string, color: string): void {
    const ctx = this.ctx;
    const r = 6 * this.unit;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NIGHT_INK;
    ctx.font = `800 ${Math.round(r * 1.5)}px Lato, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y + 0.5);
  }

  private paintPings(dt: number): void {
    const ctx = this.ctx;
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += dt;
      const f = p.t / 1.6;
      if (f >= 1) {
        this.pings.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - f;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.sx[p.station], this.sy[p.station], (8 + f * 34) * this.unit, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ couche fixe

  private paintLayer(): void {
    this.dirty = false;
    const ctx = this.layer.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = this.width;
    const h = this.height;
    const u = this.unit;

    // Fond : un écran de régulation bleu nuit, plus clair au centre.
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const cx = this.ox;
    const cy = this.oy;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
    glow.addColorStop(0, 'rgba(60, 52, 170, 0.35)');
    glow.addColorStop(1, 'rgba(60, 52, 170, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Les anneaux de la loupe : 1, 2, 4 et 8 km à vol d'oiseau de la Comédie.
    ctx.font = `500 ${Math.round(9 * u + 1)}px Lato, sans-serif`;
    ctx.textAlign = 'center';
    for (const km of [1, 2, 4, 8]) {
      const lens = CONFIG.map.lens;
      const north = project(lens.lat + km / 110.57, lens.lon);
      const r = Math.hypot(north.x, north.y) * this.scale;
      ctx.strokeStyle = 'rgba(146, 217, 255, 0.09)';
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(146, 217, 255, 0.28)';
      ctx.fillText(`${km} km`, cx, cy - r - 3);
    }

    // Les lignes : la ligne choisie par-dessus, les autres estompées.
    const order = [...this.net.lines].sort(
      (a, b) => Number(a.id === this.selected) - Number(b.id === this.selected),
    );
    const width = 3.4 * u;
    for (const line of order) {
      const dim = this.selected !== null && line.id !== this.selected;
      for (const path of line.paths) {
        if (path.dir !== 1) continue;
        ctx.beginPath();
        path.stations.forEach((s, k) => {
          const x = this.sx[s] + path.offsets[k * 2] * this.gap;
          const y = this.sy[s] + path.offsets[k * 2 + 1] * this.gap;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        if (path.loop) ctx.closePath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = NIGHT_INK;
        ctx.lineWidth = width + 2.4;
        ctx.globalAlpha = dim ? 0.4 : 1;
        ctx.stroke();
        ctx.strokeStyle = line.display;
        ctx.lineWidth = width;
        ctx.globalAlpha = dim ? 0.22 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Les stations : pastilles blanches, plus grosses aux correspondances, cerclées au terminus.
    for (const s of this.net.stations) {
      const x = this.sx[s.index];
      const y = this.sy[s.index];
      const hub = s.lines.length > 1;
      const dim = this.selected !== null && !s.lines.includes(this.selected);
      const r = (hub ? 3.3 : 2.2) * u;
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = NIGHT_INK;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (s.terminus) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, r + 2.6 * u, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    this.paintLabels(ctx);
  }

  /**
   * Étiquettes : terminus et grands pôles, plus toutes les stations de la ligne choisie. Chacune essaie quatre
   * places (vers l'extérieur de la carte d'abord, puis de l'autre côté, dessus, dessous) et prend la première qui
   * ne chevauche ni une autre étiquette, ni une station, ni le bord ; sinon elle n'est pas affichée.
   */
  private paintLabels(ctx: CanvasRenderingContext2D): void {
    const u = this.unit;
    const obstacles: Box[] = [];
    const dot = 3.5 * u;
    for (let i = 0; i < this.sx.length; i++) {
      obstacles.push({
        x: this.sx[i] - dot,
        y: this.sy[i] - dot,
        w: dot * 2,
        h: dot * 2,
        owner: i,
      });
    }
    const important = new Set<string>(CONFIG.map.labels);
    const sel = this.selected;
    const major = this.net.stations
      .filter((s) => s.terminus || important.has(s.id))
      .filter((s) => sel === null || s.lines.includes(sel) || s.terminus)
      .sort((a, b) => Number(b.terminus) - Number(a.terminus));
    const extra =
      sel === null
        ? []
        : this.net.stations.filter((s) => s.lines.includes(sel) && !major.includes(s));
    const size = Math.round(10 * u + 1.5);
    const v = this.view;
    const bounds = { x: v.x + 4, y: v.y + 4, w: v.w - 8, h: v.h - 8 };
    for (const [list, small] of [
      [major, false],
      [extra, true],
    ] as const) {
      const fontSize = small ? size - 1 : size;
      ctx.font = `${small ? 500 : 700} ${fontSize}px Lato, sans-serif`;
      for (const s of list) {
        const x = this.sx[s.index];
        const y = this.sy[s.index];
        const tw = ctx.measureText(s.short).width;
        const h = fontSize + 2;
        const off = (s.terminus ? 9 : 6) * u;
        const right: Spot = { x: x + off, y: y - h / 2, align: 'left' };
        const left: Spot = { x: x - off - tw, y: y - h / 2, align: 'right' };
        const above: Spot = { x: x - tw / 2, y: y - off - h, align: 'center' };
        const below: Spot = { x: x - tw / 2, y: y + off, align: 'center' };
        const spots = s.x >= -0.05 ? [right, left, above, below] : [left, right, above, below];
        const spot = spots.find((p) => {
          const box = { x: p.x, y: p.y, w: tw, h };
          return (
            inside(box, bounds) && !obstacles.some((o) => o.owner !== s.index && overlap(o, box))
          );
        });
        if (!spot) continue;
        obstacles.push({ x: spot.x, y: spot.y, w: tw, h, owner: -1 });
        const tx =
          spot.align === 'left' ? spot.x : spot.align === 'right' ? spot.x + tw : spot.x + tw / 2;
        ctx.textAlign = spot.align;
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(11, 8, 48, 0.9)';
        ctx.strokeText(s.short, tx, spot.y + h / 2);
        ctx.fillStyle = small ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.92)';
        ctx.fillText(s.short, tx, spot.y + h / 2);
      }
    }
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  owner?: number;
}

interface Spot {
  x: number;
  y: number;
  align: CanvasTextAlign;
}

function inside(a: Box, b: Box): boolean {
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}

/** 0 en pleine journée, 1 en pleine nuit (avant 6 h 30, après 21 h), en fondu. */
export function nightness(minute: number): number {
  const h = minute / 60;
  if (h < 6.5) return 1;
  if (h < 8) return 1 - (h - 6.5) / 1.5;
  if (h < 19.5) return 0;
  if (h < 21) return (h - 19.5) / 1.5;
  return 1;
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.min(r, h / 2, Math.max(0, w) / 2));
}
