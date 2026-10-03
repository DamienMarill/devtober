import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideVolume2, lucideVolumeX } from '@ng-icons/lucide';
import { Plane } from './art/plane';
import { Sky } from './art/sky';
import { DebugPanel } from './debug-panel';
import { Ambience, levels } from './lib/ambience';
import { Camera, frame, toScreen } from './lib/camera';
import { Canopy } from './lib/canopy';
import { atOgakiMinutes, spokenOgakiTime } from './lib/clock';
import { Look, cityLights, computeLook } from './lib/look';
import { OGAKI } from './lib/ogaki';
import { Overrides, parseOverrides } from './lib/overrides';
import { PetalField } from './lib/petals';
import { RainField } from './lib/rain';
import { buildFond, buildPont, glows } from './lib/scenery';
import { moonPhase, sunPosition } from './lib/solar';
import { Stage } from './lib/stage';
import { TOUR, tourAt } from './lib/tour';
import {
  Conditions,
  FALLBACK_CONDITIONS,
  PRESETS,
  WMO_LABELS,
  Weather,
  fetchWeather,
  toConditions,
} from './lib/weather';
import { Gusts, screenWind, windLabel, windStrength } from './lib/wind';

/** Le décor vectoriel, construit une fois au chargement du jour. */
const FOND = buildFond();
const PONT = buildPont();
const GLOWS = glows();

/** Relecture de la météo (Open-Meteo publie un relevé par quart d'heure). */
const REFRESH_MS = 10 * 60_000;
/** Recalcul de la lumière en direct ; en accéléré, bien plus souvent (et les cerisiers un peu moins). */
const LOOK_LIVE_MS = 15_000;
const LOOK_FAST_MS = 100;
const CANOPY_FAST_MS = 250;
/** Dérive des nuages (unités par seconde et par m/s de vent latéral), et un minimum. */
const CLOUD_DRIFT = 2.4;
/** Part du vent réel appliquée au rendu (pétales, pluie, balancement, nuages) ; le son garde le vent réel. */
const RENDER_WIND = 0.5;
/** Temps de peinture des cerisiers accordé à chaque image (ms). */
const PAINT_BUDGET_MS = 9;
/** Éclairs : intervalle (s) entre deux coups. */
const STORM_GAP: [number, number] = [6, 18];

