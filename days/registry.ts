import type { Type } from '@angular/core';

export interface DayEntry {
  /** Composant du jour, lazy-loadé. */
  component: () => Promise<Type<unknown>>;
  /** README du jour en texte brut, affiché dans la modale de la barre de navigation. */
  readme: () => Promise<string>;
}

/**
 * Jours publiés : numéro du jour -> composant + README, chargés à la demande.
 * Rempli automatiquement par `npm run new-day -- <numéro>`.
 */
export const DAY_ENTRIES: Partial<Record<number, DayEntry>> = {
  // new-day:insert
};
