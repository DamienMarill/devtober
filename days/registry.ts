import type { Type } from '@angular/core';

/**
 * Jours publiés : numéro du jour -> composant lazy-loadé.
 * Rempli automatiquement par `npm run new-day -- <numéro>`.
 */
export const DAY_LOADERS: Partial<Record<number, () => Promise<Type<unknown>>>> = {
  // new-day:insert
};
