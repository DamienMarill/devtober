import {
  Component,
  ElementRef,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle, lucidePause, lucidePlay, lucideSearch } from '@ng-icons/lucide';
import { CoverTheme, THEME_ROLES, themeFromCover } from './cover-theme';
import { DeezerTrack, searchTracks } from './deezer';
import { PulseAudio } from './pulse-audio';

const DEBOUNCE_MS = 300;
const ORB_MAX_OPACITY = 0.12;

function formatDuration(seconds: number): string {
  const s = String(seconds % 60).padStart(2, '0');
  return `${Math.floor(seconds / 60)}:${s}`;
}

@Component({
  selector: 'app-day-01-pulse',
  imports: [NgIcon],
  providers: [PulseAudio, provideIcons({ lucideLoaderCircle, lucidePause, lucidePlay, lucideSearch })],
  host: {
    class:
      'relative flex size-full flex-col items-center overflow-hidden px-4 py-6 transition-colors duration-700',
    '[style.background-color]': 'background()',
    '(document:pointerdown)': 'onOutsidePointer($event)',
  },
  template: `
    <!-- Deux orbes géantes centrées sur les bords gauche et droit, rayon = largeur de la page.
         Chacune flashe sur les grosses caisses et percussions de son canal stéréo. -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-0">
      @for (orb of orbs; track orb.left) {
        <div
          class="absolute top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full will-change-[opacity]"
          [style.left]="orb.left"
          [style.background]="orbBackground()"
          [style.opacity]="orbOpacity(orb.kick())"
        ></div>
      }
    </div>

    <div #search class="relative z-20 w-full max-w-xl">
      <div class="relative">
        <ng-icon
          name="lucideSearch"
          class="text-muted-foreground pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-lg"
        />
        <input
          type="search"
          role="combobox"
          aria-label="Rechercher un morceau"
          aria-autocomplete="list"
          aria-controls="pulse-results"
          [attr.aria-expanded]="showList()"
          [attr.aria-activedescendant]="showList() && active() >= 0 ? 'pulse-opt-' + active() : null"
          autocomplete="off"
          placeholder="Rechercher un morceau, un artiste…"
          class="border-border bg-card/80 placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/40 h-12 w-full rounded-full border ps-11 pe-11 text-base backdrop-blur outline-none focus-visible:ring-4"
          [value]="query()"
          (input)="onInput($any($event.target).value)"
          (focus)="open.set(true)"
          (keydown)="onKeydown($event)"
        />
        @if (results.isLoading()) {
          <ng-icon
            name="lucideLoaderCircle"
            class="text-muted-foreground absolute end-4 top-1/2 -translate-y-1/2 animate-spin text-lg"
          />
        }
      </div>

      @if (showList()) {
        <ul
          id="pulse-results"
          role="listbox"
          class="border-border bg-popover/95 absolute inset-x-0 top-14 max-h-[60dvh] overflow-y-auto rounded-2xl border p-1.5 shadow-2xl backdrop-blur-xl"
        >
          @if (results.error()) {
            <li class="text-destructive px-3 py-3 text-sm">
              {{ errorMessage() }}
            </li>
          } @else if (results.hasValue() && results.value().length === 0) {
            <li class="text-muted-foreground px-3 py-3 text-sm">Aucun résultat.</li>
          }
          @for (track of results.value() ?? []; track track.id; let i = $index) {
            <li
              role="option"
              [id]="'pulse-opt-' + i"
              [attr.aria-selected]="i === active()"
              [attr.aria-disabled]="!track.preview"
              class="flex items-center gap-3 rounded-xl p-2 transition-colors"
              [class.bg-accent]="i === active()"
              [class.cursor-pointer]="track.preview"
              [class.opacity-40]="!track.preview"
              [title]="track.preview ? '' : 'Pas d’extrait disponible'"
              (pointerenter)="active.set(i)"
              (click)="select(track)"
            >
              <img
                [src]="track.album.cover_small"
                [alt]="'Pochette de ' + track.album.title"
                width="40"
                height="40"
                class="size-10 shrink-0 rounded-md object-cover"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ track.title }}</span>
                <span class="text-muted-foreground block truncate text-xs">{{ track.artist.name }}</span>
              </span>
              <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                {{ duration(track.duration) }}
              </span>
            </li>
          }
        </ul>
      }
    </div>

    <div class="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8">
      @if (audio.current(); as track) {
        <div class="relative size-[min(56vmin,20.8rem)]">
          <!-- Lueur : la pochette elle-même, floutée, qui enfle et s'éclaire sur les basses. -->
          <img
            aria-hidden="true"
            [src]="track.album.cover_xl"
            alt=""
            class="absolute inset-0 size-full rounded-3xl object-cover blur-3xl will-change-transform"
            [style.opacity]="glowOpacity()"
            [style.transform]="glowTransform()"
          />
          <img
            [src]="track.album.cover_xl"
            [alt]="'Pochette de ' + track.album.title"
            class="relative size-full rounded-2xl object-cover shadow-2xl will-change-transform"
            [style.transform]="coverTransform()"
          />
        </div>

        <div class="flex max-w-full items-center gap-4">
          <button
            type="button"
            class="border-border bg-card/80 hover:bg-accent inline-flex size-12 shrink-0 items-center justify-center rounded-full border backdrop-blur transition-colors"
            [attr.aria-label]="audio.playing() ? 'Mettre en pause' : 'Lire'"
            (click)="audio.toggle()"
          >
            <ng-icon [name]="audio.playing() ? 'lucidePause' : 'lucidePlay'" class="text-xl" />
          </button>
          <div class="min-w-0">
            <p class="font-display truncate text-xl font-semibold">{{ track.title }}</p>
            <p class="text-muted-foreground truncate text-sm">{{ track.artist.name }}</p>
          </div>
        </div>
      } @else {
        <p class="text-muted-foreground text-center text-lg">
          Cherche un morceau et laisse la pochette battre la mesure.
        </p>
      }
    </div>

    <!-- Debug : thème généré depuis la pochette (à remplacer par l'application réelle au thème). -->
    @if (theme.value(); as t) {
      <aside
        class="bg-background/80 border-border absolute right-3 bottom-3 z-30 max-h-[70dvh] w-60 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border p-3 text-xs shadow-xl backdrop-blur"
        aria-label="Debug : thème généré"
      >
        <p class="text-muted-foreground mb-2 font-semibold tracking-wide uppercase">Debug · thème</p>
        <div class="mb-3 flex items-center gap-1.5" title="Couleurs candidates (la 1re est la source)">
          @for (c of t.candidates; track c; let i = $index) {
            <span
              class="size-7 rounded-full border border-white/20"
              [class.ring-2]="i === 0"
              [class.ring-white]="i === 0"
              [style.background]="c"
              [title]="c"
            ></span>
          }
          <span class="text-muted-foreground ms-1 font-mono">{{ t.source }}</span>
        </div>
        <ul class="flex flex-col gap-1">
          <li class="flex items-center gap-2">
            <span class="size-5 shrink-0 rounded border border-white/20" [style.background]="t.backdrop"></span>
            <span class="flex-1 truncate">backdrop (fond de page)</span>
            <span class="text-muted-foreground font-mono">{{ t.backdrop }}</span>
          </li>
          @for (role of roles; track role) {
            <li class="flex items-center gap-2">
              <span class="size-5 shrink-0 rounded border border-white/20" [style.background]="t.roles[role]"></span>
              <span class="flex-1 truncate">{{ role }}</span>
              <span class="text-muted-foreground font-mono">{{ t.roles[role] }}</span>
            </li>
          }
        </ul>
      </aside>
    } @else if (theme.error()) {
      <p class="text-destructive absolute right-3 bottom-3 z-30 text-xs">Thème : {{ theme.error() }}</p>
    }
  `,
})
export default class Day01Pulse {
  protected readonly audio = inject(PulseAudio);
  private readonly search = viewChild.required<ElementRef<HTMLElement>>('search');

