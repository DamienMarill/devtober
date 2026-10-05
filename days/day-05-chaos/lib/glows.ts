import { CONFIG } from './config';
import type { Outcome } from './density';
import { clamp, easeOutCubic, smoothstep } from './math';
import type { Params } from './params';

export type GlowPhase = 'live' | 'fade' | 'extinguish' | 'bloom';

export interface Glow {
  active: boolean;
  phase: GlowPhase;
  /** Position dans le monde (u). */
  x: number;
  y: number;
  /** Temps visible (s), âge compté horloge lancée (s), temps dans la phase (s), durée de vie (s). */
  shown: number;
  age: number;
  phaseT: number;
  life: number;
  coherent: boolean;
  /** Tirage imposé (debug), sinon tiré au contact. */
  forced: Outcome | null;
  /** Part restante après dissipation (1 → 0, ne remonte jamais). */
  residual: number;
  /** Distance au body à l'apparition : la dissipation ne commence jamais avant qu'on s'en soit approché. */
  spawnDistance: number;
  size: number;
  seed: number;
  note: number;
  /** Lus par le rendu et l'audio. */
  alpha: number;
  scale: number;
  proximity: number;
  /** Position relative au body, en part de la demi-largeur de la vue (−1..1). */
  pan: number;
}

export interface GlowHandler {
  contact(glow: Glow): void;
}

const G = CONFIG.glows;

function blank(): Glow {
  return {
    active: false,
    phase: 'live',
    x: 0,
    y: 0,
    shown: 0,
    age: 0,
    phaseT: 0,
    life: 0,
    coherent: false,
    forced: null,
    residual: 1,
    spawnDistance: 1,
    size: 1,
    seed: 0,
    note: 0,
    alpha: 0,
    scale: 1,
    proximity: 0,
    pan: 0,
  };
}

/**
 * Les glows : un pool fixe. Un glow non coherent se dissipe à mesure que le body s'en approche (sa part
 * restante ne remonte jamais) ; un glow coherent se laisse toucher, et le contact est confié au handler.
 */
export class GlowField {
  readonly pool: Glow[] = Array.from({ length: G.pool }, blank);
  /** Sur la dernière image : part dissipée (somme), dont près du body, et alignement de l'input. */
  dissipated = 0;
  nearDissipated = 0;
  alignment = 0;

  private spawned = 0;
  private nextSpawn: number = G.interval[0];
  private coherentSeen = false;
  private contacted = false;
  private t = 0;

  constructor(private readonly random: () => number) {}

  get count(): number {
    let n = 0;
    for (const g of this.pool) if (g.active) n++;
    return n;
  }

  step(
    dt: number,
    running: boolean,
    episode: boolean,
    bodyX: number,
    bodyY: number,
    inputX: number,
    inputY: number,
    p: Params,
    camX: number,
    camY: number,
    halfW: number,
    halfH: number,
    handler: GlowHandler,
  ): void {
    this.t += dt;
    this.dissipated = 0;
    this.nearDissipated = 0;
    this.alignment = 0;

    if (this.spawned === 0 && halfW > 0) {
      this.spawn(bodyX, bodyY, camX, camY, halfW, halfH, p);
    } else if (running && !episode) {
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0) {
        this.spawn(bodyX, bodyY, camX, camY, halfW, halfH, p);
        const jitter = G.intervalJitter;
        this.nextSpawn = p.glowInterval * (1 - jitter / 2 + jitter * this.random());
      }
    }

