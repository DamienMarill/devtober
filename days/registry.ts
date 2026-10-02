import type { Type } from '@angular/core';

/**
 * Réglages de la capture d'un jour (`npm run gif -- <numéro>`) : la page `/capture/<jour>` affiche
 * le jour dans un carré avec un bandeau, et le script la filme.
 */
export interface CaptureConfig {
  /**
   * Où cliquer pour lancer l'animation, en pixels dans le carré de capture (720 × 720 par défaut,
   * origine en haut à gauche). `null` : on ne clique pas (l'animation démarre toute seule, ou avec `key`).
   */
  click: { x: number; y: number } | null;
  /**
   * Touche à presser pour lancer l'animation (nom Playwright : `'t'`, `'Space'`, `'Enter'`…), à la place
   * du clic ou après lui. Sans `click` ni `key`, on filme dès que la page est chargée.
   */
  key?: string;
  /** Durée filmée (secondes), comptée à partir du clic ou de la touche, ou du chargement sans l'un ni l'autre. */
  seconds: number;
  /** Attente (ms) avant de cliquer ou de filmer, le temps que le jour finisse de charger. 1500 par défaut. */
  settle?: number;
}

export interface DayEntry {
  /** Composant du jour, lazy-loadé. */
  component: () => Promise<Type<unknown>>;
  /** README du jour en texte brut, affiché dans la modale de la barre de navigation. */
  readme: () => Promise<string>;
  /** Comment filmer le jour pour son GIF d'aperçu. */
  capture: CaptureConfig;
}

/**
 * Jours publiés : numéro du jour -> composant + README, chargés à la demande.
 * Rempli automatiquement par `npm run new-day -- <numéro>`.
 */
export const DAY_ENTRIES: Partial<Record<number, DayEntry>> = {
  1: {
    component: () => import('./day-01-pulse/day-01-pulse').then((m) => m.default),
    readme: () => import('./day-01-pulse/README.md').then((m) => m.default),
    // Le bouton lecture d'*Iris Out* ; 30 s = la durée d'un extrait Deezer.
    capture: { click: { x: 307, y: 534 }, seconds: 30, settle: 3000 },
  },
  2: {
    component: () => import('./day-02-loop/day-02-loop').then((m) => m.default),
    readme: () => import('./day-02-loop/README.md').then((m) => m.default),
    // La touche T lance la démo : deux robots font la course ; 3 s de décompte, trois tours en ~22 s, puis le podium.
    capture: { click: null, key: 't', seconds: 30 },
  },
  // new-day:insert
};
