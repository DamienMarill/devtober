import type { Type } from '@angular/core';
import { DAY_LOADERS } from '../../days/registry';

export const YEAR = 2026;

export const WORDS = [
  'Pulse',
  'Loop',
  'Bloom',
  'Drift',
  'Chaos',
  'Tiny',
  'Swarm',
  'Maze',
  'Gravity',
  'Fold',
  'Ripple',
  'Lost',
  'Tangle',
  'Bounce',
  'Shadow',
  'Tide',
  'Orbit',
  'Glitch',
  'Echo',
  'Fragile',
  'Signal',
  'Mirror',
  'Spark',
  'Hidden',
  'Melt',
  'Machine',
  'Haunted',
  'Grow',
  'Infinite',
  'Collapse',
  'Wake',
] as const;

export type DayStatus = 'done' | 'today' | 'upcoming' | 'missed';

export interface Day {
  number: number;
  word: string;
  /** Nom du dossier et de la route, ex: day-01-pulse */
  slug: string;
  date: Date;
  load?: () => Promise<Type<unknown>>;
}

export const daySlug = (n: number) =>
  `day-${String(n).padStart(2, '0')}-${WORDS[n - 1].toLowerCase()}`;

export const DAYS: Day[] = WORDS.map((word, i) => ({
  number: i + 1,
  word,
  slug: daySlug(i + 1),
  date: new Date(YEAR, 9, i + 1),
  load: DAY_LOADERS[i + 1],
}));

export function dayStatus(day: Day, now = new Date()): DayStatus {
  if (day.load) return 'done';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = day.date.getTime() - today.getTime();
  if (diff === 0) return 'today';
  return diff > 0 ? 'upcoming' : 'missed';
}
