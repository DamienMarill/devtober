import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideShare2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

const COPIED_MS = 2000;

/**
 * Bouton de partage : feuille de partage native quand elle existe (mobile), sinon copie du lien.
 * Il partage l'adresse courante telle quelle, query params compris (ex. `?track=` du Jour 1).
 */
@Component({
  selector: 'app-share-button',
  imports: [NgIcon, HlmButtonImports, HlmTooltipImports],
  providers: [provideIcons({ lucideShare2, lucideCheck })],
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon"
      [hlmTooltip]="copied() ? 'Lien copié !' : 'Partager'"
      position="bottom"
      [attr.aria-label]="copied() ? 'Lien copié' : 'Partager cette page'"
      (click)="share()"
    >
      <ng-icon [name]="copied() ? 'lucideCheck' : 'lucideShare2'" class="text-lg" />
    </button>
  `,
})
export class ShareButton {
  /** Titre passé à la feuille de partage native. */
  readonly title = input.required<string>();

  protected readonly copied = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async share(): Promise<void> {
    const url = location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: this.title(), url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // l'utilisateur a refermé la feuille
        // Autre échec : on retombe sur la copie du lien.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), COPIED_MS);
  }
}
