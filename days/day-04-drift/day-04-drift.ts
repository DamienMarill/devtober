import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BananaEmblem, DecoRule, Laurel, Skid } from './art';
import { Envelope } from './envelope';
import {
  Awards,
  CRITERE_LABELS,
  CRITERES,
  Mois,
  capitalize,
  ceremonyNumber,
  dayLabel,
  findCandidat,
  findMois,
  mentions,
  monthLabel,
  monthName,
  monthShort,
  podium,
  roman,
  shortName,
} from './lib/awards';
import { Nominee } from './nominee';
import type { Plaque } from './trophy/plinth';
import { TrophyStage } from './trophy-stage';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&display=swap';
const OPENED_KEY = 'derapawards-enveloppes-ouvertes';

/** Les enveloppes déjà ouvertes (gardées pour la session : on ne re-spoile pas un mois qu'on a vu). */
function loadOpened(): ReadonlySet<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(OPENED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveOpened(opened: ReadonlySet<string>) {
  try {
    sessionStorage.setItem(OPENED_KEY, JSON.stringify([...opened]));
  } catch {
    // Stockage indisponible (navigation privée) : tant pis, la session ne se souviendra de rien.
  }
}

/**
 * Jour 4 : Drift, ou « Les Dérapawards ». Un contrepied : au lieu d'une glisse en voiture, une cérémonie
 * de remise de prix des plus beaux dérapages (verbaux) de chaque mois. Tout le contenu vient de
 * `derapawards-2026.json` : modifier le JSON modifie le site.
 *
 * `/day-04-drift` affiche la couverture et le palmarès, `?mois=2026-03` la cérémonie d'un mois.
 */
@Component({
  selector: 'app-day-04-drift',
  imports: [RouterLink, TrophyStage, Envelope, Nominee, Skid, DecoRule, Laurel, BananaEmblem],
  host: { '(document:keydown)': 'onKey($event)' },
  styles: `
    :host {
      --gold: #e8c873;
      --gold-deep: #8a6a2a;
      --ivory: #f3ead8;
      --velvet: #0b0907;
      --wine: #3a0a12;
      --flame: #ff7a52;
      --gala: 'Bodoni Moda', 'Playfair Display', Didot, Georgia, serif;
      display: block;
      min-height: 100%;
      background: var(--velvet);
      color: var(--ivory);
    }
    .gold-text {
      background: linear-gradient(180deg, #fff1c2 0%, #e8c873 48%, #9a7a35 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .stage {
      background: radial-gradient(120% 90% at 50% 0%, #4d0f1b 0%, #230810 46%, #0b0907 100%);
    }
    .curtain {
      position: absolute;
      inset-block: 0;
      width: min(20%, 15rem);
      background: repeating-linear-gradient(
        90deg,
        rgb(0 0 0 / 0.55) 0,
        rgb(124 22 38 / 0.55) 1.5rem,
        rgb(0 0 0 / 0.55) 3rem
      );
      mask-image: linear-gradient(to right, #000 50%, transparent);
    }
    .curtain.right {
      right: 0;
      scale: -1 1;
    }
    .beam {
      position: absolute;
      left: 50%;
      top: -6rem;
      width: min(95%, 36rem);
      height: calc(100% + 6rem);
      translate: -50% 0;
      background: linear-gradient(180deg, rgb(255 232 170 / 0.4), rgb(255 232 170 / 0.03) 88%);
      clip-path: polygon(41% 0, 59% 0, 100% 100%, 0 100%);
      filter: blur(12px);
      opacity: 0.22;
      transition: opacity 1.8s;
    }
    .pool {
      position: absolute;
      left: 50%;
      bottom: 2%;
      width: 85%;
      height: 16%;
      translate: -50% 0;
      background: radial-gradient(closest-side, rgb(255 226 150 / 0.4), transparent);
      opacity: 0.25;
      transition: opacity 1.8s;
    }
    .lit .beam,
    .lit .pool {
      opacity: 1;
    }
    .rise {
      animation: rise 0.9s both cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
    }
    .dropcap::first-letter {
      float: left;
      padding: 0.06em 0.12em 0 0;
      font: 700 4.6em/0.78 var(--gala);
      color: var(--gold);
    }
    @media (prefers-reduced-motion: reduce) {
      .rise {
        animation: none;
      }
      .beam,
      .pool {
        transition: none;
      }
    }
  `,
  template: `
    @if (awards(); as a) {
      <!-- La barre des mois : couverture, dix cérémonies. -->
      <nav
        class="sticky top-0 z-30 border-b border-(--gold)/25 bg-(--velvet)/85 backdrop-blur"
        aria-label="Cérémonies"
      >
        <div class="mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-8">
          <a
            routerLink="."
            [queryParams]="{ mois: null }"
            class="flex shrink-0 items-center gap-2 text-(--gold)"
            aria-label="Couverture et palmarès"
          >
            <app-banana-emblem class="size-6" />
            <span class="font-(family-name:--gala) hidden text-sm tracking-[0.2em] uppercase sm:inline">{{ a.meta.titre }}</span>
          </a>
          <ol class="ml-auto flex shrink-0 items-center gap-1.5">
            @for (m of a.mois; track m.mois) {
              <li>
                <a
                  routerLink="."
                  [queryParams]="{ mois: m.mois }"
                  class="block min-w-11 border px-2.5 py-1.5 text-center text-[0.7rem] tracking-[0.12em] uppercase transition-colors"
                  [class]="
                    m === current()
                      ? 'border-(--gold) bg-(--gold) font-bold text-(--velvet)'
                      : 'border-(--gold)/25 text-(--ivory)/75 hover:border-(--gold)/70 hover:text-(--gold)'
                  "
                  [attr.aria-current]="m === current() ? 'page' : null"
                  [attr.title]="m.provisoire ? 'Provisoire, hors concours' : null"
                >
                  {{ monthShort(m.mois) }}{{ m.provisoire ? '*' : '' }}
                </a>
              </li>
            }
          </ol>
        </div>
      </nav>

      <!-- La scène : rideaux, poursuite, trophée, et à côté l'annonce. -->
      <section class="stage relative isolate overflow-hidden" [class.lit]="lit()">
        <div class="curtain left"></div>
        <div class="curtain right"></div>
        <div class="mx-auto grid max-w-7xl items-center gap-4 px-4 pt-6 pb-12 sm:px-8 lg:grid-cols-2 lg:gap-10 lg:py-10">
          <div class="relative">
            <div class="beam"></div>
            <div class="pool"></div>
            <app-trophy-stage
              class="relative z-10 h-[26rem] w-full sm:h-[34rem] lg:h-[40rem]"
              [plaque]="plaque()"
              [revealKey]="revealKey()"
            />
            @if (current(); as m) {
              @if (!isOpen(m)) {
                <div class="absolute inset-0 z-20 grid place-items-center">
                  <app-envelope [label]="'Dérapaward de ' + name(m.mois)" (opened)="open(m.mois)" />
                </div>
              }
            }
          </div>

          <div class="relative z-10 grid justify-items-center gap-6 text-center lg:justify-items-start lg:text-left">
            @if (current(); as m) {
              @if (!isOpen(m)) {
                <!-- L'enveloppe, avant l'ouverture. -->
                <div class="rise grid justify-items-center gap-5 lg:justify-items-start">
                  <p class="text-xs tracking-[0.34em] text-(--gold) uppercase">
                    Cérémonie n° {{ roman(number(m)) }} · {{ label(m.mois) }}
                  </p>
                  <h1 class="font-(family-name:--gala) text-4xl leading-tight text-(--ivory) sm:text-5xl">
                    Et le Dérapaward de {{ name(m.mois) }} est attribué à…
                  </h1>
                  @if (m.provisoire) {
                    <p class="max-w-md border border-(--flame)/60 px-3 py-2 text-sm text-(--flame)">
                      Mois en cours : résultats provisoires, hors concours.
                    </p>
                  }
                  <p class="animate-pulse text-xs tracking-[0.3em] text-(--ivory)/60 uppercase">Cliquez sur l’enveloppe pour briser le sceau</p>
                </div>
              } @else {
                <!-- Le lauréat. -->
                @let w = winner(m);
                <div class="rise grid max-w-xl justify-items-center gap-4 lg:justify-items-start">
                  <p class="text-xs tracking-[0.34em] text-(--gold) uppercase">
                    Dérapaward · {{ label(m.mois) }} · cérémonie {{ roman(number(m)) }}
                  </p>
                  @if (m.provisoire) {
                    <p class="border border-(--flame)/60 px-3 py-1.5 text-sm text-(--flame)">
                      Résultats provisoires, hors concours.
                    </p>
                  }
                  <h1 class="gold-text font-(family-name:--gala) text-5xl leading-[1.02] font-semibold sm:text-6xl">
                    {{ shortName(w.qui) }}
                  </h1>
                  <p class="text-sm text-(--ivory)/60">{{ w.qui }} · {{ day(w.date) }}</p>
                  <app-deco-rule class="w-full text-(--gold)/70" />
                  <h2 class="font-(family-name:--gala) text-2xl leading-snug text-(--ivory) italic sm:text-3xl">
                    {{ w.titre }}
                  </h2>
                  @if (w.citation; as c) {
                    <blockquote class="font-(family-name:--gala) border-l-2 border-(--gold) pl-4 text-left text-lg leading-relaxed text-(--ivory)/90">
                      « {{ c.texte }} »
                    </blockquote>
                  }
                  @if (m.punchline; as punchline) {
                    <figure class="w-full border-t border-(--gold)/40 pt-3 text-left">
                      <figcaption class="text-[0.65rem] tracking-[0.3em] text-(--gold) uppercase">Commentaire éditorial</figcaption>
                      <blockquote class="font-(family-name:--gala) mt-1.5 text-lg leading-snug text-(--ivory) italic sm:text-xl">
                        <span class="gold-text mr-1 text-2xl leading-none">«</span>{{ punchline }}<span class="gold-text ml-1 text-2xl leading-none">»</span>
                      </blockquote>
                    </figure>
                  }
                </div>
              }
            } @else {
              <!-- La couverture. -->
              <div class="rise grid max-w-xl justify-items-center gap-5 lg:justify-items-start">
                <p class="text-xs tracking-[0.34em] text-(--gold) uppercase">Saison {{ year(a) }} · première cérémonie des sorties de route</p>
                <h1 class="gold-text font-(family-name:--gala) text-5xl leading-[0.95] font-semibold sm:text-7xl lg:text-8xl">
                  Les<br />Dérapawards
                </h1>
                <app-deco-rule class="w-full text-(--gold)/70" />
                <p class="font-(family-name:--gala) text-xl leading-relaxed text-(--ivory)/90 italic">
                  Le jury a mesuré, au kilomètre, les plus belles sorties de route de l’actualité. Aucune bonne foi n’a été blessée au cours de la glisse.
                </p>
                <a
                  href="#palmares"
                  class="border border-(--gold) px-6 py-3 text-xs tracking-[0.3em] text-(--gold) uppercase transition-colors hover:bg-(--gold) hover:text-(--velvet)"
                  (click)="scrollTo('palmares', $event)"
                  >Entrer dans la salle</a
                >
              </div>
            }
          </div>
        </div>
      </section>

      @if (current(); as m) {
        @if (isOpen(m)) {
          <!-- Le podium. -->
          <section class="mx-auto grid max-w-5xl gap-5 px-4 py-14 sm:px-8">
            <header class="grid justify-items-center gap-3 text-center">
              <h2 class="font-(family-name:--gala) text-3xl text-(--ivory) sm:text-4xl">Le podium de {{ name(m.mois) }}</h2>
              <app-deco-rule class="w-64 text-(--gold)/70" />
            </header>
            @for (c of podium(m); track c.id; let i = $index) {
              <app-nominee [candidat]="c" [awards]="a" [rank]="i + 1" [focusId]="focus(c.id, i)" />
            }
          </section>

          <section class="mx-auto grid max-w-3xl justify-items-center gap-6 px-4 pb-14 text-center sm:px-8">
            <app-skid class="w-full text-(--gold)/60" />
            <h2 class="font-(family-name:--gala) text-3xl text-(--ivory)">Délibération du jury</h2>
            <p class="dropcap font-(family-name:--gala) text-left text-lg leading-[1.75] text-(--ivory)/90">
              {{ m.justificationTop3 }}
            </p>
          </section>

          <section class="mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:px-8">
            <header class="mb-2 flex items-center justify-center gap-5 text-(--gold)">
              <app-laurel class="h-20 w-10" />
              <div class="text-center">
                <h2 class="font-(family-name:--gala) text-3xl text-(--ivory) sm:text-4xl">Mentions honorables</h2>
                <p class="mt-1 text-xs tracking-[0.3em] uppercase">{{ rest(m).length }} dérapages classés au kilométrage</p>
              </div>
              <app-laurel class="h-20 w-10 -scale-x-100" />
            </header>
            @for (c of rest(m); track c.id; let i = $index) {
              <app-nominee [candidat]="c" [awards]="a" [rank]="i + 4" [focusId]="focus(c.id)" />
            }
          </section>

          <nav class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pb-20 sm:px-8" aria-label="Autres cérémonies">
            @if (neighbour(m, -1); as prev) {
              <a routerLink="." [queryParams]="{ mois: prev.mois }" class="border border-(--gold)/40 px-4 py-3 text-xs tracking-[0.2em] text-(--gold) uppercase hover:bg-(--gold) hover:text-(--velvet)">
                ← {{ label(prev.mois) }}
              </a>
            } @else {
              <a routerLink="." [queryParams]="{ mois: null }" class="border border-(--gold)/40 px-4 py-3 text-xs tracking-[0.2em] text-(--gold) uppercase hover:bg-(--gold) hover:text-(--velvet)">
                ← Palmarès
              </a>
            }
            @if (neighbour(m, 1); as next) {
              <a routerLink="." [queryParams]="{ mois: next.mois }" class="border border-(--gold)/40 px-4 py-3 text-xs tracking-[0.2em] text-(--gold) uppercase hover:bg-(--gold) hover:text-(--velvet)">
                {{ label(next.mois) }} →
              </a>
            }
          </nav>
        }
      } @else {
        <!-- Le palmarès : une carte par mois, scellée tant que l'enveloppe n'a pas été ouverte. -->
        <section id="palmares" class="scroll-mt-16 mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-8">
          <header class="grid justify-items-center gap-3 text-center">
            <h2 class="font-(family-name:--gala) text-4xl text-(--ivory)">Le palmarès {{ year(a) }}</h2>
            <app-deco-rule class="w-72 text-(--gold)/70" />
            <button
              type="button"
              class="mt-1 cursor-pointer text-xs tracking-[0.25em] text-(--ivory)/60 uppercase underline-offset-4 hover:text-(--gold) hover:underline"
              (click)="openAll()"
            >
              Tout révéler d’un coup
            </button>
          </header>
          <ol class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (m of recent(a); track m.mois) {
              @let w = winner(m);
              <li>
                <a
                  routerLink="."
                  [queryParams]="{ mois: m.mois }"
                  class="group grid h-full content-start gap-3 border border-(--gold)/25 bg-white/[0.025] p-5 transition-colors hover:border-(--gold)/70 hover:bg-white/[0.05]"
                >
                  @if (isOpen(m) && w.image; as img) {
                    <img
                      [src]="img.url"
                      alt=""
                      referrerpolicy="no-referrer"
                      loading="lazy"
                      class="-mx-5 -mt-5 h-36 w-[calc(100%+2.5rem)] max-w-none object-cover object-[50%_25%] [filter:sepia(.2)_saturate(.85)_contrast(1.05)] [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]"
                      (error)="$any($event.target).hidden = true"
                    />
                  }
                  <span class="flex items-baseline justify-between text-(--gold)">
                    <span class="font-(family-name:--gala) text-3xl text-(--gold)/80">{{ roman(number(m)) }}</span>
                    <span class="text-xs tracking-[0.25em] uppercase">{{ label(m.mois) }}</span>
                  </span>
                  @if (isOpen(m)) {
                    <span class="font-(family-name:--gala) gold-text text-2xl leading-tight font-semibold">{{ shortName(w.qui) }}</span>
                    <span class="font-(family-name:--gala) line-clamp-3 text-(--ivory)/85 italic">{{ w.titre }}</span>
                    <span class="mt-auto flex items-center justify-between pt-2 text-xs tracking-[0.2em] text-(--ivory)/60 uppercase">
                      <span>{{ m.provisoire ? 'Provisoire, hors concours' : 'Kilométrage' }}</span>
                      <span class="font-(family-name:--gala) text-2xl text-(--gold)">{{ w.kilometrage.note }}<small class="text-xs opacity-60">/10</small></span>
                    </span>
                  } @else {
                    <span class="flex items-center gap-3 py-4 text-(--ivory)/60">
                      <app-banana-emblem class="size-10 text-(--gold)/70" />
                      <span class="text-sm tracking-[0.2em] uppercase">Enveloppe scellée{{ m.provisoire ? ' · provisoire' : '' }}</span>
                    </span>
                  }
                </a>
              </li>
            }
          </ol>
        </section>

        <!-- Le règlement : la grille du jury, lue dans le JSON. -->
        <section class="mx-auto grid max-w-5xl gap-6 px-4 pb-20 sm:px-8">
          <app-skid class="w-full text-(--gold)/60" />
          <header class="grid justify-items-center gap-2 text-center">
            <h2 class="font-(family-name:--gala) text-3xl text-(--ivory)">Le règlement du jury</h2>
            <p class="max-w-2xl text-(--ivory)/70">{{ a.grille.calcul }}</p>
          </header>
          <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (k of criteres; track k) {
              <div class="border border-(--gold)/25 p-4">
                <dt class="text-xs tracking-[0.25em] text-(--gold) uppercase">{{ critereLabel[k] }}</dt>
                <dd class="mt-1 text-sm leading-relaxed text-(--ivory)/80">{{ a.grille.bareme[k] }}</dd>
              </div>
            }
          </dl>
          <p class="text-center text-xs leading-relaxed text-(--ivory)/50">
            Palmarès établi le {{ day(a.meta.genere) }}. Chaque fiche indique ses sources et le statut des faits
            (avéré, contesté, attribué).
          </p>
        </section>
      }
    } @else if (data.error()) {
      <p class="grid min-h-96 place-items-center p-8 text-center text-(--flame)">
        Le palmarès n’a pas pu être chargé : {{ data.error() }}
      </p>
    } @else {
      <p class="grid min-h-96 place-items-center p-8 text-center text-(--gold) tracking-[0.3em] uppercase">Ouverture des portes…</p>
    }
  `,
})
export default class Day04Drift {
  /** Mois affiché (`?mois=2026-03`) ; sans lui, la couverture. Lié par `withComponentInputBinding`. */
  readonly mois = input<string | undefined>();

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Id d'un dérapage à ouvrir et à montrer (fragment de l'URL, depuis un lien de carambolage). */
  private readonly fragment = toSignal(this.route.fragment, { initialValue: null });

  protected readonly data = resource({
    loader: () => import('./derapawards-2026.json').then((m) => m.default as unknown as Awards),
  });
  protected readonly awards = computed(() => (this.data.hasValue() ? this.data.value() : undefined));
  protected readonly current = computed(() => {
    const a = this.awards();
    return a ? findMois(a, this.mois()) : undefined;
  });

  protected readonly opened = signal(loadOpened());
  protected readonly criteres = CRITERES;
  protected readonly critereLabel = CRITERE_LABELS;

  /** Le trophée est visible (et la poursuite allumée) sur la couverture et sur un mois dont l'enveloppe est ouverte. */
  protected readonly revealKey = computed(() => {
    const m = this.current();
    if (!m) return 'couverture';
    return this.isOpen(m) ? m.mois : null;
  });
  protected readonly lit = computed(() => this.revealKey() !== null);

  /** Ce qu'on grave sur la plaque du socle. */
  protected readonly plaque = computed<Plaque>(() => {
    const a = this.awards();
    const m = this.current();
    if (!a) return { kicker: '', title: '', name: '' };
    if (!m) return { kicker: a.meta.titre, title: 'Palmarès', name: 'Les sorties de route de l’année' };
    return {
      kicker: `Dérapaward · cérémonie n° ${roman(ceremonyNumber(a, m.mois))}`,
      title: capitalize(monthLabel(m.mois)),
      name: shortName(this.winner(m).qui),
    };
  });

  protected readonly roman = roman;
  protected readonly shortName = shortName;
  protected readonly monthShort = monthShort;
  protected readonly day = dayLabel;
  protected readonly name = monthName;
  protected readonly label = (mois: string) => capitalize(monthLabel(mois));
  protected readonly podium = podium;
  /** Le palmarès de la racine : du mois le plus récent au plus ancien. */
  protected readonly recent = (a: Awards) => [...a.mois].reverse();

  constructor() {
    this.loadFonts();

    // Changer de mois remet la page en haut (le conteneur qui défile est le <main> de la coque).
    effect(() => {
      this.mois();
      if (this.fragment()) return;
      untracked(() => this.host.nativeElement.closest('main')?.scrollTo({ top: 0 }));
    });

    // Un lien de carambolage ouvre le mois visé (même si son enveloppe est scellée) et amène sur la fiche.
    effect((onCleanup) => {
      const a = this.awards();
      const id = this.fragment();
      if (!a || !id) return;
      const place = findCandidat(a, id);
      if (place) untracked(() => this.open(place.mois.mois));
      const timer = setTimeout(
        () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        150,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected isOpen(m: Mois) {
    return this.opened().has(m.mois);
  }

  protected open(mois: string) {
    this.opened.update((s) => new Set(s).add(mois));
    saveOpened(this.opened());
  }

  protected openAll() {
    const a = this.awards();
    if (!a) return;
    this.opened.set(new Set(a.mois.map((m) => m.mois)));
    saveOpened(this.opened());
  }

  protected number(m: Mois) {
    return ceremonyNumber(this.awards()!, m.mois);
  }

  protected year(a: Awards) {
    return a.mois[0]?.mois.slice(0, 4) ?? '';
  }

  protected winner(m: Mois) {
    return podium(m)[0];
  }

  protected rest(m: Mois) {
    return mentions(m);
  }

  /** Le mois d'à côté (`-1` précédent, `1` suivant), s'il existe. */
  protected neighbour(m: Mois, delta: number) {
    const mois = this.awards()?.mois ?? [];
    return mois[mois.indexOf(m) + delta];
  }

  /** Quelle fiche ouvrir : celle du fragment ; à défaut, le dossier du lauréat (premier du podium). */
  protected focus(id: string, podiumIndex?: number) {
    return this.fragment() ?? (podiumIndex === 0 ? id : null);
  }

  protected scrollTo(id: string, event: Event) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  /** ← et → passent d'une cérémonie à l'autre ; depuis la couverture, → ouvre janvier. */
  protected onKey(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const a = this.awards();
    if (!delta || !a) return;
    const index = a.mois.findIndex((m) => m === this.current()) + delta;
    if (index >= a.mois.length || (index < 0 && !this.current())) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mois: a.mois[index]?.mois ?? null },
    });
  }

  /** Bodoni Moda (la Didone des génériques), chargée avec le jour 4 seulement. */
  private loadFonts() {
    if (document.getElementById('derapawards-fonts')) return;
    const link = document.createElement('link');
    link.id = 'derapawards-fonts';
    link.rel = 'stylesheet';
    link.href = FONTS;
    document.head.append(link);
  }
}