@Component({
  selector: 'app-day-03-bloom',
  imports: [Sky, Plane, DebugPanel, NgIcon],
  providers: [provideIcons({ lucideVolume2, lucideVolumeX })],
  host: {
    class: 'relative block size-full overflow-hidden select-none bg-[#0b1331]',
    '(document:keydown)': 'onKeydown($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <div class="absolute inset-0" role="img" [attr.aria-label]="label()">
      <app-bloom-sky [camera]="camera()" [moonPhase]="moonPhase()" />
      <app-bloom-plane [camera]="camera()" [shapes]="fond" />
      <canvas #far class="layer"></canvas>
      <app-bloom-plane [camera]="camera()" [shapes]="pont" />
      @for (g of glowBoxes(); track $index) {
        <div
          class="glow pointer-events-none absolute rounded-full"
          [style.left.px]="g.x"
          [style.top.px]="g.y"
          [style.width.px]="g.size"
          [style.height.px]="g.size"
        ></div>
      }
      <canvas #mid class="layer"></canvas>
      <canvas #back class="layer"></canvas>
      <canvas #left class="layer limb" [style.transform-origin]="pivots().left"></canvas>
      <canvas #right class="layer limb" [style.transform-origin]="pivots().right"></canvas>
      <canvas #front class="layer"></canvas>
      <div #flash class="pointer-events-none absolute inset-0 bg-[#eef2ff] opacity-0"></div>
    </div>

    <button
      type="button"
      class="absolute top-3 right-3 z-20 grid size-10 place-items-center rounded-full bg-black/25 text-white/90 backdrop-blur-sm transition hover:bg-black/40"
      [attr.aria-pressed]="sound()"
      [attr.aria-label]="sound() ? 'Couper le son d’Ōgaki' : 'Écouter Ōgaki (son généré)'"
      [title]="sound() ? 'Couper le son' : 'Écouter Ōgaki'"
      (click)="toggleSound()"
    >
      <ng-icon [name]="sound() ? 'lucideVolume2' : 'lucideVolumeX'" class="text-lg" />
    </button>

    @if (debug()) {
      <app-bloom-debug
        [(overrides)]="overrides"
        [weather]="lastWeather()"
        [error]="weatherError()"
        [conditions]="conditions()"
        [now]="status().now"
        [fps]="status().fps"
        (closed)="debug.set(false)"
        (tour)="startTour()"
      />
    }
  `,
  styles: `
    .layer {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .limb {
      will-change: transform;
    }
    .glow {
      translate: -50% -50%;
      mix-blend-mode: screen;
      opacity: var(--lanterns);
      background: radial-gradient(
        circle,
        rgb(255 190 150 / 0.8),
        rgb(255 140 140 / 0.2) 35%,
        transparent 70%
      );
    }
  `,
})
export default class Day03Bloom {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sky = viewChild.required(Sky);
  private readonly farCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('far');
  private readonly midCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('mid');
  private readonly leftCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('left');
  private readonly rightCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('right');
  private readonly backCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('back');
  private readonly frontCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('front');
  private readonly flash = viewChild.required<ElementRef<HTMLElement>>('flash');

  protected readonly fond = FOND;
  protected readonly pont = PONT;

  private readonly url = parseOverrides(location.search);
  protected readonly debug = signal(this.url.debug);
  protected readonly overrides = signal<Overrides>(this.url.overrides);
  protected readonly camera = signal<Camera>(frame(1600, 1000));
  /** Le son est actif par défaut ; les navigateurs ne le laissent démarrer qu'après un premier geste. */
  protected readonly sound = signal(true);
  /** Instant affiché, libellé et FPS : rafraîchis une fois par seconde, pas à chaque image. */
  protected readonly status = signal({ now: Date.now(), fps: 0 });

  /** La météo d'Ōgaki, relue toutes les 10 minutes. */
  protected readonly weather = resource({
    loader: ({ abortSignal }) => fetchWeather(abortSignal),
  });
  /** Dernière réponse valide : une erreur passagère ne fait pas retomber sur le repli. */
  protected readonly lastWeather = linkedSignal<Weather | undefined, Weather | undefined>({
    source: () => (this.weather.hasValue() ? this.weather.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });
  protected readonly weatherError = computed(() => {
    const e = this.weather.error();
    return e ? `météo indisponible (${e instanceof Error ? e.message : e})` : undefined;
  });

  /** Ce qu'on rend : la météo réelle, puis ce que le debug (ou la visite) impose par-dessus. */
  protected readonly conditions = computed<Conditions>(() => {
    const o = this.overrides();
    const live = this.lastWeather()?.conditions ?? FALLBACK_CONDITIONS;
    let c: Conditions = o.weather
      ? {
          ...toConditions(PRESETS[o.weather]),
          windSpeed: live.windSpeed,
          windFrom: live.windFrom,
          gusts: live.gusts,
          temperature: live.temperature,
        }
      : live;
    if (o.wind)
      c = { ...c, windSpeed: o.wind.speed, windFrom: o.wind.from, gusts: o.wind.speed * 1.6 };
    if (o.clouds !== undefined) c = { ...c, clouds: o.clouds };
    return c;
  });

  protected readonly moonPhase = computed(() => moonPhase(this.status().now).phase);

  /** Ce que lirait un lecteur d'écran : le lieu, l'heure, le temps qu'il fait. */
  protected readonly label = computed(() => {
    const c = this.conditions();
    const weather = WMO_LABELS[c.code] ?? 'temps inconnu';
    return `Ōgaki, ${spokenOgakiTime(this.status().now)} : un tunnel de cerisiers au-dessus du canal Suimon, le pont Mitokoi au milieu des fleurs, les montagnes au loin, ${weather}, ${windLabel(c.windFrom)} ${windStrength(c.windSpeed)}.`;
  });

  protected readonly pivots = computed(() => {
    const cam = this.camera();
    const at = (p?: { x: number; y: number }) => {
      if (!p) return '50% 100%';
      const s = toScreen(cam, p.x, p.y);
      return `${s.x.toFixed(1)}px ${s.y.toFixed(1)}px`;
    };
    return { left: at(this.pivotPoints.left), right: at(this.pivotPoints.right) };
  });
  private pivotPoints: { left?: { x: number; y: number }; right?: { x: number; y: number } } = {};

  protected readonly glowBoxes = computed(() => {
    const cam = this.camera();
    return GLOWS.map((g) => {
      const s = toScreen(cam, g.x, g.y);
      return { ...s, size: g.r * 2 * cam.scale };
    });
  });

  // ------------------------------------------------------------ état de l'animation (hors signaux)
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly coarse = matchMedia('(pointer: coarse)').matches;
  private readonly gusts = new Gusts(11);
  private readonly ambience = new Ambience();
  private readonly rain = new RainField();
  private petals?: PetalField;
  private canopy?: Canopy;
  private stage?: Stage;
  private frame = 0;
  private last = 0;
  /** Temps de simulation (s) : turbulence, rafales. */
  private time = 0;
  private clouds = 0;
  /** Horloge : instant simulé `sim` à l'instant réel `real`, qui avance à `speed`. */
  private clock = { real: Date.now(), sim: Date.now(), speed: 1 };
  private tour?: { start: number; step: number; before: Overrides };
  private look?: Look;
  private lookAt = -Infinity;
  private canopyAt = -Infinity;
  private lookKey = '';
  private applied: Record<string, string> = {};
  private nextStrike = 0;
  private frames = 0;
  private statusAt = 0;
  private soundAt = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Une heure ou une vitesse imposée remet l'horloge à zéro.
    effect(() => {
      const o = this.overrides();
      untracked(() => this.resetClock(o));
    });
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.canopy = new Canopy({
        far: this.farCanvas().nativeElement,
        mid: this.midCanvas().nativeElement,
        left: this.leftCanvas().nativeElement,
        right: this.rightCanvas().nativeElement,
      });
      this.pivotPoints = { left: this.canopy.pivot('left'), right: this.canopy.pivot('right') };
      this.stage = new Stage(this.backCanvas().nativeElement, this.frontCanvas().nativeElement);
      this.petals = new PetalField([]);
      if (this.coarse) {
        this.petals.max = 600;
        this.rain.density = 0.6;
      }
      if (this.reduced) {
        this.petals.max = Math.round(this.petals.max * 0.3);
        this.petals.rate *= 0.3;
        this.rain.density *= 0.5;
      }
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(element);
      const refresh = setInterval(() => this.weather.reload(), REFRESH_MS);
      this.frame = requestAnimationFrame((t) => this.tick(t));
      const gesture = new AbortController();
      this.startSoundOnLoad(gesture.signal);
      destroyRef.onDestroy(() => {
        gesture.abort();
        observer.disconnect();
        clearInterval(refresh);
        cancelAnimationFrame(this.frame);
        this.ambience.dispose();
      });
    });
  }

  // ------------------------------------------------------------ interactions

  protected onKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable]')) return;
    const key = event.key.toLowerCase();
    if (key === 'd') this.debug.update((d) => !d);
    if (key === 't') this.startTour();
  }

  /**
   * Tente de lancer le son dès le chargement ; si le navigateur le bloque (aucun geste encore), il
   * démarre au premier clic ou à la première touche, tant que le son n'a pas été coupé entre-temps.
   */
  private startSoundOnLoad(signal: AbortSignal): void {
    void this.ambience.start().catch(() => undefined);
    const resume = () => {
      if (this.sound() && !document.hidden) void this.ambience.start().catch(() => undefined);
    };
    for (const type of ['pointerdown', 'keydown']) {
      document.addEventListener(type, resume, { once: true, capture: true, signal });
    }
  }

  protected onVisibility(): void {
    if (!this.sound()) return;
    if (document.hidden) this.ambience.stop();
    else void this.ambience.start();
  }

  protected toggleSound(): void {
    const on = !this.sound();
    this.sound.set(on);
    if (on) void this.ambience.start();
    else this.ambience.stop();
  }

  /** Lance la visite : une journée en 30 secondes (pour le GIF, ou pour voir la pluie et la nuit). */
  protected startTour(): void {
    const before = this.tour?.before ?? this.overrides();
    this.tour = { start: performance.now(), step: -1, before };
    this.nextStrike = 0;
  }

  // ------------------------------------------------------------ boucle

  private resize(): void {
    const element = this.host.nativeElement;
    const camera = frame(element.clientWidth, element.clientHeight);
    this.camera.set(camera);
    this.canopy?.resize(camera);
    this.stage?.resize(camera);
    this.lookKey = '';
  }

  private resetClock(o: Overrides): void {
    const real = Date.now();
    const sim = o.time === undefined ? real : atOgakiMinutes(real, o.time, this.utcOffset());
    this.clock = { real, sim, speed: o.speed ?? 1 };
  }

  private utcOffset(): number {
    return this.lastWeather()?.utcOffsetSeconds ?? OGAKI.utcOffsetSeconds;
  }

  /** L'instant rendu : le direct, l'heure imposée qui avance à sa vitesse, ou celle de la visite. */
  private now(): number {
    if (this.tour) {
      const t = (performance.now() - this.tour.start) / 1000;
      const { minutes, step, done } = tourAt(t);
      const index = TOUR.indexOf(step);
      if (index !== this.tour.step) {
        this.tour.step = index;
        this.overrides.set({ weather: step.weather, wind: step.wind });
      }
      if (done) {
        const before = this.tour.before;
        this.tour = undefined;
        this.overrides.set(before);
      }
      return atOgakiMinutes(this.clock.real, minutes, this.utcOffset());
    }
    return this.clock.sim + (Date.now() - this.clock.real) * this.clock.speed;
  }

  private tick(t: number): void {
    this.frame = requestAnimationFrame((next) => this.tick(next));
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.05) : 1 / 60;
    this.last = t;
    this.time += dt;
    this.frames++;

    const now = this.now();
    const c = this.conditions();
    const camera = this.camera();
    const fast = !!this.tour || this.clock.speed > 1;

    // Le vent du moment : moyen + rafales, projeté dans notre regard.
    const gust = this.gusts.at(this.time);
    const speed = this.gusts.speed(this.time, c.windSpeed, c.gusts);
    const wind = screenWind(speed * RENDER_WIND, c.windFrom);
    const view = { x: camera.x, y: camera.y, w: camera.w, h: camera.h };

    const falling = c.precip === 'rain' || c.precip === 'drizzle' ? c.intensity : 0;
    this.petals?.step(dt, { wind, gust, rain: falling, view, time: this.time });
    this.rain.step(dt, { precip: c.precip, intensity: c.intensity, wind, view, time: this.time });
    this.stage?.draw(this.petals?.petals ?? [], this.rain, c.precip, wind);

    this.sway(wind.x, gust, speed * RENDER_WIND);
    this.clouds += (wind.x * CLOUD_DRIFT + 1.2) * dt * (fast ? 25 : 1);
    this.sky().drift(this.clouds);
    this.storm(c, t);

    // La lumière : en direct toutes les 15 s, en accéléré plusieurs fois par seconde.
    const weather = this.lastWeather();
    const key = `${JSON.stringify(c)}|${camera.width}x${camera.height}|${weather?.observedAt}`;
    const elapsed = t - this.lookAt;
    if (key !== this.lookKey || elapsed > (fast ? LOOK_FAST_MS : LOOK_LIVE_MS)) {
      const changed = key !== this.lookKey;
      this.lookKey = key;
      this.lookAt = t;
      const sun = sunPosition(now, OGAKI.latitude, OGAKI.longitude);
      this.look = computeLook({
        sun,
        moon: moonPhase(now),
        lights: cityLights(now, sun.elevation, weather?.sunrises ?? [], weather?.sunsets ?? []),
        conditions: c,
      });
      this.paint(this.look);
      if (changed || !fast || t - this.canopyAt > CANOPY_FAST_MS) {
        this.canopyAt = t;
        this.canopy?.tint(this.look);
      }
    }
    // Peinture des cerisiers : quelques millisecondes par image, jusqu'à ce que tout soit peint.
    if (this.canopy && !this.canopy.done) {
      this.canopy.work(performance.now() + PAINT_BUDGET_MS);
      if (this.canopy.done && this.petals) this.petals.sources = this.canopy.sources();
    }

    if (t - this.statusAt > 1000) {
      this.status.set({ now, fps: Math.round((this.frames * 1000) / (t - this.statusAt)) });
      this.frames = 0;
      this.statusAt = t;
    }
    if (this.sound() && t - this.soundAt > 250) {
      this.soundAt = t;
      this.ambience.set(levels(c, speed, gust, wind.x / RENDER_WIND));
    }
  }

  /** Les branches proches ploient sous le vent latéral et frémissent aux rafales (calques composités). */
  private sway(windX: number, gust: number, speed: number): void {
    if (this.reduced) return;
    const lean = Math.max(-1, Math.min(1, windX / 10)) * 0.35;
    const shiver =
      Math.sin(this.time * 1.7) * 0.05 * (0.3 + Math.min(speed, 15) / 8) +
      gust * Math.sign(windX || 1) * 0.12 * Math.min(1, speed / 6);
    this.leftCanvas().nativeElement.style.transform = `rotate(${(lean + shiver).toFixed(3)}deg)`;
    this.rightCanvas().nativeElement.style.transform = `rotate(${(lean + shiver * 0.8 + Math.sin(this.time * 1.3 + 1) * 0.02).toFixed(3)}deg)`;
  }

  /** Orage : un éclair de temps en temps (deux flashs au plus, jamais aveuglants), puis le tonnerre. */
  private storm(c: Conditions, t: number): void {
    if (!c.storm) {
      this.nextStrike = 0;
      return;
    }
    if (!this.nextStrike) this.nextStrike = t + 2000 + Math.random() * 4000;
    if (t < this.nextStrike) return;
    this.nextStrike = t + (STORM_GAP[0] + Math.random() * (STORM_GAP[1] - STORM_GAP[0])) * 1000;
    if (!this.reduced) {
      this.flash().nativeElement.animate(
        [{ opacity: 0 }, { opacity: 0.32 }, { opacity: 0.05 }, { opacity: 0.22 }, { opacity: 0 }],
        { duration: 520, easing: 'ease-out' },
      );
    }
    if (this.sound()) this.ambience.thunder(0.8 + Math.random() * 3.5, 0.6 + Math.random() * 0.4);
  }

  /** Pose les couleurs du moment sur l'hôte (seulement celles qui ont changé). */
  private paint(look: Look): void {
    const cam = this.camera();
    const sun = toScreen(cam, look.sun.x, look.sun.y);
    const vars: Record<string, string> = {
      ...look.vars,
      '--sun-x': `${Math.round(sun.x)}px`,
      '--sun-y': `${Math.round(sun.y)}px`,
      '--sun-size': `${Math.round(1100 * cam.scale)}px`,
      '--sun-alpha': String(look.sun.alpha),
      '--sun-glow': look.sun.glow,
      '--stars': String(look.stars),
      '--moon': String(look.moon.alpha),
    };
    const style = this.host.nativeElement.style;
    for (const [name, value] of Object.entries(vars)) {
      if (this.applied[name] === value) continue;
      style.setProperty(name, value);
      this.applied[name] = value;
    }
    this.stage?.colors(look);
  }
}
