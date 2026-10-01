import { NgComponentOutlet } from '@angular/common';
import { Component, computed, input, resource } from '@angular/core';
import { DAYS, padDay } from '../days';

/**
 * Page de capture d'un jour : `/capture/<jour>` (ex. `/capture/day-01-pulse`).
 *
 * Elle est hors de la coque du site : pas de navbar. Elle affiche le jour dans un carré, avec en bas un
 * bandeau repris de la navbar (numéro et mot à gauche, logo Marill.dev à droite). C'est ce carré que
 * `npm run gif` filme ; il expose ses réglages (`CaptureConfig`) dans des attributs `data-*`.
 * Ouverte dans un navigateur normal, la page montre le même carré, centré : pratique pour régler le clic.
 */
@Component({
  selector: 'app-capture',
  imports: [NgComponentOutlet],
  host: { class: 'fixed inset-0 grid place-items-center bg-black' },
  template: `
    @if (day(); as d) {
      <div
        id="capture"
        class="bg-background text-foreground relative flex aspect-square h-[min(100dvh,100dvw)] flex-col overflow-hidden"
        [attr.data-ready]="ready()"
        [attr.data-slug]="d.slug"
        [attr.data-seconds]="d.entry!.capture.seconds"
        [attr.data-settle]="d.entry!.capture.settle ?? 1500"
        [attr.data-click-x]="d.entry!.capture.click?.x"
        [attr.data-click-y]="d.entry!.capture.click?.y"
      >
        <div class="relative min-h-0 flex-1 overflow-hidden">
          @if (component.value(); as c) {
            <ng-container *ngComponentOutlet="c" />
          }
        </div>

        <!-- Bandeau : mêmes classes que la navbar (fond, bordure, flou), à l'envers. -->
        <footer
          class="border-border bg-background/80 relative z-40 flex h-16 shrink-0 items-center justify-between border-t px-6 backdrop-blur-sm"
        >
          <p class="flex items-baseline gap-2.5">
            <span class="text-muted-foreground font-mono text-base tabular-nums">#{{ pad(d.number) }}</span>
            <span class="font-display text-xl font-semibold">{{ d.word }}</span>
          </p>
          <!-- Le logo est un wordmark (Lato 800, point en accent) : du vrai texte garde la police du site. -->
          <p class="font-sans text-2xl font-extrabold tracking-[-0.034em]">
            Marill<span class="text-[#a49cff]">.</span>dev
          </p>
        </footer>
      </div>
    } @else {
      <p class="text-white">Jour inconnu ou non publié : {{ slug() }}</p>
    }
  `,
})
export default class Capture {
  /** Paramètre de route `:slug`. */
  readonly slug = input.required<string>();

  protected readonly day = computed(() => DAYS.find((d) => d.slug === this.slug() && d.entry));

  protected readonly component = resource({
    params: () => this.day()?.entry,
    loader: ({ params }) => params.component(),
  });

  /** Vrai quand le composant du jour est chargé : le script peut alors prendre la main. */
  protected readonly ready = computed(() => this.component.hasValue());

  protected pad = padDay;
}
