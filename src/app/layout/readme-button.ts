import { Component, computed, input, resource, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookOpenText, lucideExternalLink } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

const REPO = 'https://github.com/DamienMarill/devtober';

/** Bouton (avec tooltip) qui ouvre le README d'un jour dans une modale. */
@Component({
  selector: 'app-readme-button',
  imports: [NgIcon, HlmButtonImports, HlmDialogImports, HlmTooltipImports],
  providers: [provideIcons({ lucideBookOpenText, lucideExternalLink })],
  template: `
    <hlm-dialog (stateChanged)="$event === 'open' && opened.set(true)">
      <button
        hlmDialogTrigger
        hlmBtn
        variant="ghost"
        size="icon"
        [hlmTooltip]="tooltip()"
        position="bottom"
        [attr.aria-label]="tooltip()"
      >
        <ng-icon name="lucideBookOpenText" class="text-lg" />
      </button>

      <hlm-dialog-content
        *hlmDialogPortal="let ctx"
        class="flex max-h-[85dvh] flex-col gap-4 sm:max-w-3xl"
        closeLabel="Fermer"
      >
        <hlm-dialog-header class="pe-10">
          <h2 hlmDialogTitle class="font-display text-xl font-semibold">{{ title() }}</h2>
          <a
            class="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm transition-colors"
            [href]="githubUrl()"
            target="_blank"
            rel="noopener"
          >
            Voir le code sur GitHub <ng-icon name="lucideExternalLink" />
          </a>
        </hlm-dialog-header>

        <div class="-mx-6 min-h-0 overflow-y-auto px-6">
          @if (html.error()) {
            <p class="text-destructive">Impossible de charger le README.</p>
          } @else if (html.hasValue()) {
            <article class="prose prose-readme max-w-none" [innerHTML]="html.value()"></article>
          } @else {
            <p class="text-muted-foreground">Chargement…</p>
          }
        </div>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class ReadmeButton {
  /** Titre affiché en haut de la modale. */
  readonly title = input.required<string>();
  /** Dossier du README dans le repo, ex: `days/day-01-pulse` ('' pour la racine). */
  readonly dir = input.required<string>();
  /** Charge le contenu Markdown (import dynamique du fichier .md). */
  readonly load = input.required<() => Promise<string>>();
  readonly tooltip = input('Comment c’est codé ?');

  protected readonly githubUrl = computed(() =>
    this.dir() ? `${REPO}/tree/main/${this.dir()}` : REPO,
  );

  /** Le README n'est chargé qu'à la première ouverture de la modale. */
  protected readonly opened = signal(false);

  protected readonly html = resource({
    params: () => (this.opened() ? { load: this.load(), dir: this.dir() } : undefined),
    loader: async ({ params }) => {
      // marked n'est chargé qu'au premier README affiché, pour alléger le bundle initial.
      const [{ renderReadme }, markdown] = await Promise.all([import('./markdown'), params.load()]);
      return renderReadme(markdown, params.dir);
    },
  });
}