  protected readonly query = signal('');
  private readonly debounced = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);

  /** Moins d'amplitude pour qui préfère les animations réduites. */
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;

  protected readonly results = resource({
    params: () => this.debounced().trim() || undefined,
    loader: ({ params, abortSignal }) => searchTracks(params, abortSignal),
  });

  protected readonly roles = THEME_ROLES;

  /** Thème Material You tiré de la pochette du morceau en cours. */
  protected readonly theme = resource({
    params: () => this.audio.current()?.album.cover_medium,
    loader: ({ params, abortSignal }) => themeFromCover(params, abortSignal),
  });

  /** Dernier thème connu : pas de retour au fond par défaut le temps que le suivant se calcule. */
  private readonly lastTheme = linkedSignal<CoverTheme | undefined, CoverTheme | undefined>({
    source: () => this.theme.value(),
    computation: (next, previous) => next ?? previous?.value,
  });

  protected readonly background = computed(
    () => this.lastTheme()?.backdrop ?? 'var(--background)',
  );

  /** Chaque orbe suit son canal : gauche sur le bord gauche, droite sur le bord droit. */
  protected readonly orbs = [
    { left: '0%', kick: this.audio.flashLeft },
    { left: '100%', kick: this.audio.flashRight },
  ];
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Couleur on-surface du thème, en halo qui s'estompe vers les bords. */
  protected readonly orbBackground = computed(
    () => `radial-gradient(closest-side, ${this.lastTheme()?.roles.onSurface ?? 'transparent'}, transparent)`,
  );
  /** Plafonné : on-surface est très clair, un flash plein écran serait agressif. */
  protected orbOpacity(kick: number): number {
    return this.reducedMotion ? 0 : kick * ORB_MAX_OPACITY;
  }

  protected readonly showList = computed(
    () => this.open() && this.debounced().trim() !== '' && !this.results.isLoading(),
  );
  protected readonly errorMessage = computed(() => {
    const e = this.results.error();
    return e instanceof Error ? e.message : 'La recherche a échoué.';
  });

  protected readonly glowOpacity = computed(() => 0.35 + this.audio.level() * 0.65 * this.motion);
  protected readonly glowTransform = computed(
    () => `scale(${1.1 + this.audio.level() * 0.25 * this.motion})`,
  );
  protected readonly coverTransform = computed(
    () => `scale(${1 + this.audio.level() * 0.06 * this.motion})`,
  );

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected duration = formatDuration;

  protected onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.active.set(-1);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debounced.set(value), DEBOUNCE_MS);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const list = this.results.value() ?? [];
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!this.showList() || list.length === 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.active.set((this.active() + step + list.length) % list.length);
        break;
      }
      case 'Enter': {
        const track = list[this.active()];
        if (this.showList() && track) {
          event.preventDefault();
          this.select(track);
        }
        break;
      }
      case 'Escape':
        this.open.set(false);
        break;
    }
  }

  protected select(track: DeezerTrack): void {
    if (!track.preview) return;
    this.open.set(false);
    this.query.set(`${track.title} · ${track.artist.name}`);
    void this.audio.play(track).catch((e) => console.error('Lecture impossible', e));
  }

  protected onOutsidePointer(event: PointerEvent): void {
    if (!this.search().nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
