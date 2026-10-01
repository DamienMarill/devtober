import { DatePipe } from '@angular/common';
import { Component, computed, input, numberAttribute } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { DAYS } from '../days';

const REPO = 'https://github.com/DamienMarill/devtober';

/** Cadre commun à toutes les pages de jour : barre de navigation + création en plein écran. */
@Component({
  selector: 'app-day-page',
  imports: [RouterLink, RouterOutlet, DatePipe, HlmButtonImports],
  host: { class: 'flex h-dvh flex-col' },
  template: `
    <header class="border-border flex items-center gap-3 border-b px-4 py-2">
      <a hlmBtn variant="ghost" size="sm" routerLink="/">← Accueil</a>
      <div class="flex min-w-0 flex-1 items-baseline gap-2">
        <span class="text-muted-foreground font-mono text-sm">
          #{{ current().number.toString().padStart(2, '0') }}
        </span>
        <h1 class="truncate font-semibold">{{ current().word }}</h1>
        <span class="text-muted-foreground hidden text-sm sm:inline">
          {{ current().date | date: 'd MMMM' }}
        </span>
      </div>
      @if (prev(); as p) {
        <a hlmBtn variant="ghost" size="sm" [routerLink]="['/', p.slug]">‹ {{ p.word }}</a>
      }
      @if (next(); as n) {
        <a hlmBtn variant="ghost" size="sm" [routerLink]="['/', n.slug]">{{ n.word }} ›</a>
      }
      <a hlmBtn variant="outline" size="sm" [href]="readmeUrl()" target="_blank" rel="noopener">
        README
      </a>
    </header>
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <router-outlet />
    </main>
  `,
})
export default class DayPage {
  /** Fourni par la data de la route (withComponentInputBinding). */
  readonly day = input.required({ transform: numberAttribute });

  protected readonly current = computed(() => DAYS[this.day() - 1]);
  private readonly published = DAYS.filter((d) => d.load);
  protected readonly prev = computed(
    () => this.published.filter((d) => d.number < this.day()).at(-1) ?? null,
  );
  protected readonly next = computed(
    () => this.published.find((d) => d.number > this.day()) ?? null,
  );
  protected readonly readmeUrl = computed(() => `${REPO}/tree/main/days/${this.current().slug}`);
}
