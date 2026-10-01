import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight, lucideGithub } from '@ng-icons/lucide';
import { HlmBreadcrumbImports } from '@spartan-ng/helm/breadcrumb';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { filter, map } from 'rxjs';
import { DAYS, PUBLISHED_DAYS, padDay } from '../days';
import { ReadmeButton } from './readme-button';

const REPO = 'https://github.com/DamienMarill/devtober';

/** Numéro du jour porté par la route active (`data.day`), ou null sur l'accueil. */
function activeDay(route: ActivatedRouteSnapshot): number | null {
  while (route.firstChild) route = route.firstChild;
  return route.data['day'] ?? null;
}

/** Barre de navigation commune : fil d'Ariane, jours précédent/suivant et README. */
@Component({
  selector: 'app-site-nav',
  imports: [
    RouterLink,
    DatePipe,
    NgIcon,
    HlmBreadcrumbImports,
    HlmButtonImports,
    HlmTooltipImports,
    ReadmeButton,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight, lucideGithub })],
  host: {
    class: 'border-border bg-background/80 relative z-40 shrink-0 border-b backdrop-blur-sm',
  },
  template: `
    <div class="mx-auto flex h-14 max-w-[1800px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
      <nav hlmBreadcrumb aria-label="Fil d’Ariane" class="min-w-0 flex-1">
        <ol hlmBreadcrumbList class="flex-nowrap">
          <li hlmBreadcrumbItem>
            @if (day(); as d) {
              <a hlmBreadcrumbLink link="/" class="brand"
                >Dev<span class="text-primary">tober</span></a
              >
            } @else {
              <span hlmBreadcrumbPage class="brand"
                >Dev<span class="text-primary">tober</span></span
              >
            }
          </li>
          @if (day(); as d) {
            <li hlmBreadcrumbSeparator></li>
            <li hlmBreadcrumbItem class="min-w-0">
              <span hlmBreadcrumbPage class="flex min-w-0 items-baseline gap-2">
                <span class="text-muted-foreground font-mono tabular-nums"
                  >#{{ pad(d.number) }}</span
                >
                <span class="truncate font-semibold">{{ d.word }}</span>
                <span class="text-muted-foreground hidden md:inline">
                  {{ d.date | date: 'EEEE d MMMM' }}
                </span>
              </span>
            </li>
          }
        </ol>
      </nav>

      @if (day(); as d) {
        <div class="flex items-center">
          @if (prev(); as p) {
            <a
              hlmBtn
              variant="ghost"
              size="icon"
              [routerLink]="['/', p.slug]"
              [hlmTooltip]="'#' + pad(p.number) + ' ' + p.word"
              position="bottom"
              [attr.aria-label]="'Jour précédent : ' + p.word"
            >
              <ng-icon name="lucideChevronLeft" class="text-lg" />
            </a>
          }
          @if (next(); as n) {
            <a
              hlmBtn
              variant="ghost"
              size="icon"
              [routerLink]="['/', n.slug]"
              [hlmTooltip]="'#' + pad(n.number) + ' ' + n.word"
              position="bottom"
              [attr.aria-label]="'Jour suivant : ' + n.word"
            >
              <ng-icon name="lucideChevronRight" class="text-lg" />
            </a>
          }
        </div>
        <app-readme-button
          [title]="'#' + pad(d.number) + ' ' + d.word"
          [dir]="'days/' + d.slug"
          [load]="d.entry!.readme"
        />
      } @else {
        <a
          hlmBtn
          variant="ghost"
          size="icon"
          [href]="repo"
          target="_blank"
          rel="noopener"
          hlmTooltip="Le repo sur GitHub"
          position="bottom"
          aria-label="Le repo sur GitHub"
        >
          <ng-icon name="lucideGithub" class="text-lg" />
        </a>
        <app-readme-button
          title="Le projet Devtober"
          dir=""
          [load]="projectReadme"
          tooltip="À propos du projet"
        />
      }
    </div>
  `,
  styles: `
    .brand {
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 800;
      color: var(--foreground);
    }
  `,
})
export class SiteNav {
  private readonly router = inject(Router);

  protected readonly repo = REPO;
  protected readonly pad = padDay;
  protected readonly projectReadme = () => import('../../../README.md').then((m) => m.default);

  private readonly dayNumber = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => activeDay(this.router.routerState.snapshot.root)),
    ),
    { initialValue: null },
  );

  protected readonly day = computed(() => {
    const n = this.dayNumber();
    return n ? DAYS[n - 1] : null;
  });
  protected readonly prev = computed(() => {
    const n = this.dayNumber();
    return n ? (PUBLISHED_DAYS.filter((d) => d.number < n).at(-1) ?? null) : null;
  });
  protected readonly next = computed(() => {
    const n = this.dayNumber();
    return n ? (PUBLISHED_DAYS.find((d) => d.number > n) ?? null) : null;
  });
}
