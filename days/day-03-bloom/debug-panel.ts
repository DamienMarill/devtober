import { Component, computed, input, model, output } from '@angular/core';
import { formatOgakiTime, ogakiMinutes } from './lib/clock';
import { Overrides } from './lib/overrides';
import { Conditions, PRESETS, Preset, WMO_LABELS, Weather } from './lib/weather';
import { windLabel } from './lib/wind';

/**
 * Le panneau de debug (caché : `?debug` dans l'adresse, ou la touche D). Il montre ce que renvoie
 * Open-Meteo et permet d'imposer l'heure, la météo et le vent pour voir les autres ambiances.
 */
@Component({
  selector: 'app-bloom-debug',
  host: {
    class:
      'bg-background/85 border-border text-foreground absolute right-3 bottom-3 z-30 block max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border p-3 text-xs shadow-xl backdrop-blur',
    role: 'region',
    'aria-label': 'Debug : heure et météo',
  },
  template: `
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="font-display text-sm font-semibold">Ōgaki · {{ time() }}</p>
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground"
        (click)="closed.emit()"
        aria-label="Fermer le debug"
      >
        ✕
      </button>
    </div>

    <dl class="text-muted-foreground mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      @if (weather(); as w) {
        <dt>Météo</dt>
        <dd>{{ label(w.conditions.code) }} ({{ w.conditions.code }})</dd>
        <dt>Temp.</dt>
        <dd>{{ w.conditions.temperature ?? '–' }} °C</dd>
        <dt>Vent</dt>
        <dd>
          {{ w.conditions.windSpeed }} m/s, {{ wind(w.conditions.windFrom) }} ({{
            w.conditions.windFrom
          }}°), rafales {{ w.conditions.gusts }}
        </dd>
        <dt>Nuages</dt>
        <dd>{{ round(w.conditions.clouds * 100) }} %</dd>
        <dt>Soleil</dt>
        <dd>{{ sun(w) }}</dd>
        <dt>Relevé</dt>
        <dd>{{ clock(w.observedAt) }}</dd>
      } @else {
        <dt>API</dt>
        <dd>{{ error() ?? 'chargement…' }}</dd>
      }
      <dt>Rendu</dt>
      <dd>{{ label(conditions().code) }}, {{ conditions().windSpeed }} m/s · {{ fps() }} i/s</dd>
    </dl>

    <div class="grid gap-2">
      <label class="grid gap-1">
        <span
          >Heure : {{ overrides().time === undefined ? 'direct' : hhmm(overrides().time!) }}</span
        >
        <input
          type="range"
          min="0"
          max="1439"
          step="5"
          [value]="minutes()"
          (input)="set({ time: +$any($event.target).value })"
        />
      </label>
      <label class="flex items-center justify-between gap-2">
        <span>Vitesse du temps</span>
        <select
          class="bg-background rounded border px-1"
          [value]="overrides().speed ?? 1"
          (change)="set({ speed: +$any($event.target).value })"
        >
          @for (s of speeds; track s) {
            <option [value]="s">×{{ s }}</option>
          }
        </select>
      </label>
      <label class="flex items-center justify-between gap-2">
        <span>Météo</span>
        <select
          class="bg-background rounded border px-1"
          [value]="overrides().weather ?? ''"
          (change)="setWeather($any($event.target).value)"
        >
          <option value="">Direct</option>
          @for (p of presets; track p[0]) {
            <option [value]="p[0]">{{ p[1].label }}</option>
          }
        </select>
      </label>
      <label class="grid gap-1">
        <span>Vent : {{ windSpeed() }} m/s, {{ wind(windFrom()) }}</span>
        <input
          type="range"
          min="0"
          max="20"
          step="0.5"
          [value]="windSpeed()"
          (input)="setWind(+$any($event.target).value, windFrom())"
        />
        <input
          type="range"
          min="0"
          max="355"
          step="5"
          [value]="windFrom()"
          (input)="setWind(windSpeed(), +$any($event.target).value)"
          aria-label="Provenance du vent"
        />
      </label>
      <label class="grid gap-1">
        <span>Nuages : {{ round(conditions().clouds * 100) }} %</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          [value]="round(conditions().clouds * 100)"
          (input)="set({ clouds: +$any($event.target).value / 100 })"
        />
      </label>
      <div class="mt-1 flex gap-2">
        <button
          type="button"
          class="hover:bg-accent flex-1 rounded border px-2 py-1"
          (click)="overrides.set({})"
        >
          Revenir au direct
        </button>
        <button
          type="button"
          class="hover:bg-accent flex-1 rounded border px-2 py-1"
          (click)="tour.emit()"
        >
          Visite (T)
        </button>
      </div>
    </div>
  `,
})
export class DebugPanel {
  readonly overrides = model.required<Overrides>();
  readonly weather = input<Weather | undefined>();
  readonly error = input<string | undefined>();
  readonly conditions = input.required<Conditions>();
  /** Instant affiché (ms), rafraîchi chaque seconde. */
  readonly now = input.required<number>();
  readonly fps = input(0);
  readonly closed = output<void>();
  readonly tour = output<void>();

  protected readonly presets = Object.entries(PRESETS) as [Preset, (typeof PRESETS)[Preset]][];
  protected readonly speeds = [1, 60, 300, 1200];
  protected readonly round = Math.round;
  protected readonly wind = windLabel;

  protected readonly time = computed(() => formatOgakiTime(this.now()));
  protected readonly minutes = computed(() => Math.round(ogakiMinutes(this.now())));
  protected readonly windSpeed = computed(
    () => this.overrides().wind?.speed ?? this.conditions().windSpeed,
  );
  protected readonly windFrom = computed(
    () => this.overrides().wind?.from ?? this.conditions().windFrom,
  );

  protected label(code: number): string {
    return WMO_LABELS[code] ?? `code ${code}`;
  }

  protected clock(ms: number): string {
    return formatOgakiTime(ms);
  }

  protected hhmm(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  protected sun(w: Weather): string {
    const now = this.now();
    const rise = w.sunrises.find((t) => t > now - 12 * 3600_000) ?? w.sunrises[0];
    const set = w.sunsets.find((t) => t > now - 12 * 3600_000) ?? w.sunsets[0];
    return rise && set ? `lever ${formatOgakiTime(rise)}, coucher ${formatOgakiTime(set)}` : '–';
  }

  protected set(patch: Partial<Overrides>): void {
    this.overrides.update((o) => ({ ...o, ...patch }));
  }

  protected setWeather(value: string): void {
    this.overrides.update((o) => ({ ...o, weather: (value || undefined) as Preset | undefined }));
  }

  protected setWind(speed: number, from: number): void {
    this.set({ wind: { speed, from } });
  }
}
