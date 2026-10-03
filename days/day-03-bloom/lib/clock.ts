import { OGAKI } from './ogaki';

/** Minutes écoulées depuis minuit, heure d'Ōgaki, à l'instant `ms`. */
export function ogakiMinutes(ms: number, utcOffsetSeconds = OGAKI.utcOffsetSeconds): number {
  const local = ms + utcOffsetSeconds * 1000;
  return (((local / 60_000) % 1440) + 1440) % 1440;
}

/** L'instant d'aujourd'hui (jour d'Ōgaki qui contient `ms`) où il est `minutes` après minuit là-bas. */
export function atOgakiMinutes(
  ms: number,
  minutes: number,
  utcOffsetSeconds = OGAKI.utcOffsetSeconds,
): number {
  return ms - ogakiMinutes(ms, utcOffsetSeconds) * 60_000 + minutes * 60_000;
}

const TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: OGAKI.timeZone,
  hour: '2-digit',
  minute: '2-digit',
});

/** « 20:34 », heure d'Ōgaki. */
export function formatOgakiTime(ms: number): string {
  return TIME.format(ms);
}

/** « 20 h 34 », pour une lecture à voix haute. */
export function spokenOgakiTime(ms: number): string {
  const [h, m] = formatOgakiTime(ms).split(':');
  return `${Number(h)} h ${m}`;
}
