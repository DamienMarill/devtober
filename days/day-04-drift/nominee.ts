import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Medal } from './art';
import { Odometer } from './odometer';
import {
  Awards,
  Candidat,
  Place,
  bordLabel,
  categorieLabel,
  dayLabel,
  domain,
  findCandidat,
  monthName,
  shortName,
} from './lib/awards';

/**
 * Un nominé : en ligne repliée (rang, titre, qui, note), puis dépliée (citation, faits, suites,
 * critères, sources et chaîne de « carambolage » vers les dérapages liés). Sert aussi pour le podium
 * (`rank` 2 ou 3 : médaille et cadre plus larges).
 */
@Component({
  selector: 'app-nominee',
  imports: [Odometer, RouterLink, Medal],
  host: { class: 'block scroll-mt-28' },
  template: `
    <article
      [id]="candidat().id"
      class="border border-(--gold)/25 bg-white/[0.025] transition-colors"
      [class]="open() ? 'border-(--gold)/60 bg-white/[0.05]' : 'hover:border-(--gold)/50'"
    >
      <!-- En-tête : l'image (si elle existe) sur la gauche, puis le rang, le titre et la note. -->
      <div class="grid" [class]="showImage() ? 'sm:grid-cols-[20rem_1fr] lg:grid-cols-[24rem_1fr]' : ''">
        @if (showImage()) {
          @if (candidat().image; as img) {
            <figure class="relative h-44 overflow-hidden border-b border-(--gold)/20 sm:h-auto sm:min-h-56 sm:border-r sm:border-b-0">
              <img
                [src]="img.url"
                alt=""
                referrerpolicy="no-referrer"
                loading="lazy"
                class="absolute inset-0 size-full object-cover object-[50%_25%] [filter:sepia(.15)_saturate(.9)_contrast(1.05)]"
                (error)="imageFailed.set(true)"
              />
              <figcaption class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pt-6 pb-1.5 text-[0.5rem] tracking-[0.14em] uppercase sm:text-[0.55rem]">
                <a class="text-(--ivory)/75 hover:text-(--gold)" [href]="img.source" target="_blank" rel="noopener noreferrer">Image : {{ domain(img.source) }}</a>
              </figcaption>
            </figure>
          }
        }
        <button
          type="button"
          class="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] content-center items-center gap-x-4 gap-y-1 p-4 text-left sm:gap-x-6 sm:p-5"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
        >
          @if (podiumRank(); as r) {
            <app-medal [rank]="r" class="h-16 w-12" />
          } @else {
            <span class="font-(family-name:--gala) w-8 text-2xl text-(--gold)/70 tabular-nums">{{ pad(rank()) }}</span>
          }
          <span class="min-w-0">
            <span class="block text-[0.65rem] tracking-[0.22em] text-(--gold) uppercase">
              {{ podiumLabel() ?? categorie() }}
            </span>
            <span class="font-(family-name:--gala) mt-1 block text-lg leading-snug text-(--ivory) sm:text-xl">
              {{ candidat().titre }}
            </span>
            <span class="mt-1 block text-sm text-(--ivory)/60">
              {{ qui() }} · {{ date() }}
            </span>
          </span>
          @if (rank() !== 1) {
            <app-odometer [km]="candidat().kilometrage" class="w-14 sm:w-20" />
          }
        </button>
      </div>

      @if (open()) {
        <div class="grid gap-6 border-t border-(--gold)/20 p-4 sm:p-6 lg:grid-cols-[1fr_15rem]">
          <div class="grid gap-5">
            @if (candidat().punchline; as punchline) {
              <p class="font-(family-name:--gala) border-y border-(--gold)/40 py-3 text-xl leading-snug text-(--gold) italic">
                <span class="mr-2 text-[0.65rem] tracking-[0.3em] not-italic uppercase">Commentaire éditorial</span>{{ punchline }}
              </p>
            }
            @if (candidat().citation; as c) {
              <blockquote class="font-(family-name:--gala) border-l-2 border-(--gold) pl-5 text-xl leading-relaxed text-(--ivory) italic">
                « {{ c.texte }} »
                <a
                  class="mt-2 block text-xs tracking-[0.18em] text-(--gold) not-italic uppercase hover:underline"
                  [href]="c.source"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Source de la citation · {{ domain(c.source) }}</a
                >
              </blockquote>
            }
            <p class="leading-relaxed text-(--ivory)/85">{{ candidat().faits }}</p>
            <p class="leading-relaxed text-(--ivory)/85">
              <strong class="mr-2 text-[0.7rem] tracking-[0.2em] text-(--gold) uppercase">Suites</strong>
              {{ candidat().suites }}
            </p>

            <p class="flex flex-wrap items-center gap-2 text-xs tracking-[0.14em] uppercase">
              <span class="border border-(--gold)/40 px-2 py-1 text-(--ivory)/80">{{ categorie() }}</span>
              @if (bord(); as b) {
                <span class="border border-(--gold)/40 px-2 py-1 text-(--ivory)/80">{{ b }}</span>
              }
              <span class="border px-2 py-1" [class]="statutStyle()">{{ candidat().statut }}</span>
            </p>

            @if (links().length || outside().length) {
              <div class="border-t border-(--gold)/20 pt-4">
                <p class="text-[0.7rem] tracking-[0.2em] text-(--gold) uppercase">Carambolage</p>
                <ul class="mt-2 grid gap-1.5 text-sm text-(--ivory)/85">
                  @for (l of links(); track l.place.candidat.id) {
                    <li>
                      <span class="text-(--ivory)/55">{{ l.sens }}</span>
                      <a
                        class="text-(--gold) underline-offset-4 hover:underline"
                        [routerLink]="[]"
                        [queryParams]="{ mois: l.place.mois.mois }"
                        [fragment]="l.place.candidat.id"
                        >{{ l.place.candidat.titre }}</a
                      >
                      <span class="text-(--ivory)/55"> ({{ monthName(l.place.mois.mois) }})</span>
                    </li>
                  }
                  @for (o of outside(); track o.description) {
                    <li>
                      <span class="text-(--ivory)/55">{{ o.sens === 'declenche' ? 'a provoqué, en ' : 'fait suite, en ' }}</span>
                      {{ o.description }}
                    </li>
                  }
                </ul>
              </div>
            }

            <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--ivory)/55">
              @for (s of candidat().sources; track s) {
                <li>
                  <a class="underline-offset-4 hover:text-(--gold) hover:underline" [href]="s" target="_blank" rel="noopener noreferrer">{{ domain(s) }}</a>
                </li>
              }
            </ul>
          </div>

          <aside class="grid content-start gap-3 lg:border-l lg:border-(--gold)/20 lg:pl-6">
            <app-odometer [km]="candidat().kilometrage" size="lg" [bareme]="awards().grille.bareme" class="max-w-64" />
            <p class="text-sm leading-relaxed text-(--ivory)/70 italic">{{ candidat().kilometrage.justification }}</p>
          </aside>
        </div>
      }
    </article>
  `,
})
export class Nominee {
  readonly candidat = input.required<Candidat>();
  readonly awards = input.required<Awards>();
  /** Position dans le mois (1 : lauréat). */
  readonly rank = input.required<number>();
  /** Id à ouvrir (venu du lien d'un carambolage). */
  readonly focusId = input<string | null>(null);

