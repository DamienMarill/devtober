import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CabinSound } from './lib/audio';
import { Autopilot, needsRescue } from './lib/autopilot';
import { Cabin } from './lib/cabin';
import { CabinView } from './lib/cabin-view';
import { CONFIG, DEG } from './lib/config';
import { Flight, thrustMax } from './lib/flight';
import { GMeter, LoadChart } from './lib/gauges';
import { parseOptions } from './lib/options';
import { Callout, PhaseWatch } from './lib/phases';
import { Rng } from './lib/rng';
import { SkyView, Track } from './lib/sky-view';

/** Ce que le DOM affiche (rafraîchi une quinzaine de fois par seconde). */
interface Readout {
  nz: number;
  alt: number;
  speed: number;
  pitch: number;
  parabolas: number;
  zero: number;
  last: number;
  best: number;
  floating: boolean;
}

type Pilot = 'you' | 'auto' | 'rescue';

const CALLOUTS: Record<Exclude<Callout, 'parabola'>, { title: string; sub: string }> = {
  'pull-up': { title: 'Pull up', sub: 'ressource : 1,8 g' },
  injection: { title: 'Injection', sub: 'apesanteur' },
  'pull-out': { title: 'Pull out', sub: 'sortie : 1,8 g' },
};

/** Nombre à la française ; pas de « -0,00 » quand on frôle zéro par en dessous. */
const fmt = (v: number, digits = 0) => {
  const r = Number(v.toFixed(digits));
  return (r === 0 ? 0 : r).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/**
 * Jour 9 : Gravity, ou le vol parabolique. On pilote un avion de vols « zéro g » avec deux boutons (tirer,
 * pousser) : la trajectoire se dessine dehors, colorée par la force ressentie, et la cabine montre ce que
 * cette force fait aux passagers, au ballon, à la bulle d'eau. La gravité ne disparaît jamais : quand
 * l'avion tombe exactement comme une pierre lancée, tout ce qu'il contient tombe avec lui, et flotte.
 */
@Component({
  selector: 'app-day-09-gravity',
  host: {
    class:
      'relative block size-full overflow-hidden select-none bg-night-floor [container-type:size]',
    '(document:keydown)': 'onKey($event, true)',
    '(document:keyup)': 'onKey($event, false)',
    '(document:visibilitychange)': 'onVisibility()',
    '(window:blur)': 'release()',
  },
  template: `
    <div class="layout">
      <section class="sky relative min-h-0 overflow-hidden" #skyBox>
        <canvas
          #sky
          class="absolute inset-0 size-full"
          aria-label="Vue extérieure : la trajectoire de l’avion"
        ></canvas>
        <p
          class="font-display absolute top-2 left-3 text-sm font-semibold text-white/90 drop-shadow"
        >
          Vol parabolique <span class="font-sans font-normal text-white/60">· A310 « 0 g »</span>
        </p>
        <dl
          class="hud absolute top-2 right-3 grid grid-cols-[auto_auto] gap-x-2 text-right font-mono text-xs text-white tabular-nums drop-shadow"
        >
          <dt class="text-white/60">altitude</dt>
          <dd>{{ fmt(view().alt) }} m</dd>
          <dt class="text-white/60">vitesse</dt>
          <dd>{{ fmt(view().speed) }} km/h</dd>
          <dt class="text-white/60">assiette</dt>
          <dd>{{ view().pitch > 0 ? '+' : '' }}{{ fmt(view().pitch) }}°</dd>
        </dl>
        @if (callout(); as c) {
          <div
            class="callout pointer-events-none absolute inset-x-0 top-[34%] text-center"
            aria-live="polite"
          >
            <p
              class="font-display text-4xl font-extrabold tracking-tight text-white uppercase drop-shadow-lg"
            >
              {{ c.title }}
            </p>
            <p class="text-sm font-semibold text-white/85 drop-shadow">{{ c.sub }}</p>
          </div>
        }
        @if (banner(); as b) {
          <p
            class="banner absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-night-floor/80 px-4 py-1.5 text-sm text-white shadow-lg backdrop-blur"
          >
            {{ b }}
          </p>
        } @else if (hint()) {
          <p
            class="banner absolute bottom-3 left-1/2 w-max max-w-[92%] -translate-x-1/2 rounded-full bg-night-floor/70 px-4 py-1.5 text-center text-xs text-white/90 backdrop-blur"
          >
            Garde <b>▲</b> pour cabrer à 1,8 g jusqu’à 45°, puis vise
            <b class="text-sakura">0 g</b> avec <b>▼</b>. Ou <b>A</b> : pilote auto.
          </p>
        }
      </section>

      <section class="cabin relative min-h-0" #cabinBox>
        <canvas
          #cabin
          class="absolute inset-0 size-full touch-none"
          [class.cursor-grab]="!grabbing()"
          [class.cursor-grabbing]="grabbing()"
          aria-label="La cabine : attrape un objet ou un passager et lance-le"
          (pointerdown)="grab($event)"
          (pointermove)="drag($event)"
          (pointerup)="drop()"
          (pointercancel)="drop()"
        ></canvas>
      </section>

      <section class="panel flex min-h-0 items-center gap-3 px-3 py-2">
        <canvas #meter class="meter shrink-0" aria-hidden="true"></canvas>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <p class="text-xs text-white/60">Force ressentie</p>
          <p
            class="font-display text-4xl leading-none font-extrabold tabular-nums"
            [style.color]="gColor()"
          >
            {{ fmt(view().nz, 2) }}<span class="text-xl"> g</span>
          </p>
          <p class="text-xs text-white/70">
            Passager de 70 kg : <b class="text-white tabular-nums">{{ fmt(70 * view().nz) }} kg</b>
          </p>
          <canvas #chart class="chart h-14 w-full" aria-hidden="true"></canvas>
          <ol class="guide text-xs leading-relaxed text-white/70">
            <li>
              <b class="text-peach">▲ Pull up</b> : tire jusqu’à 1,8 g, garde-le jusqu’à 45°
              d’assiette.
            </li>
            <li>
              <b class="text-sakura">▼ Injection</b> : pousse jusqu’à 0 g (le repère rose du
              manche), et tiens.
            </li>
            <li>
              <b class="text-peach">▲ Pull out</b> : vers −42°, tire à nouveau pour sortir du piqué.
            </li>
          </ol>
          <p class="text-xs text-white/70 tabular-nums">
            Parabole {{ view().parabolas + 1 }} · apesanteur
            <b class="text-sakura">{{ fmt(view().zero, 1) }} s</b>
            @if (view().best > 0) {
              <span class="text-white/50"> · record {{ fmt(view().best, 1) }} s</span>
            }
          </p>
        </div>
      </section>

      <section class="controls flex min-h-0 items-center justify-center gap-3 px-3 py-2">
        <div class="flex h-full max-h-56 flex-col items-center justify-center gap-2">
          <button
            class="pad"
            [class.on]="holding() === 'up'"
            [disabled]="pilot() === 'rescue'"
            aria-label="Haut : tirer le manche (cabrer)"
            (pointerdown)="press($event, 'up')"
            (pointerup)="release()"
            (pointercancel)="release()"
            (lostpointercapture)="release()"
            (contextmenu)="$event.preventDefault()"
          >
            ▲<span>Haut</span>
          </button>
          <button
            class="pad"
            [class.on]="holding() === 'down'"
            [disabled]="pilot() === 'rescue'"
            aria-label="Bas : pousser le manche (piquer)"
            (pointerdown)="press($event, 'down')"
            (pointerup)="release()"
            (pointercancel)="release()"
            (lostpointercapture)="release()"
            (contextmenu)="$event.preventDefault()"
          >
            ▼<span>Bas</span>
          </button>
        </div>
        <div class="stick" aria-hidden="true" title="Le manche">
          <i class="mark" style="bottom: 50%"></i>
          <i class="mark zero" #zeroMark></i>
          <i class="knob" #knob></i>
        </div>
        <div class="flex flex-col gap-2 text-xs">
          <button class="chip" [class.on]="pilot() === 'auto'" (click)="toggleAuto()">
            Pilote auto <kbd>A</kbd>
          </button>
          <button class="chip" [class.on]="sound()" (click)="toggleSound()">
            Son {{ sound() ? 'oui' : 'non' }} <kbd>M</kbd>
          </button>
          <button class="chip" (click)="reset()">Recommencer <kbd>R</kbd></button>
        </div>
      </section>
    </div>
    @if (options.debug) {
      <p class="absolute bottom-1 left-2 font-mono text-[10px] text-white/70 tabular-nums">
        {{ debugLine() }}
      </p>
    }
  `,
  styles: `
    .layout {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template: 'sky sky' 40% 'cabin cabin' 31% 'panel controls' 1fr / minmax(0, 1fr) auto;
    }
    .sky {
      grid-area: sky;
    }
    .cabin {
      grid-area: cabin;
    }
    .panel {
      grid-area: panel;
    }
    .controls {
      grid-area: controls;
    }
    .meter {
      width: min(26cqw, 24cqh);
      height: min(26cqw, 24cqh);
    }
    .guide {
      display: none;
      list-style: decimal inside;
    }
    @container (min-aspect-ratio: 4/3) and (min-width: 820px) {
      .layout {
        grid-template: 'sky panel' 58% 'cabin controls' 1fr / 1fr minmax(300px, 26%);
      }
      .panel {
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
      }
      .meter {
        width: min(15cqw, 28cqh);
        height: min(15cqw, 28cqh);
        align-self: center;
      }
      .guide {
        display: block;
      }
    }
    @container (max-aspect-ratio: 4/5) {
      .layout {
        grid-template: 'sky' 1fr 'cabin' calc(100cqw * 0.33) 'panel' auto 'controls' auto / minmax(
            0,
            1fr
          );
      }
      .meter {
        width: min(30cqw, 15cqh);
        height: min(30cqw, 15cqh);
      }
    }
    @container (max-height: 560px) {
      .chart {
        display: none;
      }
    }
    .pad {
      display: grid;
      place-items: center;
      width: clamp(3.6rem, 13cqmin, 5.2rem);
      aspect-ratio: 1;
      border-radius: 1rem;
      border: 1px solid rgb(255 255 255 / 0.18);
      background: rgb(255 255 255 / 0.08);
      color: #fff;
      font-size: clamp(1.3rem, 4cqmin, 1.9rem);
      line-height: 1;
      touch-action: none;
      transition:
        background 0.1s,
        transform 0.1s;
    }
    .pad span {
      font-size: 0.7rem;
      font-weight: 700;
      opacity: 0.7;
      margin-top: -0.6em;
    }
    .pad.on {
      background: var(--color-blouge);
      transform: scale(0.96);
    }
    .pad:disabled {
      opacity: 0.35;
    }
    .stick {
      position: relative;
      width: 0.75rem;
      height: min(70%, 11rem);
      border-radius: 9999px;
      background: rgb(255 255 255 / 0.1);
    }
    .mark {
      position: absolute;
      left: -0.3rem;
      right: -0.3rem;
      height: 2px;
      background: rgb(255 255 255 / 0.4);
    }
    .mark.zero {
      background: var(--color-glow-pink);
    }
    .knob {
      position: absolute;
      left: 50%;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 9999px;
      background: #fff;
      box-shadow: 0 0 0 3px var(--color-blouge);
      transform: translate(-50%, 50%);
    }
    .chip {
      border-radius: 9999px;
      border: 1px solid rgb(255 255 255 / 0.18);
      padding: 0.35rem 0.8rem;
      color: rgb(255 255 255 / 0.85);
      background: rgb(255 255 255 / 0.06);
      white-space: nowrap;
    }
    .chip.on {
      background: var(--color-blouge);
      color: #fff;
    }
    kbd {
      opacity: 0.55;
      font-family: var(--font-mono);
      margin-left: 0.2em;
    }
    .callout {
      animation: pop 1.6s ease-out forwards;
    }
    @keyframes pop {
      0% {
        opacity: 0;
        transform: scale(1.25);
      }
      12% {
        opacity: 1;
        transform: scale(1);
      }
      75% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .callout {
        animation: none;
      }
    }
  `,
})
export default class Day09Gravity {
  protected readonly options = parseOptions(location.search);
  protected readonly fmt = fmt;

  private readonly skyCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('sky');
  private readonly cabinCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cabin');
  private readonly meterCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('meter');
  private readonly chartCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chart');
  private readonly knob = viewChild.required<ElementRef<HTMLElement>>('knob');
  private readonly zeroMark = viewChild.required<ElementRef<HTMLElement>>('zeroMark');

  private flight = new Flight(undefined, undefined, this.options.seed);
  private cabin = new Cabin(undefined, undefined, this.options.seed);
  private watch = new PhaseWatch();
  private readonly track = new Track();
  private readonly rng = new Rng(this.options.seed + 1);
  private readonly audio = new CabinSound();
  private autopilot: Autopilot | null = null;
  private sky: SkyView | null = null;
  private cabinView: CabinView | null = null;
  private meter: GMeter | null = null;
  private chart: LoadChart | null = null;

  protected readonly pilot = signal<Pilot>('you');
  protected readonly holding = signal<'up' | 'down' | null>(null);
  protected readonly sound = signal(false);
  protected readonly grabbing = signal(false);
  protected readonly callout = signal<{ title: string; sub: string } | null>(null);
  protected readonly banner = signal<string | null>(null);
  protected readonly hint = signal(true);
  protected readonly debugLine = signal('');
  protected readonly view = signal<Readout>({
    nz: 1,
    alt: CONFIG.cruise.altitude,
    speed: CONFIG.cruise.speed * 3.6,
    pitch: 0,
    parabolas: 0,
    zero: 0,
    last: 0,
    best: 0,
    floating: false,
  });
  protected readonly gColor = computed(() => {
    const n = this.view().nz;
    return Math.abs(n) < 0.06 ? 'var(--color-glow-pink)' : n > 1.45 ? 'var(--color-peach)' : '#fff';
  });

  private holdTime = 0;
  private acc = 0;
  private last = 0;
  private frame = 0;
  private publishClock = 0;
  private calloutTimer = 0;
  private bannerTimer = 0;
  /** Mémoire du cadran : le plus petit et le plus grand facteur de charge de la parabole en cours. */
  private lo = 1;
  private hi = 1;
  private keys = new Set<string>();
  private pushPending = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.audio.dispose();
    });
    if (this.options.auto) this.engageAuto();

    afterNextRender(() => {
      this.sky = new SkyView(this.skyCanvas().nativeElement);
      this.cabinView = new CabinView(this.cabinCanvas().nativeElement);
      this.meter = new GMeter(this.meterCanvas().nativeElement);
      this.chart = new LoadChart(this.chartCanvas().nativeElement);
      const observer = new ResizeObserver(() => this.layout());
      for (const c of [
        this.skyCanvas(),
        this.cabinCanvas(),
        this.meterCanvas(),
        this.chartCanvas(),
      ])
        observer.observe(c.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
      this.layout();

      const tick = (now: number) => {
        this.frame = requestAnimationFrame(tick);
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
        this.last = now;
        this.frameStep(dt);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private layout(): void {
    const box = (c: ElementRef<HTMLCanvasElement>) => c.nativeElement.getBoundingClientRect();
    const s = box(this.skyCanvas());
    this.sky?.resize(s.width, s.height);
    const c = box(this.cabinCanvas());
    this.cabinView?.resize(c.width, c.height, this.cabin);
    this.meter?.resize(box(this.meterCanvas()).width);
    const ch = box(this.chartCanvas());
    this.chart?.resize(ch.width, ch.height);
    // Le repère « 0 g » du manche : l'incidence de portance nulle, la même à toutes les vitesses.
    const s0 = this.flight.stickForAlpha(CONFIG.aircraft.alpha0);
    this.zeroMark().nativeElement.style.bottom = `${((s0 + 1) / 2) * 100}%`;
  }

  // ─────────────────────────────── boucle

  private frameStep(dt: number): void {
    const DT = CONFIG.dt;
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.simulate(DT);
    }
    const f = this.flight;
    this.sky?.draw(f, this.track);
    this.cabinView?.draw(this.cabin, f.theta, dt);
    this.meter?.draw(f.nz, this.lo, this.hi, dt);
    this.chart?.draw();
    this.knob().nativeElement.style.bottom = `${((f.stick + 1) / 2) * 100}%`;
    this.audio.update(f.thrust / thrustMax(f.h, f.mach), f.q);

    this.calloutTimer -= dt;
    if (this.calloutTimer <= 0 && this.callout()) this.callout.set(null);
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0 && this.banner() && this.pilot() !== 'rescue') this.banner.set(null);
    this.publishClock += dt;
    if (this.publishClock >= 1 / 15) {
      this.publishClock = 0;
      this.publish(dt);
    }
  }

  /** Un pas fixe : le manche, le vol, la cabine, les annonces. */
  private simulate(dt: number): void {
    const f = this.flight;
    const pilot = this.pilot();
    if (pilot === 'you') {
      const dir =
        this.holding() === 'up' || this.keyHeld('up')
          ? 1
          : this.holding() === 'down' || this.keyHeld('down')
            ? -1
            : 0;
      if (dir) {
        this.holdTime += dt;
        const S = CONFIG.stick;
        const rate = this.holdTime < S.slowFor ? S.slow : S.fast;
        f.stick = Math.max(-1, Math.min(1, f.stick + dir * rate * dt));
      } else this.holdTime = 0;
      if (needsRescue(f)) this.startRescue();
    }
    if (this.autopilot) {
      this.autopilot.update(f, dt);
      if (this.pilot() === 'rescue' && this.autopilot.done) {
        this.autopilot = null;
        this.pilot.set('you');
        this.showBanner('À toi : l’avion est de nouveau en palier.', 3);
      }
    }
    f.step(dt);
    this.watch.update(f, dt);
    this.track.record(f, dt);
    this.chart?.push(f.nz, dt);
    this.cabin.setLoad(f.nx, f.nz);
    this.cabin.step(dt);
    this.lo = Math.min(this.lo, f.nz);
    this.hi = Math.max(this.hi, f.nz);
    // Les passagers ne décollent du plancher qu'une fois l'apesanteur vraiment là.
    if (this.pushPending && Math.abs(f.nz) < 0.03) {
      this.pushPending = false;
      this.cabin.pushOff(this.rng);
    }

    for (const c of this.watch.callouts) {
      if (c === 'parabola') {
        this.showBanner(
          `Parabole ${this.watch.parabolas} : ${fmt(this.watch.last, 1)} s d’apesanteur`,
          4,
        );
        continue;
      }
      if (c === 'pull-up') {
        this.lo = f.nz;
        this.hi = f.nz;
      }
      if (c === 'injection') this.pushPending = true;
      this.track.mark(f, c);
      this.audio.announce(c);
      this.callout.set(CALLOUTS[c]);
      this.calloutTimer = 1.6;
    }
    this.watch.callouts.length = 0;
  }

  private publish(dt: number): void {
    const f = this.flight;
    const w = this.watch;
    this.view.set({
      nz: f.nz,
      alt: Math.round(f.h / 10) * 10,
      speed: Math.round((f.V * 3.6) / 5) * 5,
      pitch: Math.round(f.theta / DEG),
      parabolas: w.parabolas,
      zero: w.phase === 'zerog' || w.phase === 'pullout' ? w.zero : w.last,
      last: w.last,
      best: w.best,
      floating: Math.abs(f.nz) < CONFIG.phases.zero,
    });
    if (this.options.debug)
      this.debugLine.set(
        `${Math.round(1 / Math.max(dt, 1e-3))} i/s · α ${fmt(f.alpha / DEG, 1)}° · γ ${fmt(f.gamma / DEG, 1)}° · T ${fmt(f.thrust / 1000)} kN (${f.throttle}) · nx ${fmt(f.nx, 3)} · Mach ${fmt(f.mach, 2)} · ${this.autopilot?.phase ?? '–'}`,
      );
  }

  private showBanner(text: string, seconds: number): void {
    this.banner.set(text);
    this.bannerTimer = seconds;
  }

  // ─────────────────────────────── pilotes

  /** Le pilote de sécurité reprend la main : trop bas ou trop vite. */
  private startRescue(): void {
    this.release();
    const ap = new Autopilot('recover');
    ap.loop = false;
    this.autopilot = ap;
    this.pilot.set('rescue');
    this.banner.set('Trop bas ou trop vite : le commandant reprend la main…');
  }

  private engageAuto(): void {
    this.autopilot = new Autopilot('recover');
    this.pilot.set('auto');
    this.hint.set(false);
  }

  protected toggleAuto(): void {
    if (this.pilot() === 'rescue') return;
    this.wakeSound();
    if (this.pilot() === 'auto') this.takeOver();
    else this.engageAuto();
  }

  /** Une commande manuelle débraye le pilote automatique. */
  private takeOver(): void {
    if (this.pilot() !== 'auto') return;
    this.autopilot = null;
    this.pilot.set('you');
    this.showBanner('Tu as les commandes.', 2);
  }

  /** La démo (touche T) : l'automatique, déjà lancé dans la ressource, pour filmer l'apesanteur. */
  private startDemo(): void {
    this.reset();
    this.engageAuto();
    this.autopilot!.startParabola(this.flight);
    for (let t = 0; t < 9; t += CONFIG.dt) this.simulate(CONFIG.dt);
  }

  protected reset(): void {
    this.flight = new Flight(undefined, undefined, this.options.seed);
    this.cabin = new Cabin(undefined, undefined, this.options.seed);
    this.watch = new PhaseWatch();
    this.track.clear();
    this.chart?.clear();
    this.autopilot = null;
    this.pilot.set('you');
    this.lo = this.hi = 1;
    this.pushPending = false;
    this.callout.set(null);
    this.banner.set(null);
    this.layout();
  }

  // ─────────────────────────────── commandes

  protected press(event: PointerEvent, dir: 'up' | 'down'): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.wakeSound();
    this.takeOver();
    this.hint.set(false);
    this.holding.set(dir);
  }

  protected release(): void {
    this.holding.set(null);
    this.keys.clear();
  }

  private keyHeld(dir: 'up' | 'down'): boolean {
    return dir === 'up'
      ? this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('KeyZ')
      : this.keys.has('ArrowDown') || this.keys.has('KeyS');
  }

  protected onKey(event: KeyboardEvent, down: boolean): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable], [role="dialog"]')) return;
    const code = event.code;
    const stick = ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyZ', 'KeyS'].includes(code);
    if (stick) {
      event.preventDefault();
      if (!down) {
        this.keys.delete(code);
        return;
      }
      if (this.pilot() === 'rescue') return;
      this.wakeSound();
      this.takeOver();
      this.hint.set(false);
      this.keys.add(code);
      return;
    }
    if (!down || event.repeat) return;
    switch (code) {
      case 'KeyA':
        this.toggleAuto();
        break;
      case 'KeyM':
        this.toggleSound();
        break;
      case 'KeyR':
        this.reset();
        break;
      case 'KeyT':
        this.startDemo();
        break;
    }
  }

  // ─────────────────────────────── cabine : attraper, lancer

  protected grab(event: PointerEvent): void {
    const view = this.cabinView;
    if (!view) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const [x, y] = view.toCabin(event.clientX - rect.left, event.clientY - rect.top);
    const body = this.cabin.pick(x, y, 14 / view.scale);
    if (!body) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.wakeSound();
    this.cabin.startGrab(body, x, y);
    this.grabbing.set(true);
  }

  protected drag(event: PointerEvent): void {
    if (!this.cabin.grab || !this.cabinView) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const [x, y] = this.cabinView.toCabin(event.clientX - rect.left, event.clientY - rect.top);
    this.cabin.moveGrab(x, y);
  }

  protected drop(): void {
    this.cabin.endGrab();
    this.grabbing.set(false);
  }

  // ─────────────────────────────── son, onglet

  private wakeSound(): void {
    if (this.sound() || this.audio.enabled) return;
    void this.audio.enable().then(() => this.sound.set(true));
  }

  protected toggleSound(): void {
    if (this.sound()) {
      this.audio.disable();
      this.sound.set(false);
    } else void this.audio.enable().then(() => this.sound.set(true));
  }

  protected onVisibility(): void {
    this.last = 0;
    this.release();
    this.audio.setHidden(document.hidden);
  }
}