    const effort = Math.hypot(inputX, inputY);
    for (const g of this.pool) {
      if (!g.active) continue;
      g.shown += dt;
      g.phaseT += dt;
      if (running) g.age += dt;
      const dx = g.x - bodyX;
      const dy = g.y - bodyY;
      const dist = Math.hypot(dx, dy);
      g.proximity = 1 - smoothstep(0.05, 0.9, dist);
      g.pan = clamp(dx / Math.max(halfW, 0.1), -1, 1);

      if (g.phase === 'live') {
        if (episode || (running && g.age > g.life)) {
          this.enter(g, 'fade');
        } else if (!g.coherent) {
          const from = Math.min(p.dissipateFrom, g.spawnDistance * 0.85);
          const f = smoothstep(Math.min(p.dissipateTo, from * 0.6), from, dist);
          if (f < g.residual) {
            const drop = g.residual - f;
            g.residual = f;
            this.dissipated += drop;
            if (dist < G.warmthRange) this.nearDissipated += drop;
          }
        } else if (dist < G.contact + g.size * p.glowRadius * 0.25) {
          handler.contact(g);
        }
      }

      if (g.phase === 'live' && effort > 0 && dist > 1e-4) {
        const align = (inputX * dx + inputY * dy) / (effort * dist);
        if (align > 0) {
          const visible = smoothstep(0, G.appear, g.shown) * g.residual;
          const w = align * align * visible * effort;
          if (w > this.alignment) this.alignment = w;
        }
      }

      this.envelope(g);
    }
  }

  /** Tirage du contact : imposé, sinon unstable pour le tout premier, sinon aléatoire. */
  outcomeFor(g: Glow): Outcome {
    if (g.forced) return g.forced;
    if (!this.contacted) {
      this.contacted = true;
      return 'unstable';
    }
    const r = this.random();
    const O = CONFIG.outcomes;
    return r < O.stable ? 'stable' : r < O.stable + O.inert ? 'inert' : 'unstable';
  }

  enter(g: Glow, phase: GlowPhase): void {
    g.phase = phase;
    g.phaseT = 0;
  }

  /** Efface en douceur tous les glows vivants sauf `except`. */
  fadeAll(except: Glow | null): void {
    for (const g of this.pool)
      if (g.active && g !== except && g.phase === 'live') this.enter(g, 'fade');
  }

  /** Apparition à la périphérie de la vue (debug : position et nature imposées). */
  spawn(
    bodyX: number,
    bodyY: number,
    camX: number,
    camY: number,
    halfW: number,
    halfH: number,
    p: Params,
    at?: { x: number; y: number; coherent: boolean; forced: Outcome | null },
  ): Glow | null {
    const g = this.pool.find((slot) => !slot.active);
    if (!g) return null;
    let x: number;
    let y: number;
    let coherent: boolean;
    if (at) {
      x = at.x;
      y = at.y;
      coherent = at.coherent;
      g.forced = at.forced;
    } else {
      const a = this.random() * Math.PI * 2;
      x = camX + Math.cos(a) * Math.max(0, halfW - G.margin) * p.glowDistance;
      y = camY + Math.sin(a) * Math.max(0, halfH - G.margin) * p.glowDistance;
      this.spawned++;
      if (this.spawned === 1) coherent = false;
      else if (!this.coherentSeen && this.spawned >= CONFIG.opening.coherentBy) coherent = true;
      else coherent = this.random() < p.glowCoherent;
      g.forced = null;
    }
    if (coherent) this.coherentSeen = true;

    const dist = Math.hypot(x - bodyX, y - bodyY);
    g.active = true;
    g.phase = 'live';
    g.x = x;
    g.y = y;
    g.shown = 0;
    g.age = 0;
    g.phaseT = 0;
    g.life = clamp(dist / (p.maxSpeed * G.lifeSpeedShare) + G.lifeMargin, G.lifeMin, G.lifeMax);
    g.coherent = coherent;
    g.residual = 1;
    g.spawnDistance = dist;
    g.size = 0.85 + this.random() * 0.3;
    g.seed = this.random();
    g.note = Math.floor(this.random() * CONFIG.audio.voices.notes.length);
    g.alpha = 0;
    g.scale = 1;
    g.proximity = 0;
    return g;
  }

  private envelope(g: Glow): void {
    let env = 1;
    let scale = 1;
    if (g.phase === 'fade') {
      env = 1 - smoothstep(0, G.fade, g.phaseT);
      if (g.phaseT >= G.fade) g.active = false;
    } else if (g.phase === 'extinguish') {
      const x = Math.min(1, g.phaseT / G.extinguish);
      env = 1 - x * x;
      scale = 1 - 0.35 * x;
      if (x >= 1) g.active = false;
    } else if (g.phase === 'bloom') {
      const x = Math.min(1, g.phaseT / G.bloom);
      env = 1 - smoothstep(0, 1, x);
      scale = 1 + (G.bloomScale - 1) * easeOutCubic(x);
      if (x >= 1) g.active = false;
    } else if (!g.coherent && g.residual < 0.002) {
      g.active = false;
    }
    const shimmer =
      0.9 + 0.1 * Math.sin(this.t * 1.3 + g.seed * 20) * Math.sin(this.t * 0.71 + g.seed * 7);
    g.alpha = g.active ? smoothstep(0, G.appear, g.shown) * g.residual * env * shimmer : 0;
    g.scale = scale;
  }
}