  protected readonly imageFailed = signal(false);
  protected readonly showImage = computed(() => !!this.candidat().image && !this.imageFailed());
  protected readonly open = linkedSignal(() => this.focusId() === this.candidat().id);

  protected readonly podiumRank = computed<1 | 2 | 3 | null>(() => {
    const r = this.rank();
    return r === 1 || r === 2 || r === 3 ? r : null;
  });
  protected readonly podiumLabel = computed(() =>
    this.rank() === 1 ? 'Lauréat' : this.rank() === 2 ? 'Accessit d’argent' : this.rank() === 3 ? 'Prix de bronze' : null,
  );
  protected readonly qui = computed(() => shortName(this.candidat().qui));
  protected readonly date = computed(() => dayLabel(this.candidat().date));
  protected readonly categorie = computed(() => categorieLabel(this.candidat().categorie));
  protected readonly bord = computed(() => (this.candidat().bord ? bordLabel(this.candidat().bord!) : null));
  protected readonly statutStyle = computed(() =>
    this.candidat().statut === 'avéré'
      ? 'border-(--gold)/40 text-(--gold)'
      : 'border-(--flame)/60 text-(--flame)',
  );

  /** Les dérapages liés, retrouvés dans tout le palmarès. */
  protected readonly links = computed(() => {
    const c = this.candidat();
    const out: { sens: string; place: Place }[] = [];
    for (const [ids, sens] of [
      [c.declenchePar, 'Fait suite à : '],
      [c.declenche, 'A provoqué : '],
    ] as const) {
      for (const id of ids) {
        const place = findCandidat(this.awards(), id);
        if (place) out.push({ sens, place });
      }
    }
    return out;
  });
  /** Les liens vers des faits d'un mois qui n'est pas au palmarès (octobre 2025, par exemple). */
  protected readonly outside = computed(() => this.candidat().liensHorsMois ?? []);

  protected readonly monthName = monthName;
  protected readonly domain = domain;
  protected readonly pad = (n: number) => String(n).padStart(2, '0');
}
